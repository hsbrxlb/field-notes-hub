# OEDRO 海外用户运营 Hub

这是 Oliver 的在线版上班记事本和工作成果档案，主要供 Oliver 日常查看。网站通过公开 GitHub Pages 发布，URL 仍可公开访问。

研究、分析、内容生成、方案和文件制作继续由本地 Codex 与现有本地工具完成。Hub页面不调用AI、不提供在线编辑，也不保存完整私有工作数据。OEDRO公开问题由本机Codex自动任务每天检查，GitHub Actions只在收到代码推送后校验并发布网页。

## 当前页面

- `customer-analytics.html`：切换全体客户与首批触达样本，查看购买次数、历史累计订单金额分布和邮件订阅状态；首批另有订阅与购买交叉、名单来源重叠。图表可点选查看人数和占比，分母随范围切换。新增 JSON 只含聚合人数，不含客户明细或财务总额；样本不能外推全体，无日期字段不展示趋势。

- `first-outreach.html` / `first-outreach-users.html`：近期访问与累计高消费客户的筛选说明、合并去重名单和分类分页；只展示获授权的客户编号、打码邮箱、历史订单、订阅状态与分类。`data/first-outreach-users.json` 保留原近期批次作为核对基准，当前名单读取 `data/outreach-users.json`；发布前运行 `node scripts/check-outreach-users.js`。

- `products.html`：产品知识库；1,209 条目录记录按 12 个分类拆分加载，每页只渲染 24 件，完整适配、规格、说明、媒体和政策快照可按商品展开。标题与统计区顶部对齐。
- `fakesite/`：独立站样站，侧栏直接进入首页；包含 Blog、两篇完整指南、FAQ 和草稿编辑演示。保留独立的品牌页面外观，不套 Hub 阅读外壳。页面标明设计演示并禁止索引，不连接购物或真实发布。
- `fakesite/editor.html`：可预览、在浏览器保存并下载 Markdown/JSON 草稿；这不是员工登录后台，也不会把内容提交到仓库。正式发文优先接公司现有后台；没有现成能力时再评估 Pages CMS 或 Decap 的认证与仓库授权。
- 样站检查：`node scripts/check-fakesite.js`；发布流程同时检查源码和最终 Pages 文件。公开目录只包含运行所需网页、脚本、字体和图片，没有研究原件或本地运行记录。

- `index.html`：直接进入 Discord 社群
- `research.html`：统一的“AI问卷”，完整界面预览与“开始AI调研问卷”入口。`light-research.html` 保留为同内容兼容入口；独立应用源码位于 `apps/light-research`。
- `user-voice.html`：OEDRO讨论全网捕捉，以讨论卡片展示具体主题、社区、平台和原帖入口；仅在存在已批准记录时呈现洞察与行动。抓取状态和内部处理字段保留在数据中，不占据阅读页面。
- `first-outreach.html`：首批触达用户，展示筛选区间、分层与试发建议；人数链接进入 `first-outreach-users.html`，在线查看合并后 5,232 人的分页表格，不设搜索。
- 2026-09-15 Oliver明确批准本批客户编号、打码邮箱、历史订单数与金额、订阅状态随Hub发布，同一范围不再重复确认。仅适用于该批指定字段，不扩大到完整邮箱或其他名单。
- `discord-invite-plan.html`：邀请加入Discord活动方案，展示待审批的优惠、申领流程、额度与发送批次；未启动，不代表已经发券或发信。两页检查为 `node scripts/check-outreach-pages.js`，已接入源码及最终发布目录的校验。
- `content-studio.html`：社媒内容自动化生产，先展示一个选题形成三平台 AI 图文、人工确认后使用的流程，再说明输入与交付；三平台样稿作为下方实例，完整 Prompt、作品和中文对照进入 `content-pipeline-test.html` 查看。
- `social-brand.html`：社媒品牌升级讨论方案，产品与购买信息、车主交流内容与平台分工。
- `merch-plan.html`：Oedro周边，含四张概念图、产品优先级和同行实物参考；周边覆盖日常使用、赠送、购买和活动参与。
- 两页使用 `brand-plan.css`，正文为静态 HTML，共用 `data/content.json` 导航；验证：`node scripts/check-brand-plans.js`。更新不能把企划改写成已经执行的运营结果。
- `content-pipeline-test.html`：仅展示当前 Instagram、X 和 YouTube 社区图文的 Prompt、简短目的与作品，中文对照默认展开。历史作品和公开安全的来源、审核记录保留在数据中，不在当前审阅页展示。

  维护说明：Hub 的 `youtube` 对应 Skill 的 `youtube_community`。本次验收范围是静态作品页，完整自动管线尚未通过；Instagram 原生图片为 1122×1402，低于预设目标，保持原尺寸。
