# OEDRO海外用户运营工作台

公开站点用于解释赢他为什么开始建设海外用户运营，以及这项能力怎样从零建立。具体项目、研究方法和公开口径分别放在二级页面。

## 本地预览

```bash
python3 -m http.server 4173
```

打开 `http://127.0.0.1:4173/`。

## 发布边界

- 不包含用户个人信息、公司账号、内部联系人、精确业务金额或未批准承诺。
- 首页不展示具体产品、近期访谈或单项数据任务。
- 项目状态必须有证据日期；讨论和建议不写成已完成。

## 文件

- `index.html`：总览
- `playbook.html`：六阶段工作方法
- `work.html`：当前项目与依赖
- `research.html`：研究方法与参与项目
- `resources.html`：术语、来源与公开边界
- `data/`：页面读取的公开安全数据

## 更新项目状态

本机脚本读取赢他执行记忆中的任务YAML，只通过固定白名单生成公开安全的`data/workspace.json`：

```bash
python3 build-artifacts/v2-workbench/tools/sync_public_workspace.py
```

脚本和写作过程材料位于被Git忽略的`build-artifacts/v2-workbench/`。

## 部署

推送到`main`后，GitHub Actions把静态文件发布到GitHub Pages。
