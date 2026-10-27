# dsh-selask — 选中即引用 / 侧边提问（DSH Web GUI 客户端插件）

> 适配 **DSH 0.2.1-rc.2**（Web GUI）。本插件只把引用写进草稿，**永不自动发送**。

在页面里选中一段文字 → **选区上右键** → 两个动作：**添加到对话** / **在侧边聊天中提问**。

- **添加到对话**：把引用块追加进当前会话输入框草稿，光标落在末尾，**永不发送**。
- **在侧边聊天中提问**：右栏「侧边聊天」tab 里给出引用快照 + 预填好的提问框；提交后**为新会话预置草稿**（不发送），并给出「切换到该会话」。

形态不变：纯 ESM JavaScript、无构建、零依赖、不 `npm install`；包名/模块 id `dsh-selask`；`platform: "web"`。

> 本版为第二版：触发方式从「浮动 ❝ 按钮」改为「右键菜单」；右栏 tab 从「引用预览」升级为「侧边聊天」。快捷键 `Ctrl+Shift+K` 保留。

---

## 1. 行为

### 1.1 触发

| 触发 | 位置 | 说明 |
| --- | --- | --- |
| **右键菜单（主入口）** | 选区上的任意位置 | `contextmenu` 捕获阶段拦截；仅当 `window.getSelection()` 非空、且锚点仍在文档内（`isConnected` 且矩形非零）、且不在插件自身 DOM / 输入框内时才 `preventDefault()` 并出菜单 |
| 全局快捷键 | `Ctrl+Shift+K`（macOS `Cmd+Shift+K`） | 等价于「添加到对话」，键盘入口；可在「设置 → 快捷键」改 |
| 输入框工具条 ❝ | 输入框右侧 | 保留（v1 的页内按钮，不再浮动）。它同时也是插件拿到 `inputActions` 的挂载点，去掉它等于断掉快捷键写草稿的链路 |

菜单两项文案（写在 `locale/zh.json`、`locale/en.json` 与 `lib/client.js` 内联字典里）：

- `menu.addToConversation`：**添加到对话** / Add to conversation
- `menu.askInSideChat`：**在侧边聊天中提问** / Ask in side chat

关闭方式：点击菜单外任意位置（`pointerdown` 捕获）、Esc（`keydown` 捕获）、滚动 / 改窗口大小（`scroll`/`resize` 捕获）、选中任一项。菜单是纯 DOM（`data-dsh-selask="menu"`），不进 React 树。

### 1.2 引用块格式（按来源分流，与 v1 相同）

能解析出「工作区文件 + 行号」：

```
> const x = 1;
>   return x;
— 来源：src/app/main.ts:41
```

解析不出：

```
> 原文快照……
— 来源：会话消息区
```

- 快照上限 **400 字**（Unicode 码点计，超出截断并加 `…`）；按行加 `> ` 前缀。
- 来源区域标签：会话消息区 / 右侧文档预览 / 交付物 · 变更审查 / 输入框 / `页面 · <tag>`。

### 1.3 「添加到对话」= 写草稿（与 v1 相同，未改）

1. 首选 `inputActions.setDraft(现有草稿 + 块)`——只在真拿到当前草稿文本（`useInput((s) => s.draft)`）时用，因为 `setDraft` 是整体替换。
2. 兜底 `inputActions.insertText(块, captureInsertion())`——不破坏现有内容，但插入点是当前光标。
3. 都不可用 → 只弹提示，不动草稿。

块尾留一个换行：`setDraft` 按行拆段落并把光标放末尾，人的第一句话落在引用下方的新行。

### 1.4 「在侧边聊天中提问」= 第 1 档（首选档，已实现）

点击后：

1. 右栏打开 / 复用 tab 类型 `selask.quote`（kind `selask-quote`，标题「侧边聊天」）：先 `ctx.reflect.provide("sidebarRight", controller)` 暴露的控制器 `openTabIn(sessionId, "selask-quote", {})`，再 `ctx.layout.openRightbar(true, false)` 确保右栏可见。
2. tab 上部是本次引用快照（只读 `<pre>`），下部是 `<textarea>`，**预填**「引用块 + 一个空行」，提交按钮 + `Ctrl/Cmd+Enter`。
3. 提交调用 `ctx.uiWorkspace.startSession(workspaceId, { prompt: 全文 })`。这条链路在宿主内部是：
   `startSession` → `initializeDraft`（因为传了 `prompt`）→ `openWorkspace(target, (id) => prepareDraft(binding, { prompt }))` → `conversation.input.requestDraftInitialization(binding, { prompt })` → **`this.setDraft(options.prompt ?? "")`**。
   **只写草稿，不发送**——发送仍然是人按回车。
