// Headless smoke test for dsh-selask: stub window/document/react/ctx, then run the real
// bundle against them. Run with: node .\test\smoke.mjs

let capturedLoader = null;
let prevented = 0;
const rect = { top: 100, left: 200, width: 60, height: 16 };
const timers = [];
const pluginErrors = [];
const drainTimers = () => {
	let guard = 0;
	while (timers.length > 0 && guard < 100) {
		guard += 1;
		timers.shift()();
	}
};

function createElementStub(tag) {
	const listeners = new Map();
	const attributes = new Map();
	const el = {
		tagName: String(tag).toUpperCase(),
		style: {},
		children: [],
		parentElement: null,
		isConnected: true,
		offsetWidth: 0,
		offsetHeight: 0,
		value: "",
		type: "",
		_text: "",
		get textContent() {
			if (el.children.length === 0) return el._text;
			return el.children.map((child) => child.textContent).join("");
		},
		set textContent(value) {
			el._text = String(value);
			el.children.length = 0;
		},
		setAttribute: (key, value) => attributes.set(key, String(value)),
		getAttribute: (key) => (attributes.has(key) ? attributes.get(key) : null),
		appendChild: (child) => {
			el.children.push(child);
			child.parentElement = el;
			return child;
		},
		removeChild: (child) => {
			const at = el.children.indexOf(child);
			if (at >= 0) el.children.splice(at, 1);
			return child;
		},
		remove: () => {
			if (el.parentElement !== null) el.parentElement.removeChild(el);
			el.isConnected = false;
		},
		addEventListener: (type, fn) => {
			const list = listeners.get(type) ?? [];
			list.push(fn);
			listeners.set(type, list);
		},
		removeEventListener: (type, fn) => {
			const list = listeners.get(type) ?? [];
			const at = list.indexOf(fn);
			if (at >= 0) list.splice(at, 1);
		},
		focus: () => {},
		setSelectionRange: () => {},
		querySelector: () => null,
		querySelectorAll: () => [],
		fire: (type, event) => {
			for (const fn of listeners.get(type) ?? []) fn(event);
		}
	};
	Object.defineProperty(el, "firstChild", { get: () => el.children[0] ?? null });
	return el;
}

function makeNode(spec) {
	return {
		nodeType: 1,
		tagName: spec.tagName ?? "PRE",
		parentElement: null,
		isConnected: true,
		closest: (selector) => (spec.closest && spec.closest[selector] !== undefined ? spec.closest[selector] : null)
	};
}

const selectionText = { value: "const x = 1;\n  return x;" };
let selectionNode = makeNode({});
const composerEl = createElementStub("div");
const body = createElementStub("body");
const docListeners = new Map();

globalThis.window = {
	__ModuleLoader__: { load: (definition) => { capturedLoader = definition; } },
	getSelection: () => ({
		rangeCount: 1,
		isCollapsed: false,
		toString: () => selectionText.value,
		getRangeAt: () => ({ commonAncestorContainer: selectionNode, getBoundingClientRect: () => rect }),
		removeAllRanges: () => {},
		addRange: () => {}
	}),
	addEventListener: () => {},
	removeEventListener: () => {},
	innerWidth: 1200,
	innerHeight: 800,
	console: { error: (message) => { pluginErrors.push(String(message)); }, warn: () => {}, log: () => {} },
	setTimeout: (fn) => {
		timers.push(fn);
		return timers.length;
	}
};

globalThis.document = {
	body,
	documentElement: createElementStub("html"),
	createElement: (tag) => createElementStub(tag),
	addEventListener: (type, fn) => {
		const list = docListeners.get(type) ?? [];
		list.push(fn);
		docListeners.set(type, list);
	},
	removeEventListener: (type, fn) => {
		const list = docListeners.get(type) ?? [];
		const at = list.indexOf(fn);
		if (at >= 0) list.splice(at, 1);
	},
	querySelector: (selector) => (selector === "[data-composer-input]" ? composerEl : null),
	createRange: () => ({ selectNodeContents: () => {}, collapse: () => {}, getBoundingClientRect: () => rect }),
	fire: (type, event) => {
		for (const fn of docListeners.get(type) ?? []) fn(event);
	}
};