- `flipbooks.html`：Flip Book Demo（翻页书），进入 Brand Story 与 Car Owner Survey
- `mascot.html`：OEDRO 吉祥物角色展示：小欧、金金、阿稳三个品牌伙伴方向与救援踏板产品伙伴，共十四张大图及对话、邮件应用示意。不设置选角标签；未使用的旧图从当前发布资源中移除，版本历史保留于 Git。
- `mascot-workflow.html`：吉祥物设计的skill，可直接复制或下载完整的跨品牌吉祥物工作包，供其他 Codex 或 AI 使用，不依赖本机私有路径。
- 侧栏分别进入“SEO与AI搜索”“Discord频道设计”“Oedro persona”，沿用对应的 `topic.html?slug=...` 网址。“Discord频道设计”位于侧栏最底部，新触达名单与邀请活动方案位于用户邮件模板之后。`topics.html` 仅保留旧链接所需的资料索引。
- Discord 配置位于频道结构下方；没有实际用途证据的机器人与空配置区不显示。品牌表达页包含品牌名大小写建议和六个双语场景示例，示例不代表已发送消息。
- 原“公开信号与用户关系”网址兼容跳转至讨论卡片；页面已移除通用处理流程说明，旧 `#feedback-method` 链接仍可打开。
- `research-library.html`、`sites-systems.html`、`playbook.html` 已退出导航，只保留旧网址的定向跳转。

`content-studio.html` 为只读流程介绍页，与独立样稿页复用 `data/content-pipeline-tests.json` 的当前作品数据，分别渲染概览与完整样稿；页面不触发生成或发布，不提供表单、登录或数据库。

维护记录：2026年9月9日创意样稿由现有 Skills 与总控整合完成；完整自动内容包校验尚未通过，Hub 展示验收不代表整套工作流通过。

`flipbooks.html` 是两本书的统一入口。书内左上角返回该页面；Car Owner Survey 的回答保存在访问者当前浏览器。

两本书使用已修复的软页引擎：末页保持柔软且不自动退出，拖回起点可取消，保存回答立即更新。独立翻页源项目的重建顺序：核对 `scripts/flipbook-baseline-sha256.json`，依次应用 `scripts/flipbook-source.patch` 与 `scripts/flipbook-integration.patch`，运行 `npm run build`；只把构建产物同步到 `experiences/flipbooks`。这些补丁不作为网页资源发布。不要从未打补丁的旧源项目覆盖当前构建。

“问题与反馈”同时读取两份用途不同的数据：

- `data/demand-radar.json`：本机Codex每天生成的公开问题线索，保存受控分类、来源链接、处理原因和下一步。作者、完整原话、内部草稿和产品Fact ID不会进入公开文件。
- `data/user-voice.json`：人工确认后的重复问题、FAQ、研究、内容和产品行动汇总。

## 本地预览

```bash
python3 -m http.server 4173
```

打开`http://127.0.0.1:4173/`。

首页直接进入 Discord 社群；工作入口统一由左侧导航提供，不恢复总览和重复成果摘要。

## 重要工作完成后的更新

本地 Codex 完成重要工作后，准备一份公开安全的成果记录。检查无误后运行：

```bash
python3 scripts/update-hub-record.py --input <记录.json> --dry-run
python3 scripts/update-hub-record.py --input <记录.json>
```

记录只更新成果；项目进展栏目已移除，`project_update` 输入会明确拒绝。正式提交前运行：

```bash
node scripts/check-content-studio.js
node scripts/test-hub-navigation.js
node scripts/test-user-voice-render.js
node scripts/test-content-automation.js
python3 scripts/test-customer-analytics.py
node scripts/check-content-pipeline-tests.js
node scripts/test-content-pipeline-records.js
node scripts/check-public-pages.js
node scripts/check-public-user-voice.js
node scripts/test-public-user-voice-check.js
python3 scripts/test-update-hub-record.py
python3 scripts/build-products-data.py
node scripts/check-products.js
```

本地预览确认后提交并推送，GitHub Actions会自动发布。

用户数据分析更新时，将已核实的后台计数作为 `--snapshot` 输入运行 `scripts/build-customer-analytics.py`，首批样本从既有 `data/outreach-users.json` 聚合。省略 `--snapshot` 会生成待补数据状态，不能覆盖已核实的全体快照。`test-customer-analytics.py` 只读取并核对已发布聚合，不重写数据；发布流程同时检查源码和最终产物中的聚合文件。

