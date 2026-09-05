# BrowserForge 表单 Skill MVP 编码方案

## 目标

 BrowserForge 是把网站 UI 自动编译成可复用 Agent Skill 的软件平台；Skill 是它生成的标准化执行插件。

```text
输入网站 URL
  -> Explorer 使用 Playwright 探索单页面表单
  -> Compiler 生成网站 Skill
  -> Runtime 接收结构化参数
  -> 复用已生成 Skill 填写并提交表单
  -> 返回结构化结果和执行指标
```

演示重点是第二次执行不再重新探索 DOM。第一版只支持单域名、单页面、单表单、一次提交，优先保证成功率和可解释性。

默认演示目标使用 `https://demoqa.com/automation-practice-form`。网络不可用时，提供一个本地 fixture 表单作为备用目标。




## 建议技术栈

- Node.js 20+
- TypeScript
- Playwright
- Zod 或 JSON Schema 校验库（二选一，优先使用项目已有依赖）
- Fastify/Express 任选其一；若没有服务端需求，可先使用 CLI
- Vitest/Playwright Test 用于单元和端到端验证

编码前先检查当前环境是否已有 `package.json` 和依赖。没有依赖时只新增完成 MVP 必需的依赖，并同步锁文件。

## 目录结构

```text
src/
  explorer/
    exploreForm.ts          # 打开 URL、提取表单和页面证据
    pageSnapshot.ts         # 页面语义快照，不保存完整 DOM
    operationDetector.ts    # 识别填写和提交动作
  compiler/
    skillCompiler.ts        # 探索结果 -> Skill 文件
    templates.ts             # SKILL.md、reference、action 模板
    validators.ts            # Skill/action 静态检查
  runtime/
    skillLoader.ts           # 加载 manifest 和 action
    skillRunner.ts           # 校验输入并调用 action
    playwrightAdapter.ts     # Playwright 浏览器适配器
    errors.ts                # 统一错误码
  contracts/
    skill.ts                 # 探索、Skill、执行结果类型
  cli.ts                     # 可选：explore/run 命令
  server.ts                  # 可选：演示 API
skills/
  demoqa.com/
    SKILL.md
    manifest.json
    references/fill-student-form.md
    actions/fill-student-form.js
fixtures/
  form.html                  # 网络不可用时的本地表单
tests/
  explorer.spec.ts
  runtime.spec.ts
  demoqa-form.spec.ts
README.md
IMPLEMENTATION_PLAN.md
```

如果实现采用其他目录，必须保持 Explorer、Compiler、Runtime 三个边界清晰，不要把探索逻辑混入执行器。

## 核心数据契约

### FormExploration

```ts
type FormExploration = {
  sourceUrl: string;
  origin: string;
  title: string;
  fields: Array<{
    name: string;
    label: string;
    kind: "text" | "email" | "tel" | "date" | "radio" | "checkbox" | "select" | "textarea";
    required: boolean;
    options?: string[];
    locators: Array<{
      strategy: "label" | "role" | "aria" | "placeholder" | "testid" | "css";
      value: string;
    }>;
  }>;
  submit: {
    label: string;
    locators: Array<{ strategy: string; value: string }>;
  };
  successEvidence: Array<{ strategy: string; value: string }>;
  risk: "read" | "write" | "high-risk";
};
```

### Action

```ts
type ActionManifest = {
  name: string;
  site: string;
  version: string;
  inputSchema: object;
  outputSchema: object;
  risk: "write";
  navigation: { url: string };
  generatedAt: string;
  verifiedAt?: string;
};
```

### Run result

```ts
type RunResult = {
  ok: boolean;
  data?: unknown;
  error?: {
    code: "INVALID_INPUT" | "NAVIGATION_FAILED" | "FIELD_NOT_FOUND" |
      "FIELD_VALUE_MISMATCH" | "SUBMIT_FAILED" | "SUCCESS_NOT_CONFIRMED";
    message: string;
    field?: string;
    recoverable: boolean;
  };
  telemetry: {
    exploration: boolean;
    durationMs: number;
    fieldsFilled: number;
    domInspectionCount: number;
  };
};
```

## 实现顺序

### 1. 初始化工程

- 创建 TypeScript 工程、脚本和基础目录。
- 配置 Playwright、测试命令、格式化和类型检查。
- 添加 `.gitignore`，禁止提交浏览器缓存、认证文件和测试输出。

验收：`npm test`、`npm run typecheck` 可以运行。

### 2. 实现 Runtime

先手写一个 action，证明 Skill 格式和执行链路可用。