const componentState = { cells: [], cursor: 0 };
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
	useState: (initial) => {
		const index = componentState.cursor;
		componentState.cursor += 1;
		if (componentState.cells.length <= index) componentState.cells[index] = typeof initial === "function" ? initial() : initial;
		return [componentState.cells[index], (next) => {
			componentState.cells[index] = typeof next === "function" ? next(componentState.cells[index]) : next;
		}];
	},
	useEffect: (fn) => fn(),
	useRef: () => ({ current: null })
};
const renderTab = (props) => {
	componentState.cursor = 0;
	return tabSlotRef.component(props);
};

await import("../lib/client.js");
if (capturedLoader === null) throw new Error("bundle never called __ModuleLoader__.load");
const mod = capturedLoader.factory((name) => {
	if (name === "react") return reactStub;
	throw new Error("unexpected require: " + name);
});

const calls = { setDraft: [], submit: 0, insertText: 0, startSession: [], openTabIn: [], openRightbar: 0, openSession: [] };
const actions = {
	draftRev: 7,
	setDraft: (text) => calls.setDraft.push(text),
	submit: () => { calls.submit += 1; },
	insertText: () => { calls.insertText += 1; return false; },
	captureInsertion: () => ({ start: 0, end: 0, draftRev: 7 })
};

const services = {
	workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: "ws-1", sessionIds: ["s1"] }] }) } },
	uiSession: { current: { getSnapshot: () => ({ key: "s1" }) } },
	uiWorkspace: {
		startSession: (workspaceId, options) => calls.startSession.push([workspaceId, options]),
		openSession: (sessionId) => calls.openSession.push(sessionId)
	},
	sidebarRight: {
		openTabIn: (sessionId, kind, options) => calls.openTabIn.push([sessionId, kind, options]),
		openTab: (kind, options) => calls.openTabIn.push(["openTab", kind, options])
	},
	layout: { openRightbar: () => { calls.openRightbar += 1; } }
};

const dict = {
	"command.label": "引用选中的文字到输入框",
	"button.title": "引用选中的文字（{keys}）",
	"menu.addToConversation": "添加到对话",
	"menu.askInSideChat": "在侧边聊天中提问",
	"toast.empty": "先选中一段文字",
	"toast.noSession": "先打开一个会话",
	"toast.written": "已写入输入框草稿（未发送）",
	"toast.failed": "写入失败",
	"toast.sideFallback": "侧边提问不可用，已放入当前对话",
	"tab.title": "侧边聊天",
	"tab.empty": "还没有引用。选中文字后右键选「在侧边聊天中提问」。",
	"tab.snapshot": "本次引用",
	"tab.placeholder": "把问题补在引用下面……",
	"tab.submit": "提问",
	"tab.submitHint": "{keys} 提交",
	"tab.sent": "已在新会话里准备好引用：补完问题，按回车发送。",
	"tab.switch": "切换到该会话",
	"tab.failed": "发起新会话失败，已放入当前对话草稿。",
	"source.file": "— 来源：{path}:{line}",
	"source.fileNoLine": "— 来源：{path}",
	"source.page": "— 来源：{place}",
	"region.conversation": "会话消息区",
	"region.preview": "右侧文档预览",
	"region.review": "交付物 · 变更审查",
	"region.page": "页面 · {tag}"
};
const translate = (key, params) => {
	const template = dict[key] ?? key;
	return params === undefined ? template : template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
};

const registrations = { slots: [], tabs: [], shortcuts: [], effects: [] };
// The host marks 'id' as required on list cells; a stub that silently accepts any options
// cannot reproduce the wiring bug that killed the composer entry, so it validates here.
const LIST_SLOTS = new Set(["conversation.input.right"]);
const makeCtx = (options = {}) => ({
	effect: (fn, label) => {
		registrations.effects.push(label);
		return fn();
	},
	get: (name) => services[name],
	locale: { register: () => {}, bind: () => translate },
	shortcuts: {
		describeBinding: () => ({ keys: "Ctrl+Shift+K" }),
		register: (command) => {
			if (options.failShortcut === true) throw new Error("shortcut refused");
			registrations.shortcuts.push(command);
			return () => {};
		}
	},
	sidebarRightTabs: {
		register: (definition) => {
			if (options.failTab === true) throw new Error("tab type refused");
			registrations.tabs.push(definition);
			return () => {};
		}
	},
	slots: {
		inject: (name, callback) => { callback(); return () => {}; },
		register: (definition, component) => {
			if (options.failSlots === true) throw new Error("slot registration refused");
			if (options.failCell === definition.name) throw new Error("slot '" + definition.name + "' rejected by the contract check");
			for (const name of LIST_SLOTS.has(definition.name) ? ["id"] : []) {
				if (typeof definition[name] !== "string") throw new Error("slot '" + definition.name + "' requires option '" + name + "'");
			}
			registrations.slots.push({ definition, component });
			return () => {};
		}
	}
});
const ctx = makeCtx();
let tabSlotRef = null;
const report = (label, value) => console.log(label + ": " + value);
const assert = (condition, message) => {
	if (!condition) throw new Error("ASSERT FAILED: " + message);
};

