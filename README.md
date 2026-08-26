# OEDRO海外用户运营工作台

公开站点用于查看海外用户运营的当前重点、项目进展、工作方法、用户研究、内容草稿和单项运营安排。

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
- `content-studio.html`：三步需求表单、结构草稿、审核和浏览器本地版本
- `topics.html`：运营专题列表
- `topic.html`：通用专题详情页
- `data/content.json`：共用文案和工作数据
- `data/topics.json`与`data/topics/`：专题索引和专题内容

专题详情支持两种数据结构：旧专题继续使用固定字段；新专题可使用`sections`数组，每个章节包含`title`，并按需要提供`paragraphs`、`items`或`rows`。来源可补`published_or_updated`和`supports`，说明更新时间与链接支持的具体主张。

内容生产页读取`data/content-studio.json`，由`content-studio.js`在浏览器生成结构草稿、保存版本并记录审核状态。数据只保存在当前浏览器`localStorage`；原有`oedro-content-studio-jobs-v1`记录继续兼容。不要填写PII、名单、账号、凭据或未公开业务数据。

## 实现取舍

本次重构先检查现有静态架构、RJSF、JSON Forms、Decap CMS、Payload、Postiz，以及Linear、Stripe Docs、GOV.UK、Basecamp和GitLab的实际信息结构。现有HTML、CSS、JavaScript和JSON已经覆盖核心功能；引入表单框架、CMS或发布系统会增加构建、权限和维护成本，因此继续使用无依赖静态实现。

复用的是成熟交互做法：任务入口优先、分步表单、内容与审核分区、项目表直接进入首屏、长资料按需展开、详情页保留页内导航。没有复制第三方代码、视觉资产或品牌表达。

## 部署

推送到`main`后，GitHub Actions把静态文件发布到GitHub Pages。

## 视觉

根站保留深色流体背景，把它作为环境层；正文使用连续工作区和稳定遮罩。不同页面按任务使用项目表、步骤切换、标签页、分步表单或详情导航，不再共用同一种内容模板。旧深色预览地址保留跳转，来源说明见`preview/THIRD_PARTY_NOTICES.md`。
