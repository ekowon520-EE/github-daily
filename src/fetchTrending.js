// 数据抓取：主源 github.com/trending 页面解析（Playwright），备源官方 Search API
import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export async function fetchTrending(topN = 15) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ userAgent: UA, viewport: { width: 1280, height: 900 } });
    await page.goto('https://github.com/trending', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('article.Box-row', { timeout: 30000 });

    const rows = await page.$$eval(
      'article.Box-row',
      (nodes, topN) =>
        nodes.slice(0, topN).map((row) => {
          const href = row.querySelector('h2 a')?.getAttribute('href') || '';
          const desc = row.querySelector('p')?.textContent?.trim() || '';
          const lang = row.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || '';
          const starLink = [...row.querySelectorAll('a')].find((a) =>
            (a.getAttribute('href') || '').endsWith('/stargazers')
          );
          const todayMatch = row.textContent.match(/([\d,]+)\s+stars\s+today/i);
          return {
            fullName: href.replace(/^\//, ''),
            desc,
            lang,
            stars: parseInt((starLink?.textContent || '0').replace(/[,\s]/g, ''), 10) || 0,
            todayStars: todayMatch ? parseInt(todayMatch[1].replace(/,/g, ''), 10) : 0,
          };
        }),
      topN
    );

    const cleaned = rows.filter((r) => r.fullName);
    if (!cleaned.length) throw new Error('trending 页面解析到 0 条，页面结构可能已变化');
    console.log(`trending 抓取成功：${cleaned.length} 条`);
    return cleaned;
  } finally {
    await browser.close();
  }
}

// 兜底：官方 Search API，取近 14 天新创建且星数最高的仓库
export async function fetchFallbackOfficial(topN = 15) {
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const url = `https://api.github.com/search/repositories?q=created:%3E${since}&sort=stars&order=desc&per_page=${topN}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`官方 Search API 兜底失败: HTTP ${res.status}`);
  const j = await res.json();
  const items = (j.items || []).map((it) => ({
    fullName: it.full_name,
    desc: (it.description || '').slice(0, 300),
    lang: it.language || '',
    stars: it.stargazers_count || 0,
    todayStars: 0,
  }));
  if (!items.length) throw new Error('官方 Search API 兜底返回 0 条');
  console.log(`官方 API 兜底成功：${items.length} 条`);
  return items;
}
