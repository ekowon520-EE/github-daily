// 手工重推今天的日报（不重新抓取/渲染，直接用 output/ 里的现有数据）
// 用法：node src/repush.js            → 重推全部已配置通道
//       node src/repush.js wxpusher   → 只推 WxPusher（serverchan / email 同理）
//       node src/repush.js wxpusher https://example.com/latest.png → 带 图片URL 推 WxPusher
import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';
import { buildMarkdown } from './markdown.js';
import { notifyAll } from './notify.js';

const pick = process.argv[2] || '';
const imageUrl = process.argv[3] || '';

const emptyWx = { appToken: '', spt: '', uid: '', topicIds: [] };
const cfgFiltered = {
  wxpusher: pick === '' || pick === 'wxpusher' ? cfg.wxpusher : emptyWx,
  serverchan: pick === '' || pick === 'serverchan' ? cfg.serverchan : { sendKey: '' },
  email: pick === '' || pick === 'email' ? cfg.email : { host: '', user: '', pass: '', to: '' },
};

const { meta, repos } = JSON.parse(fs.readFileSync(path.resolve('output/data.json'), 'utf8'));
const markdown = buildMarkdown(repos, meta);
const title = `GitHub 每日热榜 ${meta.dateStr.slice(5)}${pick ? '' : '（重推）'}`;
const imagePath = fs.existsSync(path.resolve('output/latest.png')) ? path.resolve('output/latest.png') : '';

console.log(`重推 ${meta.dateStr} 日报${imageUrl ? '（带图片URL）' : ''} → ${pick || '全部通道'}`);
const results = await notifyAll(cfgFiltered, { title, markdown, imagePath, imageUrl });
console.log('推送结果:\n  ' + results.join('\n  '));
