// Headless smoke test for dsh-selask. Stubs window/document/react/ctx, then runs the real
// bundle against them: node .\test\smoke.mjs

let capturedLoader = null;
let prevented = 0;
const rect = { top: 100, left: 200, width: 60, height: 16 };
const timers = [];
const pluginErrors = [];
const pluginWarns = [];
const pluginInfos = [];
const timeline = [];
const drainTimers = () => {
	let guard = 0;
	while (timers.length > 0 && guard < 200) {
		guard += 1;
		timers.shift()();
	}
};
const flush = async () => {
	for (let i = 0; i < 12; i += 1) await Promise.resolve();
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

function makeEl(spec = {}) {
	const attributes = spec.attributes ?? {};
	const el = {
		nodeType: 1,
		tagName: spec.tagName ?? "DIV",
		isConnected: true,
		parentElement: spec.parentElement ?? null,
		getAttribute: (name) => (name in attributes ? attributes[name] : null),
		querySelector: () => null,
		querySelectorAll: () => [],
		closest: (selector) => (spec.closest && selector in spec.closest ? spec.closest[selector] : null)
	};
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
	console: {
		error: (message) => { pluginErrors.push(String(message)); },
		warn: (message) => { pluginWarns.push(String(message)); },
		info: (message) => { pluginInfos.push(String(message)); },
		log: () => {}
	},
	clearTimeout: () => {},
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
	useRef: () => {
		const index = componentState.cursor;
		componentState.cursor += 1;
		if (componentState.cells.length <= index) componentState.cells[index] = { current: null };
		return componentState.cells[index];
	}
};

await import("../lib/client.js");
if (capturedLoader === null) throw new Error("bundle never called __ModuleLoader__.load");
const mod = capturedLoader.factory((name) => {
	if (name === "react") return reactStub;
	throw new Error("unexpected require: " + name);
});

const calls = {
	setDraft: [],
	submit: 0,
	insertText: 0,
	openTabIn: [],
	openResourceIn: [],
	openRightbar: 0,
	openSession: [],
	connectBlank: [],
	create: [],
	seed: [],
	retain: [],
	release: [],
	resourceRegister: [],
	renderSlot: [],
	factory: []
};
const actions = {
	draftRev: 7,
	setDraft: (text) => calls.setDraft.push(text),
	submit: () => { calls.submit += 1; },
	insertText: () => { calls.insertText += 1; return false; },
	captureInsertion: () => ({ start: 0, end: 0, draftRev: 7 })
};

// Session controllers: binding() becomes available only after the first writes, like a real
// freshly created session; requestDraftInitialization answers blocked twice, then applied.
let bindingReady = false;
let seedCursor = 0;
const seedPlan = ["blocked", "blocked", "applied"];
const services = {
	workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: "ws-1", sessionIds: ["s1"] }] }) } },
	sessionCatalog: null,
	uiSession: { current: { getSnapshot: () => ({ key: "s1" }) } },
	uiWorkspace: {
		connectBlank: (workspaceId) => { calls.connectBlank.push([workspaceId]); return Promise.resolve("s-new"); },
		openSession: (sessionId) => calls.openSession.push(sessionId)
	},
	sessions: {
		create: (options) => { calls.create.push([options]); return Promise.resolve("s-created"); },
		list: { getSnapshot: () => ({ byId: { s1: { id: "s1", displayTitle: "引用功能调试" } } }) },
		binding: (sessionId) => (bindingReady ? { sessionId } : void 0),
		retain: (sessionId, options) => {
			calls.retain.push([sessionId, options]);
			return { sessionId, release: () => calls.release.push(sessionId) };
		}
	},
	conversation: {
		input: {
			requestDraftInitialization: (binding, options) => {
				timeline.push("seed");
				calls.seed.push([binding, options]);
				const outcome = seedPlan[Math.min(seedCursor, seedPlan.length - 1)];
				seedCursor += 1;
				return outcome;
			}
		}
	},
	resources: { register: (provider) => { calls.resourceRegister.push(provider); return () => {}; } },
	sidebarRight: {
		openTabIn: (sessionId, kind, options) => calls.openTabIn.push([sessionId, kind, options]),
		openResourceIn: (sessionId, address, options) => {
			timeline.push("bind:" + address);
			calls.openResourceIn.push([sessionId, address, options]);
		}
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
	"toast.sideSent": "已在右栏打开新的侧边会话（未发送）",
	"tab.title": "侧边聊天",
	"tab.empty": "还没有引用。选中文字后右键选「在侧边聊天中提问」。",
	"tab.snapshot": "本次引用",
	"tab.placeholder": "把问题补在引用下面……",
	"tab.submit": "提问",
	"tab.submitHint": "{keys} 提交",
	"tab.creating": "正在新建侧边会话……",
	"tab.createFailed": "新建会话失败，已把文字放进当前草稿。",
	"tab.seeding": "正在把引用写入新会话草稿……",
	"tab.seedApplied": "已在新会话里准备好引用：补完问题，按回车发送。",
	"tab.seedBlocked": "新会话草稿一直忙（已重试 {count} 次）；可以点下面按钮在主区打开后粘贴。",
	"tab.seedPreserved": "新会话里已经有别的草稿，引用没有覆盖它。",
	"tab.seedUnavailable": "拿不到输入框接口（重试 {count} 次）。",
	"tab.openInMain": "在主区打开该会话",
	"tab.embedUnavailable": "这个版本不支持在侧栏内嵌会话，请在主区打开。",
	"source.file": "— 来源：{path}:{line}",
	"source.fileNoLine": "— 来源：{path}",
	"source.detail": "— 来源：{detail}",
	"source.sessionTitle": "会话《{title}》",
	"source.sessionMessage": "第 {n} 条消息",
	"source.roleUser": "（你）",
	"source.roleAssistant": "（助手）",
	"source.codeBlock": "代码块 {lang}",
	"source.composer": "— 来源：输入框草稿"
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
assert(typeof bundlePatch === "string" && bundlePatch !== "", "package.json declares dsh.bundle.patch");
assert(bundlePatchUrl !== null && fsMod.existsSync(bundlePatchUrl), "the declared patch file exists on disk");
assert((manifest.files ?? []).includes("cordis.patch.yml"), "package files ship cordis.patch.yml");

mod.apply(ctx);
report("module id", capturedLoader.id);
report("guard failures on first apply", JSON.stringify(pluginErrors));
assert(pluginErrors.length === 0, "no registration may fail silently on a healthy host");
report("effects", registrations.effects.length);
report("slots", registrations.slots.map((entry) => entry.definition.name + (entry.definition.key ? "#" + entry.definition.key : "")).join(", "));
const tabType = registrations.tabs[0];
report("tab type", tabType.id + " / " + tabType.kind + " / " + JSON.stringify(tabType.patterns) + " / " + tabType.title());
assert(tabType.canOpen("dsh-resource://selaskchat/session/s-new") === true, "tab type claims our resource addresses");
assert(tabType.canOpen("dsh-resource://other/session/x") === false, "tab type rejects foreign addresses");
const shortcut = registrations.shortcuts[0];
report("shortcut", shortcut.id + " " + JSON.stringify(shortcut.defaults["web:windows"]) + " resolve=" + shortcut.resolve({}).status);
report("resource provider registered", calls.resourceRegister.length);

const composerSlot = registrations.slots.find((entry) => entry.definition.name === "conversation.input.right");
const tabSlot = registrations.slots.find((entry) => entry.definition.name === "sidebar.right.pane.tab");
const embedSlot = registrations.slots.find((entry) => entry.definition.name === "selask.chat.conversation");
assert(composerSlot !== undefined, "composer slot registered");
assert(tabSlot !== undefined, "tab slot registered");
assert(embedSlot !== undefined, "embedded conversation slot registered");
assert(tabSlot.definition.children?.["selask.chat.conversation"]?.scope === "session", "tab declares the session-scoped embed child");
report("composer cell", JSON.stringify({ id: composerSlot.definition.id, order: composerSlot.definition.order }));
assert(typeof composerSlot.definition.id === "string" && composerSlot.definition.id !== "", "list cell registers with the required id");
assert(typeof composerSlot.definition.order === "number", "list cell carries a numeric order");
tabSlotRef = tabSlot;

const renderButton = () => composerSlot.component({
	sessionId: "s1",
	inputActions: actions,
	useInput: (selector) => selector({ draft: "existing line" }),
	useSession: (selector) => selector({ cwd: "D:\\BBG\\deepseek" }),
	t: translate
});
assert(renderButton() === null, "the composer mount renders nothing (no DOM node)");
assert(registrations.slots.some((entry) => entry.definition.name === "conversation.input.right" && entry.definition.id === "selask.composer"), "the mount-only cell stays registered");

const renderTab = (props) => {
	componentState.cursor = 0;
	return tabSlotRef.component({ t: translate, sessionId: "s1", ...props });
};
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

// ---- 2) Add to conversation: draft only, never send ----
click(menuEl.children[0]);
report("draft after item 1", JSON.stringify(calls.setDraft[calls.setDraft.length - 1]));
assert(calls.setDraft.length === 1, "exactly one draft write");
assert(calls.setDraft[0].includes("existing line"), "existing draft preserved");
assert(calls.setDraft[0].includes("— 来源：src/app/main.ts:41"), "structured source line");
assert(calls.submit === 0, "never calls submit");
assert(menuEl.style.display === "none", "menu closed after picking");

// ---- 2b) source line: detailed, or absent ----
// writeBlock always appends one trailing newline; ignore that empty tail
const lastLines = () => {
	const lines = calls.setDraft[calls.setDraft.length - 1].split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines;
};
const draftSourceLine = () => {
	const lines = lastLines();
	const tail = lines[lines.length - 1];
	return tail.startsWith("— 来源：") ? tail : null;
};


// (1) workspace file + line, from a deliverable review card
selectionText.value = "const k = 3;";
const menuFile = renderMenu(makeNode({
	closest: {
		"[data-review-file]": { getAttribute: () => "src\\app\\main.ts" },
		"[data-diff-line]": { querySelectorAll: () => [{ textContent: "88" }] }
	}
}));
click(menuFile.children[0]);
report("source (file:line)", JSON.stringify(draftSourceLine()));
assert(draftSourceLine() === "— 来源：src/app/main.ts:88", "file+line source kept");

// (2) conversation body: session title + flow ordinal + role, no filler
const flowEl = makeEl({ tagName: "DIV" });
const nodeEl = makeEl({ attributes: { "data-chat-node-key": "k2", "data-chat-flow-kind": "assistant" } });
const sessionEl = makeEl({ attributes: { "data-conversation-session": "s1" } });
const secondNode = makeEl({ attributes: { "data-chat-node-key": "k1", "data-chat-flow-kind": "user" } });
flowEl.querySelectorAll = () => [secondNode, nodeEl];
nodeEl.closest = (selector) => (selector === "[data-chat-flow]" ? flowEl : null);
const bodyNode = makeEl({
	tagName: "P",
	closest: {
		"[data-chat-node-key]": nodeEl,
		"[data-conversation-session]": sessionEl
	}
});
selectionText.value = "这里说的引用落点是什么意思？";
const menuBody = renderMenu(bodyNode);
click(menuBody.children[0]);
report("source (conversation)", JSON.stringify(draftSourceLine()));
assert(draftSourceLine() === "— 来源：会话《引用功能调试》 · 第 2 条消息（助手）", "conversation source names the title, the ordinal and the role");
assert(!draftSourceLine().includes("会话消息区") && !draftSourceLine().includes("页面 · "), "no filler phrasing in the conversation source");

// (3) composer selection — the context menu skips the composer on purpose, so this
// case is reached through the keyboard entry
const composerNode = makeEl({ tagName: "DIV", closest: { "[data-composer-input]": makeEl() } });
selectionText.value = "草稿里的一段";
selectionNode = composerNode;
shortcut.resolve({}).run();
report("source (composer)", JSON.stringify(draftSourceLine()));
assert(draftSourceLine() === "— 来源：输入框草稿", "composer source");

// (4) no provable anchor: the source line must not exist at all
const bareNode = makeEl({ tagName: "DIV" });
selectionText.value = "一段没有锚点的文字";
const menuBare = renderMenu(bareNode);
click(menuBare.children[0]);
report("draft without source", JSON.stringify(calls.setDraft[calls.setDraft.length - 1]));
assert(draftSourceLine() === null, "no source line when nothing is provable");
// the draft is append-only, so check just the segment this write appended
const appended = calls.setDraft[calls.setDraft.length - 1].split("\n\n").pop();
report("appended segment", JSON.stringify(appended));
assert(appended === "> 一段没有锚点的文字\n", "the block keeps only the quote lines");

// ---- 3) Ask in side chat: the tab opens, no session is created yet ----
selectionText.value = "const y = 2;";
const menu2 = renderMenu(makeNode({ closest: { "[data-chat-flow]": {} } }));
click(menu2.children[1]);
report("openTabIn after item 2", JSON.stringify(calls.openTabIn));
assert(calls.openTabIn.length === 1 && calls.openTabIn[0][1] === "selask-quote", "side chat tab requested by kind");
assert(calls.connectBlank.length === 0, "no session is created until the user submits");

// ---- 4) ask: create (no main switch) -> bind the tab -> only then seed the draft ----
const fakeReference = { sessionId: "s-new", release: () => {} };
const fakeSessionProvider = function SessionProvider(props) { return props.children; };
const unboundTab = () => renderTab({ useTabInfo: () => ({ tab: { contentId: void 0 } }), useResource: () => ({ value: void 0 }) });
const boundTab = () => renderTab({
	useTabInfo: () => ({ tab: { contentId: "dsh-resource://selaskchat/session/s-new" } }),
	useResource: () => ({ value: { reference: fakeReference } }),
	SessionProvider: fakeSessionProvider,
	renderSlot: (name) => { calls.renderSlot.push(name); return { type: "slot", name }; }
});
const lastStatus = (tree) => tree.children[tree.children.length - 1];
const statusText = (node) => {
	const text = node?.children?.[0]?.children?.[0];
	return typeof text === "string" ? text : null;
};
const submitRound = async (plan) => {
	seedPlan.length = 0;
	for (const outcome of plan) seedPlan.push(outcome);
	seedCursor = 0;
	timeline.length = 0;
	timers.length = 0;
	selectionText.value = "问题：" + plan.join("-");
	click(renderMenu(makeNode({})).children[1]);
	const compose = unboundTab();
	compose.children[4].children[0].props.onClick();
	await flush();
	// the Host has created the Session by now, so its binding exists for the seed retry
	bindingReady = true;
	return compose;
};

// (4a) the compose panel still creates the session without touching the main area
const composeTree = await submitRound(["blocked", "blocked", "applied"]);
report("compose children", composeTree.children.length);
const textarea = composeTree.children[3];
report("question value", JSON.stringify(textarea.props.value));
assert(textarea.type === "textarea", "question box present");
assert(textarea.props.value.endsWith("\n\n"), "prefilled with the quote block plus one blank line");
report("connectBlank", JSON.stringify(calls.connectBlank));
report("openSession calls", JSON.stringify(calls.openSession));
assert(calls.connectBlank.length === 1 && calls.connectBlank[0][0] === "ws-1", "session created through connectBlank(workspaceId)");
assert(calls.openSession.length === 0, "main area is never switched on the happy path");
report("openResourceIn", JSON.stringify(calls.openResourceIn));
assert(calls.openResourceIn.length === 1 && calls.openResourceIn[0][1].startsWith("dsh-resource://selaskchat/session/"), "tab is pointed at the new session's resource address");
report("timeline before bind", JSON.stringify(timeline));
assert(calls.seed.length === 0, "no draft write happens before the embedded conversation is mounted");

// (4b) mounting the embedded conversation is what triggers the seed; bind precedes seed
const boundTree = boundTab();
report("bound tree", boundTree.props["data-selask-embed"] + " / " + (boundTree.children.some((child) => child !== null && child !== void 0 && child.type === fakeSessionProvider)));
assert(boundTree.props["data-selask-embed"] === "session", "tab switches to the embedded session view");
const providerNode = boundTree.children.find((child) => child !== null && child !== void 0 && child.type === fakeSessionProvider);
assert(providerNode !== undefined, "SessionProvider wraps the embedded view");
assert(providerNode.props.session === fakeReference, "SessionProvider receives the retained reference");
report("timeline after bind", JSON.stringify(timeline));
assert(timeline.indexOf("bind:dsh-resource://selaskchat/session/s-new") === 0, "binding happens before any seed call");
drainTimers();
await flush();
report("timeline", JSON.stringify(timeline));
assert(timeline.filter((entry) => entry === "seed").length >= 3, "blocked results are retried until applied");
assert(timeline.indexOf("bind:dsh-resource://selaskchat/session/s-new") < timeline.indexOf("seed"), "the tab binds first, the seed follows");
const appliedStatus = lastStatus(unboundTab());
report("status (applied)", JSON.stringify(statusText(appliedStatus)));
assert(statusText(appliedStatus).includes("已在新会话里准备好引用"), "applied branch copy");
assert(pluginInfos.length >= 1 && pluginInfos[0].includes("draft seeded into side session"), "applied seed logs an info line");
assert(calls.openSession.length === 0, "still no main-area switch");

// (4c) preserved branch: the session already had a draft, so we say so instead of claiming success
await submitRound(["preserved"]);
boundTab();
drainTimers();
await flush();
const preservedStatus = lastStatus(unboundTab());
report("status (preserved)", JSON.stringify(statusText(preservedStatus)));
assert(statusText(preservedStatus) === "新会话里已经有别的草稿，引用没有覆盖它。", "preserved branch copy");
assert(pluginWarns.some((message) => message.includes("preserved")), "preserved is logged as a warning");

// (4d) blocked branch: stays blocked through the whole budget
await submitRound(Array.from({ length: 20 }, () => "blocked"));
boundTab();
drainTimers();
await flush();
const blockedStatus = lastStatus(unboundTab());
report("status (blocked)", JSON.stringify(statusText(blockedStatus)));
assert(statusText(blockedStatus).includes("一直忙") && statusText(blockedStatus).includes("20"), "blocked branch copy carries the attempt count");

// (4e) binding never arrives: degrade to the main area with a warning, never silently
const openBefore = calls.openSession.length;
const warnsBefore = pluginWarns.length;
await submitRound(["blocked", "applied"]);
unboundTab();
drainTimers();
await flush();
const degradedStatus = lastStatus(unboundTab());
report("status (degraded)", JSON.stringify(statusText(degradedStatus)));
report("plugin warns (degraded)", JSON.stringify(pluginWarns.slice(warnsBefore)));
assert(calls.openSession.length === openBefore + 1 && calls.openSession[0] === "s-new", "the fallback opens the session in the main area");
assert(pluginWarns.slice(warnsBefore).some((message) => message.includes("did not bind")), "the fallback is logged, not silent");
assert(statusText(degradedStatus) !== null, "the degraded click still reports a status");

// ---- 5) embedded conversation component: host factory slot ----
const factoryCalls = [];
const embedTree = embedSlot.component({
	t: translate,
	sessionId: "s-new",
	useSession: () => ({ blank: true, openState: "open" }),
	useConversation: () => ({ activeTargets: new Set() }),
	useSessions: () => true,
	renderFactorySlot: (name, input, local) => { factoryCalls.push([name, input, local]); return { type: "factory", name }; }
});
report("factory slot", JSON.stringify(factoryCalls.map((entry) => [entry[0], entry[1].variant])));
assert(factoryCalls.length === 1 && factoryCalls[0][0] === "conversation.content", "embedded view renders the host conversation.content factory");
assert(factoryCalls[0][1].variant === "embedded", "it uses the embedded variant");
const noFactoryTree = embedSlot.component({ t: translate, sessionId: "s-new" });
assert(noFactoryTree.props["data-dsh-selask"] === "embed-unavailable", "missing factory slot degrades to a message, not a crash");


// ---- 6) resource provider retains and releases the session ----
const provider = calls.resourceRegister[0];
assert(provider !== undefined && provider.protocol === "selaskchat", "resource protocol registered");
const controller = new AbortController();
const stream = provider.open("dsh-resource://selaskchat/session/s-new", { signal: controller.signal });
const first = await stream.next();
report("resource frame", JSON.stringify({ ok: first.value?.ok, sessionId: first.value?.value?.sessionId }));
assert(first.value.ok === true, "resource opens for a valid address");
assert(calls.retain.length === 1 && calls.retain[0][0] === "s-new", "sessions.retain(sessionId) called for the tab");
assert(first.value.value.reference.sessionId === "s-new", "the frame carries the retained reference");
controller.abort();
await stream.return?.();
report("released", JSON.stringify(calls.release));
assert(calls.release.length === 1 && calls.release[0] === "s-new", "reference released when the tab closes");

// ---- 7) the shortcut / composer button still write the draft ----
selectionText.value = "字".repeat(500);
selectionNode = makeNode({ closest: { "[data-textpreview-body]": {} } });
assert(renderButton() === null, "re-rendering the mount still produces no DOM");
const writesBeforeClip = calls.setDraft.length;
shortcut.resolve({}).run();
const lastDraft = calls.setDraft[calls.setDraft.length - 1];
const quoteLine = lastDraft.split("\n").filter((line) => line.startsWith("> "))[0];
report("clip quote line chars", Array.from(quoteLine).length);
assert(Array.from(quoteLine).length === 403, "400 char snapshot + '> ' + ellipsis");
const appendedClip = lastDraft.split("\n\n").pop();
report("clip appended segment tail", JSON.stringify(appendedClip.slice(-24)));
assert(!appendedClip.includes("— 来源："), "a preview selection without a resolvable path emits no source line at all");
assert(calls.setDraft.length === writesBeforeClip + 1, "the shortcut adds exactly one draft write");
assert(calls.submit === 0, "nothing sends through the composer action face");

// ---- 8) one failing registration must not take the others down ----
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
report("plugin errors logged", JSON.stringify(pluginErrors.slice(errorsBefore)));
report("contextmenu listeners", menuListenersBefore + " -> " + (docListeners.get("contextmenu") ?? []).length);
assert(applyThrew === null, "apply() survives a failing registration");
assert((docListeners.get("contextmenu") ?? []).length === menuListenersBefore + 1, "context menu still installed when the composer cell fails");
assert(registrations.tabs.length === tabsBefore + 1, "tab type still registered when the composer cell fails");
assert(registrations.shortcuts.length === shortcutsBefore + 1, "shortcut still registered when the composer cell fails");
assert(pluginErrors.length === errorsBefore + 1 && pluginErrors[errorsBefore].includes("composer mount"), "the failure is logged against its own item");
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

// ---- 9) every --dsw-* token in the bundle must exist in the official contract ----
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
