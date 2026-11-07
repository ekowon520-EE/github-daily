# GitHub 每日热榜 · 开源日报

每天早上自动抓取 GitHub Trending 前 15 名，生成一张精美的中文日报长图（含 AI 中文点评、语言分布、二维码），推送到 **WxPusher / Server酱（微信）** 和 **邮箱**。

## 功能

- 🏆 综合 Top 15 + AI/Agent 项目金色高亮标注
- 💡 AI 中文一句话点评 + Top 3 上手速览（GLM-4-Flash，免费；不配 key 自动降级为英文简介）
- 📊 头部统计带（今日合计新增 / 榜单总星 / AI 占比）+ 语言分布色条
- 📱 底部扫码直达 Trending
- 🛡️ 双数据源：trending 页面解析为主，官方 Search API 兜底
- 📄 图片推 JSON 数据归档在 `output/`，可回溯历史

## 目录结构

```
src/
  fetchTrending.js   # 抓取（Playwright 解析 trending 页 + 官方 API 兜底）
  summarize.js       # GLM-4-Flash 中文简介/点评/分类（可降级）
  render.js          # HTML 模板 → Playwright 截图
  markdown.js        # 文字版摘要
  notify.js          # WxPusher / Server酱 / 邮箱 三通道
  index.js           # 主流程
.github/workflows/daily.yml  # GitHub Actions 定时任务（每天 08:07 北京时间）
output/              # 生成的图片与数据（Actions 会提交回仓库当图床）
```

## 一、本地运行（测试用）

要求 Node ≥ 18。

```bash
cd E:\AI\github-daily
npm install
npx playwright install chromium
copy .env.example .env   # 按需填写，不填也能跑（只是没有中文点评和推送）
npm start
```

产物在 `output/latest.png`，双击打开即可预览效果。

## 二、GitHub Actions 部署（正式启用）

1. **建仓库**：GitHub 新建一个 **私有仓库**（如 `github-daily`），把本目录推上去：
   ```bash
   cd E:\AI\github-daily
   git init && git add -A && git commit -m "init: github daily report"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/github-daily.git
   git push -u origin main
   ```
2. **配置 Secrets**：仓库页面 → Settings → Secrets and variables → Actions → `New repository secret`，逐条添加（用不到的可以不加，对应通道会自动跳过）：

   | Secret 名称 | 说明 |
   |---|---|
   | `ZHIPU_API_KEY` | 智谱开放平台 API Key（免费申请） |
   | `WXPUSHER_APP_TOKEN` | WxPusher 应用的 appToken |
   | `WXPUSHER_UID` | 你的 UID |
   | `SCT_SENDKEY` | Server酱 SendKey |
   | `SMTP_USER` | 发件邮箱（如 QQ 邮箱地址） |
   | `SMTP_PASS` | 邮箱 SMTP 授权码（不是登录密码） |
   | `SMTP_TO` | 收件邮箱（不填则发给自己） |

   可选 Variables（同页面 Variables 标签）：`TOP_N`（榜单条数，默认 15）、`ZHIPU_MODEL`（默认 glm-4-flash）。

3. **启用并测试**：仓库 Actions 页 → 选中「GitHub 每日热榜」→ Run workflow 手动跑一次，看日志确认「推送结果」全绿。
4. 之后每天北京时间 08:07 左右自动推送（Actions 定时器可能有几分钟到半小时的延迟，属正常现象）。图片每天会提交到仓库 `output/latest.png`，raw 地址作为 WxPusher/Server酱 图片消息的图床。

## 三、各服务开通指引

| 服务 | 步骤 | 费用 |
|---|---|---|
| **WxPusher** | ① 打开 wxpusher.zjiecode.com 微信扫码登录 ② 「应用管理」→ 创建应用 → 拿到 `appToken` ③ 用微信扫应用的二维码关注 ④ 「用户管理」里看到你的 `UID` | 免费 |
| **Server酱** | 打开 sct.ftqq.com → 微信扫码登录 → 首页即显示 SendKey → 按提示关注公众号 | 免费版 5 条/天 |
| **QQ 邮箱授权码** | QQ邮箱网页版 → 设置 → 账户 → 「POP3/IMAP/SMTP」开启服务 → 生成授权码 | 免费 |
| **智谱 GLM** | open.bigmodel.cn → 注册 → API Keys → 创建复制。`glm-4-flash` 模型免费 | 免费 |

## 四、自定义

- **推送时间**：改 `.github/workflows/daily.yml` 里的 `cron: "7 0 * * *"`（UTC 时间，+8 即北京时间）。
- **榜单条数**：改 `TOP_N`。
- **样式**：`src/render.js` 里的 CSS（配色、字号、卡片圆角都在注释分块处）。
- **分类标签**：`src/util.js` 的 `AI_KEYWORDS` / `heuristicTag`，以及 `src/summarize.js` 的 `TAGS` 枚举。
- **只推 AI 专榜**：`src/fetchTrending.js` 的 `fetchTrending` 里抓 `https://github.com/trending` 可改成按语言筛选（如 `?l=python`），或在 `index.js` 抓取后 `repos.filter(isAIRepo)`。

## 五、常见问题

- **Actions 截图中文变方块**：workflow 已安装 `fonts-noto-cjk`，不要删那一步。
- **WxPusher 收到的图片点开是链接**：第一次运行时仓库里还没有 `output/latest.png`，第二次起正常；也可先手动跑一次 workflow。
- **图片未出现在微信**：确认仓库是 **私有** 时 raw 地址也能访问吗？——注意：**私有仓库的 raw 地址需要登录才能访问**，WxPusher/Server酱 的服务器抓不到图。要图片直达，请把仓库设为 **公开**（图片本身是公开榜单数据，无隐私风险），或者只用「文字摘要」消息 + 邮箱通道看原图。
- **额度**：Server酱免费版 5 条/天（每天只用 1-2 条）；WxPusher 额度宽松；GitHub Actions 私有仓库每月免费 2000 分钟，本任务每天约 3 分钟。
- **trending 页面改版导致解析失败**：会自动切官方 Search API 兜底，日报不会中断；长期失败需更新 `fetchTrending.js` 的选择器。

## 成本

全链路 0 元（GitHub Actions + WxPusher + Server酱免费额度 + QQ 邮箱 + GLM-4-Flash）。
