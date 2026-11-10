// 本地触发器：由 Windows 计划任务每天 08:20 调用
// 原理：GitHub 的 schedule 触发器会被服务端静默丢弃（本仓库 3 天零次生效），
// 改用 gh API 手动触发 workflow_dispatch —— API 触发即时可靠，不依赖 GitHub 调度器。
// 网络：gh 走 api.github.com 直连（不读系统代理）；直连失败时自动拉起 Clash 走 7897 重试。
// 重复推送由 workflow 侧的防重护栏兜底（schedule 触发且当日已生成则跳过）。
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'ekowon520-EE/github-daily';
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'trigger.log');
const CLASH_EXE = 'D:\\软件\\vpn\\clash-verge.exe';
const CLASH_PROXY = 'http://127.0.0.1:7897';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 探测本地端口是否在监听
function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => { s.destroy(); resolve(false); });
    s.setTimeout(2000, () => { s.destroy(); resolve(false); });
  });
}

// 确保 Clash 在跑（没跑则拉起并等端口就绪），返回是否可用
async function ensureClash() {
  if (await portOpen(7897)) return true;
  log('7897 未监听，尝试拉起 Clash Verge...');
  try {
    spawn('powershell', ['-NoProfile', '-Command', `Start-Process '${CLASH_EXE}'`], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {
    log(`拉起 Clash 失败: ${e.message}`);
    return false;
  }
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    if (await portOpen(7897)) { log(`Clash 已就绪（${(i + 1) * 3}s）`); return true; }
  }
  log('Clash 拉起后 30s 端口仍未就绪');
  return false;
}

// gh 不一定在计划任务的 PATH 里，按常见安装位置兜底
function findGh() {
  const candidates = [
    'gh',
    'C:\\Program Files\\GitHub CLI\\gh.exe',
    String.fromCharCode(0x43) + ':\\Program Files (x86)\\GitHub CLI\\gh.exe', // 防 PATH 缺失
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      return c;
    } catch { /* 尝试下一个 */ }
  }
  return null;
}

// 触发 workflow；viaProxy 时给 gh 注入代理环境变量（gh 不读系统代理，只认 env）
function dispatch(gh, viaProxy = false) {
  const env = { ...process.env };
  if (viaProxy) { env.HTTPS_PROXY = CLASH_PROXY; env.HTTP_PROXY = CLASH_PROXY; }
  execFileSync(gh, ['workflow', 'run', 'daily.yml', '-R', REPO], { stdio: 'pipe', timeout: 60000, env });
}

const gh = findGh();
if (!gh) {
  log('失败: 找不到 gh CLI，无法触发');
  process.exit(1);
}

// 先直连，失败则拉起 Clash 走代理重试
let ok = false;
try {
  dispatch(gh);
  ok = true;
  log('已触发 GitHub 每日热榜 workflow_dispatch（直连）');
} catch (e) {
  log(`直连触发失败: ${e.message.split('\n')[0]}`);
  if (await ensureClash()) {
    try {
      dispatch(gh, true);
      ok = true;
      log('已触发 GitHub 每日热榜 workflow_dispatch（经 Clash 代理重试）');
    } catch (e2) {
      log(`代理重试仍失败: ${e2.message.split('\n')[0]}`);
    }
  }
}
if (!ok) process.exit(1);

// 触发后等几秒确认 run 已被接受，写进日志便于排查
await new Promise((r) => setTimeout(r, 8000));
try {
  const out = execFileSync(gh, [
    'run', 'list', '-R', REPO, '--workflow', 'daily.yml',
    '--limit', '1', '--json', 'databaseId,status,createdAt',
    '--jq', '.[0] | "\\(.databaseId) \\(.status) \\(.createdAt)"',
  ], { encoding: 'utf8', timeout: 60000 }).trim();
  log(`最新 run: ${out}`);
} catch (e) {
  log(`提示: 无法查询 run 状态（不影响已触发的任务）- ${e.message}`);
}
