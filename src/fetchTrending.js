// 数据抓取：GitHub trending 多页合并 + 官方 Search API 兜底
// 2026-11-09 起 GitHub 改版，综合日榜服务端只返回 ~9 条（原 25），需用语言分区日榜补足 TopN；
// 分区页同为"今日"口径、带真实今日新增星数；周榜/API 兜底条目今日星数为 0。
import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// 按常见热门度排序的语言分区页，用于补足
const LANG_PAGES = ['python', 'javascript', 'typescript', 'rust', 'go', 'c++', 'jupyter-notebook', 'java'];

async function scrapeTrendingPage(page, url, topN) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
          lang: lang || (url.match(/trending\/(.+?)\??$/) || [])[1]?.replace(/c\+\+/i, 'C++') || '',
          stars: parseInt((starLink?.textContent || '0').replace(/[,\s]/g, ''), 10) || 0,
          todayStars: todayMatch ? parseInt(todayMatch[1].replace(/,/g, ''), 10) : 0,
        };
      }),
    topN
  );
  return rows.filter((r) => r.fullName);
}

export async function fetchTrending(topN = 15) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ userAgent: UA, viewport: { width: 1280, height: 900 } });
    const seen = new Set();
    const merged = [];
    const push = (rows) => {
      for (const r of rows) {
        if (!seen.has(r.fullName)) {
          seen.add(r.fullName);
          merged.push(r);
        }
      }
    };

    // 1. 综合日榜：全局 Top，主榜排名以它为准（失败重试 1 次）
    let main = [];
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        main = await scrapeTrendingPage(page, 'https://github.com/trending', topN);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!main.length) throw lastErr || new Error('trending 综合页解析到 0 条');
    push(main);
    console.log(`综合日榜：${main.length} 条`);

    // 2. 不足 topN：按今日星数从语言分区日榜补
    if (merged.length < topN) {
      for (const lang of LANG_PAGES) {
        if (merged.length >= topN) break;
        try {
          const rows = await scrapeTrendingPage(page, `https://github.com/trending/${lang}`, topN);
          const before = merged.length;
          push(rows);
          if (merged.length > before) console.log(`${lang} 分区补 ${merged.length - before} 条（累计 ${merged.length}/${topN}）`);
        } catch (e) {
          console.warn(`${lang} 分区抓取失败（跳过）: ${e.message.split('\n')[0]}`);
        }
      }
    }

    // 3. 仍不足：周榜补（今日星数为 0，排尾部）
    if (merged.length < topN) {
      try {
        const rows = await scrapeTrendingPage(page, 'https://github.com/trending?since=weekly', topN);
        const before = merged.length;
        push(rows);
        if (merged.length > before) console.log(`周榜补 ${merged.length - before} 条（累计 ${merged.length}/${topN}）`);
      } catch (e) {
        console.warn(`周榜抓取失败（跳过）: ${e.message.split('\n')[0]}`);
      }
    }

    if (!merged.length) throw new Error('trending 全部来源解析到 0 条，页面结构可能已变化');

    // 主榜保持综合页原顺序，补充条目按今日新增星数降序
    const head = merged.splice(0, main.length);
    const rest = merged.sort((a, b) => (b.todayStars || 0) - (a.todayStars || 0));
    const out = [...head, ...rest].slice(0, topN);
    if (out.length < topN) console.warn(`警告：多源合并后仅 ${out.length}/${topN} 条，不足部分由官方 API 兜底`);
    console.log(`trending 合并完成：${out.length} 条`);
    return out;
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
