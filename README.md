# dsh-selask — 选中即引用 / 侧边聊天（第三版：会话嵌进右栏）

在页面里选中一段文字 → **选区上右键** → 两个动作：**添加到对话** / **在侧边聊天中提问**。

- **添加到对话**：把引用块追加进当前会话输入框草稿，光标落末尾，**永不发送**。
- **在侧边聊天中提问**：右栏新开一个 tab，tab 里就是**那个新会话本体**（历史 + 输入框），**主区不动**。点「提问」只负责「建会话 + 把引用写进它的草稿」，发送由你在那个输入框里按回车完成。

包名 / 模块 id 是 `dsh-selask`；纯 ESM、无构建、零依赖；`platform: "web"`；manifest 含 `dsh.bundle.patch`（否则宿主把它当普通依赖，永远不加载）。

---

## 1. 行为

### 1.1 触发

| 触发 | 位置 | 说明 |
| --- | --- | --- |
| **右键菜单（主入口）** | 选区上任意位置 | `contextmenu` 捕获阶段拦截；仅当 `window.getSelection()` 非空、锚点 `isConnected`、矩形非零、且不在插件自身 DOM / 输入框内时才 `preventDefault()` 并出菜单 |
| 全局快捷键 | `Ctrl+Shift+K`（macOS `Cmd+Shift+K`） | 等同「添加到对话」；可在「设置 → 快捷键」改 |
| 输入框右侧的挂载点 | 输入框工具条（`conversation.input.right`） | **不渲染任何 DOM**：只借这个 list 槽挂载组件以拿到 `inputActions` / 当前草稿（`id: "selask.composer"` / `order: 100`）。所以页面上看不到按钮 |

菜单两项文案：`menu.addToConversation` = **添加到对话**、`menu.askInSideChat` = **在侧边聊天中提问**（写在 `locale/zh.json`、`locale/en.json` 与 `lib/client.js` 内联字典里）。
关闭方式：点菜单外（`pointerdown` 捕获）/ Esc（`keydown` 捕获）/ 滚动或改窗口尺寸（`scroll`、`resize` 捕获）/ 选中任一项。菜单是纯 DOM（`data-dsh-selask="menu"`），不进 React 树。

### 1.2 引用块格式（与第二版相同）

按「能多具体就多具体」的要**一条**来源行；拿不到可证明的定位就**整行不输出**（只留 `> ` 引用行）。四档依次降级：

1. **工作区文件 + 行号**（右侧文档预览 / 交付物审查的 `data-*` 锚点）→ `— 来源：src/app/main.ts:41`（无行号时 `— 来源：src/app/main.ts`）。
2. **会话正文**→ `— 来源：会话《<标题>》 · 第 <N> 条消息（助手） · 代码块 <lang>`：标题取会话目录快照的 `displayTitle`，序数取锚点最近的 `[data-chat-node-key]` 在 `[data-chat-flow]` 里的 1-based 序号，角色只在 `data-chat-flow-kind` 明确为 `user`/`assistant` 时才写，语言只在 `pre code[class*=language-]` / `[data-language]` / `[data-lang]` 存在时才写；每一项取不到就省掉这项，全都取不到就不出这一行。
3. **输入框内选区** → `— 来源：输入框草稿`（输入框选区被右键菜单有意跳过，这一档走 `Ctrl+Shift+K`）。
4. **其它**（无锚点）→ 不输出来源行，绝不写「页面 · div」「会话消息区」这类空话。

### 1.3 添加到对话（与第二版相同）

1. 首选 `inputActions.setDraft(现有草稿 + 块)`（只有真拿到 `useInput((s) => s.draft)` 才用，因为它是整体替换）；
2. 兜底 `inputActions.insertText(块, captureInsertion())`；
3. 都不可用 → 只弹提示，不动草稿。块尾留一个换行，人的第一句落在引用下方的新行。

### 1.4 在侧边聊天中提问 = **真嵌入（第 2 档）**

点菜单第二项 → 右栏「侧边聊天」tab（类型 `selask.quote` / kind `selask-quote`）。tab 有两种形态：

- **没有绑定会话时**：显示引用快照 + 预填引用块的 textarea + 「提问」（`Ctrl/Cmd+Enter` 同效）。
- **点「提问」之后**：
  1. **建会话但不切主区**：`ctx.get("uiWorkspace").connectBlank(workspaceId)`。该方法的 `reuse` 缺省分支直接 `return this.sessions.create({ workspaceId })`，**不经过 `replaceMain`**（证据 4.1 第 1、2 条）。