4. tab 内显示「已在新会话里准备好引用：补完问题，按回车发送。」；一旦新会话出现在主区绑定上（`uiSession.current` 的 `key` 变化），额外给出「切换到该会话」按钮（`ctx.uiWorkspace.openSession(sessionId)`）。

**如实说明（重要）**：新会话开在**主区**，不是嵌在右栏里。也就是「侧栏发起、主区作答」。原因与取舍见第 5 节第 1 条。

三个档位落点：

| 档 | 状态 | 说明 |
| --- | --- | --- |
| 1 首选 `startSession(workspaceId, { prompt })` | **已实现并作为默认** | 只预置草稿；`workspaceId` 取不到时传 `undefined`（宿主自己回落到当前/最近工作区） |
| 2 右栏自带最小对话视图 | **未做** | 需要自己 retain 一个 Session reference 才能把 `conversation.content` factory 槽套进 tab（subagent 那套 `resources.register` + `renderFactorySlot`）；未在真实环境验证生命周期，风险高于收益 |
| 3 写当前会话草稿 + toast | **保留为兜底** | 仅当 `startSession` 不可用/抛错时走：写当前草稿并提示「侧边提问不可用，已放入当前对话」 |

`workspaceId` 的取法（按优先级）：

1. `ctx.get("workspaces").list.getSnapshot().items.find(w => w.sessionIds.includes(sessionId))?.workspaceId`
2. 取不到就 `undefined`（宿主内部 `workspaceId ?? currentWorkspaceId ?? recent`）。

---

## 2. 目录树（行数，按 LF 计）

```
dsh-selask/
├── package.json          35 行   dsh.client.inject / platform / exports
├── README.md             244 行 本文
├── lib/
│   ├── index.js           5 行   宿主标记（export apply()）
│   └── client.js        864 行   全部浏览器逻辑
├── locale/
│   ├── zh.json           29 行
│   └── en.json           29 行
└── test/
    └── smoke.mjs        367 行   无头桩测试（不随插件分发，files 未包含）
```

`lib/client.js` 是未编译单文件：`window.__ModuleLoader__.load({ id: "dsh-selask", factory })`，factory 只 `require("react")`（宿主内置），不 require 任何 `@deepseek-ai/*` 包。

---

## 3. 检查命令与输出

```powershell
Copy-Item .\lib\client.js .\check.mjs
node --check .\check.mjs        -> check exit=0
Remove-Item .\check.mjs
node .\test\smoke.mjs           -> SMOKE OK (exit=0)
```

node：`C:\Users\BBG\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`。

smoke 输出（节选，全绿）：

```
slots: sidebar.right.pane.tab#selask.quote, conversation.input.right
tab: selask.quote / selask-quote / 侧边聊天
shortcut: selask.quoteSelection {"code":"KeyK","modifiers":["primary","shift"]} resolve=handled
menu items: ["添加到对话","在侧边聊天中提问"]
menu position: 300px / 200px
draft after item 1: "existing line

> const x = 1;
>   return x;
— 来源：src/app/main.ts:41
"
openTabIn: [["s1","selask-quote",{}]]
openRightbar calls: 1
tab snapshot: "> const y = 2;
— 来源：会话消息区"
tab textarea value: "> const y = 2;
— 来源：会话消息区

"
startSession call: [["ws-1",{"prompt":"> const y = 2;
— 来源：会话消息区

"}]]
sent status: "已在新会话里准备好引用：补完问题，按回车发送。"
switch label: "切换到该会话"
openSession calls: ["s2"]
clip quote line chars: 403
SMOKE OK
```

smoke 覆盖：① `contextmenu` 被拦截（`preventDefault` 恰好 1 次）+ 菜单两项文案 + 菜单定位；② 点「添加到对话」只调 `setDraft`（断言 `submit` 调用数 0、`insertText` 0、原草稿被保留）；③ 点「在侧边聊天中提问」→ 断言 `openTabIn(sessionId, "selask-quote", {})`、`openRightbar` 被调、tab 预填 = 引用块 + 一个空行；④ 提交后断言 `startSession` 参数是 `("ws-1", { prompt })` 且**只有** `prompt` 这个键、草稿写入次数没增加；⑤ 新会话出现在 `uiSession.current` 后断言出现「切换到该会话」且点击调 `openSession("s2")`；⑥ 快照 400 字截断（403 = `> ` + 400 + `…`）。

