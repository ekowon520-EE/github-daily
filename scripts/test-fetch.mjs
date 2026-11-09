// 本地测试：只测抓取链路（多源合并），不渲染不推送
import { fetchTrending } from '../src/fetchTrending.js';

const topN = parseInt(process.argv[2] || '15', 10);
const repos = await fetchTrending(topN);
console.log('---');
repos.forEach((r, i) =>
  console.log(`${i + 1}. ${r.fullName} [${r.lang}] 总星${r.stars} 今日+${r.todayStars}${r.desc ? ' ｜ ' + r.desc.slice(0, 60) : ''}`)
);
console.log(`\n合计 ${repos.length}/${topN} 条，唯一性: ${new Set(repos.map((r) => r.fullName)).size}`);
process.exit(repos.length === topN ? 0 : 1);