2. **先绑 tab、再灌草稿**（时序关键）：建会话后立刻 `openResourceIn` 把 tab 指到该会话，**让宿主先把内嵌对话（含 composer）挂载起来**；草稿灌注在 tab 组件的 `useEffect` 里、等 `useResource` 拿到 reference 之后才开始 —— 轮询 `sessions.binding(sessionId)`，再 `conversation.input.requestDraftInitialization(binding, { prompt })`，`blocked` 就 100ms 重试，最多 20 次。反过来的顺序（先灌草稿后挂载）必然 `blocked`：没有挂载的 composer，`phase` 永远停在 `adjudicating`。
2b. **绑不上就退化，绝不静默**：若 1.5s 内 tab 仍未绑定（`openResourceIn` 已知可能 no-op），`console.warn` 带上 sessionId，并把该会话在主区打开（`uiWorkspace.openSession`）后再灌草稿；状态行先显示「右栏没能打开该会话」再显示最终灌注结果。
  3. **把 tab 指向该会话的资源地址** `dsh-resource://selaskchat/session/<id>`：`controller.openResourceIn(sessionId, address, {})`（或 `openResource(address)`），由本插件注册的资源 provider `sessions.retain(sessionId, { source, signal })` 保住会话，tab 关闭时 `release()`。
  4. **tab 里渲染会话本体**：`SessionProvider({ session: reference })` 包住子槽，再在子槽里 `renderFactorySlot("conversation.content", { variant: "embedded", phase, hero }, {})` —— 宿主自己的对话渲染（含输入框）。
- **发送**：在那个输入框里按回车（宿主自己的提交路径）。「提问」按钮**只准备草稿，不代发**；错误路径（建会话失败）才退回「写当前草稿 + toast」。

档位落点：

| 档 | 状态 | 依据 |
| --- | --- | --- |
| 1 建会话并预置草稿 | 已实现，且**不再依赖 prompt 一次性注入** | 自己调 `requestDraftInitialization` 并重试（证据 4.1 第 8–10 条） |
| 2 **会话嵌入右栏** | **已实现**（资源地址 + `SessionProvider` + `conversation.content` 的 `embedded` 变体） | 证据 4.1 第 4–7 条，形状照抄 ui-subagent 的侧栏聊天 |
| 3 写当前草稿 + toast | 仅保留为**建会话失败/资源不可用**时的兜底 | — |

为什么上一版「草稿是空的」：宿主 `startSession` 的 `prepareDraft` 在新会话上调用 `requestDraftInitialization`，返回值 `"blocked"` 时走 `draftPreparationFailed()` 抛错，被 `startSession` 的 `.catch` 吞掉；而新会话刚建时 `phase` 常是 `adjudicating`，必然 `blocked`（证据 4.1 第 8–10、13 条）。本版不再走那条一次性注入。

---

## 2. 目录树（行数，按 LF 计）

```
dsh-selask/
├── package.json          43 行   dsh.bundle.patch + dsh.client.platform/inject
├── cordis.patch.yml        3 行   profile 层注册（- insert: dsh-selask）
├── README.md             174 行 本文
├── lib/
│   ├── index.js          5 行   宿主标记（export apply()）
│   └── client.js       1175 行   全部浏览器逻辑
├── locale/
│   ├── zh.json           37 行
│   └── en.json           37 行
└── test/
    └── smoke.mjs       706 行   无头桩测试（files 未包含）
```

---

## 3. 检查命令与输出

```powershell
Copy-Item .\lib\client.js .\check.mjs
node --check .\check.mjs      -> client --check exit=0
Copy-Item .\lib\index.js .\check2.mjs
node --check .\check2.mjs     -> index --check exit=0
node .\test\smoke.mjs         -> SMOKE OK (exit=0)
```

smoke 关键输出：

```
guard failures on first apply: []
slots: sidebar.right.pane.tab#selask.quote, selask.chat.conversation, conversation.input.right
tab type: selask.quote / selask-quote / ["dsh-resource://selaskchat/session/**"] / 侧边聊天
menu items: ["添加到对话","在侧边聊天中提问"]
connectBlank: [["ws-1"]]          openSession calls: []
seed wait: timers=3 seedCalls=0   seed attempts: 3
status text: "已在新会话里准备好引用：补完问题，按回车发送。"
openResourceIn: [["s1","dsh-resource://selaskchat/session/s-new",{}]]
embed tree: session / true         factory slot: [["conversation.content","embedded"]]
resource frame: {"ok":true,"sessionId":"s-new"}   released: ["s-new"]
dsw tokens used: --dsw-alias-bg-layer-2 ... --dsw-font-markdown-code-font-family
hardcoded colors: []              token contract: ... (299 tokens)
SMOKE OK
```

