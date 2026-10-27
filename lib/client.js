window.__ModuleLoader__.load({
	id: "dsh-selask",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;

		//#region namespace, dictionaries, ids
		const NS = "dsh-selask";
		const TAB_ID = "selask.quote";
		const COMPOSER_ENTRY_ID = "selask.composer";
		const TAB_KIND = "selask-quote";
		const COMMAND_ID = "selask.quoteSelection";
		const MARK = "data-dsh-selask";
		const MAX_SNAPSHOT = 400;
		/** Draft-seed retry budget: a fresh session is often still adjudicating. */
		const SEED_ATTEMPTS = 20;
		const SEED_INTERVAL = 100;
		const WEB_BINDING = { code: "KeyK", modifiers: ["primary", "shift"] };
		const DESKTOP_BINDING = { code: "KeyK", modifiers: ["control", "shift"] };
		const zh = {
			"command.label": "引用选中的文字到输入框",
			"button.title": "引用选中的文字（{keys}）",
			"menu.label": "选区操作",
			"menu.addToConversation": "添加到对话",
			"menu.askInSideChat": "在侧边聊天中提问",
			"toast.empty": "先选中一段文字",
			"toast.noSession": "先打开一个会话，把光标放进输入框",
			"toast.written": "已写入输入框草稿（未发送）",
			"toast.failed": "写入失败：输入框不可用",
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
			"source.page": "— 来源：{place}",
			"region.conversation": "会话消息区",
			"region.preview": "右侧文档预览",
			"region.review": "交付物 · 变更审查",
			"region.composer": "输入框",
			"region.page": "页面 · {tag}"
		};
		const en = {
			"command.label": "Quote selection into draft",
			"button.title": "Quote the selected text ({keys})",
			"menu.label": "Selection actions",
			"menu.addToConversation": "Add to conversation",
			"menu.askInSideChat": "Ask in side chat",
			"toast.empty": "Select some text first",
			"toast.noSession": "Open a session and focus its composer first",
			"toast.written": "Written into the draft (not sent)",
			"toast.failed": "Write failed: the composer is unavailable",
			"toast.sideFallback": "Side chat is unavailable; the text went into this draft",
			"toast.sideSent": "New side conversation opened in the right panel (not sent)",
			"tab.title": "Side chat",
			"tab.empty": "No quote yet. Select text, then right-click and pick Ask in side chat.",
			"tab.snapshot": "This quote",
			"tab.placeholder": "Add your question under the quote…",
			"tab.submit": "Ask",
			"tab.submitHint": "{keys} to submit",
			"tab.creating": "Creating a side conversation…",
			"tab.createFailed": "Could not create a conversation; the text went into this draft.",
			"tab.seeding": "Writing the quote into the new draft…",
			"tab.seedApplied": "Prepared in the side conversation: finish the question and press Enter there.",
			"tab.seedBlocked": "The new draft stayed busy through {count} attempts; open it below to paste.",
			"tab.seedPreserved": "The new conversation already had a draft, so the quote was not written.",
			"tab.seedUnavailable": "The composer API was not reachable ({count} attempts).",
			"tab.openInMain": "Open that conversation in the main area",
			"tab.embedUnavailable": "This build cannot embed a conversation; open it in the main area instead.",
			"source.file": "— Source: {path}:{line}",
			"source.fileNoLine": "— Source: {path}",
			"source.page": "— Source: {place}",
			"region.conversation": "conversation transcript",
			"region.preview": "document preview",
			"region.review": "deliverable review",
			"region.composer": "composer",
			"region.page": "page · {tag}"
		};

		let t = (key) => key;
		let hintKeys = "Ctrl+Shift+K";
		/** Plugin context kept for ctx.get() lookups of optional services. */
		let runtime = null;
		//#endregion

		//#region tiny snapshot store
		function createStore(initial) {
			let value = initial;
			const listeners = new Set();
			return {
				get: () => value,
				set: (next) => {
					value = next;
					for (const listener of [...listeners]) listener();
				},
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				}
			};
		}

		/** The pending side-chat payload: { block, prompt, at, createdId? }. */
		const sideChat = createStore(null);

		function useStoreValue(store) {
			const [value, setValue] = react.useState(store.get);
			react.useEffect(() => store.subscribe(() => setValue(store.get())), [store]);
			return value;
		}
		//#endregion

		//#region composer binding registry
		/**
		 * The composer action face handed to this slot by the host's provide channel
		 * (uiSession.provide props: inputActions). It only exists while a composer is
		 * mounted, so the shortcut and the context menu read it from here.
		 */
		const live = {
			actions: null,
			sessionId: null,
			draft: "",
			draftKnown: false,
			cwd: ""
		};
		//#endregion

		//#region selection capture
		function rawSelection() {
			const selection = window.getSelection();
			if (selection === null || selection.rangeCount === 0) return null;
			if (selection.isCollapsed === true) return null;
			const text = selection.toString();
			if (typeof text !== "string" || text.trim() === "") return null;
			const range = selection.getRangeAt(0);
			const node = range.commonAncestorContainer;
			return {
				text,
				node,
				range,
				rect: range.getBoundingClientRect()
			};
		}

		function isInside(node, selector) {
			const el = node === null || node === void 0 ? null : node.nodeType === 1 ? node : node.parentElement;
			if (el === null || el === void 0 || typeof el.closest !== "function") return false;
			return el.closest(selector) !== null;
		}

		const OWN_SELECTOR = "[" + MARK + "]";
		const COMPOSER_SELECTOR = "[data-composer-input]";

		let pending = null;

		function ownSnapshot(snapshot) {
			return snapshot === null || isInside(snapshot.node, OWN_SELECTOR) || isInside(snapshot.node, COMPOSER_SELECTOR);
		}
		//#endregion

		//#region citation block formatting
		function normalize(text) {
			return String(text).replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
		}

		function clip(text, max) {
			const chars = Array.from(text);
			if (chars.length <= max) return text;
			return chars.slice(0, max).join("") + "…";
		}

		function quoteLines(text) {
			return text.split("\n").map((line) => "> " + line.replace(/\s+$/, "")).join("\n");
		}

		/** Normalize a filesystem path for display: forward slashes, workspace-relative when possible. */
		function displayPath(path, cwd) {
			let out = String(path).trim().replace(/\\/g, "/");
			const base = String(cwd).trim().replace(/\\/g, "/").replace(/\/+$/, "");
			if (base !== "" && out.toLowerCase().startsWith(base.toLowerCase())) {
				out = out.slice(base.length).replace(/^\/+/, "");
			}
			return out;
		}

		function digitsLine(row) {
			if (row === null) return null;
			for (const span of row.querySelectorAll("span")) {
				const text = (span.textContent ?? "").trim();
				if (text !== "" && /^[0-9]+$/.test(text)) return Number(text);
			}
			return null;
		}

		/**
		 * Line numbers in the plain-text preview are page offsets; the container tells
		 * whether the rendered base is 0 or 1 by whether a line 0 exists.
		 */
		function previewLine(lineHost) {
			const container = lineHost.parentElement;
			let base = 1;
			if (container !== null) {
				const values = [...container.querySelectorAll("[data-textpreview-line]")].map((el) => Number(el.getAttribute("data-textpreview-line")));
				if (values.includes(0)) base = 0;
			}
			const raw = Number(lineHost.getAttribute("data-textpreview-line"));
			if (!Number.isFinite(raw)) return null;
			return raw + 1 - base;
		}

		function previewAnchor(node) {
			const el = node.nodeType === 1 ? node : node.parentElement;
			if (el === null || el === void 0 || typeof el.closest !== "function") return null;
			const lineHost = el.closest("[data-textpreview-line]");
			if (lineHost === null) return null;
			const body = lineHost.closest("[data-textpreview-body]");
			const scope = body === null ? document : body.parentElement ?? document;
			const pathEl = scope.querySelector("[data-textpreview-path]") ?? document.querySelector("[data-textpreview-path]");
			const path = pathEl === null ? "" : (pathEl.textContent ?? "").trim();
			if (path === "" || path.includes("…") || path.includes("...")) return null;
			return { path, line: previewLine(lineHost) };
		}

		function reviewAnchor(node) {
			const el = node.nodeType === 1 ? node : node.parentElement;
			if (el === null || el === void 0 || typeof el.closest !== "function") return null;
			const fileHost = el.closest("[data-review-file]");
			if (fileHost === null) return null;
			const path = (fileHost.getAttribute("data-review-file") ?? "").trim();
			if (path === "") return null;
			return { path, line: digitsLine(el.closest("[data-diff-line]")) };
		}

		function presentedAnchor(node) {
			const el = node.nodeType === 1 ? node : node.parentElement;
			if (el === null || el === void 0 || typeof el.closest !== "function") return null;
			const host = el.closest("[data-presented-file]");
			if (host === null) return null;
			const labelled = host.querySelector("[title]") ?? host.querySelector("[aria-label]");
			const path = labelled === null ? "" : (labelled.getAttribute("title") ?? labelled.getAttribute("aria-label") ?? "").trim();
			if (path === "") return null;
			return { path, line: null };
		}

		/** Workspace-file + line resolution, in decreasing confidence. */
		function resolveSource(node) {
			return previewAnchor(node) ?? reviewAnchor(node) ?? presentedAnchor(node);
		}

		const REGION_PROBES = [
			["[data-textpreview-body]", "region.preview"],
			["[data-document-preview]", "region.preview"],
			["[data-review-view]", "region.review"],
			["[data-diff-code]", "region.review"],
			["[data-conversation-content]", "region.conversation"],
			["[data-conversation-region]", "region.conversation"],
			["[data-chat-flow]", "region.conversation"],
			["[data-chat-turn]", "region.conversation"],
			[COMPOSER_SELECTOR, "region.composer"]
		];

		function describePlace(node) {
			const el = node.nodeType === 1 ? node : node.parentElement;
			if (el !== null && el !== void 0 && typeof el.closest === "function") {
				for (const [selector, key] of REGION_PROBES) {
					if (el.closest(selector) !== null) return t(key);
				}
			}
			const tag = el === null || el === void 0 ? "?" : String(el.tagName ?? "?").toLowerCase();
			return t("region.page", { tag });
		}

		function sourceLine(node) {
			const source = resolveSource(node);
			if (source === null) return t("source.page", { place: describePlace(node) });
			const path = displayPath(source.path, live.cwd);
			if (source.line === null) return t("source.fileNoLine", { path });
			return t("source.file", { path, line: source.line });
		}

		function buildBlock(snapshot) {
			return quoteLines(clip(normalize(snapshot.text), MAX_SNAPSHOT)) + "\n" + sourceLine(snapshot.node);
		}
		//#endregion

		//#region draft write (never submits)
		function composerElement() {
			return document.querySelector(COMPOSER_SELECTOR);
		}

		/** Put the caret at the end of the composer without scrolling the page. */
		function focusComposer() {
			const el = composerElement();
			if (el === null) return;
			try {
				el.focus({ preventScroll: true });
			} catch {
				el.focus();
			}
			const selection = window.getSelection();
			if (selection === null) return;
			// The caret must land inside the last paragraph, not between root children,
			// or the editor adopts a selection outside any block.
			const last = el.lastElementChild ?? el;
			const range = document.createRange();
			range.selectNodeContents(last);
			range.collapse(false);
			selection.removeAllRanges();
			selection.addRange(range);
		}

		/**
		 * Append the block to the live draft.
		 * setDraft is used only when the current draft text is known, because it
		 * replaces the whole draft; otherwise the caret-anchored insert is used.
		 * @param block - the citation block, without trailing newlines.
		 * @returns whether the draft changed.
		 */
		function writeBlock(block) {
			const actions = live.actions;
			if (actions === null || actions === void 0) return false;
			const text = block + "\n";
			try {
				if (live.draftKnown === true && typeof actions.setDraft === "function") {
					const base = live.draft.trim() === "" ? "" : live.draft.replace(/\s+$/, "");
					const next = base === "" ? text : base + "\n\n" + text;
					actions.setDraft(next);
					live.draft = next;
					focusComposer();
					return true;
				}
				if (typeof actions.insertText === "function" && typeof actions.captureInsertion === "function") {
					const written = actions.insertText(text, actions.captureInsertion()) === true;
					if (written === true) focusComposer();
					return written;
				}
			} catch (error) {
				window.console?.error("[dsh-selask] draft write failed", error);
			}
			return false;
		}
		//#endregion

		//#region user feedback
		function toast(message) {
			if (document.body === null) return;
			const el = document.createElement("div");
			el.setAttribute(MARK, "toast");
			el.textContent = message;
			Object.assign(el.style, {
				position: "fixed",
				left: "50%",
				bottom: "96px",
				transform: "translateX(-50%)",
				zIndex: "2147483000",
				padding: "6px 12px",
				borderRadius: "8px",
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-layer-3)",
				color: "var(--dsw-alias-label-primary)",
				fontFamily: "inherit",
				fontSize: "12px",
				lineHeight: "18px",
				pointerEvents: "none",
				boxShadow: "var(--dsw-elevation-soft)"
			});
			document.body.appendChild(el);
			window.setTimeout(() => el.remove(), 2400);
		}
		//#endregion

		//#region the add-to-conversation action
		/**
		 * Write one selection's citation block into the current draft. Never sends anything.
		 * @param snapshotArg - the captured selection; the live (or last) selection when omitted.
		 * @returns whether the draft changed.
		 */
		function quoteSelection(snapshotArg) {
			const snapshot = snapshotArg ?? rawSelection() ?? pending;
			pending = null;
			if (snapshot === null || snapshot.text.trim() === "") {
				toast(t("toast.empty"));
				return false;
			}
			if (live.actions === null) {
				toast(t("toast.noSession"));
				return false;
			}
			const written = writeBlock(buildBlock(snapshot));
			if (written === false) {
				toast(t("toast.failed"));
				return false;
			}
			toast(t("toast.written"));
			return true;
		}
		//#endregion

		//#region composer button (slot: conversation.input.right)
		const buttonStyle = {
			width: "28px",
			height: "28px",
			flex: "none",
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			border: "none",
			borderRadius: "8px",
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
			fontSize: "15px",
			lineHeight: "1",
			padding: "0"
		};

		function QuoteButton(props) {
			live.actions = props.inputActions ?? null;
			live.sessionId = typeof props.sessionId === "string" ? props.sessionId : null;
			// Hook presence is fixed by the host build, so these calls are stable.
			const draft = typeof props.useInput === "function" ? props.useInput((state) => state.draft) : void 0;
			live.draft = typeof draft === "string" ? draft : "";
			live.draftKnown = typeof draft === "string";
			if (typeof props.useSession === "function") {
				let cwd;
				try {
					cwd = props.useSession((state) => state?.cwd);
				} catch {
					cwd = void 0;
				}
				live.cwd = typeof cwd === "string" ? cwd : "";
			}
			const translate = typeof props.t === "function" ? props.t : t;
			return h("button", {
				type: "button",
				[MARK]: "composer-button",
				title: translate("button.title", { keys: hintKeys }),
				"aria-label": translate("button.title", { keys: hintKeys }),
				onMouseDown: (event) => event.preventDefault(),
				onClick: () => {
					quoteSelection();
				},
				style: buttonStyle
			}, "\u275D");
		}

		function registerComposerSlot(ctx) {
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				// The cell contract marks id as required on this list slot.
				id: COMPOSER_ENTRY_ID,
				order: 100,
				label: () => t("button.title", { keys: hintKeys }),
				locale: NS
			}, QuoteButton));
		}
		//#endregion

		//#region optional host services
		/** Resolve an optional service without adding it to the inject list. */
		function service(name) {
			try {
				const viaGet = runtime === null ? void 0 : runtime.get?.(name);
				if (viaGet !== void 0 && viaGet !== null) return viaGet;
			} catch {}
			try {
				return runtime?.[name];
			} catch {
				return void 0;
			}
		}

		/** The workspace that currently holds this session, when the list exposes it. */
		function workspaceIdOf(sessionId) {
			try {
				const items = service("workspaces")?.list?.getSnapshot?.()?.items;
				if (!Array.isArray(items) || typeof sessionId !== "string") return void 0;
				const item = items.find((entry) => Array.isArray(entry?.sessionIds) && entry.sessionIds.includes(sessionId));
				return typeof item?.workspaceId === "string" ? item.workspaceId : void 0;
			} catch {
				return void 0;
			}
		}

		function sessionKeyOf(source) {
			try {
				const key = source?.current?.getSnapshot?.()?.key;
				return typeof key === "string" ? key : void 0;
			} catch {
				return void 0;
			}
		}

		/** The on-screen session: the composer slot's own id first, the main binding second. */
		function currentSessionId() {
			if (typeof live.sessionId === "string") return live.sessionId;
			return sessionKeyOf(service("uiSession"));
		}

		/** Open the side chat tab itself (no session bound yet). */
		function openSideChatTab() {
			const controller = service("sidebarRight");
			try {
				const sessionId = currentSessionId();
				if (typeof controller?.openTabIn === "function" && typeof sessionId === "string") controller.openTabIn(sessionId, TAB_KIND, {});
				else if (typeof controller?.openTab === "function") controller.openTab(TAB_KIND, {});
			} catch (error) {
				window.console?.warn("[dsh-selask] sidebarRight.openTab failed", error);
			}
			try {
				service("layout")?.openRightbar?.(true, false);
			} catch {}
		}

		/** Point the side chat tab at one session's resource address (opens or reuses it). */
		function openSideChatSession(sessionId) {
			const controller = service("sidebarRight");
			const address = sideChatAddress(sessionId);
			try {
				if (typeof controller?.openResourceIn === "function") controller.openResourceIn(currentSessionId(), address, {});
				else if (typeof controller?.openResource === "function") controller.openResource(address, {});
				else openSideChatTab();
			} catch (error) {
				window.console?.warn("[dsh-selask] sidebarRight.openResource failed", error);
				openSideChatTab();
			}
			try {
				service("layout")?.openRightbar?.(true, false);
			} catch {}
		}

		function openSessionById(sessionId) {
			try {
				service("uiWorkspace")?.openSession?.(sessionId);
			} catch (error) {
				window.console?.warn("[dsh-selask] uiWorkspace.openSession failed", error);
			}
		}

		/**
		 * Create a Session WITHOUT touching the main area.
		 * connectBlank(workspaceId) with no reuse preset resolves to sessions.create({ workspaceId })
		 * and never calls replaceMain, so the main conversation keeps its selection.
		 * @returns the new session id.
		 */
		function createSideSession() {
			const workspaceId = workspaceIdOf(currentSessionId());
			const workspace = service("uiWorkspace");
			if (typeof workspaceId === "string" && typeof workspace?.connectBlank === "function") return workspace.connectBlank(workspaceId);
			const sessions = service("sessions");
			if (typeof sessions?.create === "function") return sessions.create(workspaceId === void 0 ? {} : { workspaceId });
			throw new Error("no session creation path");
		}

		/**
		 * Seed a new session's composer draft, retrying while the host still reports blocked
		 * (a freshly created session is often still adjudicating).
		 * @param sessionId - target session.
		 * @param prompt - draft text.
		 * @param onStep - report callback, called on every attempt with the latest state.
		 */
		function seedDraft(sessionId, prompt, onStep) {
			const state = { attempts: 0, outcome: "pending" };
			const step = () => {
				state.attempts += 1;
				const conversation = service("conversation");
				let binding;
				try {
					binding = service("sessions")?.binding?.(sessionId);
				} catch {
					binding = void 0;
				}
				if (binding === void 0 || typeof conversation?.input?.requestDraftInitialization !== "function") {
					if (state.attempts >= SEED_ATTEMPTS) {
						state.outcome = "unavailable";
						onStep({ ...state });
						return;
					}
					onStep({ ...state });
					window.setTimeout(step, SEED_INTERVAL);
					return;
				}
				let result;
				try {
					result = conversation.input.requestDraftInitialization(binding, { prompt });
				} catch (error) {
					window.console?.warn("[dsh-selask] draft initialization threw", error);
					result = "blocked";
				}
				state.outcome = typeof result === "string" ? result : "blocked";
				if (state.outcome !== "blocked" || state.attempts >= SEED_ATTEMPTS) {
					if (state.outcome === "preserved") window.console?.warn("[dsh-selask] draft initialization was preserved (the session already had a draft)");
					onStep({ ...state });
					return;
				}
				onStep({ ...state });
				window.setTimeout(step, SEED_INTERVAL);
			};
			step();
		}
		//#endregion
		//#region selection context menu (pure DOM, independent of the React tree)
		const menuStyle = {
			position: "fixed",
			zIndex: "2147482000",
			minWidth: "172px",
			padding: "4px",
			display: "none",
			flexDirection: "column",
			gap: "2px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "8px",
			background: "var(--dsw-alias-bg-layer-2)",
			color: "var(--dsw-alias-label-primary)",
			boxShadow: "var(--dsw-elevation-soft)",
			fontFamily: "inherit",
			fontSize: "12px",
			lineHeight: "18px"
		};

		const menuItemStyle = {
			appearance: "none",
			border: "none",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			textAlign: "left",
			padding: "6px 10px",
			borderRadius: "6px",
			cursor: "pointer",
			fontFamily: "inherit",
			fontSize: "12px",
			lineHeight: "18px",
			whiteSpace: "nowrap"
		};

		/** The live selection, only when its anchor still sits in a rendered, non-empty region. */
		function anchoredSelection() {
			const snapshot = rawSelection();
			if (snapshot === null || ownSnapshot(snapshot)) return null;
			const el = snapshot.node.nodeType === 1 ? snapshot.node : snapshot.node.parentElement;
			if (el === null || el === void 0 || el.isConnected === false) return null;
			if (snapshot.rect.width === 0 && snapshot.rect.height === 0) return null;
			return snapshot;
		}
		function installContextMenu() {
			if (document.body === null || typeof document.addEventListener !== "function") return () => {};
			const menu = document.createElement("div");
			menu.setAttribute(MARK, "menu");
			menu.setAttribute("role", "menu");
			Object.assign(menu.style, menuStyle);
			let captured = null;
			let opened = false;

			const hide = () => {
				captured = null;
				opened = false;
				menu.style.display = "none";
			};

			const close = (run) => (event) => {
				event.preventDefault();
				event.stopPropagation();
				const snapshot = captured;
				hide();
				if (snapshot !== null) run(snapshot);
			};

			const item = (label, run) => {
				const button = document.createElement("button");
				button.type = "button";
				button.setAttribute(MARK, "menu-item");
				button.setAttribute("role", "menuitem");
				button.textContent = label;
				Object.assign(button.style, menuItemStyle);
				button.addEventListener("mousedown", (event) => event.preventDefault());
				button.addEventListener("click", close(run));
				return button;
			};

			const render = () => {
				menu.textContent = "";
				menu.appendChild(item(t("menu.addToConversation"), (snapshot) => quoteSelection(snapshot)));
				menu.appendChild(item(t("menu.askInSideChat"), (snapshot) => askInSideChat(snapshot)));
			};

			const place = (event) => {
				menu.style.display = "flex";
				const width = menu.offsetWidth || 180;
				const height = menu.offsetHeight || 80;
				menu.style.left = Math.max(4, Math.min(event.clientX, window.innerWidth - width - 4)) + "px";
				menu.style.top = Math.max(4, Math.min(event.clientY, window.innerHeight - height - 4)) + "px";
			};

			const onSelectionChange = () => {
				const snapshot = rawSelection();
				pending = snapshot === null || ownSnapshot(snapshot) ? null : snapshot;
			};

			const onContextMenu = (event) => {
				if (isInside(event.target ?? null, OWN_SELECTOR)) return;
				const snapshot = anchoredSelection();
				if (snapshot === null) return;
				event.preventDefault();
				captured = snapshot;
				opened = true;
				render();
				place(event);
			};

			const onPointerDown = (event) => {
				if (opened === false) return;
				if (isInside(event.target ?? null, OWN_SELECTOR)) return;
				hide();
			};

			const onKeyDown = (event) => {
				if (opened === true && event.key === "Escape") hide();
			};

			const onViewportChange = () => {
				if (opened === true) hide();
			};

			document.addEventListener("selectionchange", onSelectionChange, true);
			document.addEventListener("contextmenu", onContextMenu, true);
			document.addEventListener("pointerdown", onPointerDown, true);
			document.addEventListener("keydown", onKeyDown, true);
			window.addEventListener("scroll", onViewportChange, true);
			window.addEventListener("resize", onViewportChange, true);
			document.body.appendChild(menu);

			return () => {
				document.removeEventListener("selectionchange", onSelectionChange, true);
				document.removeEventListener("contextmenu", onContextMenu, true);
				document.removeEventListener("pointerdown", onPointerDown, true);
				document.removeEventListener("keydown", onKeyDown, true);
				window.removeEventListener("scroll", onViewportChange, true);
				window.removeEventListener("resize", onViewportChange, true);
				menu.remove();
			};
		}
		//#endregion

		//#region global shortcut
		function registerShortcut(ctx) {
			ctx.effect(() => ctx.shortcuts.register({
				id: COMMAND_ID,
				label: () => t("command.label"),
				aliases: ["quote selection", "citation", "quote into draft", "引用选区"],
				defaults: {
					"web:windows": WEB_BINDING,
					"web:macos": WEB_BINDING,
					"desktop:windows": DESKTOP_BINDING,
					"desktop:macos": DESKTOP_BINDING
				},
				regions: ["page", "editable", "terminal"],
				modals: [],
				resolve: () => ({
					status: "handled",
					run: () => {
						quoteSelection();
					}
				})
			}), "dsh-selask: quote-selection shortcut");
		}
		//#endregion

		//#region right sidebar side chat (embedded conversation)
		const tabRootStyle = {
			display: "flex",
			flexDirection: "column",
			width: "100%",
			height: "100%",
			minHeight: "0",
			overflow: "hidden",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "inherit",
			fontSize: "12px",
			lineHeight: "18px"
		};
		const composeStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "10px",
			padding: "12px",
			overflow: "auto",
			height: "100%",
			boxSizing: "border-box",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "inherit",
			fontSize: "12px",
			lineHeight: "18px"
		};
		const labelStyle = { fontSize: "11px", lineHeight: "16px", color: "var(--dsw-alias-label-secondary)", letterSpacing: "0.02em", fontFamily: "inherit" };
		const preStyle = {
			margin: "0",
			maxHeight: "168px",
			overflow: "auto",
			padding: "8px",
			borderRadius: "8px",
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-layer-2)",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "var(--dsw-font-markdown-code-font-family)",
			fontSize: "12px",
			lineHeight: "1.55",
			whiteSpace: "pre-wrap",
			wordBreak: "break-word"
		};
		const areaStyle = {
			width: "100%",
			boxSizing: "border-box",
			minHeight: "120px",
			padding: "8px",
			borderRadius: "8px",
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "inherit",
			fontSize: "12px",
			lineHeight: "1.6",
			resize: "vertical"
		};
		const sideButtonStyle = {
			padding: "5px 14px",
			borderRadius: "8px",
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-layer-3)",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "inherit",
			fontSize: "12px",
			lineHeight: "18px",
			cursor: "pointer"
		};
		const hintStyle = { fontSize: "11px", lineHeight: "16px", color: "var(--dsw-alias-label-secondary)", fontFamily: "inherit" };

		/** Resource protocol that binds this tab to one Session. */
		const CHAT_PROTOCOL = "selaskchat";
		const CHAT_ADDRESS = "dsh-resource://selaskchat/session/";
		/** Child slot rendered inside the retained session scope. */
		const EMBED_SLOT = "selask.chat.conversation";

		function sideChatAddress(sessionId) {
			return CHAT_ADDRESS + encodeURIComponent(sessionId);
		}

		/** @returns the session id carried by one side-chat address, or undefined. */
		function parseSideChatAddress(value) {
			let url;
			try {
				url = new URL(value);
			} catch {
				return void 0;
			}
			if (url.protocol !== "dsh-resource:" || url.hostname.toLowerCase() !== CHAT_PROTOCOL) return void 0;
			const parts = url.pathname.split("/").filter(Boolean);
			if (parts.length !== 2 || parts[0] !== "session") return void 0;
			try {
				return decodeURIComponent(parts[1]);
			} catch {
				return void 0;
			}
		}

		function waitForAbort(signal) {
			if (signal.aborted) return Promise.resolve();
			return new Promise((resolve) => {
				signal.addEventListener("abort", () => resolve(), { once: true });
			});
		}

		/** Retain one Session for as long as the tab holds its resource, and release it after. */
		function sideChatResourceProvider(sessions) {
			return {
				protocol: CHAT_PROTOCOL,
				async *open(address, { signal }) {
					const sessionId = parseSideChatAddress(address);
					if (sessionId === void 0) throw new Error("dsh-selask: invalid side-chat resource address " + address);
					if (signal.aborted) return;
					const reference = sessions.retain(sessionId, { source: "selaskChat", signal });
					try {
						yield { ok: true, value: { sessionId, reference } };
						await waitForAbort(signal);
					} finally {
						reference.release();
					}
				}
			};
		}

		/**
		 * The Conversation body of one embedded Session. The host's own
		 * conversation.content factory in its embedded variant renders history and
		 * the composer, so sending stays the host's own submit path.
		 */
		function EmbeddedConversation(props) {
			const translate = typeof props.t === "function" ? props.t : t;
			if (typeof props.renderFactorySlot !== "function") {
				return h("div", { [MARK]: "embed-unavailable", style: hintStyle }, translate("tab.embedUnavailable"));
			}
			const session = typeof props.useSession === "function" ? props.useSession((value) => value) : null;
			const conversation = typeof props.useConversation === "function" ? props.useConversation((value) => value) : null;
			const summaryBlank = typeof props.useSessions === "function" ? props.useSessions((state) => state?.byId?.[props.sessionId]?.blank) : void 0;
			const engaging = conversation?.activeTargets?.size > 0 || (session !== null && session.blank === false) || session?.running === true;
			const phase = engaging ? "active" : session?.promptAttempted === true ? "engaging" : "blank";
			const hero = phase === "blank" && (session?.openState === "open" || summaryBlank === true);
			return props.renderFactorySlot("conversation.content", { variant: "embedded", phase, hero }, {});
		}

		/**
		 * The side chat tab: when a resource address is bound it renders the embedded
		 * conversation, otherwise the compose panel that creates the session.
		 */
		function SideChatTab(props) {
			const translate = typeof props.t === "function" ? props.t : t;
			const tabInfo = typeof props.useTabInfo === "function" ? props.useTabInfo() : null;
			const contentId = tabInfo?.tab?.contentId;
			const resource = typeof props.useResource === "function" && typeof contentId === "string" ? props.useResource(contentId) : null;
			const reference = resource?.value?.reference;
			const payload = useStoreValue(sideChat);
			const [text, setText] = react.useState(payload === null ? "" : payload.prompt);
			const [flow, setFlow] = react.useState(null);
			react.useEffect(() => {
				setText(payload === null ? "" : payload.prompt);
			}, [payload === null ? "" : payload.prompt]);
			if (reference !== void 0 && reference !== null && typeof props.SessionProvider === "function" && typeof props.renderSlot === "function") {
				return h("div", { [MARK]: "side-chat", "data-selask-embed": "session", style: tabRootStyle },
					h(props.SessionProvider, { session: reference }, props.renderSlot(EMBED_SLOT, {})));
			}
			if (payload === null) {
				return h("div", { [MARK]: "side-chat", style: composeStyle }, h("div", { style: hintStyle }, translate("tab.empty")));
			}
			const submit = () => {
				if (text.trim() === "") return;
				setFlow({ kind: "creating" });
				createSideSession().then((sessionId) => {
					if (typeof sessionId !== "string" || sessionId === "") throw new Error("no session id");
					setFlow({ kind: "seeding", sessionId, attempts: 0, outcome: "pending" });
					seedDraft(sessionId, text, (state) => setFlow({ kind: "seed", sessionId, ...state }));
					openSideChatSession(sessionId);
					toast(t("toast.sideSent"));
				}).catch((error) => {
					window.console?.warn("[dsh-selask] side chat session creation failed", error);
					setFlow({ kind: "createFailed" });
					writeBlock(text);
					toast(t("toast.sideFallback"));
				});
			};
			return h("div", { [MARK]: "side-chat", style: composeStyle },
				h("div", { style: labelStyle }, translate("tab.snapshot")),
				h("pre", { [MARK]: "snapshot", style: preStyle }, payload.block),
				h("div", { style: labelStyle }, translate("tab.placeholder")),
				h("textarea", {
					[MARK]: "question",
					style: areaStyle,
					value: text,
					spellCheck: false,
					onChange: (event) => setText(event.target.value),
					onKeyDown: (event) => {
						if (event.key !== "Enter") return;
						if (event.ctrlKey !== true && event.metaKey !== true) return;
						event.preventDefault();
						submit();
					}
				}),
				h("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
					h("button", { type: "button", [MARK]: "submit", style: sideButtonStyle, onClick: submit }, translate("tab.submit")),
					h("span", { style: hintStyle }, translate("tab.submitHint", { keys: "Ctrl+Enter" }))),
				statusLine(flow, translate, flow?.sessionId, openSessionById));
		}

		/** One status line per flow state; nothing claims success before the draft is really in. */
		function statusLine(flow, translate, sessionId, openInMain) {
			if (flow === null) return null;
			if (flow.kind === "creating") return h("div", { [MARK]: "status", style: hintStyle }, translate("tab.creating"));
			if (flow.kind === "createFailed") return h("div", { [MARK]: "status", style: hintStyle }, translate("tab.createFailed"));
			if (flow.kind === "seeding") return h("div", { [MARK]: "status", style: hintStyle }, translate("tab.seeding"));
			const outcome = flow.outcome === "applied" ? "tab.seedApplied" : flow.outcome === "preserved" ? "tab.seedPreserved" : flow.outcome === "blocked" ? "tab.seedBlocked" : "tab.seedUnavailable";
			return h("div", { [MARK]: "status", style: hintStyle },
				h("div", null, translate(outcome, { count: flow.attempts })),
				typeof sessionId === "string" && flow.outcome !== "applied"
					? h("button", {
						type: "button",
						[MARK]: "open-in-main",
						style: { ...sideButtonStyle, marginTop: "6px" },
						onClick: () => openInMain(sessionId)
					}, translate("tab.openInMain"))
					: null);
		}

		/** Publish one selection and open the side chat tab (no session bound yet). */
		function askInSideChat(snapshot) {
			const block = buildBlock(snapshot);
			sideChat.set({ block, prompt: block + "\n\n", at: Date.now(), createdId: void 0 });
			openSideChatTab();
		}


		function registerSideChatResources(ctx) {
			ctx.effect(() => {
				const resources = service("resources");
				if (typeof resources?.register !== "function") return () => {};
				return resources.register(sideChatResourceProvider(service("sessions")));
			}, "dsh-selask: side chat resources");
		}

		function registerTab(ctx) {
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: TAB_ID,
				kind: TAB_KIND,
				patterns: [CHAT_ADDRESS + "**"],
				priority: "builtin",
				canOpen: (address) => parseSideChatAddress(address) !== void 0,
				title: () => t("tab.title")
			}), "dsh-selask: side chat tab type");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: TAB_ID,
				locale: NS,
				children: { [EMBED_SLOT]: { kind: "single", scope: "session" } }
			}, SideChatTab)), "dsh-selask: side chat tab body");
			ctx.effect(() => ctx.slots.inject(EMBED_SLOT, () => ctx.slots.register({
				name: EMBED_SLOT,
				locale: NS
			}, EmbeddedConversation)), "dsh-selask: embedded conversation");
		}
		//#endregion

		const inject = ["slots", "locale", "shortcuts", "sidebarRightTabs"];

		/** Run one registration so a failure drops that feature only. */
		function guard(label, run) {
			try {
				run();
			} catch (error) {
				window.console?.error("[dsh-selask] " + label + " failed", error);
			}
		}

		function apply(ctx) {
			runtime = ctx;
			guard("dictionaries", () => {
				ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-selask: dictionaries");
				t = ctx.locale.bind(NS);
			});
			// The context menu is the primary entry: install it before anything that can throw.
			guard("selection context menu", () => {
				ctx.effect(() => installContextMenu(), "dsh-selask: selection context menu");
			});
			guard("shortcut", () => {
				try {
					const described = ctx.shortcuts.describeBinding(WEB_BINDING);
					const keys = described?.keys;
					if (typeof keys === "string" && keys !== "") hintKeys = keys;
					else if (Array.isArray(keys) && keys.length > 0) hintKeys = keys.join("+");
				} catch {}
				registerShortcut(ctx);
			});
			guard("side chat resources", () => registerSideChatResources(ctx));
			guard("side chat tab", () => registerTab(ctx));
			guard("composer button", () => registerComposerSlot(ctx));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
