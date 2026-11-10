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
.github/workflows/daily.yml  # 日报主流程（主触发：本地计划任务 08:20；schedule 仅兜底）
scripts/trigger-daily.mjs     # 本地触发器（Windows 计划任务调用，日志在 logs/trigger.log）
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

重推已有日报（不重新抓取）：`node src/repush.js`（全部通道）或 `node src/repush.js wxpusher`（单通道）。

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
   | `WXPUSHER_SPT` | WxPusher 极简推送码（SPT_ 开头，与 appToken 二选一即可） |
   | `WXPUSHER_APP_TOKEN` | WxPusher 应用的 appToken（用 SPT 则不用填） |
   | `WXPUSHER_UID` | 你的 UID |
   | `SCT_SENDKEY` | Server酱 SendKey |
   | `SMTP_USER` | 发件邮箱（如 QQ 邮箱地址） |
   | `SMTP_PASS` | 邮箱 SMTP 授权码（不是登录密码） |
   | `SMTP_TO` | 收件邮箱（不填则发给自己） |

   可选 Variables（同页面 Variables 标签）：`TOP_N`（榜单条数，默认 15）、`ZHIPU_MODEL`（默认 glm-4-flash）。

3. **启用并测试**：仓库 Actions 页 → 选中「GitHub 每日热榜」→ Run workflow 手动跑一次，看日志确认「推送结果」全绿。
4. **配置云端主触发 cron-job.org**（GitHub 自带 schedule 会被服务端静默丢弃、本仓库曾 3 天零次生效，所以用外部定时服务每天调 dispatch API，不依赖电脑开机）：
   - 登录 GitHub 网页 → Settings → Developer settings → **Fine-grained tokens** → Generate new token：Repository access 选 **Only select repositories → github-daily**；Permissions → Actions → **Read and write**；Expiration 建议选 1 年。生成后复制 `github_pat_` 开头的 token（只此一次机会）
   - 注册 **cron-job.org**（邮箱注册即可，免费无限制）→ Create Cronjob：
     - URL：`https://api.github.com/repos/ekowon520-EE/github-daily/actions/workflows/daily.yml/dispatches`
     - Method：**POST**；Body：`{"ref":"main"}`
     - Headers 添加：`Authorization: Bearer <你的github_pat_令牌>` 和 `Accept: application/vnd.github+json`
     - Schedule：每天 **08:03**，时区选 **Asia/Shanghai**
     - 保存后点 **Check now** 测试一次：Actions 页应出现新 run、手机应收到推送
     - 建议在 cron-job.org 的 Notifications 里开启失败邮件提醒
5. **配置本地备用触发**（电脑醒着时多一层保险，与云端触发由防重护栏自动去重）。管理员 PowerShell 执行一次：
   ```powershell
   $action = New-ScheduledTaskAction -Execute "node" -Argument "E:\AI\github-daily\scripts\trigger-daily.mjs" -WorkingDirectory "E:\AI\github-daily"
   $trigger = New-ScheduledTaskTrigger -Daily -At 8:20AM
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -WakeToRun
   Register-ScheduledTask -TaskName "GitHubDaily-Trigger" -Action $action -Trigger $trigger -Settings $settings -Description "每天 08:20 触发 GitHub 每日热榜（睡眠自动唤醒/晚开机补跑，已推送则自动跳过）"
   ```
6. 最终推送时间线（多层互备，防重护栏保证当日只推一次）：**08:03 cron-job.org（主）→ 08:20 本地任务（备①）→ 08:43 / 11:23 GitHub schedule（备②③）**。触发日志在 `logs/trigger.log`。图片每天会提交到仓库 `output/latest.png`，raw 地址作为 WxPusher/Server酱 图片消息的图床。

## 三、各服务开通指引

| 服务 | 步骤 | 费用 |
|---|---|---|
| **WxPusher** | 最简：客户端/官网「简单推送」页直接复制 `SPT`（SPT_ 开头的极简推送码）；或建应用拿 `appToken` + 关注后得 `UID` | 免费 |
| **Server酱** | 打开 sct.ftqq.com → 微信扫码登录 → 首页即显示 SendKey → 按提示关注公众号 | 免费版 5 条/天 |
| **QQ 邮箱授权码** | QQ邮箱网页版 → 设置 → 账户 → 「POP3/IMAP/SMTP」开启服务 → 生成授权码 | 免费 |
| **智谱 GLM** | open.bigmodel.cn → 注册 → API Keys → 创建复制。`glm-4-flash` 模型免费 | 免费 |

## 四、自定义

- **推送时间**：主触发改 cron-job.org 任务里的 Schedule 时间；备用 cron 改 `.github/workflows/daily.yml` 顶部两行 `cron`（UTC，+8 即北京时间）；本地备用任务改计划任务「GitHubDaily-Trigger」的时间。注意榜单数据是 UTC 日口径：越早推送"今日新增"星数越少，想要更饱满的数据可把主触发时间往后调（如 09:00）。
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
