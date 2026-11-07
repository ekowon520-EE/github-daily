// 图片渲染：HTML/CSS 模板 → Playwright 截图（1080 宽、2x 清晰度竖版长图）
import fs from 'node:fs';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { kfmt, esc, langColor, isAIRepo, avatarColor } from './util.js';

function rankStyle(i) {
  if (i === 0) return 'linear-gradient(135deg,#ffd66b,#f5a623)';
  if (i === 1) return 'linear-gradient(135deg,#c9d4e3,#8fa1bb)';
  if (i === 2) return 'linear-gradient(135deg,#e2a877,#c07a3e)';
  return 'linear-gradient(135deg,#a9b8cd,#8296b0)';
}

function rowHtml(r, i) {
  const ai = isAIRepo(r);
  const pill = ai
    ? `<div class="pill ai">🤖 ${esc(r.tag || 'AI/Agent')}</div>`
    : `<div class="pill">${esc(r.tag || '工具')}</div>`;
  const rankCls = i < 3 ? ` top r${i + 1}` : '';
  const crown = i === 0 ? '<div class="crown">👑</div>' : '';
  return `
  <div class="row">
    <div class="rankwrap">
      ${crown}
      <div class="rank${rankCls}" style="background:${rankStyle(i)}"><span>TOP</span><b>${i + 1}</b></div>
    </div>
    <div class="avatar" style="background:${avatarColor(r.fullName)}">${esc((r.fullName[0] || 'G').toUpperCase())}</div>
    <div class="info">
      <div class="name">${esc(r.fullName)}</div>
      <div class="desc">${esc(r.zhDesc || r.desc || '暂无官方简介')}</div>
      ${r.comment ? `<div class="comment">💡 ${esc(r.comment)}</div>` : ''}
      ${r.quickstart ? `<div class="quick">📌 ${esc(r.quickstart)}</div>` : ''}
      <div class="meta"><i style="background:${langColor(r.lang)}"></i>${esc(r.lang || '未知语言')}</div>
    </div>
    <div class="metrics">
      <div class="mlabel">▲ 今日新增</div>
      <div class="delta">+${kfmt(r.todayStars)}</div>
      <div class="mlabel m2">★ 总 Star</div>
      <div class="total">${kfmt(r.stars)}</div>
    </div>
    ${pill}
  </div>`;
}

