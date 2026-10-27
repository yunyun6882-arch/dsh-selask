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
			"tab.title": "Side chat",
			"tab.empty": "No quote yet. Select text, then right-click and pick Ask in side chat.",
			"tab.snapshot": "This quote",
			"tab.placeholder": "Add your question under the quote…",
			"tab.submit": "Ask",
			"tab.submitHint": "{keys} to submit",
			"tab.sent": "Prepared in a new conversation: finish the question and press Enter.",
			"tab.switch": "Open that conversation",
			"tab.failed": "Starting a conversation failed; the text went into this draft.",
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

		/** Watch the main conversation until its binding reports a session other than "previous". */
		function watchNewSession(previous, onFound) {
			let ticks = 0;
			const tick = () => {
				ticks += 1;
				const key = sessionKeyOf(service("uiSession"));
				if (typeof key === "string" && key !== previous) {
					onFound(key);
					return;
				}
				if (ticks >= 40) return;
				window.setTimeout(tick, 100);
			};
			window.setTimeout(tick, 100);
		}
		/**
		 * Prefill a NEW conversation's draft (never sends) and report how it went.
		 * startSession only runs requestDraftInitialization, so the send stays with the human.
		 * @param text - the quote plus the user's question.
		 * @returns "sent" when a new conversation was prepared, otherwise "fallback".
		 */
		function askInNewConversation(text) {
			const workspace = service("uiWorkspace");
			if (typeof workspace?.startSession === "function") {
				try {
					const previous = currentSessionId();
					workspace.startSession(workspaceIdOf(currentSessionId()), { prompt: text });
					watchNewSession(previous, (sessionId) => {
						sideChat.set({ ...(sideChat.get() ?? {}), createdId: sessionId });
					});
					return "sent";
				} catch (error) {
					window.console?.warn("[dsh-selask] uiWorkspace.startSession failed", error);
				}
			}
			writeBlock(text);
			toast(t("toast.sideFallback"));
			return "fallback";
		}

		function openSessionById(sessionId) {
			try {
				service("uiWorkspace")?.openSession?.(sessionId);
			} catch (error) {
				window.console?.warn("[dsh-selask] uiWorkspace.openSession failed", error);
			}
		}

		/** Publish one selection and open (or reuse) the right-sidebar side chat tab. */
		function askInSideChat(snapshot) {
			const block = buildBlock(snapshot);
			sideChat.set({ block, prompt: block + "\n\n", at: Date.now() });
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

		//#region right sidebar side chat
		const tabStyle = {
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
			minHeight: "136px",
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

		/**
		 * The right-sidebar side chat: this quote on top, an editable question below.
		 * Submitting prefills a NEW conversation's draft through uiWorkspace.startSession
		 * (draft only, never sent); when that path is unavailable it writes the current
		 * session's draft instead.
		 */
		function SideChatTab(props) {
			const payload = useStoreValue(sideChat);
			const translate = typeof props.t === "function" ? props.t : t;
			const areaRef = react.useRef(null);
			const [status, setStatus] = react.useState("idle");
			const promptText = payload === null ? "" : payload.prompt;
			const [text, setText] = react.useState(promptText);
			react.useEffect(() => {
				setText(promptText);
				const area = areaRef.current;
				if (area === null || area === void 0) return;
				area.focus();
				try {
					area.setSelectionRange(area.value.length, area.value.length);
				} catch {}
			}, [promptText]);
			if (payload === null) {
				return h("div", { [MARK]: "side-chat", style: tabStyle }, h("div", { style: hintStyle }, translate("tab.empty")));
			}
			const createdId = typeof payload.createdId === "string" ? payload.createdId : null;
			const submit = () => {
				if (text.trim() === "") return;
				setStatus(askInNewConversation(text));
			};
			return h("div", { [MARK]: "side-chat", style: tabStyle },
				h("div", { style: labelStyle }, translate("tab.snapshot")),
				h("pre", { [MARK]: "snapshot", style: preStyle }, payload.block),
				h("div", { style: labelStyle }, translate("tab.placeholder")),
				h("textarea", {
					[MARK]: "question",
					ref: areaRef,
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
				status === "sent"
					? h("div", { [MARK]: "status", style: hintStyle },
						h("div", null, translate("tab.sent")),
						createdId === null ? null : h("button", {
							type: "button",
							[MARK]: "switch",
							style: { ...sideButtonStyle, marginTop: "6px" },
							onClick: () => openSessionById(createdId)
						}, translate("tab.switch")))
					: status === "fallback"
						? h("div", { [MARK]: "status", style: hintStyle }, translate("tab.failed"))
						: null);
		}

		function registerTab(ctx) {
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: TAB_ID,
				kind: TAB_KIND,
				priority: "builtin",
				title: () => t("tab.title")
			}), "dsh-selask: side chat tab type");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: TAB_ID,
				locale: NS
			}, SideChatTab)), "dsh-selask: side chat tab body");
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
			guard("side chat tab", () => registerTab(ctx));
			guard("composer button", () => registerComposerSlot(ctx));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
