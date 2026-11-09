// 中文简介 + 点评：智谱 GLM（免费模型）。未配置 key 时降级为英文；
// 配置了 key 则必须出中文：解析失败自动重试、漏翻自动补翻，全失败即报错终止（宁可不推也不推英文版）。
import { jsonrepair } from 'jsonrepair';
import { heuristicTag } from './util.js';
import { cfg } from './config.js';

// API 地址由 config.llmBaseUrl 决定（默认智谱，可切 DeepSeek 等兼容接口）
const API = `${(cfg.llmBaseUrl || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '')}/chat/completions`;

const TAGS = 'AI/Agent、智能体框架、编码助手、插件与Skills、前端开发、后端服务、数据与工具、DevOps工具、移动开发、硬件与机器人、开源好奇货';

const JSON_RULES = [
  `输出硬性要求（违反任意一条即视为无效）：`,
  `- 只输出一个 JSON 对象，不要 markdown 代码块、不要解释文字、不要注释；`,
  `- 所有键和字符串值用双引号；字符串内部的 " 必须写成 \\"，不得有裸换行；`,
  `- 不得有尾随逗号（如 "tag":"...",} 这种写法是错误的）。`,
].join('\n');

function buildPrompt(repos, retryHint = '') {
  const list = repos.map((r, i) => ({
    idx: i + 1,
    fullName: r.fullName,
    lang: r.lang || '未知',
    desc: (r.desc || '（无官方描述）').slice(0, 200),
  }));
  return [
    `以下是 GitHub 今日 Trending 前 ${repos.length} 个仓库的信息（JSON 数组）。请为每个仓库生成：`,
    `1. zhDesc：不超过 45 字的中文简介，翻译/概括官方描述，保留关键技术要点，不要空话；必须是中文，不得照抄英文；`,
    `2. comment：不超过 35 字的中文点评，口语化，点明适用人群或价值（例如"适合想给 Claude Code 加技能库的开发者"）；`,
    `3. tag：从这些枚举里选一个最贴切的：${TAGS}。`,
    `另外，对 idx 为 1、2、3 的仓库，各生成 quickstart：不超过 40 字，说明它是什么/最大亮点/如何一句话上手。`,
    ``,
    JSON_RULES,
    `格式：`,
    `{"items":[{"idx":1,"fullName":"...","zhDesc":"...","comment":"...","tag":"..."}],"quickstarts":{"1":"...","2":"...","3":"..."}}`,
    `items 数量、顺序与输入一致，idx 与 fullName 原样返回。`,
    retryHint ? `\n${retryHint}` : '',
    ``,
    `仓库列表：`,
    JSON.stringify(list),
  ].filter(Boolean).join('\n');
}

const isChinese = (s) => /[一-鿿]/.test(String(s || ''));

export function extractJSON(text) {
  let t = String(text).replace(/```json|```/g, '').trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('GLM 输出中没有 JSON');
  t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch {}
  // 常见毛病：尾随逗号
  try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch {}
  // 终极兜底：jsonrepair（单引号键、缺引号、注释等都能修）
  return JSON.parse(jsonrepair(t));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 调 GLM 并解析，失败自动重试（重试时追加更严格的 JSON 指令）
async function callGLM(prompt, cfg) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const hint = attempt === 1 ? '' : `\n\n注意：上一次输出无法解析为合法 JSON，请重新生成并严格遵守 JSON 格式要求。`;
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.zhipuKey}` },
        body: JSON.stringify({
          model: cfg.zhipuModel,
          temperature: 0.3,
          messages: [
            { role: 'system', content: '你是严谨的开源项目点评助手，只输出 JSON，不要输出任何其他内容。' },
            { role: 'user', content: prompt + hint },
          ],
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) throw new Error(`GLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      return extractJSON(j.choices?.[0]?.message?.content || '');
    } catch (e) {
      lastErr = e;
      console.warn(`GLM 第 ${attempt}/3 次调用/解析失败: ${e.message}`);
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

// 把解析结果按 idx 回填；zhDesc 必须含中文才算有效，否则视为漏翻留空
function applyParsed(out, parsed) {
  const items = parsed.items || [];
  const byIdx = new Map();
  items.forEach((it, i) => byIdx.set(Number.isInteger(it?.idx) ? it.idx : i + 1, it || {}));
  const qs = parsed.quickstarts || {};
  out.forEach((r, i) => {
    const it = byIdx.get(i + 1) || {};
    const zh = (it.zhDesc || '').trim();
    if (isChinese(zh)) r.zhDesc = zh.slice(0, 80);
    const cm = (it.comment || '').trim();
    if (cm) r.comment = cm.slice(0, 60);
    r.tag = it.tag || r.tag || heuristicTag(r);
    if (i < 3) r.quickstart = ((qs[String(i + 1)] || '') + '').slice(0, 60);
  });
}

// 漏翻补翻：只把缺中文的条目再发一轮，最多 2 轮；仍缺的才用英文兜底
async function fillMissing(out, cfg) {
  for (let round = 1; round <= 2; round++) {
    const todo = out.filter((r) => !r.zhDesc);
    if (!todo.length) return;
    console.log(`第 ${round} 轮补翻：${todo.length} 条缺中文简介`);
    const list = todo.map((r, i) => ({ idx: i + 1, fullName: r.fullName, desc: (r.desc || '').slice(0, 200) || '（无官方描述）' }));
    try {
      const parsed = await callGLM(
        [
          `请把以下仓库的英文描述翻译/概括成中文简介（zhDesc，不超过 45 字，必须是中文），并从这些枚举选一个 tag：${TAGS}。`,
          JSON_RULES,
          `格式：{"items":[{"idx":1,"fullName":"...","zhDesc":"...","tag":"..."}]}`,
          ``,
          `仓库列表：`,
          JSON.stringify(list),
        ].join('\n'),
        cfg
      );
      const byIdx = new Map((parsed.items || []).map((it, i) => [Number.isInteger(it?.idx) ? it.idx : i + 1, it || {}]));
      todo.forEach((r, i) => {
        const zh = ((byIdx.get(i + 1) || {}).zhDesc || '').trim();
        if (isChinese(zh)) r.zhDesc = zh.slice(0, 80);
      });
    } catch (e) {
      console.warn(`补翻第 ${round} 轮失败: ${e.message}`);
    }
  }
  const rest = out.filter((r) => !r.zhDesc);
  if (rest.length) {
    console.warn(`警告：${rest.length} 条多轮补翻后仍未翻译，用英文简介兜底: ${rest.map((r) => r.fullName).join(', ')}`);
    rest.forEach((r) => { r.zhDesc = r.desc || '暂无官方简介'; });
  }
}

export async function summarize(repos, cfg) {
  const out = repos.map((r) => ({ ...r, zhDesc: '', comment: '', tag: '', quickstart: '' }));

  if (!cfg.zhipuKey) {
    console.log('未配置 ZHIPU_API_KEY，降级为无中文点评模式');
    out.forEach((r) => {
      r.zhDesc = r.desc || '暂无官方简介';
      r.tag = heuristicTag(r);
    });
    return out;
  }

  try {
    const parsed = await callGLM(buildPrompt(out), cfg);
    applyParsed(out, parsed);
    await fillMissing(out, cfg);
    const ok = out.filter((r) => r.zhDesc && isChinese(r.zhDesc)).length;
    console.log(`GLM 中文点评生成成功：${ok}/${out.length} 条为中文`);
  } catch (e) {
    console.error(`GLM 多次重试后仍失败: ${e.message} —— 终止运行，不推送英文版`);
    throw e;
  }
  return out;
}
