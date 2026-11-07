// 文字版摘要（用于 WxPusher markdown / Server酱 desp / 邮件正文）
import { kfmt, isAIRepo } from './util.js';

export function buildMarkdown(repos, meta) {
  const L = [];
  L.push(`# GitHub 每日热榜 ${meta.dateStr}（第${meta.week}周 ${meta.weekday}）`);
  L.push('');
  L.push(
    `今日合计新增 **+${kfmt(meta.totals.delta)}** ｜ 榜单总星 **${kfmt(meta.totals.stars)}** ｜ AI 项目 **${meta.aiCount}/${repos.length}**`
  );
  L.push('');
  repos.forEach((r, i) => {
    const flag = isAIRepo(r) ? ' 🤖' : '';
    L.push(`**${i + 1}. ${r.fullName}**${flag} ｜ ▲今日 +${kfmt(r.todayStars)} ｜ ★${kfmt(r.stars)}${r.tag ? ` ｜ \`${r.tag}\`` : ''}`);
    if (r.zhDesc) L.push(`> ${r.zhDesc}`);
    if (r.comment) L.push(`> 💡 ${r.comment}`);
    if (r.quickstart) L.push(`> 📌 ${r.quickstart}`);
    L.push('');
  });
  L.push('---');
  const srcNote = meta.source !== 'trending' ? ' · 兜底源：官方Search API' : '';
  L.push(
    `数据来源 [github.com/trending](https://github.com/trending) · 生成于 ${meta.dateStr} ${meta.timeStr}（UTC+8）${srcNote} · AI 摘要仅供参考`
  );
  return L.join('\n');
}