---

## 4. API 证据（包 + lib/client.js + 字节偏移 + 原文摘录 ≤200 字符）

只读自 `D:\Users\BBG\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\`；偏移是**字节偏移**。

### 4.1 本版新增（侧边聊天 + 右键菜单所需）

| # | API | 包 / 文件 | 字节偏移 | 摘录 |
| --- | --- | --- | --- | --- |
| 26 | `uiWorkspace.startSession(workspaceId, options)` | dsh-client-ui-workspace / lib/client.js | 57427 | `startSession(workspaceId, options) { const { agentPreset, ...draft } = options ?? {};` |
| 27 | 传 `prompt` 即「预置草稿」 | 同上 | 57583 | `const initializeDraft = draftOptions !== void 0 && (draftOptions.prompt !== void 0 || draftOptions.clearPreviousDraft === true);` |
| 28 | `workspaceId` 可省略 | 同上 | 58158 | `const target = workspaceId ?? currentWorkspaceId ?? recent;` |
| 29 | 开新会话 + 准备草稿 | 同上 | 58557 | `this.openWorkspace(target, initializeDraft ? (id) => { const binding = this.sessions.binding(id); …` |
| 30 | 草稿准备 | 同上 | 58917 | `prepareDraft(binding, options) { const conversation = this.ctx.get("conversation");` |
| 31 | workspaceId 从会话反查 | 同上 | 57937 | `workspace.items.find((item) => item.sessionIds.includes(current))?.workspaceId` |
| 32 | `openSession(sessionId)`（切换用） | 同上 | 56381 | `openSession(target) { this.replaceMain(target, this.lifetime.signal, "reveal"); }` |
| 33 | 草稿初始化入口 | dsh-client-ui-conversation / lib/client.js | 536146 | `requestDraftInitialization(options) { if (this.draftInitializationBlocked()) return "blocked";` |
| 34 | **只写草稿、不发送** | 同上 | 536473 | `this.setDraft(options.prompt ?? ""); return "applied";` |
| 35 | 右栏控制器被暴露成服务 | dsh-client-ui-sidebar-right / lib/client.js | 184875 | `ctx.reflect.provide("sidebarRight", controller);` |
| 36 | 按 kind 打开 tab（不抛错版） | 同上 | 91862 | `openTabIn(sessionId, kind, options = {}) { const actions = this.actionsFor(sessionId); if (actions !== void 0) this.placeTab(...)` |
| 37 | 需已挂载会话的版本 | 同上 | 90702 | `openTab(kind, options = {}) { const { sessionId, actions } = this.require(); this.placeTab(sessionId, actions, kind, options); }` |
| 38 | 展开右栏 | dsh-client-ui-layout / lib/client.js | 24485 | `openRightbar(track, fullscreen) { this.panels.openRightbar(track, fullscreen); }` |
| 39 | 主区当前会话绑定 | dsh-client-ui-session / lib/client.js | 26726 | `this.current = createBindingSource(this.absent.value);` |
| 40 | 绑定的 key 就是 sessionId | 同上 | 36044 | `key: binding.sessionId, ctx: binding.ctx, hooks, keyedHooks, props };` |

### 4.2 第一版沿用（未改动的部分）

| # | API | 包 / 文件 | 字节偏移 | 摘录 |
| --- | --- | --- | --- | --- |
| 1 | 客户端入口形态 | voice-input / lib/client.js | 0 | `window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-experimental-client-ui-voice-input", factory: (require) => { var module = { exports: {} };` |
| 2 | 入口导出 `apply` / `inject` | 同上 | 119383 | `exports.apply = apply; exports.inject = inject; return module.exports;` |
| 3 | `inject` 清单 + `ctx.effect` | 同上 | 116106 | `const inject = [ "remote", "slots", "locale", "pluginNavigation" ];` |
| 4 | 包形状 `dsh.client` | 同上 / package.json | 2094 | `"dsh": { "client": { "inject": [ "@deepseek-ai/dsh-api-remotes", …` |
| 5 | 槽位注册 | 同上 | 117698 | `ctx.slots.inject("conversation.input.activity", () => ctx.slots.register({ name: "conversation.input.activity", locale: NS, inject: () => actions }, VoiceInput));` |
| 6 | 草稿动作面 | ui-conversation | 529608 | `captureInsertion: () => ({ ...this.caretSpan(), draftRev: this.rev }), insertText: (text, span) => { if (this.snapshot.phase ==` |
| 7 | `setDraft` 光标落末尾 | 同上 | 520453 | `Replace the whole draft (persisted-draft seed and programmatic writes). * Placeholder-sanitized; newlines split paragraphs; the caret lands` |
| 9 | 已发布输入态草稿字段 | 同上 | 558903 | `const core = this.core.state; return { draft: this.projection.clipboardText, …` |
| 10 | provide 通道下发 `inputActions` | 同上 | 762388 | `ctx.uiSession.provide({ hooks: ["conversation", "input"], props: ["inputActions"], resolve: (binding) => { trackBinding(binding);` |
| 12 | 输入框子槽只传空 props | 同上 | 737481 | `renderSlot("conversation.input.right", {})` |
| 13 | 输入框 DOM 锚点 | 同上 | 687429 | `"data-composer-input": true,` |
| 14 | 标准 props 合成 | ui-renderer | 27550 | `function materializeStandardBinding(binding, optional, defaultKey) { const standard = { ...binding.props };` |
| 15 | 快捷键命令形状 | ui-sidebar-right | 9373 | `id: "sidebar.right.toggle", label: () => t("command.toggle"), aliases: ["right sidebar", "toggle right panel"], defaults: {` |
| 16 | Web 组合键放行 | dsh-client-shortcuts | 4151 / 4314 | `function isWebBindingAllowed(binding, platform) { …` / `if (binding.modifiers.length >= 3) return true;` |
| 18 | 键面文案 | ui-theme | 117264 | `scope.shortcuts.describeBinding(binding).keys,` |
| 19 | 右栏 tab 类型注册 | ui-subagent | 42026 | `kind: "subagentchat", patterns: […], priority: "builtin", canOpen: (address) => …` |
| 20 | tab 体槽（key = 类型 id） | 同上 | 42569 | `name: "sidebar.right.pane.tab", key: SUBAGENT_CHAT_ID,` |
| 21 | `locale.register` / `bind` | dsh-client-locale | 56237 / 57466 | `register(ns, localeOrDicts, dict) {` / `bind(ns) { let t = this.bound.get(ns); …` |
| 22 | 文档预览行号/路径 | ui-sidebar-documentpreview | 25830 / 35679 | `"data-textpreview-line": number,` / `"data-textpreview-path": true }),` |
| 23 | 交付物审查文件路径 | ui-deliverables | 92281 | `"data-review-file": file.path,` |
| 24 | diff 行结构与行号 | 同上 | 40750 | `"data-diff-line": splitRowKind(row), children: [ (span, { className: FileDiff_module_css_default.number,` |

---

## 5. 未验证假设

1. **「侧边聊天」落在第 1 档，但是「主区作答」**：`startSession` 走 `openWorkspaceSession` → `replaceMain`，新会话出现在主区（不是右栏内嵌）。第 2 档（tab 内自带最小对话视图）没做——要在 tab 里 retain 一个 Session reference 再把 `conversation.content` factory 槽套进去（subagent 的 `resources.register` + `renderFactorySlot("conversation.content", …)` 那套），生命周期未在真实环境验证过，风险高于收益。
2. **`prompt` 是草稿而不是直发**：证据 27/29/30/33/34 五段串起来看是「开新会话 → `requestDraftInitialization({prompt})` → `setDraft(prompt)`」，没有 submit 调用。若某个版本把 `prompt` 改成「发出去」，本插件会变成自动发送——这是本设计唯一的高危假设，建议第一次试装时先只点「在侧边聊天中提问」并**只观察到草稿出现**再继续。
3. **`workspaceId` 的取法未实跑**：走 `ctx.get("workspaces").list` 的 `items[].sessionIds`。取不到时传 `undefined`（宿主自己回落）。`workspaces` 服务名来自 `dsh-api-workspace-controller`（`super(ctx, "workspaces")`）。
4. **右栏 tab 的打开链路可能静默降级**：`openTabIn` 在「该会话的侧栏 store 未 adopt」时是 no-op（不抛错），此时 `ctx.layout.openRightbar(true, false)` 仍会把右栏展开到现有/引导 tab，用户从「+」里选「侧边聊天」。也就是说「点一下右栏就出现我这一屏」**不保证**，但不会报错。
5. **「切换到该会话」依赖 `uiSession.current.getSnapshot().key`**：`current` 是 `uiSession` 实例上的字段（证据 39/40），不是公开文档化 API；拿不到就只显示「已准备好」文案、不显示按钮（代码里 40 次 ×100ms 轮询后放弃）。
6. **右键菜单与宿主原生菜单的关系**：我在 `contextmenu` 捕获阶段 `preventDefault()`，因此选中文字后宿主/浏览器自带的右键菜单不会出现。输入框内的选区**故意不拦**（避免抢掉粘贴/剪切菜单）。
7. **`Ctrl+Shift+K` 可能被浏览器先截获**（Firefox 控制台保留键）；DSH 放行规则允许它，可在「设置 → 快捷键」改。
8. **行号基准**：`data-textpreview-line` 是页内偏移；用「同一容器里是否出现 0」判断 0/1 起始，只渲染后半页时会多算 1 行。
9. **`data-textpreview-path` 可能被省略号截断**（检测 `…`/`...` 则退化）；`data-review-file` 可能是绝对路径，只有拿到 cwd 才相对化。
10. **`useSession((s) => s.cwd)` 与 `props.useInput` 存在性**：取不到就退到 `insertText` 路径/不做相对化，不报错；两个 prop 的有无在渲染间稳定，因此条件 Hook 调用不破坏顺序。
11. **整体仍未在真实 Web GUI 点过**：本轮全部验证=源码静态证据 + 无头桩测试（stub `window`/`document`/`react`/`ctx`/`uiWorkspace`/`sidebarRight`）。没有安装、没有启用。
12. **安装/加载形态未实跑**：`__ModuleLoader__.load` 的 `id` 是否必须等于包名、`file:` 安装对 `private`/`dependencies` 的要求均未验证；故故意不写 `dependencies`/`peerDependencies`。

---

## 6. 安装

1. 拿到插件（任选其一）：
   - GitHub：`dsh plugin --profile web add github:yunyun6882-arch/dsh-selask#v0.1.0`
   - 本地目录：Web GUI → 左侧栏「插件」→ 安装 → spec 填 `file:<插件目录的绝对路径>`（URL 形式 `file:///D:/path/to/dsh-selask`）
2. 在插件列表里**启用** `dsh-selask`，**刷新页面**；若右键菜单或输入框按钮没出现，**完整重启 DSH**（客户端 bundle 只在 boot 时按 manifest 拉取，宿主侧插件需重新组合）。
3. 自检四项（见 1.1–1.4 的行为）。

差异点：

1. 若已装过第一版，需要**卸载/重装或至少刷新**，因为 `lib/client.js` 与 `locale/*.json` 都换了内容（客户端 bundle 只在 boot 时按 manifest 拉取）。
2. 自检四项变成：① 选中文字后**右键**出现「添加到对话 / 在侧边聊天中提问」；② 点「添加到对话」→ 输入框出现引用块、消息未发出；③ 点「在侧边聊天中提问」→ 右栏出现「侧边聊天」tab（若右栏没自动切到该 tab，从「+」里选一次），tab 上部是引用快照、下部输入框已预填引用块 + 空行；④ 点「提问」→ **主区**新会话，输入框里已有引用块，消息未发出；补完问题按回车才发。
3. 快捷键仍是 `Ctrl+Shift+K`（macOS `Cmd+Shift+K`），行为等同「添加到对话」。

## 7. 回滚（与上一版相同）

1. 插件页 → `dsh-selask` → **禁用** → 刷新页面：右键菜单、快捷键、输入框 ❝、右栏「侧边聊天」tab 一起消失。
2. 卸载后若目录仍在，删除该插件目录（纯静态资源，无运行时状态）。
3. 本插件不写任何持久化状态：草稿写入走宿主输入组件，侧边聊天负载只在内存（刷新即空）。

---

## 8. 自查声明

本会话只在 `D:\BBG\deepseek\dsh-selask\` 下创建/修改文件：`package.json`、`README.md`、`lib/index.js`、`lib/client.js`、`locale/zh.json`、`locale/en.json`、`test/smoke.mjs`；临时文件 `check.mjs`、`.block1..4.txt`、`check-client.mjs` 创建后已删除。未修改 DSH 安装目录（仅 `fs.readFileSync` 只读 asar）、未写 `~/.dsh`、未安装/启用插件、未执行 `npm install`。
