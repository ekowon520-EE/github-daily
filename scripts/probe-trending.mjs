// 探针：观察 trending 页 Box-row 数量随时间的变化，验证截断/渐进渲染假设
import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ userAgent: UA, viewport: { width: 1280, height: 900 } });
  const t0 = Date.now();
  await page.goto('https://github.com/trending', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(`domcontentloaded @ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.waitForSelector('article.Box-row', { timeout: 30000 });
  console.log(`首个 Box-row 出现 @ ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  for (let i = 0; i < 8; i++) {
    const n = await page.$$eval('article.Box-row', (ns) => ns.length);
    console.log(`  t+${((Date.now() - t0) / 1000).toFixed(1)}s  Box-row = ${n}`);
    if (n >= 25) break;
    await page.mouse.wheel(0, 1200); // 滚到底，触发可能的懒加载
    await page.waitForTimeout(1500);
  }
  const bodyLen = (await page.content()).length;
  console.log(`页面 HTML 长度: ${bodyLen}`);

  // 看看抓到的 9 个是谁，页面上还有没有其他仓库链接形态
  const names = await page.$$eval('article.Box-row h2 a', (as) => as.map((a) => a.getAttribute('href')));
  console.log('Box-row 内仓库:', names.join(', '));
  const others = await page.$$eval('a[href^="/"]', (as) =>
    [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => /^[^/]+\/[^/]+$/.test(h.slice(1)) && !/^(features|topics|collections|trending|about|pricing|security|contact|sitemap|docs|organizations|enterprise|team|customer-stories|readme|events|explore|login|signup|pricing)/.test(h.slice(1))))]
  );
  console.log(`页面上其他疑似仓库链接 (${others.length}):`, others.slice(0, 40).join(' '));
} finally {
  await browser.close();
}
