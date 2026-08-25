# OEDRO海外用户运营工作台

公开站点用于查看赢他为什么开始建设海外用户运营、从哪里开始、当前进展和单项运营安排。

## 本地预览

```bash
python3 -m http.server 4173
```

打开 `http://127.0.0.1:4173/`。

## 发布边界

- 不包含用户个人信息、公司账号、内部联系人、精确业务金额或未批准承诺。
- 首页不展示具体产品、近期访谈或单项数据任务。
- 讨论和建议不写成已完成。

## 文件

- `index.html`：总览
- `playbook.html`：工作方法
- `work.html`：当前项目与依赖
- `research.html`：研究方法与参与项目
- `topics.html`：运营专题列表
- `topic.html`：通用专题详情页
- `data/content.json`：共用文案和工作数据
- `data/topics.json`与`data/topics/`：专题索引和专题内容

专题详情支持两种数据结构：旧专题继续使用固定字段；新专题可使用`sections`数组，每个章节包含`title`，并按需要提供`paragraphs`、`items`或`rows`。来源可补`published_or_updated`和`supports`，说明更新时间与链接支持的具体主张。

## 部署

推送到`main`后，GitHub Actions把静态文件发布到GitHub Pages。

## 视觉

根站使用深色流体背景和无卡片排版。旧深色预览地址保留跳转，方便已有链接继续打开根站。来源说明见`preview/THIRD_PARTY_NOTICES.md`。
