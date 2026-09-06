# BrowserForge

一个浏览器插件：点击一次，模型就把当前网页生成为 [`browsing-skills`](https://github.com/browsing-skills/browsing-skills) 格式的站点 Skill。

生成结果是 `skills/<domain>/SKILL.md` 和 `references/<action>.md`。只读 reference 使用严格 JSON 描述声明式 DOM 读取计划，由 Chrome Bridge 在当前登录标签页执行；不会执行模型生成的 JavaScript。

## 安装

```bash
npm install
```

在当前 PowerShell 会话中设置密钥并启动服务：

```powershell
$env:BROWSERFORGE_API_KEY = "你的密钥"
npm run serve
```

默认使用 `https://api.zeekai.cc/v1/responses` 与 `gpt-5.6-terra`；可通过环境变量改写地址、路径和模型。生成请求默认超时 120 秒，可用 `BROWSERFORGE_RESPONSES_TIMEOUT_MS` 设置为 1000–300000 毫秒；遇到 `429/502/503/504` 会自动重试一次。`npm run serve` 会读取项目根目录的 `.env`，该文件已被 Git 忽略，禁止提交真实密钥。

## 一键生成

插件需要 HTTP(S) 页面访问权限：生成 Skill 时读取当前标签页的可见文本、交互元素和可见截图；运行只读 action 时由本地服务向后台桥接发送显式命令。扩展不会把 Cookie、Storage 或页面凭据写入 Skill。

1. 在项目根目录启动服务：`npm run serve`。
2. 打开 Chrome/Edge 的扩展管理页，启用开发者模式，点击“加载已解压的扩展程序”，选择 `extension/`。
3. 打开任意 HTTP(S) 页面，选择 `Current page` 或 `Standard site flow (unlimited pages / depth / time)`，点击 BrowserForge 图标，再点 `Generate Skill`。
4. 结果会写到 `skills/<当前域名>/`；Popup 显示生成的 actions。

全流程模式复用当前标签页的登录态，从当前页开始只访问同域名的 HTTP(S) 页面，不限制页数、链接深度或总时长；会跳过登出、删除、付款、购买等明显写操作链接，并按页面结构和 URL 去重。它会点击当前页中符合安全规则的一级 SPA 菜单/按钮以发现路由；二级及更深按钮只采集名称和稳定属性，不会点击。探索期间当前标签页会在同域路由间跳转，结束后恢复到开始时的 URL。它生成的是同一域名下的增量 action 包，不会覆盖未提及的旧 action。

Popup 会显示当前正在生成的路由；关闭后重新打开 Popup，可查看最近一次探索的进度或结果。

服务只绑定 `127.0.0.1:8787`。生成接口和桥接轮询只接受 `chrome-extension://` 来源；MCP 通过本机服务列出或运行 action。生成前会校验 Markdown、JSON 合约、作用域、选择器、输出大小、发布元数据、敏感 Key 和本机路径。DSL 只允许在指定根节点下读取文本或属性，不支持点击、提交、导航、网络请求、Storage/Cookie 或 DOM 写入。旧 JavaScript reference 会显示明确迁移错误，不会执行。

输入和输出契约使用 JSON Schema object 子集，支持数组 `items` 及嵌套对象的 `properties`、`required` 和 `additionalProperties`。

## MCP 工具

先运行本地服务并加载扩展，再在 MCP 客户端中把命令配置为：

```bash
npm run serve
npm run --silent mcp
```

MCP package script 是 `npm run mcp`；客户端配置使用 `npm run --silent mcp`，避免 npm 启动横幅混入 JSON-RPC stdout。

模型新生成且通过 JSON 合约校验的 action 会自动设置 `published: true` 和稳定的 `<domain>_<action>` 工具名。MCP 在每次 `tools/list`/`tools/call` 时重新读取 `skills/`，并在文件变化时发送 `notifications/tools/list_changed`，因此新 Skill 不需要重启 MCP。工具按名称稳定排序；同名工具会让 MCP 注册失败。`browserforge_list_actions`、`browserforge_run_read_action` 和 demo 用的 `browserforge_run_write_action` 作为高级/调试入口保留。

如果当前 URL 包含普通查询参数或 hash 路由参数，生成器会把非敏感参数转成声明式 `scope.urlTemplate` 和 MCP 必填输入。MCP 根据输入构造预期 URL，但不会替用户导航；当前已登录标签页仍必须与构造后的 URL 精确匹配。包含 token、secret、password、credential、session、signature、auth 或 key 的参数不会转成工具输入。

当前发布的业务工具是 `rdms_list_deployment_instances`，输入为 `appCode`、`sysCode`、`env` 和 `appName`。它不会导航：Chrome 当前标签页必须已登录 RDMS，并停留在由这四个参数生成的精确部署路由，否则返回 `SCOPE_MISMATCH`。模块缺失、等待超时、空表和输出超限分别返回稳定错误，不会读取整页文本或凭据。

每次 action 响应包含 `invocation.tool`、domain、action、内容脚本执行时间和桥接等待时间，不记录输入、页面文本、Cookie 或 token。RDMS 本地与真实登录页测量见 [docs/rdms-pilot-measurements.md](docs/rdms-pilot-measurements.md)。

## Demo write tools

在 Popup 选择 `Current page — write demo`，生成器会为当前页面生成一个经过本地 JSON 合约校验的具名 write MCP 工具。注册表下次 reload 后即可发现；调用时使用当前已登录 Chrome 标签页，先填充声明字段，再弹出一次 `window.confirm()`，确认后只点击一次提交控件，并返回 `SUCCESS`、`FAILURE`、`TIMEOUT`、`NOT_CONFIRMED` 或 `VALIDATION_FAILED`。

Demo 只支持当前精确路由上可由稳定 selector 描述、且有稳定完成证据的 `create`、`update`、`delete`、`submit`。它不会导航，也不支持多页流程。页面没有稳定 submit selector 或成功证据时，生成应校验失败；运行时未出现证据则返回 `TIMEOUT`，不会重试。

这不是生产写平台：没有审计、幂等、RBAC、审批、重试、回滚、队列或多步工作流。Plan 005 的生产控制分析和 Plan 006 的 demo 边界见 [docs/guarded-write-tools.md](docs/guarded-write-tools.md)。

## 测试

```bash
npm run typecheck
npm test
```

测试使用 mock Responses 结果，不会调用外部模型 API。

要验证模型实际生成的 Skill 是否能在已登录页面执行，先用测试浏览器配置完成登录，再运行：

```bash
npm run test:generated-skill -- "完整页面 URL"
```

该命令使用 `.env` 配置的模型（当前为 `gpt-5.6-terra`），把生成文件写入系统临时目录，确认工具出现在 MCP `tools/list`，再通过 MCP `tools/call` 逐个执行，不会覆盖项目内已有的 `skills/`。