- `skillLoader` 加载 `manifest.json` 和 action 文件。
- `skillRunner` 校验 action 名称、输入 schema 和网站 origin。
- `playwrightAdapter` 管理 browser/context/page 生命周期。
- 统一处理页面加载、定位、填写、提交和结果断言。
- 使用分层定位：label -> role/name -> aria -> placeholder -> testid -> CSS。
- 每个字段填写后检查实际 value 或 checked 状态。
- 提交后检查成功弹窗或成功证据。

验收：手写 `fill-student-form` 可以在 DemoQA 或本地 fixture 完成提交，并返回 `ok: true`。

### 3. 实现 Explorer

- 打开目标 URL，并限制同源、页面数和运行时间。
- 只提取表单控件、label、可访问名称、选项和提交按钮。
- 不输出完整 DOM；保存最小页面语义快照。
- 通过 label、关联 `for`、role、aria 属性生成候选定位器。
- 识别字段类型、必填状态和 radio/checkbox/select 选项。
- 通过提交按钮附近的反馈区域识别成功证据。
- 默认不点击高风险按钮；表单提交只在测试数据和显式探索模式下执行。

验收：对目标表单产出完整字段列表，且每个必填字段至少有一个可用定位器。

### 4. 实现 Compiler

- 将 `FormExploration` 转换为 action manifest、`SKILL.md` 和 reference 文件。
- 生成自包含 action JavaScript，不依赖外部 CDN 或运行时网络请求。
- 为字段生成 JSON Schema；枚举字段生成 enum。
- 在 reference 中写入导航地址、输入输出 schema、风险和成功证据。
- 生成 `manifest.json`，记录版本、生成时间、验证状态和支持运行时。
- 生成后执行静态验证：JSON 可解析、JS 可编译、必填字段和成功证据存在。

验收：生成的文件可以被 `skillLoader` 直接加载，且 action 名称与 manifest 一致。

### 5. 串联 CLI 或演示 API

至少提供两个命令：

```bash
npm run explore -- https://demoqa.com/automation-practice-form
npm run run -- --skill demoqa.com --action fill-student-form --input examples/student.json
```

可选提供 API：

```text
POST /api/explore
{ "url": "https://demoqa.com/automation-practice-form" }

POST /api/run
{
  "skill": "demoqa.com",
  "action": "fill-student-form",
  "input": { ... }
}
```

演示页面只需要 URL 输入框、探索结果、结构化 JSON 输入框、执行按钮和结果/耗时展示。

### 6. 增加本地 fixture

- 创建与 DemoQA 字段类型相似的本地表单。
- 提交后显示稳定的成功标记，例如 `[data-testid="submit-success"]`。
- 测试默认优先使用本地 fixture，网络演示再使用 DemoQA。

## 必须验证的场景

1. 读取表单字段并生成 Skill。
2. 文本、邮箱、手机号、日期、单选、多选、下拉框、文本域填写。
3. 缺少必填参数时返回 `INVALID_INPUT`，不打开页面提交。
4. 页面找不到字段时返回 `FIELD_NOT_FOUND`，指出字段名。
5. 填写后实际值不一致时返回 `FIELD_VALUE_MISMATCH`。
6. 点击提交后没有成功证据时返回 `SUCCESS_NOT_CONFIRMED`。
7. 第二次执行直接读取已生成 action，不调用 Explorer。
8. 生成的 Skill 不包含 Cookie、Token、密码或本机绝对路径。

## 演示验收标准

- 用户只输入一个 URL 就能启动探索。
- 探索结果能生成可审查的 `SKILL.md`、reference 和 action 文件。
- 第二次只传结构化参数即可完成表单填写和提交。
- 页面提交成功后返回结构化 JSON。
- UI 或 CLI 明确显示第二次执行 `exploration: false`。
- 在本地 fixture 上连续执行 3 次成功率为 100%。
- 至少记录耗时、填写字段数和 DOM 检查次数，用于展示 Skill 路径的收益。

## 风险和处理

- **目标网站变化**：演示默认使用本地 fixture；外部站点只作为增强展示。
- **网络或反爬**：不依赖登录和验证码，失败时切换本地 fixture。
- **生成定位器不稳定**：优先语义定位，并在每个字段填写后校验值。
- **误提交真实业务**：只使用测试数据，写操作显式标记为 `write`，不支持高风险动作。
- **模型生成无效代码**：生成后执行 JS 编译、schema 校验和真实页面回归。
- **探索成本过高**：限制单页探索，不保存完整 DOM，不允许失败后无限重试。

## 完成定义

完成以下条件后即可用于参赛演示：

1. 本地 fixture 的探索、生成、加载、执行闭环通过。
2. DemoQA 表单在网络可用时可以完成一次提交。
3. 第二次执行没有调用 Explorer，并返回 `exploration: false`。
4. 相关测试、类型检查和 README 使用说明通过。
5. 生成文件中不存在敏感信息或本机路径。