// ---- manifest: the host only loads profile layers that declare dsh.bundle.patch ----
const fsMod = await import("node:fs");
const manifestUrl = new URL("../package.json", import.meta.url);
const manifest = JSON.parse(fsMod.readFileSync(manifestUrl, "utf8"));
const bundlePatch = manifest?.dsh?.bundle?.patch;
const bundlePatchUrl = typeof bundlePatch === "string" && bundlePatch !== "" ? new URL(bundlePatch, manifestUrl) : null;
report("dsh.bundle.patch", JSON.stringify(bundlePatch));
assert(typeof bundlePatch === "string" && bundlePatch !== "", "package.json declares dsh.bundle.patch (without it the host installs a plain dependency and never loads the client)");
assert(bundlePatchUrl !== null && fsMod.existsSync(bundlePatchUrl), "the declared patch file exists on disk");
assert((manifest.files ?? []).includes("cordis.patch.yml"), "package files ship cordis.patch.yml");

mod.apply(ctx);
report("module id", capturedLoader.id);
report("effects", registrations.effects.length);
report("slots", registrations.slots.map((entry) => entry.definition.name + (entry.definition.key ? "#" + entry.definition.key : "")).join(", "));
report("tab", registrations.tabs[0].id + " / " + registrations.tabs[0].kind + " / " + registrations.tabs[0].title());
const shortcut = registrations.shortcuts[0];
report("shortcut", shortcut.id + " " + JSON.stringify(shortcut.defaults["web:windows"]) + " resolve=" + shortcut.resolve({}).status);

const composerSlot = registrations.slots.find((entry) => entry.definition.name === "conversation.input.right");
const tabSlot = registrations.slots.find((entry) => entry.definition.name === "sidebar.right.pane.tab");
assert(composerSlot !== undefined, "composer slot registered");
report("composer cell", JSON.stringify({ id: composerSlot.definition.id, order: composerSlot.definition.order }));
assert(typeof composerSlot.definition.id === "string" && composerSlot.definition.id !== "", "list cell registers with the required id");
assert(typeof composerSlot.definition.order === "number", "list cell carries a numeric order");
assert(tabSlot !== undefined, "tab slot registered");
tabSlotRef = tabSlot;

const renderButton = () => composerSlot.component({
	sessionId: "s1",
	inputActions: actions,
	useInput: (selector) => selector({ draft: "existing line" }),
	useSession: (selector) => selector({ cwd: "D:\\BBG\\deepseek" }),
	t: translate
});

// The composer slot is what binds the live inputActions; render it like a mounted session.
renderButton();

const menuOf = () => body.children.find((child) => child.getAttribute("data-dsh-selask") === "menu");
const renderMenu = (node) => {
	selectionNode = node;
	document.fire("selectionchange", {});
	document.fire("contextmenu", { clientX: 300, clientY: 200, target: node, preventDefault: () => { prevented += 1; }, stopPropagation: () => {} });
	return menuOf();
};
const click = (element) => element.fire("click", { preventDefault: () => {}, stopPropagation: () => {} });

// ---- 1) contextmenu interception and the two menu items ----
renderMenu(makeNode({
	closest: {
		"[data-review-file]": { getAttribute: () => "src\\app\\main.ts" },
		"[data-diff-line]": { querySelectorAll: () => [{ textContent: "41" }, { textContent: "const x = 1;" }] }
	}
}));
const menuEl = menuOf();
assert(menuEl !== undefined, "menu element mounted on body");
assert(prevented === 1, "contextmenu intercepted (preventDefault called once)");
assert(menuEl.style.display === "flex", "menu shown");
assert(menuEl.children.length === 2, "menu has exactly two items");
report("menu items", JSON.stringify(menuEl.children.map((item) => item.textContent)));
report("menu position", menuEl.style.left + " / " + menuEl.style.top);

