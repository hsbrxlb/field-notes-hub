# OEDRO 海外用户运营 Hub

这是 Oliver 的在线版上班记事本、项目进展仪表盘和工作成果档案。网站通过公开 GitHub Pages 发布，只读展示适合公开的工作摘要和成果。

研究、分析、内容生成、方案和文件制作继续由本地 Codex 与现有本地工具完成。Hub页面不调用AI、不提供在线编辑，也不保存完整私有工作数据；仓库内唯一的云端任务只负责每天检查公开问题并更新公开安全汇总。

## 当前页面

- `index.html`：最近完成、当前重点、下一步、关键决定和成果入口
- `work.html`：项目状态、待办、阻塞和下一动作
- `research.html`：研究项目、方法、参与方式、用户权利和 AI智能对话问卷介绍
- `user-voice.html`：本机问题处理工作的公开汇总、结论和行动
- `content-studio.html`：已经形成的内容、研究、方案和工作成果
- `topics.html`与`topic.html`：专题、稳定方法和经验记录
- `playbook.html`：工作方法和完成标准

`content-studio.html`路径为兼容旧链接而保留。页面已经改为只读成果档案，读取`data/content-studio.json`；没有填写表单、在线生成、浏览器草稿、版本审核、登录或数据库。

“问题与反馈”同时读取两份用途不同的数据：

- `data/demand-radar.json`：GitHub Actions每天生成的公开问题线索，只含受控分类、来源链接、处理原因和下一步；不含作者、完整原话、内部草稿或产品Fact ID。
- `data/user-voice.json`：人工确认后的重复问题、FAQ、研究、内容和产品行动汇总。

## 本地预览

```bash
python3 -m http.server 4173
```

打开`http://127.0.0.1:4173/`。

## 重要工作完成后的更新

本地 Codex 完成重要工作后，先准备一份公开安全的成果记录，再运行：

```bash
python3 scripts/update-hub-record.py --input <记录.json> --dry-run
python3 scripts/update-hub-record.py --input <记录.json>
```

记录可以同时更新一条成果和对应项目进度。正式提交前运行：

```bash
node scripts/check-content-studio.js
node scripts/check-public-user-voice.js
node scripts/test-public-user-voice-check.js
python3 scripts/test-update-hub-record.py
```

本地预览确认后提交并推送，GitHub Actions会自动发布。

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

公开问题检查由同一仓库的GitHub Actions每天北京时间09:17运行。选择非整点是为了降低GitHub Actions整点高负载造成的排队延迟；定时任务仍属于尽力调度，不保证分秒准时。它调用固定版本的私有OEDRO扫描代码，使用Tavily和YouTube只读API，并在同一次任务中校验、提交公开安全数据和部署Pages。扫描的SQLite、原始批次和日志只存在于临时云端运行目录，不进入Git。

YouTube检查每天执行8组固定查询，每组最多查看3个视频、每个视频最多20条顶层评论，并接收接口直接附带的回复。页面只公开本轮视频、评论、回复和不可读取视频的请求结果数，不公开作者或完整原文；不同查询可能产生重复结果。这扩大了免费官方API的覆盖，但不等于能搜索YouTube全站所有评论或全部回复。

ChatGPT Work云任务已经完成真实预检：能读取仓库，但创建测试分支返回GitHub集成权限拒绝，因此没有建立ChatGPT定时任务。当前只保留GitHub Actions这一条云端路线。

只有出现真实需求——网页直接编辑并永久保存、多人同时协作、不同用户权限，或私密业务数据必须在线存储——才重新评估后端。

## 视觉约束

- 保留深色流体背景和暖金点缀；
- `.main-content`保持透明；
- 常用文字不小于12px；
- 表单和控件文字不小于14px；
- 优先保留已经验证正常的页面和交互，不为重构而重构。