smoke 覆盖：① 菜单两项 + `preventDefault` 恰好 1 次；② 「添加到对话」只调 `setDraft`（`submit` 0、`insertText` 0、原草稿保留）；③ 菜单第二项只开 tab、不建会话；④ 点「提问」→ 断言 `connectBlank("ws-1")` 且 **`openSession` 从未被调用**；⑤ 桩按 phase 变化模拟 `blocked`→`blocked`→`applied`，断言重试到第 3 次且状态文案是「已准备好」；⑥ `openResourceIn` 指向本插件地址；⑦ `SessionProvider` 拿到保留的 reference、子槽是 `selask.chat.conversation`；⑧ 子槽调 `conversation.content` 且 `variant: "embedded"`；⑨ 资源 provider `retain` → 中止 → `release`；⑩ 缺 `renderFactorySlot` 时降级成提示而不是崩；⑪ 单项注册失败不连坐；⑫ 所有 `--dsw-*` token 在契约内且硬编码颜色为 0；⑬ manifest 有 `dsh.bundle.patch` 且文件存在。

---

## 4. API 证据（包 + lib/client.js + 字节偏移 + ≤200 字符摘录）

### 4.1 本版新增

| # | API | 包 / 文件 | 字节偏移 | 摘录 |
| --- | --- | --- | --- | --- |
| 1 | 只建会话、不切主区 | dsh-client-ui-workspace / lib/client.js | 53290 | `async connectBlank(workspaceId, reuse) { const workspace = this.workspaces.list.getSnapshot().items.find(...)` |
| 2 | 同一方法里的 create 分支 | 同上 | 53561 | `if (reuse === void 0) return this.sessions.create({ workspaceId });` |
| 3 | 切主区只在 openWorkspaceSession 里发生 | 同上 | 57071 | `this.replaceMain(sessionId, navigation, "reveal", beforeOpen);` |
| 4 | 资源服务 | dsh-client-resources / lib/client.js | 5442 | `ctx.reflect.provide("resources", resources);` |
| 5 | `useResource` 是 root keyed hook | 同上 | 5605 | `keyedHooks: { resource: (address) => resources.source(address) }` |
| 6 | 会话保留 | dsh-api-session-controller / lib/client.js | 148429 | `retain(target, options) { const { source, signal } = options; signal?.throwIfAborted();` |
| 7 | 服务名 sessions | 同上 | 148394 | `"sessions", this, void 0);` |
| 8 | `conversation.content` 的 embedded 变体 | dsh-client-ui-subagent / lib/client.js | 40747 | `renderFactorySlot("conversation.content", { variant: "embedded", phase: settling ? "settling" : hero ? "hero" : ...` |
| 9 | `variant: "embedded"` | 同上 | 40795 | `variant: "embedded", phase: ... hero }, { slots: { views: FixedChatConversationView } }` |
| 10 | SessionProvider + 子槽 | 同上 | 41418 | `session: resource.value.reference, children: renderSlot("sidebar.chat.conversation", {})` |
| 11 | 资源 open 里 retain | 同上 | 39262 | `const reference = sessions.retain(address, { source: "sidebarChat", signal });` |
| 12 | 按地址打开 tab | dsh-client-ui-sidebar-right / lib/client.js | 90339 | `openResource(address, options = {}) { const { sessionId, actions } = this.require(); this.placeResource(...)` |
| 13 | 按 kind 打开 tab | 同上 | 91862 | `openTabIn(sessionId, kind, options = {}) { const actions = this.actionsFor(sessionId);` |
| 14 | 草稿初始化入口 | dsh-client-ui-conversation / lib/client.js | 536146 | `requestDraftInitialization(options) { if (this.draftInitializationBlocked()) return "blocked";` |
| 15 | blocked 的条件 | 同上 | 536540 | `draftInitializationBlocked() { const { phase } = this.core.state; return this.disposed || phase === "adjudicating" || ...` |
| 16 | 真正写草稿 | 同上 | 536473 | `this.setDraft(options.prompt ?? ""); return "applied";` |
| 17 | 失败会抛（上一版草稿丢失的原因） | dsh-client-ui-workspace / lib/client.js | 59195 | `draftPreparationFailed() { const message = this.ctx.locale.bind("workspace")("draft.initializationFailed");` |
| 18 | `sessions.create` 返回 sessionId | dsh-api-session-controller / lib/client.js | 152964 | `return result.value.sessionId;` |

### 4.2 沿用第二版的证据

