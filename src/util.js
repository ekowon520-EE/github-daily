// 通用工具：格式化、AI 关键词判定、语言配色、启发式分类

export const AI_KEYWORDS = [
  'ai', 'llm', 'llms', 'agent', 'agents', 'gpt', 'llama', 'rag', 'mcp',
  'claude', 'openai', 'gemini', 'deepseek', 'qwen', 'chatbot', 'diffusion',
  'transformer', 'embedding', 'prompt', 'neural', 'inference',
  'machine-learning', 'copilot', 'coding-agent', 'rlhf', 'vision', 'speech',
  'tts', 'asr', 'quant', 'ragflow',
];

export function isAIRepo(r) {
  const s = `${r.fullName} ${r.desc || ''} ${r.tag || ''}`.toLowerCase();
  return AI_KEYWORDS.some((k) => s.includes(k));
}

export function kfmt(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', 'C#': '#178600', HTML: '#e34c26', CSS: '#563d7c',
  Vue: '#41b883', Shell: '#89e051', Dart: '#00B4AB', Kotlin: '#A97BFF',
  Swift: '#F05138', 'Jupyter Notebook': '#DA5B0B', PHP: '#4F5D95',
  Ruby: '#701516', Lua: '#000080', Zig: '#ec915c', Svelte: '#ff3e00',
  MDX: '#fcb32c', Dockerfile: '#384d54', Nix: '#7e7eff',
  Makefile: '#427819', Julia: '#a270ba', R: '#198CE7', Scala: '#c22d40',
  Elixir: '#6e4a7e', PowerShell: '#012456', CMake: '#ED3421',
};

export function langColor(lang) {
  return LANG_COLORS[lang] || '#8b949e';
}

export function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - ys) / 86400000) + 1) / 7);
}

const FRONTEND_LANGS = ['JavaScript', 'TypeScript', 'Vue', 'HTML', 'CSS', 'Svelte', 'SCSS'];
const BACKEND_LANGS = ['Go', 'Rust', 'Java', 'Kotlin', 'C', 'C++', 'C#', 'PHP', 'Zig', 'Lua', 'Elixir', 'Scala'];
const OPS_LANGS = ['Shell', 'Dockerfile', 'Makefile', 'HCL', 'Nix', 'PowerShell'];
const DATA_LANGS = ['Python', 'Jupyter Notebook'];

export function heuristicTag(r) {
  if (isAIRepo(r)) return 'AI/Agent';
  const lang = r.lang || '';
  if (FRONTEND_LANGS.includes(lang)) return '前端开发';
  if (BACKEND_LANGS.includes(lang)) return '后端服务';
  if (OPS_LANGS.includes(lang)) return 'DevOps工具';
  if (DATA_LANGS.includes(lang)) return '数据与工具';
  if (['Swift', 'Dart'].includes(lang)) return '移动开发';
  return '开源好奇货';
}

export function avatarColor(name) {
  const palette = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#84cc16'];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
