// 中文简介 + 点评：智谱 GLM-4-Flash（免费）。未配置 key 或调用失败时自动降级。
import { heuristicTag } from './util.js';
import { cfg } from './config.js';

// API 地址由 config.llmBaseUrl 决定（默认智谱，可切 DeepSeek 等兼容接口）
const API = `${(cfg.llmBaseUrl || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '')}/chat/completions`;

const TAGS = 'AI/Agent、智能体框架、编码助手、插件与Skills、前端开发、后端服务、数据与工具、DevOps工具、移动开发、硬件与机器人、开源好奇货';

function buildPrompt(repos) {
  const list = repos.map((r, i) => ({
    idx: i + 1,
    fullName: r.fullName,
    lang: r.lang || '未知',
    desc: (r.desc || '（无官方描述）').slice(0, 200),
  }));
  return [
    `以下是 GitHub 今日 Trending 前 ${repos.length} 个仓库的信息（JSON 数组）。请为每个仓库生成：`,
    `1. zhDesc：不超过 45 字的中文简介，翻译/概括官方描述，保留关键技术要点，不要空话；`,
    `2. comment：不超过 35 字的中文点评，口语化，点明适用人群或价值（例如"适合想给 Claude Code 加技能库的开发者"）；`,
    `3. tag：从这些枚举里选一个最贴切的：${TAGS}。`,
    `另外，对 idx 为 1、2、3 的仓库，各生成 quickstart：不超过 40 字，说明它是什么/最大亮点/如何一句话上手。`,
    ``,
    `严格只输出一个 JSON 对象（不要 markdown 代码块），格式：`,
    `{"items":[{"idx":1,"fullName":"...","zhDesc":"...","comment":"...","tag":"..."}],"quickstarts":{"1":"...","2":"...","3":"..."}}`,
    `items 数量、顺序与输入一致，fullName 原样返回。`,
    ``,
    `仓库列表：`,
    JSON.stringify(list),
  ].join('\n');
}

function extractJSON(text) {
  const t = String(text).replace(/```json|```/g, '').trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('GLM 输出中没有 JSON');
  return JSON.parse(t.slice(s, e + 1));
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
    const body = {
      model: cfg.zhipuModel,
      temperature: 0.3,
      messages: [
        { role: 'system', content: '你是严谨的开源项目点评助手，只输出 JSON，不要输出任何其他内容。' },
        { role: 'user', content: buildPrompt(out) },
      ],
    };
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.zhipuKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`GLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const parsed = extractJSON(j.choices?.[0]?.message?.content || '');

    const byName = new Map((parsed.items || []).map((it) => [it.fullName, it]));
    const qs = parsed.quickstarts || {};
    const idxQs = (i) => qs[String(i)] || '';
    out.forEach((r, i) => {
      const it = byName.get(r.fullName);
      r.zhDesc = (it?.zhDesc || '').slice(0, 80) || r.desc || '暂无官方简介';
      r.comment = (it?.comment || '').slice(0, 60);
      r.tag = it?.tag || heuristicTag(r);
      if (i < 3) r.quickstart = (idxQs(i + 1) || '').slice(0, 60);
    });
    console.log('GLM 中文点评生成成功');
  } catch (e) {
    console.warn(`GLM 生成失败，降级为英文简介: ${e.message}`);
    out.forEach((r) => {
      if (!r.zhDesc) r.zhDesc = r.desc || '暂无官方简介';
      if (!r.tag) r.tag = heuristicTag(r);
    });
  }
  return out;
}
