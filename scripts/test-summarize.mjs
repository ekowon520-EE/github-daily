// 本地测试：只测翻译链路（extractJSON 容错 + 真实 GLM 调用），不渲染不推送
// 用法：node scripts/test-summarize.mjs [模型名]，如 node scripts/test-summarize.mjs glm-4.5-flash
import { cfg } from '../src/config.js';
import { summarize, extractJSON } from '../src/summarize.js';
import fs from 'node:fs';

// —— 1. extractJSON 容错单测 ——
const cases = [
  ['正常 JSON', '{"items":[{"idx":1,"zhDesc":"测试"}]}', false],
  ['markdown 围栏', '```json\n{"items":[{"idx":1,"zhDesc":"测试"}]}\n```', false],
  ['尾随逗号', '{"items":[{"idx":1,"zhDesc":"测试","tag":"AI/Agent",}],}', false],
  ['前后废话', '好的，以下是结果：\n{"items":[{"idx":1,"zhDesc":"测试"}]}\n希望有帮助', false],
  ['单引号+缺引号', "{'items':[{'idx':1,zhDesc:'测试'}]}", false],
  ['彻底乱码', '这不是 JSON', true],
];
let pass = 0;
for (const [name, input, shouldThrow] of cases) {
  try {
    const r = extractJSON(input);
    if (shouldThrow) console.log(`  ✗ ${name}: 本应抛错却成功`);
    else { console.log(`  ✓ ${name}`); pass++; }
  } catch (e) {
    if (shouldThrow) { console.log(`  ✓ ${name}（按预期抛错）`); pass++; }
    else console.log(`  ✗ ${name}: ${e.message}`);
  }
}
console.log(`extractJSON 容错: ${pass}/${cases.length}\n`);

// —— 2. 真实 GLM 调用（用今天 data.json 里的仓库，剥掉旧字段强制重翻）——
const model = process.argv[2] || cfg.zhipuModel;
const { repos } = JSON.parse(fs.readFileSync('output/data.json', 'utf8'));
const clean = repos.map(({ zhDesc, comment, tag, quickstart, ...r }) => r);
console.log(`用模型 ${model} 翻译 ${clean.length} 条（key: ${cfg.zhipuKey ? cfg.zhipuKey.slice(0, 8) + '...' : '无'}）...\n`);

const t0 = Date.now();
const out = await summarize(clean, { ...cfg, zhipuModel: model });
const secs = ((Date.now() - t0) / 1000).toFixed(1);

for (const r of out) {
  console.log(`${r.fullName}  [${r.tag}]`);
  console.log(`  简介: ${r.zhDesc}`);
  console.log(`  点评: ${r.comment || '（空）'}${r.quickstart ? `\n  上手: ${r.quickstart}` : ''}`);
}
const ok = out.filter((r) => /[一-鿿]/.test(r.zhDesc)).length;
console.log(`\n结果: ${ok}/${out.length} 条为中文，耗时 ${secs}s`);
process.exit(ok === out.length ? 0 : 1);