function buildHTML(repos, meta, qrDataUrl) {
  const rows = repos.map((r, i) => rowHtml(r, i)).join('\n');

  // 语言分布条（取前 6 种语言，其余归"其他"）
  const counts = {};
  repos.forEach((r) => { const l = r.lang || '其他'; counts[l] = (counts[l] || 0) + 1; });
  const dist = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topLangs = dist.slice(0, 6);
  const other = dist.slice(6).reduce((s, [, c]) => s + c, 0);
  if (other > 0) topLangs.push(['其他', other]);
  const totalN = repos.length;
  const barHtml = topLangs
    .map(([l, c]) => `<div class="seg" style="width:${((c / totalN) * 100).toFixed(1)}%;background:${langColor(l === '其他' ? '' : l)}"></div>`)
    .join('');
  const legendHtml = topLangs
    .map(([l, c]) => `<span class="lg"><i style="background:${langColor(l === '其他' ? '' : l)}"></i>${esc(l)} ×${c}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#dfe7f2; font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",system-ui,"Segoe UI",sans-serif; }
  #wrap { width:1080px; padding:46px 42px 40px; background:linear-gradient(180deg,#e8effa 0%,#f7fafd 45%,#f2f6fb 100%); position:relative; }
  .deco { position:absolute; font-size:52px; opacity:.9; }
  .deco.l { top:36px; left:40px; } .deco.r { top:36px; right:40px; }
  header { text-align:center; padding:8px 0 26px; }
  .badge { display:inline-block; border:2px solid #2f6bff; color:#2f6bff; border-radius:999px; padding:7px 22px; font-size:16px; font-weight:600; letter-spacing:2px; }
  h1 { font-size:47px; font-weight:800; color:#17203a; margin-top:16px; letter-spacing:1px; }
  h1 .hl { color:#2f6bff; }
  .sub { margin-top:12px; font-size:19px; color:#5b6577; font-weight:500; }
  .stats { margin-top:10px; font-size:17px; color:#6b7688; }
  .stats b.red { color:#e5484d; font-size:19px; }
  .stats b.blue { color:#2f6bff; font-size:19px; }
  .stats b.dark { color:#24304d; font-size:19px; }
  .card { background:#fff; border-radius:26px; box-shadow:0 12px 40px rgba(23,52,102,.10); overflow:hidden; }
  main.card { margin-top:6px; }
  .row { display:flex; align-items:center; gap:14px; padding:19px 24px; border-bottom:1px solid #eef1f6; position:relative; }
  .row:last-child { border-bottom:none; }
  .rankwrap { position:relative; width:58px; flex:none; text-align:center; }
  .crown { font-size:22px; margin-bottom:2px; }
  .rank { width:58px; height:58px; border-radius:16px; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .rank span { font-size:11px; font-weight:700; letter-spacing:1px; opacity:.92; }
  .rank b { font-size:23px; font-weight:800; line-height:1; margin-top:1px; }
  .avatar { width:46px; height:46px; flex:none; border-radius:12px; color:#fff; font-size:22px; font-weight:800; display:flex; align-items:center; justify-content:center; }
  .info { flex:1; min-width:0; padding-right:4px; }
  .name { font-size:24px; font-weight:800; color:#17203a; letter-spacing:.2px; }
  .desc { font-size:16px; color:#4a5568; line-height:1.55; margin-top:6px; }
  .comment { font-size:14.5px; color:#8a94a6; line-height:1.5; margin-top:5px; }
  .quick { font-size:14px; color:#2c5db8; background:#f0f6ff; border-radius:8px; padding:6px 10px; margin-top:8px; line-height:1.5; display:inline-block; }
  .meta { margin-top:7px; font-size:13.5px; color:#8a94a6; display:flex; align-items:center; gap:6px; }
  .meta i { width:11px; height:11px; border-radius:3px; display:inline-block; }
  .metrics { flex:none; width:150px; text-align:right; }
  .mlabel { font-size:12.5px; color:#b25d63; font-weight:600; }
  .mlabel.m2 { color:#6b7688; }
  .delta { font-size:23px; font-weight:800; color:#e5484d; line-height:1.15; }
  .total { font-size:23px; font-weight:800; color:#24304d; line-height:1.15; }
  .pill { flex:none; width:128px; text-align:center; font-size:13.5px; font-weight:600; color:#5b6577; background:#eef1f6; border-radius:999px; padding:8px 0; }
  .pill.ai { color:#a16207; background:linear-gradient(135deg,#fff4d0,#ffe9a8); }
  .langblock { padding:20px 28px 22px; border-bottom:none; background:#fbfcfe; }
  .langtitle { font-size:15px; font-weight:700; color:#5b6577; margin-bottom:12px; letter-spacing:1px; }
  .langbar { display:flex; height:12px; border-radius:999px; overflow:hidden; gap:2px; }
  .legend { margin-top:12px; display:flex; flex-wrap:wrap; gap:8px 16px; }
  .lg { font-size:13px; color:#6b7688; display:flex; align-items:center; gap:5px; }
  .lg i { width:10px; height:10px; border-radius:3px; display:inline-block; }
  footer.card { margin-top:22px; padding:26px 30px; display:flex; align-items:center; gap:26px; }
  footer img { width:128px; height:128px; flex:none; border-radius:14px; border:1px solid #e5e9f2; }
  .ftext { font-size:14px; color:#6b7688; line-height:1.9; }
  .ftext b { color:#24304d; }
</style></head>
<body>
<div id="wrap">
  <div class="deco l">🖥️</div>
  <div class="deco r">🐙</div>
  <header>
    <div class="badge">★ GitHub Trending 每日精选</div>
    <h1>GitHub <span class="hl">每日热榜</span> · 开源日报</h1>
    <div class="sub">第 ${meta.week} 周 ｜ ${meta.dateStr} ${meta.weekday}</div>
    <div class="stats">
      今日合计新增 <b class="red">+${kfmt(meta.totals.delta)}</b>
      <span style="margin:0 10px;color:#c3cbd8">·</span> 榜单总星 <b class="blue">${kfmt(meta.totals.stars)}</b>
      <span style="margin:0 10px;color:#c3cbd8">·</span> AI 项目 <b class="dark">${meta.aiCount}/${repos.length}</b>
    </div>
  </header>

  <main class="card">
    ${rows}
    <div class="langblock">
      <div class="langtitle">📊 今日榜单语言分布</div>
      <div class="langbar">${barHtml}</div>
      <div class="legend">${legendHtml}</div>
    </div>
  </main>

  <footer class="card">
    <img src="${qrDataUrl}" alt="qr"/>
    <div class="ftext">
      <b>扫码直达 GitHub Trending</b><br/>
      数据来源 github.com/trending · 生成于 ${meta.dateStr} ${meta.timeStr}（UTC+8）<br/>
      中文简介与点评由 AI 生成，仅供参考 · 项目详情以官方仓库为准
    </div>
  </footer>
</div>
</body></html>`;
}

export async function renderReport(repos, meta, outDir) {
  const qrDataUrl = await QRCode.toDataURL('https://github.com/trending', {
    margin: 1,
    width: 256,
    color: { dark: '#17203a', light: '#ffffff' },
  });
  const html = buildHTML(repos, meta, qrDataUrl);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1200 }, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const latest = `${outDir}/latest.png`;
    await page.locator('#wrap').screenshot({ path: latest });
    const dated = `${outDir}/daily-${meta.dateStr.replaceAll('.', '-')}.png`;
    fs.copyFileSync(latest, dated);
    console.log(`图片已生成: ${latest}（副本 ${dated}）`);
    return latest;
  } finally {
    await browser.close();
  }
}
