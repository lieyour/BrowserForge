# BrowserForge

一个浏览器插件：点击一次，模型就把当前网页生成为 [`browsing-skills`](https://github.com/browsing-skills/browsing-skills) 格式的站点 Skill。

生成结果是 `skills/<domain>/SKILL.md` 和 `references/<action>.md`，而不是自定义 manifest 或运行时。每个 reference 都包含可由 `page.evaluate()` 或 Chrome Bridge 执行的自包含 action object。

## 安装

```bash
npm install
```

在当前 PowerShell 会话中设置密钥并启动服务：

```powershell
$env:BROWSERFORGE_API_KEY = "你的密钥"
npm run serve
```

默认使用 `https://api.zeekai.cc/v1/responses` 与 `gpt-5.6-luna`；可通过 [.env.example](/C:/Users/Yu/Desktop/BrowserForge/.env.example) 中列出的环境变量改写地址、路径和模型。服务不会自动读取 `.env` 文件，避免把密钥意外加载进其他进程。

## 一键生成

插件仅在点击时读取当前 HTTP(S) 标签页的可见文本、交互元素和可见截图，随后将这些内容发送到你配置的模型 API；不会在后台持续读取网页，也不会自动执行生成的 action。

1. 在项目根目录启动服务：`npm run serve`。
2. 打开 Chrome/Edge 的扩展管理页，启用开发者模式，点击“加载已解压的扩展程序”，选择 [extension](/C:/Users/Yu/Desktop/BrowserForge/extension)。
3. 打开任意 HTTP(S) 页面，选择 `Current page` 或 `Standard site flow (30 pages / 8 min)`，点击 BrowserForge 图标，再点 `Generate Skill`。
4. 结果会写到 `skills/<当前域名>/`；Popup 显示生成的 actions。

全流程模式从当前页开始，只访问同域名的 HTTP(S) 页面，最多 30 页、3 层链接、8 分钟；会跳过登出、删除、付款、购买等明显写操作链接，并按页面结构去重。它生成的是同一域名下的增量 action 包，不会覆盖未提及的旧 action。

服务只绑定 `127.0.0.1:8787`，且只接受 `chrome-extension://` 来源请求。生成前会检查 Markdown 结构、action JS 语法、敏感 Key、Cookie 读取与本机路径；生成的写操作必须在 Skill 中明确 opt-in。生成后仍应人工审查 action，尤其是在登录态页面。

## 测试

```bash
npm run typecheck
npm test
```

测试使用 mock Responses 结果，不会调用外部模型 API。
