// 本地触发器：由 Windows 计划任务每天 08:20 调用
// 原理：GitHub 的 schedule 触发器会被服务端静默丢弃（本仓库 3 天零次生效），
// 改用 gh API 手动触发 workflow_dispatch —— API 触发即时可靠，不依赖 GitHub 调度器。
// 重复推送由 workflow 侧的防重护栏兜底（schedule 触发且当日已生成则跳过）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'ekowon520-EE/github-daily';
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'trigger.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
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

const gh = findGh();
if (!gh) {
  log('失败: 找不到 gh CLI，无法触发');
  process.exit(1);
}

try {
  execFileSync(gh, ['workflow', 'run', 'daily.yml', '-R', REPO], { stdio: 'pipe', timeout: 60000 });
  log('已触发 GitHub 每日热榜 workflow_dispatch');
} catch (e) {
  log(`失败: gh 触发出错 - ${e.message}`);
  process.exit(1);
}

// 触发后等几秒确认 run 已被接受，写进日志便于排查
await new Promise((r) => setTimeout(r, 8000));
try {
  const out = execFileSync(gh, [
    'run', 'list', '-R', REPO, '--workflow', 'daily.yml',
    '--limit', '1', '--json', 'databaseId,status,createdAt,displayTitle',
    '--jq', '.[0] | "\\(.databaseId) \\(.status) \\(.createdAt)"',
  ], { encoding: 'utf8', timeout: 60000 }).trim();
  log(`最新 run: ${out}`);
} catch (e) {
  log(`提示: 无法查询 run 状态（不影响已触发的任务）- ${e.message}`);
}