入口形态、`apply/inject`、`ctx.effect`、槽位注册（含 list 槽 `id` 必填）、`inputActions` 的 provide 通道、`standardProps` 合成、`setDraft` 语义、`shortcuts.register` 与 Web 组合键放行、右栏 tab 类型/体、`locale.register/bind`、`data-textpreview-line/-path`、`data-review-file`、`data-diff-line` —— 偏移与摘录见 git 历史里第二版 README 的 4.1/4.2 表；本版未改动这些路径。

---

## 5. 未验证假设

1. **整体仍未在真实 Web GUI 点过**：本轮全部验证 = 源码静态证据 + 无头桩测试（stub `window` / `document` / `react` / `ctx` / `sessions` / `conversation` / `resources` / `sidebarRight`）。
2. **`useTabInfo` / `useResource` / `SessionProvider` / `renderSlot` / `renderFactorySlot` 这五个 prop 是否都到手**：形状照抄 ui-subagent 的侧栏聊天（它是随包发布的成品），但我的 tab 注册只声明了 `children`（没有声明 `inject`）。任一缺失时的行为是**降级到 compose 面板**（有快照 + 输入框 + 「提问」），并显示「这个版本不支持在侧栏内嵌会话，请在主区打开」+ 一个显式按钮，不会崩。
3. **`openResourceIn` 的复用语义**：它在该会话侧栏 store 未 adopt 时是 no-op；此时右栏仍会被 `openRightbar` 展开到现有/引导 tab，用户需从「+」里选一次「侧边聊天」。
4. **新会话在右栏里是否可发送**：取决于宿主 `conversation.content` 的 embedded 变体是否带完整输入框（ui-subagent 用它做侧栏聊天，应带）；我只负责把会话渲染进去。
5. **`connectBlank` 需要有效 workspaceId**：取不到时退到 `sessions.create({})`；两者都拿不到就退回「写当前草稿 + toast」。
6. **`requestDraftInitialization` 重试预算**：20 × 100ms。若宿主的 `adjudicating` 超过 2s，状态会显示「一直忙」，可以点按钮在主区打开后粘贴。
7. **行号基准、路径省略号截断、`useSession().cwd` 存在性、`Ctrl+Shift+K` 可能被浏览器截获** —— 同第二版，未变。
8. **`--dsw-*` token**：全部对着 `official-tokens-v1.json`（299 个）校验；契约文件不在本机时该项自动 skip（不 FAIL）。

---

## 6. 安装（与第二版相同 + 必须重装）

插件页 → 安装 → spec `file:D:\BBG\deepseek\dsh-selask`（URL 形式 `file:///D:/BBG/deepseek/dsh-selask`）→ 启用 → **刷新页面**。装过旧版要重装/刷新。

自检：① 选中文字右键出现两项；② 「添加到对话」→ 输入框出引用块、未发送；③ 「在侧边聊天中提问」→ 右栏出现「侧边聊天」tab（没自动切就从「+」选一次）；④ tab 里点「提问」→ 新建的会话**出现在右栏 tab 内、主区不变**，其输入框里已有引用块（状态行显示「已在新会话里准备好引用：补完问题，按回车发送。」）；在那里按回车才发送。

## 7. 回滚（不变）

插件页 → `dsh-selask` → 禁用 → 刷新；或卸载后删除 `D:\BBG\deepseek\dsh-selask`。插件不写任何持久化状态；侧边聊天的会话是宿主自己的会话，禁用插件不会删它。

---

## 已知问题

- 草稿灌注走宿主内部的 `requestDraftInitialization`：新会话刚创建时会短暂处于「忙碌」状态，插件会按 100ms 间隔重试最多 20 次。若 2 秒内始终被拒，状态行会如实写出「一直忙」。
- 若右侧栏没能在 1.5 秒内绑定到新会话（宿主的右栏 store 未就绪），插件会**退化为在主区打开该会话并写入草稿**，控制台留下 `[dsh-selask] the right panel did not bind the side session …`。此时主区会切换。
- 代码块语言标注依赖宿主在 `<pre><code>` 上标注语言；当前 DSH 版本不提供该标记，因此「代码块 xx」通常不会出现。
- 退化路径下，状态行可能先显示失败原因、再被最终结果覆盖，文案以最终行为准。

## 8. 自查声明

本会话只在 `D:\BBG\deepseek\dsh-selask\` 下写文件：`package.json`、`cordis.patch.yml`、`README.md`、`lib/index.js`、`lib/client.js`、`locale/zh.json`、`locale/en.json`、`test/smoke.mjs`；临时文件 `check.mjs` / `check2.mjs` 用完即删。未修改 DSH 安装目录（只 `readFileSync` 只读 asar 与 profile 里的 token 契约）、未写 `~/.dsh`、未安装/启用插件、未执行 `npm install`。
