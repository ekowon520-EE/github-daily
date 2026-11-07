// 主流程：抓取 → AI 点评 → 渲染 → 归档 →（Actions 环境下先提交图片）→ 推送
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { cfg } from './config.js';
import { fetchTrending, fetchFallbackOfficial } from './fetchTrending.js';
import { summarize } from './summarize.js';
import { renderReport } from './render.js';
import { buildMarkdown } from './markdown.js';
import { notifyAll } from './notify.js';
import { kfmt, isoWeek, isAIRepo } from './util.js';

function shanghaiMeta(now = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return {
    dateStr: `${get('year')}.${get('month')}.${get('day')}`,
    timeStr: `${get('hour')}:${get('minute')}`,
    weekday: get('weekday'),
    week: isoWeek(new Date()),
  };
}

function buildLangDist(repos) {
  const counts = {};
  repos.forEach((r) => { const l = r.lang || '其他'; counts[l] = (counts[l] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([lang, count]) => ({ lang, count }));
}

async function main() {
  const OUT = path.resolve('output');
  fs.mkdirSync(OUT, { recursive: true });

  // 1. 抓取（主源 trending，兜底官方 API）
  let repos;
  let source = 'trending';
  try {
    repos = await fetchTrending(cfg.topN);
  } catch (e) {
    console.warn(`trending 抓取失败，启用官方 Search API 兜底: ${e.message}`);
    repos = await fetchFallbackOfficial(cfg.topN);
    source = 'search-api';
  }

  // 2. AI 中文点评（无 key 自动降级）
  repos = await summarize(repos, cfg);

  // 3. 统计与元信息
  const totals = {
    delta: repos.reduce((s, r) => s + (r.todayStars || 0), 0),
    stars: repos.reduce((s, r) => s + (r.stars || 0), 0),
  };
  const meta = {
    ...shanghaiMeta(),
    totals,
    aiCount: repos.filter(isAIRepo).length,
    langDist: buildLangDist(repos),
    source,
  };
  console.log(`榜单统计: 今日新增 +${kfmt(totals.delta)} ｜ 总星 ${kfmt(totals.stars)} ｜ AI 项目 ${meta.aiCount}/${repos.length}`);

  // 4. 渲染长图 + 归档数据
  const imagePath = await renderReport(repos, meta, OUT);
  fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify({ meta, repos }, null, 2));

  // 5. Actions 环境：先把图片提交进仓库（WxPusher/Server酱 的图片消息需要公网 raw 地址）
  let imageUrl = '';
  if (process.env.GITHUB_ACTIONS === 'true') {
    try {
      execSync('git config user.name "github-actions[bot]"', { stdio: 'inherit' });
      execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"', { stdio: 'inherit' });
      execSync('git add output', { stdio: 'inherit' });
      try { execSync(`git commit -m "daily report ${meta.dateStr}"`, { stdio: 'inherit' }); }
      catch { console.log('没有新的变更需要提交'); }
      execSync('git push', { stdio: 'inherit' });
      imageUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/${process.env.GITHUB_REF_NAME || 'main'}/output/latest.png`;
      console.log(`图片已提交仓库，raw 地址: ${imageUrl}`);
      await new Promise((r) => setTimeout(r, 20000)); // 等 raw CDN 生效
    } catch (e) {
      console.warn(`git 提交失败（不影响推送，仅无图片消息）: ${e.message}`);
    }
  }

  // 6. 推送（邮件用本地附件，不受图片 URL 影响）
  const markdown = buildMarkdown(repos, meta);
  const title = `GitHub 每日热榜 ${meta.dateStr.slice(5)}`;
  const results = await notifyAll(cfg, { title, markdown, imagePath, imageUrl });
  console.log('推送结果:\n  ' + results.join('\n  '));
}

main().catch((e) => {
  console.error('运行失败:', e);
  process.exit(1);
});