// ---- 2) Add to conversation: draft only, never send ----
click(menuEl.children[0]);
report("draft after item 1", JSON.stringify(calls.setDraft[calls.setDraft.length - 1]));
assert(calls.setDraft.length === 1, "exactly one draft write");
assert(calls.setDraft[0].includes("existing line"), "existing draft preserved");
assert(calls.setDraft[0].includes("— 来源：src/app/main.ts:41"), "structured source line");
assert(calls.submit === 0, "never calls submit");
assert(calls.insertText === 0, "setDraft path used");
assert(menuEl.style.display === "none", "menu closed after picking");

// ---- 3) Ask in side chat: right sidebar tab + startSession draft seeding ----
selectionText.value = "const y = 2;";
const menu2 = renderMenu(makeNode({ closest: { "[data-chat-flow]": {} } }));
click(menu2.children[1]);
report("openTabIn", JSON.stringify(calls.openTabIn));
report("openRightbar calls", calls.openRightbar);
assert(calls.openTabIn.length === 1, "side chat tab requested once");
assert(calls.openTabIn[0][0] === "s1", "opened for the on-screen session");
assert(calls.openTabIn[0][1] === "selask-quote", "tab kind");
assert(calls.openRightbar === 1, "right bar expanded");

const tabTree = renderTab({ t: translate, sessionId: "s1" });
const children = tabTree.children;
report("tab children", children.length);
report("tab snapshot", JSON.stringify(children[1].children[0]));
report("tab textarea value", JSON.stringify(children[3].props.value));
assert(children[3].type === "textarea", "question box present");
assert(children[3].props.value === children[1].children[0] + "\n\n", "prefilled with the block plus one blank line");
assert(typeof children[3].props.onKeyDown === "function", "Ctrl+Enter handler present");

const submitButton = children[4].children[0];
report("submit label", JSON.stringify(submitButton.children[0]));
submitButton.props.onClick();
report("startSession call", JSON.stringify(calls.startSession));
assert(calls.startSession.length === 1, "startSession called once");
assert(calls.startSession[0][0] === "ws-1", "workspaceId resolved from the workspaces list");
assert(Object.keys(calls.startSession[0][1]).join(",") === "prompt", "only a prompt option is passed");
assert(calls.startSession[0][1].prompt.startsWith("> const y = 2;"), "prompt carries the cite block");
assert(calls.setDraft.length === 1, "no extra draft write on the startSession path");
assert(calls.submit === 0, "still never sends");

// the new conversation shows up in the main binding: the tab then offers a switch button
services.uiSession.current = { getSnapshot: () => ({ key: "s2" }) };
drainTimers();
const sentTree = renderTab({ t: translate, sessionId: "s1" });
const statusNode = sentTree.children[sentTree.children.length - 1];
report("sent status", JSON.stringify(statusNode?.children?.[0]?.children?.[0] ?? null));
assert(statusNode !== null && statusNode !== undefined, "status block rendered after submit");
assert(statusNode.children[0].children[0] === dict["tab.sent"], "sent copy shown");
const switchButton = statusNode.children[1];
assert(switchButton !== null && switchButton !== undefined, "switch button offered once the session id is known");
report("switch label", JSON.stringify(switchButton.children[0]));
switchButton.fire;
switchButton.props.onClick();
report("openSession calls", JSON.stringify(calls.openSession));
assert(calls.openSession.length === 1 && calls.openSession[0] === "s2", "switch opens the created conversation");
assert(calls.submit === 0, "switching never sends");

// ---- 4) the shortcut / composer button still writes the draft ----
selectionText.value = "字".repeat(500);
selectionNode = makeNode({ closest: { "[data-textpreview-body]": {} } });
renderButton().props.onClick();
const lastDraft = calls.setDraft[calls.setDraft.length - 1];
const quoteLine = lastDraft.split("\n").filter((line) => line.startsWith("> "))[0];
report("clip quote line chars", Array.from(quoteLine).length);
assert(Array.from(quoteLine).length === 403, "400 char snapshot + '> ' + ellipsis");
assert(lastDraft.includes("— 来源：右侧文档预览"), "document preview labelled when no path resolves");
report("shortcut run writes draft", calls.setDraft.length);
shortcut.resolve({}).run();
assert(calls.setDraft.length === 3, "shortcut writes the draft too");
assert(calls.submit === 0, "nothing sends anywhere");