## 成果展示

每项成果至少记录日期、项目、类型、说明、用途、状态和关联工作。

成果可以只有公开安全摘要。有适合公开的图片、PDF或视频时，可作为静态文件放入`assets`并提供查看或下载入口；没有必要为了下载文件引入后端。

## 公开边界

公开仓库和页面不包含：

- 用户个人信息、账号和完整原始记录；
- 密码、密钥、Cookie或其他凭据；
- 公司敏感数据和未公开商业资料；
- 未批准承诺、假进展和未经核实的结果；
- 本机路径和完整私有数据库。

不适合公开的成果只记录安全摘要，完整材料继续留在本地知识库或项目目录。

## 当前架构决定

当前继续使用静态 HTML、CSS、JavaScript、JSON、GitHub仓库和GitHub Pages。不接Supabase、Firebase、Cloudflare数据库、登录系统或AI API。

公开问题检查由本机Codex自动任务每天北京时间09:17运行。Codex调用固定版本的私有OEDRO扫描代码，使用Tavily、YouTube和Bluesky只读接口。公开安全的完整快照、查询游标和去重状态会先写入本机耐久outbox；Hub工作区有其他改动时仍继续扫描，只延迟公开发布。发布使用独立临时Git工作区，并且只允许提交`data/demand-radar.json`和`.github/demand-radar-state.json`。扫描临时目录、SQLite、原始批次和日志不会进入Git。GitHub Actions不再定时扫描，只负责校验推送内容和发布Pages。

YouTube检查每天执行8组固定查询，每组最多查看3个视频、每个视频最多20条顶层评论，并接收接口直接附带的回复。页面公开本轮视频、评论、回复和不可读取视频的请求结果数；作者和完整原文不会公开。不同查询可能产生重复结果。这扩大了免费官方API的覆盖，但不等于能搜索YouTube全站所有评论或全部回复。

Bluesky检查每天通过现有Tavily免费额度运行1组限定`bsky.app`的`OEDRO`品牌查询。官方AppView在本机可匿名读取，但GitHub云端出口连续返回403，因此未作为生产来源。新增查询约增加30 credits/月，当前Tavily总量约510 credits/月，仍低于1000免费额度；页面只公开聚合数量和通过固定门槛的原帖链接。

此前的ChatGPT Work云任务和GitHub定时扫描已经停用。当前只保留本机Codex每日任务这一条扫描路线；GitHub仓库与Pages继续作为公开代码和网页托管位置。

需要重新评估后端的情况包括：网页直接编辑并永久保存、多人同时协作、不同用户权限，或私密业务数据必须在线存储。

## 设计与发布检查

整站设计规则见 `design.md`。Hub 固定保留 `assets/background.png` 流体底图，正文与侧栏通过深色半透明阅读面保持清晰，不使用文字阴影；侧栏不设置页内搜索，辅助信息不小于 12px，触控目标不小于 44×44px。

980px 以下导航收起、表格采用键值行，手机菜单支持触摸、Tab 和 Escape，并恢复原焦点。导航打开时隐藏后方正文以避免文字重影，底图保持可见。数据加载失败可重试；空项目列表明确提示，而不是留下空白。

页面或可见文案变更还需运行：

```bash
node scripts/check-anti-slop.js
node scripts/check-email-templates.js
```

## Light Research

侧边栏的“AI问卷”进入 `research.html`，可打开云端真实 AI 访谈（https://oedro-light-research.onrender.com/）。GitHub Pages 发布的是入口和界面预览，不执行模型调用。完整 Next.js 应用位于 `apps/light-research`，由 Render 免费 Web Service 运行，回答与访谈进度保存于 Neon 免费 PostgreSQL；模型凭据只配置在服务端。它不进入 Pages 静态发布目录，也不依赖本机开机。

当前只保留 Oliver 选定的 Hawthorne 字体版本。参见应用目录的 README 获取启动和验证命令。

## 产品资料分享页

`product-library.html` 是供同事直接浏览的独立入口，复用产品图片、分类、详情与 `data/products` 数据，不加载 Hub 导航或工作计划。它仍是公开静态页面，独立入口不构成访问控制。

“下载 Markdown”在浏览器本地生成当前分类、品牌及资料状态筛选下的全部记录，包含所有分页。文件保留清单、分类元信息与每条产品的完整 JSON 字段，供 AI 读取；价格库存是原抓取时快照。无上传或模型调用。验证：`node scripts/check-product-library.js` 和 `node scripts/check-products.js`。
