# OEDRO海外用户运营工作台

公开站点用于查看海外用户运营的当前重点、项目进展、工作方法、用户研究、公开用户洞察、内容草稿和单项运营安排。

## 本地预览

```bash
python3 -m http.server 4173
```

打开 `http://127.0.0.1:4173/`。

## 发布边界

- 不包含用户个人信息、公司账号、内部联系人、精确业务金额或未批准承诺。
- 页面只展示公开安全的工作状态和方法，不包含联系人或内部明细。
- 讨论和建议不写成已完成。

## 文件

- `index.html`：总览
- `playbook.html`：六个工作阶段，按步骤切换查看
- `work.html`：当前项目与依赖
- `research.html`：当前研究、研究方法、参与方式、用户权利和Light Lab
- `user-voice.html`：公开问题与反馈的洞察与处理流程
- `content-studio.html`：快速模板、内部草稿、审核和浏览器本地版本
- `topics.html`：运营专题列表
- `topic.html`：通用专题详情页
- `data/content.json`：共用文案和工作数据
- `data/user-voice.json`：本机问题与反馈流程导出的公开安全汇总
- `data/topics.json`与`data/topics/`：专题索引和专题内容

专题详情支持两种数据结构：旧专题继续使用固定字段；新专题可使用`sections`数组，每个章节包含`title`，并按需要提供`paragraphs`、`items`或`rows`。来源可补`published_or_updated`和`supports`，说明更新时间与链接支持的具体主张。

内容生产页读取`data/content-studio.json`。默认只问具体事情、联系对象与希望动作、已确认事实，再用本机模板生成内部草稿；渠道、许可、素材和模块条件放在“更多设置”与批准前检查中。生成、保存和审核都在浏览器完成，不使用API Key、不调用大模型，也不会启动Codex App。

数据只保存在当前浏览器`localStorage`。原有`oedro-content-studio-jobs-v1`继续读取；未完成内容另存为`oedro-content-studio-draft-v2`。页面支持整库备份、单项导出及恢复，换浏览器、换电脑或清除网站数据前应先导出备份。它也能导入本机`oedro_user_voice export-content-task`生成的已批准任务包。不要填写PII、名单、账号、凭据或未公开业务数据。

“从外部渠道到长期用户关系”专题说明公开评论怎样进入人工核对、重复问题、具体动作和自愿参与流程，并连接内容生产、Discord社区和品牌声音专题。

问题与反馈页只接受本机`oedro_user_voice export-public`生成的固定字段。发布前运行`node scripts/check-public-user-voice.js`和`node scripts/test-public-user-voice-check.js`；出现原问题、作者、草稿、回复链接或本机地址时停止发布。

## 实现取舍

本次重构先检查现有静态架构、RJSF、JSON Forms、Decap CMS、Payload、Postiz，以及Linear、Stripe Docs、GOV.UK、Basecamp和GitLab的实际信息结构。现有HTML、CSS、JavaScript和JSON已经覆盖核心功能；引入表单框架、CMS或发布系统会增加构建、权限和维护成本，因此继续使用无依赖静态实现。

复用的是成熟交互做法：任务入口优先、分步表单、内容与审核分区、项目表直接进入首屏、长资料按需展开、详情页保留页内导航。没有复制第三方代码、视觉资产或品牌表达。

## 部署

推送到`main`后，GitHub Actions把静态文件发布到GitHub Pages。

## 视觉

根站保留深色流体背景。正文文字必须直接排在`assets/background.png`上，`.main-content`长期保持透明；不得再增加覆盖正文区域或整页底图的canvas、scrim、veil、半透明底板或暗色蒙层。常用文字不得小于12px，表单文字与placeholder不得小于14px；优先使用纯白或高亮白、深色文字阴影、字重、排版位置和底图裁切提高可读性。

侧栏、顶部导航、输入框、状态提示和弹出层可以保留完成交互所需的局部表面。不同页面按任务使用项目表、步骤切换、标签页、分步表单或详情导航。旧深色预览地址保留跳转，来源说明见`preview/THIRD_PARTY_NOTICES.md`。