// ---- 5) one failing registration must not take the others down ----
const menuListenersBefore = (docListeners.get("contextmenu") ?? []).length;
const tabsBefore = registrations.tabs.length;
const shortcutsBefore = registrations.shortcuts.length;
const errorsBefore = pluginErrors.length;
let applyThrew = null;
try {
	mod.apply(makeCtx({ failCell: "conversation.input.right" }));
} catch (error) {
	applyThrew = error;
}
const menuListenersAfter = (docListeners.get("contextmenu") ?? []).length;
report("apply threw on failing slot", applyThrew === null ? "no" : String(applyThrew));
report("contextmenu listeners", menuListenersBefore + " -> " + menuListenersAfter);
report("plugin errors logged", JSON.stringify(pluginErrors.slice(errorsBefore)));
assert(applyThrew === null, "apply() survives a failing registration");
assert(menuListenersAfter === menuListenersBefore + 1, "context menu still installed when the composer cell fails");
assert(registrations.tabs.length === tabsBefore + 1, "tab type still registered when the composer cell fails");
assert(registrations.shortcuts.length === shortcutsBefore + 1, "shortcut still registered when the composer cell fails");
report("slots after failing cell", registrations.slots.length);
assert(pluginErrors.length === errorsBefore + 1, "exactly one failure logged: " + JSON.stringify(pluginErrors.slice(errorsBefore)));
assert(pluginErrors[errorsBefore].includes("composer button"), "the failure names the composer item");
assert(registrations.slots.some((entry) => entry.definition.name === "sidebar.right.pane.tab"), "the tab body still registered when only the composer cell fails");

// ---- 6) a shot menu install must not stop the rest either ----
const menuListenersBefore2 = (docListeners.get("contextmenu") ?? []).length;
const tabsBefore2 = registrations.tabs.length;
let hookThrew = null;
try {
	mod.apply(makeCtx({ failTab: true }));
} catch (error) {
	hookThrew = error;
}
assert(hookThrew === null, "apply() survives a failing tab registration");
assert((docListeners.get("contextmenu") ?? []).length === menuListenersBefore2 + 1, "context menu installed before the failing item");
assert(registrations.tabs.length === tabsBefore2, "the failing tab type is simply skipped");

// ---- 7) every --dsw-* token in the bundle must exist in the official contract ----
const tokenContractPaths = [
	"C:\\Users\\BBG\\.dsh\\profiles\\desktop\\node_modules\\@linxin666\\dsh-client-ui-skin-center\\contracts\\official-tokens-v1.json",
	"C:\\Users\\BBG\\.dsh\\profiles\\desktop-BACKUP-20261019-234331\\node_modules\\@linxin666\\dsh-client-ui-skin-center\\contracts\\official-tokens-v1.json"
];
const clientSource = fsMod.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const usedTokens = [...new Set(clientSource.match(/--dsw-[a-z0-9-]+/g) ?? [])].sort();
report("dsw tokens used", usedTokens.join(" "));
assert(usedTokens.length > 0, "the bundle uses design tokens, not hardcoded colors");
const hardcodedColors = [...new Set((clientSource.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []))];
report("hardcoded colors", JSON.stringify(hardcodedColors));
assert(hardcodedColors.length === 0, "no hardcoded color may sit next to a token (they must not mix)");
const contractPath = tokenContractPaths.find((candidate) => fsMod.existsSync(candidate));
if (contractPath === undefined) {
	console.log("token contract not found on this machine; skipping the --dsw-* existence check");
} else {
	const contract = JSON.parse(fsMod.readFileSync(contractPath, "utf8"));
	const known = new Set(contract.tokens);
	const unknown = usedTokens.filter((token) => !known.has(token));
	report("token contract", contractPath + " (" + known.size + " tokens)");
	assert(unknown.length === 0, "undeclared --dsw-* tokens: " + JSON.stringify(unknown));
}

console.log("SMOKE OK");
