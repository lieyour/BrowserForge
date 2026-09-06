# BrowserForge demo sites

启动本地 HTTP 服务：

```powershell
node fixtures/demo-sites/serve.mjs
```

然后分别打开：

- 数据库权限申请：<http://127.0.0.1:4173/database-access.html>
- 日报与工时：<http://127.0.0.1:4173/daily-worklog.html>

两个页面都使用原生表单控件、显式 label、稳定的 `data-testid` 和独立的提交成功状态，便于创建 Skill 后验证读取、填写和提交。

需要测试提交自动化时，在扩展里选择 `Current page — write demo` 生成当前页面的写入 Skill。执行 action 前，Playwright 页面需要停留在生成时的精确 URL；action 本身不会代替浏览器导航。两个页面同属 `127.0.0.1`，分别生成时会增量合并到同一个站点 Skill。

数据库权限申请的工单格式为 `DATA-2048` 这类“字母-数字”；申请理由至少 15 个字符。日报的关联任务格式为 `NEBULA-1842`，今日完成至少 10 个字符，明日计划至少 5 个字符。
