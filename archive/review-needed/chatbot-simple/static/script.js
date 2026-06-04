document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEY = "gemini-chat-workspace-state-v2";
    const LEGACY_STORAGE_KEY = "chatbot-simple-conversations";
    const DEFAULT_PROVIDER = "gemini";
    const DEFAULT_MODEL = "gemini-2.5-flash";
    const MAX_ATTACHMENTS = 4;
    const MAX_ATTACHMENT_BYTES = 1024 * 1024;
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
    const TEXT_EXTENSIONS = new Set([
        "txt",
        "md",
        "csv",
        "json",
        "py",
        "js",
        "ts",
        "tsx",
        "jsx",
        "html",
        "css",
        "xml",
        "yaml",
        "yml",
        "log",
    ]);
    const SUGGESTIONS = [
        "Compare two models on a strategy question.",
        "Summarize attached research notes.",
        "Create a structured workspace brief.",
    ];

    const els = {
        html: document.documentElement,
        metaTheme: document.querySelector('meta[name="theme-color"]'),
        sidebar: document.querySelector(".sidebar"),
        conversationList: document.querySelector(".conversation-list"),
        newChatButton: document.querySelector(".new-chat-button"),
        clearAllButton: document.querySelector(".clear-all-button"),
        searchToggleButton: document.querySelector(".search-toggle-button"),
        searchInput: document.querySelector(".conversation-search-input"),
        settingsButton: document.querySelector(".settings-button"),
        renameChatButton: document.querySelector(".rename-chat-button"),
        themeToggleButton: document.querySelector(".theme-toggle-button"),
        modelSelect: document.querySelector(".model-select"),
        settingsModelSelect: document.querySelector(".settings-model-select"),
        autoScrollToggle: document.querySelector(".auto-scroll-toggle"),
        activeTitle: document.querySelector(".active-title"),
        systemNotice: document.querySelector(".system-notice"),
        messageForm: document.querySelector(".composer"),
        messageInput: document.querySelector(".message-input"),
        sendButton: document.querySelector(".send-button"),
        stopButton: document.querySelector(".stop-button"),
        attachButton: document.querySelector(".attach-button"),
        imageButton: document.querySelector(".image-button"),
        fileInput: document.querySelector(".file-input"),
        imageInput: document.querySelector(".image-input"),
        attachmentTray: document.querySelector(".attachment-tray"),
        chatThread: document.querySelector(".chat-thread"),
        messagesViewport: document.querySelector(".messages"),
        mobileMenuButton: document.querySelector(".mobile-menu-button"),
        sidebarCloseButton: document.querySelector(".sidebar-close-button"),
        sidebarScrim: document.querySelector(".sidebar-scrim"),
        settingsDialog: document.querySelector(".settings-dialog"),
        settingsCloseButton: document.querySelector(".dialog-close-button"),
        renameDialog: document.querySelector(".rename-dialog"),
        renameCloseButton: document.querySelector(".rename-close-button"),
        renameCancelButton: document.querySelector(".rename-cancel-button"),
        renameForm: document.querySelector(".rename-form"),
        renameInput: document.querySelector(".rename-input"),
        confirmDialog: document.querySelector(".confirm-dialog"),
        confirmTitle: document.querySelector("#confirmTitle"),
        confirmMessage: document.querySelector(".confirm-message"),
        confirmCloseButton: document.querySelector(".confirm-close-button"),
        confirmCancelButton: document.querySelector(".confirm-cancel-button"),
        confirmAcceptButton: document.querySelector(".confirm-accept-button"),
        clearHistoryButton: document.querySelector(".clear-history-button"),
        toastRegion: document.querySelector(".toast-region"),
    };

    if (!els.messageForm || !els.chatThread || !els.conversationList) {
        return;
    }

    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const mobileSidebarQuery = window.matchMedia("(max-width: 840px)");

    let state = loadState();
    let availableProviders = [];
    let availableModels = [];
    let searchTerm = "";
    let isSearchOpen = false;
    let pendingAttachments = [];
    let isSending = false;
    let isProcessingAttachment = false;
    let abortController = null;
    let currentAssistantId = null;
    let copiedMessageId = null;
    let openMenuId = null;
    let renameTargetId = null;
    let confirmCallback = null;
    let noticeText = "";
    let renderQueued = false;

    function renderIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function createId(prefix) {
        if (window.crypto?.randomUUID) {
            return `${prefix}-${window.crypto.randomUUID()}`;
        }

        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function createMessage(role, text, extra = {}) {
        const now = Date.now();

        return {
            id: createId("msg"),
            role,
            text,
            createdAt: now,
            provider: null,
            model: null,
            attachments: [],
            feedback: null,
            isError: false,
            isLoading: false,
            isStopped: false,
            ...extra,
        };
    }

    function createConversation(title = "New chat", messages = []) {
        const now = Date.now();

        return {
            id: createId("conv"),
            title,
            messages,
            createdAt: now,
            updatedAt: now,
        };
    }

    function createFreshState() {
        const conversation = createConversation();

        return {
            version: 2,
            activeConversationId: conversation.id,
            conversations: [conversation],
            selectedProvider: DEFAULT_PROVIDER,
            selectedModel: DEFAULT_MODEL,
            theme: "dark",
            settings: {
                autoScroll: true,
            },
        };
    }

    function normalizeMessage(message) {
        return {
            ...createMessage(message?.role === "user" ? "user" : "ai", String(message?.text || "")),
            id: message?.id || createId("msg"),
            role: message?.role === "user" ? "user" : "ai",
            text: String(message?.text || ""),
            createdAt: Number(message?.createdAt) || Date.now(),
            provider: message?.provider || DEFAULT_PROVIDER,
            model: message?.model || null,
            attachments: Array.isArray(message?.attachments) ? message.attachments : [],
            feedback: message?.feedback || null,
            isError: Boolean(message?.isError),
            isLoading: false,
            isStopped: Boolean(message?.isStopped),
        };
    }

    function normalizeConversation(conversation) {
        const messages = Array.isArray(conversation?.messages)
            ? conversation.messages.map(normalizeMessage)
            : [];
        const updatedAt = Number(conversation?.updatedAt) ||
            messages.at(-1)?.createdAt ||
            Date.now();

        return {
            id: conversation?.id || createId("conv"),
            title: String(conversation?.title || "New chat").trim() || "New chat",
            messages,
            createdAt: Number(conversation?.createdAt) || updatedAt,
            updatedAt,
        };
    }

    function normalizeState(saved) {
        const conversations = Array.isArray(saved?.conversations)
            ? saved.conversations.map(normalizeConversation)
            : [];
        const next = {
            ...createFreshState(),
            ...saved,
            conversations,
            selectedProvider: String(saved?.selectedProvider || DEFAULT_PROVIDER),
            selectedModel: String(saved?.selectedModel || DEFAULT_MODEL),
            theme: ["system", "light", "dark"].includes(saved?.theme) ? saved.theme : "dark",
            settings: {
                autoScroll: saved?.settings?.autoScroll !== false,
            },
        };

        if (next.conversations.length === 0) {
            const conversation = createConversation();
            next.conversations = [conversation];
            next.activeConversationId = conversation.id;
        }

        if (!next.conversations.some((conversation) => conversation.id === next.activeConversationId)) {
            next.activeConversationId = next.conversations[0].id;
        }

        return next;
    }

    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

            if (saved?.conversations) {
                return normalizeState(saved);
            }
        } catch (error) {
            console.warn("Could not load workspace state:", error);
        }

        try {
            const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));

            if (legacy?.conversations) {
                return normalizeState(legacy);
            }
        } catch (error) {
            console.warn("Could not load legacy conversations:", error);
        }

        return createFreshState();
    }

    function saveState() {
        const cleanState = {
            ...state,
            conversations: state.conversations.map((conversation) => ({
                ...conversation,
                messages: conversation.messages.map((message) => ({
                    ...message,
                    isLoading: false,
                })),
            })),
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
    }

    function getActiveConversation() {
        let conversation = state.conversations.find((item) => item.id === state.activeConversationId);

        if (!conversation) {
            conversation = ensureConversation();
        }

        return conversation;
    }

    function ensureConversation() {
        if (state.conversations.length === 0) {
            const conversation = createConversation();
            state.conversations.unshift(conversation);
            state.activeConversationId = conversation.id;
            return conversation;
        }

        state.activeConversationId = state.conversations[0].id;
        return state.conversations[0];
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeAttribute(text) {
        return escapeHtml(text).replace(/"/g, "&quot;");
    }

    function formatDate(timestamp) {
        const value = Number(timestamp);

        if (!value) {
            return "No activity";
        }

        const diff = Date.now() - value;
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;

        if (diff < minute) {
            return "now";
        }

        if (diff < hour) {
            return `${Math.floor(diff / minute)} min ago`;
        }

        if (diff < day) {
            return `${Math.floor(diff / hour)} hr ago`;
        }

        return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
        }).format(new Date(value));
    }

    function formatBytes(bytes) {
        if (bytes < 1024) {
            return `${bytes} B`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function getTitleFromMessage(text, attachments = []) {
        const cleaned = text.trim();

        if (!cleaned && attachments.length > 0) {
            return attachments.length === 1 ? attachments[0].name : `${attachments.length} attached files`;
        }

        if (cleaned.length <= 44) {
            return cleaned || "New chat";
        }

        return `${cleaned.slice(0, 44).trim()}...`;
    }

    function isNearBottom() {
        if (!els.messagesViewport) {
            return true;
        }

        const distance = els.messagesViewport.scrollHeight -
            els.messagesViewport.scrollTop -
            els.messagesViewport.clientHeight;

        return distance < 180;
    }

    function scrollMessagesToBottom() {
        if (els.messagesViewport) {
            els.messagesViewport.scrollTop = els.messagesViewport.scrollHeight;
        }
    }

    function getResolvedTheme() {
        if (state.theme === "system") {
            return "dark";
        }

        return state.theme;
    }

    function applyTheme() {
        const resolvedTheme = getResolvedTheme();
        els.html.dataset.theme = resolvedTheme;
        els.html.dataset.themeChoice = state.theme;

        if (els.metaTheme) {
            els.metaTheme.setAttribute("content", "#020103");
        }
    }

    function setSidebarOpen(isOpen) {
        document.body.classList.toggle("sidebar-open", isOpen);
        els.mobileMenuButton?.setAttribute("aria-expanded", String(isOpen));
    }

    function showNotice(message) {
        noticeText = message || "";
        renderSystemNotice();
    }

    function renderSystemNotice() {
        if (!els.systemNotice) {
            return;
        }

        els.systemNotice.textContent = noticeText;
        els.systemNotice.hidden = !noticeText;
    }

    function showToast(message, type = "info") {
        if (!els.toastRegion) {
            return;
        }

        const toast = document.createElement("div");
        toast.className = `toast ${type === "error" ? "error" : ""}`;
        toast.innerHTML = `
            <i data-lucide="${type === "error" ? "circle-alert" : "check"}"></i>
            <span>${escapeHtml(message)}</span>
        `;
        els.toastRegion.appendChild(toast);
        renderIcons();

        window.setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(8px)";
            window.setTimeout(() => toast.remove(), 220);
        }, 2600);
    }

    function renderSidebar() {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const conversations = [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
        const visibleConversations = conversations.filter((conversation) =>
            conversation.title.toLowerCase().includes(normalizedSearch)
        );

        els.sidebar?.classList.toggle("search-open", isSearchOpen);
        els.searchToggleButton?.setAttribute("aria-expanded", String(isSearchOpen));

        if (visibleConversations.length === 0) {
            els.conversationList.innerHTML = normalizedSearch
                ? `<div class="empty-search"><strong>No matching chats</strong><span class="empty-caption">Try another search term.</span></div>`
                : `<div class="empty-history"><strong>No chats yet</strong><span class="empty-caption">Start a new conversation to build history.</span></div>`;
            return;
        }

        els.conversationList.innerHTML = visibleConversations
            .map((conversation) => {
                const isActive = conversation.id === state.activeConversationId;
                const activeClass = isActive ? " active" : "";

                return `
                    <div class="conversation-item${activeClass}" data-conversation-id="${escapeAttribute(conversation.id)}">
                        <button class="conversation-main" type="button" data-action="open-conversation" data-conversation-id="${escapeAttribute(conversation.id)}" aria-current="${isActive ? "true" : "false"}">
                            <i data-lucide="message-square"></i>
                            <span class="conversation-copy">
                                <span class="conversation-name">${escapeHtml(conversation.title)}</span>
                                <span class="conversation-date">${formatDate(conversation.updatedAt)}</span>
                            </span>
                        </button>
                        <span class="conversation-actions">
                            <button type="button" data-action="rename-conversation" data-conversation-id="${escapeAttribute(conversation.id)}" aria-label="Rename ${escapeAttribute(conversation.title)}">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button type="button" data-action="delete-conversation" data-conversation-id="${escapeAttribute(conversation.id)}" aria-label="Delete ${escapeAttribute(conversation.title)}">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </span>
                    </div>
                `;
            })
            .join("");
    }

    function renderTopbar() {
        const conversation = getActiveConversation();
        const title = conversation.title || "New chat";
        els.activeTitle.textContent = title;
        document.title = `${title} | Nexa AI`;
    }

    function getProviderOptions() {
        if (availableProviders.length > 0) {
            return availableProviders;
        }

        return [{
            id: DEFAULT_PROVIDER,
            label: "Gemini",
            models: [DEFAULT_MODEL],
            default_model: DEFAULT_MODEL,
            configured: true,
            supports_images: true,
        }];
    }

    function getProviderConfig(providerId = state.selectedProvider) {
        return getProviderOptions().find((provider) => provider.id === providerId) ||
            getProviderOptions()[0];
    }

    function getProviderLabel(providerId) {
        return getProviderConfig(providerId)?.label || providerId || "AI";
    }

    function currentModelSupportsImages() {
        const provider = getProviderConfig();
        return provider?.supports_images === true || provider?.supportsImages === true;
    }

    function hasPendingImageAttachment() {
        return pendingAttachments.some((attachment) => attachment.kind === "image");
    }

    function getModelsForProvider(providerId = state.selectedProvider) {
        const provider = getProviderConfig(providerId);
        const models = Array.isArray(provider?.models) ? provider.models.filter(Boolean) : [];

        if (models.length > 0) {
            return models;
        }

        return provider?.default_model ? [provider.default_model] : [];
    }

    function syncSelectedModelWithProvider(providerId = state.selectedProvider) {
        const provider = getProviderConfig(providerId);
        const models = getModelsForProvider(providerId);
        const defaultModel = provider?.default_model || models[0] || "";

        if (models.length === 0) {
            state.selectedModel = defaultModel;
        } else if (!state.selectedModel || !models.includes(state.selectedModel)) {
            state.selectedModel = defaultModel || models[0];
        }

        availableModels = models;
    }

    function syncModelSelect(selectElement) {
        if (!selectElement) {
            return;
        }

        syncSelectedModelWithProvider();
        const models = availableModels.length > 0 ? availableModels : [];

        selectElement.innerHTML = "";

        if (models.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Configure model in .env";
            selectElement.appendChild(option);
            selectElement.value = "";
            selectElement.disabled = isSending;
            return;
        }

        models.forEach((model) => {
            const option = document.createElement("option");
            option.value = model;
            option.textContent = model;
            selectElement.appendChild(option);
        });

        if (state.selectedModel && !models.includes(state.selectedModel)) {
            const option = document.createElement("option");
            option.value = state.selectedModel;
            option.textContent = state.selectedModel;
            selectElement.appendChild(option);
        }

        selectElement.value = state.selectedModel;
        selectElement.disabled = isSending;
    }

    function renderControls() {
        const resolvedTheme = getResolvedTheme();
        const themeIcon = resolvedTheme === "dark" ? "sun" : "moon";
        els.themeToggleButton.innerHTML = `<i data-lucide="${themeIcon}"></i>`;
        els.themeToggleButton.setAttribute("aria-label", `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`);

        syncModelSelect(els.modelSelect);
        syncModelSelect(els.settingsModelSelect);

        document.querySelectorAll("[data-theme-option]").forEach((button) => {
            button.classList.toggle("active", button.dataset.themeOption === state.theme);
        });

        if (els.autoScrollToggle) {
            els.autoScrollToggle.checked = state.settings.autoScroll;
        }

        if (els.clearAllButton) {
            els.clearAllButton.disabled = state.conversations.length === 0;
        }
    }

    function renderAttachmentTray() {
        if (!els.attachmentTray) {
            return;
        }

        els.attachmentTray.hidden = pendingAttachments.length === 0 && !isProcessingAttachment;
        els.attachmentTray.textContent = "";

        pendingAttachments.forEach((attachment) => {
            const chip = document.createElement("span");
            chip.className = `attachment-chip ${attachment.kind === "image" ? "image-chip" : ""}`;
            chip.dataset.attachmentId = attachment.id;

            if (attachment.kind === "image") {
                const preview = document.createElement("img");
                preview.src = attachment.dataUrl;
                preview.alt = "";
                preview.className = "attachment-preview";
                chip.appendChild(preview);
            } else {
                const icon = document.createElement("i");
                icon.dataset.lucide = "file-text";
                chip.appendChild(icon);
            }

            const name = document.createElement("span");
            name.textContent = attachment.name;
            chip.appendChild(name);

            const size = document.createElement("small");
            size.textContent = formatBytes(attachment.size);
            chip.appendChild(size);

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.dataset.action = "remove-attachment";
            removeButton.setAttribute("aria-label", `Remove ${attachment.name}`);
            removeButton.innerHTML = '<i data-lucide="x"></i>';
            chip.appendChild(removeButton);

            els.attachmentTray.appendChild(chip);
        });

        if (isProcessingAttachment) {
            const chip = document.createElement("span");
            chip.className = "attachment-chip processing-chip";
            chip.innerHTML = `
                <span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>
                <span>Processing image</span>
            `;
            els.attachmentTray.appendChild(chip);
        }
    }

    function syncComposerState() {
        const hasText = els.messageInput.value.trim().length > 0;
        const hasAttachments = pendingAttachments.length > 0;
        els.sendButton.disabled = isSending || isProcessingAttachment || (!hasText && !hasAttachments);
        els.messageInput.disabled = isSending;
        els.attachButton.disabled = isSending;
        els.imageButton.disabled = isSending || isProcessingAttachment;
        els.stopButton.hidden = !isSending;
        els.stopButton.disabled = !isSending;
        els.messagesViewport?.setAttribute("aria-busy", String(isSending));
    }

    function isSafeMarkdownLink(url) {
        try {
            const parsedUrl = new URL(url, window.location.origin);
            return ["http:", "https:", "mailto:"].includes(parsedUrl.protocol);
        } catch (error) {
            return false;
        }
    }

    function appendInlineMarkdown(parent, text) {
        const source = String(text || "");
        const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|\[[^\]\n]+?\]\((?:https?:\/\/|mailto:)[^\s)]+?\))/g;
        let cursor = 0;

        source.replace(tokenPattern, (match, _token, offset) => {
            if (offset > cursor) {
                parent.appendChild(document.createTextNode(source.slice(cursor, offset)));
            }

            if (match.startsWith("`")) {
                const code = document.createElement("code");
                code.textContent = match.slice(1, -1);
                parent.appendChild(code);
            } else if (match.startsWith("**")) {
                const strong = document.createElement("strong");
                strong.textContent = match.slice(2, -2);
                parent.appendChild(strong);
            } else {
                const linkMatch = match.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                const label = linkMatch?.[1] || match;
                const href = linkMatch?.[2] || "";

                if (href && isSafeMarkdownLink(href)) {
                    const link = document.createElement("a");
                    link.href = href;
                    link.target = "_blank";
                    link.rel = "noreferrer";
                    link.textContent = label;
                    parent.appendChild(link);
                } else {
                    parent.appendChild(document.createTextNode(match));
                }
            }

            cursor = offset + match.length;
            return match;
        });

        if (cursor < source.length) {
            parent.appendChild(document.createTextNode(source.slice(cursor)));
        }
    }

    function appendPlainText(fragment, text) {
        const blocks = text
            .split(/\n{2,}/)
            .map((block) => block.trim())
            .filter(Boolean);

        if (blocks.length === 0) {
            return;
        }

        blocks.forEach((block) => {
            const lines = block
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
            const isNumbered = lines.length > 1 && lines.every((line) => /^\d+[\).]\s+/.test(line));
            const isBulleted = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line));
            const isQuote = lines.every((line) => /^>\s?/.test(line));
            const heading = lines.length === 1 ? lines[0].match(/^(#{1,4})\s+(.+)$/) : null;

            if (isNumbered || isBulleted) {
                const list = document.createElement(isNumbered ? "ol" : "ul");

                lines.forEach((line) => {
                    const item = document.createElement("li");
                    appendInlineMarkdown(item, line.replace(isNumbered ? /^\d+[\).]\s+/ : /^[-*]\s+/, ""));
                    list.appendChild(item);
                });

                fragment.appendChild(list);
                return;
            }

            if (isQuote) {
                const quote = document.createElement("blockquote");
                const paragraph = document.createElement("p");
                appendInlineMarkdown(paragraph, lines.map((line) => line.replace(/^>\s?/, "")).join(" "));
                quote.appendChild(paragraph);
                fragment.appendChild(quote);
                return;
            }

            if (heading) {
                const title = document.createElement(heading[1].length <= 2 ? "h3" : "h4");
                appendInlineMarkdown(title, heading[2]);
                fragment.appendChild(title);
                return;
            }

            const paragraph = document.createElement("p");
            appendInlineMarkdown(paragraph, block.replace(/\n/g, " "));
            fragment.appendChild(paragraph);
        });
    }

    function renderSanitizedMarkdown(fragment, text) {
        if (!window.marked || !window.DOMPurify) {
            return false;
        }

        window.marked.setOptions({
            breaks: false,
            gfm: true,
        });

        const rawHtml = window.marked.parse(String(text || ""));
        const cleanHtml = window.DOMPurify.sanitize(rawHtml, {
            USE_PROFILES: { html: true },
            ADD_ATTR: ["target", "rel"],
        });
        const template = document.createElement("template");
        template.innerHTML = cleanHtml;

        template.content.querySelectorAll("a[href]").forEach((link) => {
            if (!isSafeMarkdownLink(link.getAttribute("href"))) {
                link.removeAttribute("href");
                return;
            }

            link.target = "_blank";
            link.rel = "noreferrer";
        });

        fragment.appendChild(template.content);
        return true;
    }

    function renderMessageContent(text, isError = false, options = {}) {
        const fragment = document.createDocumentFragment();

        if (isError) {
            const errorBox = document.createElement("div");
            errorBox.className = "message-error";
            errorBox.textContent = text || "The request failed. Please try again.";
            fragment.appendChild(errorBox);
            return fragment;
        }

        if (options.markdown && renderSanitizedMarkdown(fragment, text)) {
            return fragment;
        }

        const parts = String(text || "").split("```");

        parts.forEach((part, index) => {
            if (!part) {
                return;
            }

            if (index % 2 === 1) {
                const lines = part.replace(/^\n/, "").split("\n");
                const code = document.createElement("code");
                const pre = document.createElement("pre");

                if (/^[a-zA-Z0-9_-]+$/.test(lines[0] || "")) {
                    pre.dataset.language = lines.shift().toLowerCase();
                }

                code.textContent = lines.join("\n").trim();
                pre.appendChild(code);
                fragment.appendChild(pre);
                return;
            }

            appendPlainText(fragment, part);
        });

        return fragment;
    }

    function createTypingIndicator(modelName) {
        const wrapper = document.createElement("div");
        wrapper.className = "typing-indicator";
        wrapper.innerHTML = `
            <span>Thinking with ${escapeHtml(modelName || state.selectedModel)}</span>
            <span class="typing-dots" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
            </span>
        `;
        return wrapper;
    }

    function createAttachmentPills(attachments) {
        const container = document.createElement("div");
        container.className = "message-attachments";

        attachments.forEach((attachment) => {
            const pill = document.createElement("span");
            pill.className = `attachment-pill ${attachment.kind === "image" ? "image-pill" : ""}`;

            if (attachment.kind === "image") {
                const preview = document.createElement("img");
                preview.src = attachment.dataUrl;
                preview.alt = attachment.name || "Attached image";
                preview.className = "message-image-preview";
                pill.appendChild(preview);
            } else {
                const icon = document.createElement("i");
                icon.dataset.lucide = "file-text";
                pill.appendChild(icon);
            }

            const name = document.createElement("span");
            name.textContent = attachment.name;
            pill.appendChild(name);

            const size = document.createElement("small");
            size.textContent = formatBytes(Number(attachment.size) || 0);
            pill.appendChild(size);
            container.appendChild(pill);
        });

        return container;
    }

    function createResponseFooter(message) {
        const footer = document.createElement("div");
        footer.className = "response-footer";
        footer.innerHTML = `
            <div class="reaction-buttons" aria-label="Response actions">
                <button class="${message.feedback === "like" ? "active" : ""}" type="button" data-action="like-response" aria-label="Like response">
                    <i data-lucide="thumbs-up"></i>
                </button>
                <button class="${message.feedback === "dislike" ? "active" : ""}" type="button" data-action="dislike-response" aria-label="Dislike response">
                    <i data-lucide="thumbs-down"></i>
                </button>
                <button type="button" data-action="copy-response" aria-label="Copy response">
                    <i data-lucide="copy"></i>
                </button>
                <span class="more-menu-wrapper">
                    <button type="button" data-action="toggle-more" aria-label="More response options">
                        <i data-lucide="more-horizontal"></i>
                    </button>
                    <span class="more-menu ${openMenuId === message.id ? "open" : ""}">
                        <button type="button" data-action="copy-response">
                            <i data-lucide="copy"></i>
                            <span>Copy response</span>
                        </button>
                        <button type="button" data-action="delete-response">
                            <i data-lucide="trash-2"></i>
                            <span>Delete response</span>
                        </button>
                    </span>
                </span>
                ${copiedMessageId === message.id ? '<span class="copy-feedback">Copied</span>' : ""}
            </div>
            <button class="regenerate-button" type="button" data-action="regenerate-response">
                <i data-lucide="rotate-ccw"></i>
                <span>Regenerate</span>
            </button>
        `;
        return footer;
    }

    function createMessageElement(message) {
        const row = document.createElement("article");
        row.className = `message ${message.role === "user" ? "user-message" : "ai-message"}`;
        row.dataset.messageId = message.id;

        const avatar = document.createElement("span");
        avatar.className = `message-avatar ${message.role === "ai" ? "ai-avatar" : "user-avatar"}`;
        avatar.setAttribute("aria-hidden", "true");
        avatar.innerHTML = message.role === "ai" ? '<i data-lucide="sparkles"></i>' : '<i data-lucide="user-round"></i>';

        const shell = document.createElement("div");
        shell.className = "message-shell";

        const meta = document.createElement("div");
        meta.className = "message-meta";

        if (message.role === "ai") {
            meta.innerHTML = `
                <span>${escapeHtml(getProviderLabel(message.provider || DEFAULT_PROVIDER))}</span>
                <span class="model-chip">${escapeHtml(message.model || state.selectedModel)}</span>
                ${message.isError ? '<span class="status-chip error">error</span>' : ""}
                ${message.isStopped ? '<span class="status-chip stopped">stopped</span>' : ""}
            `;
        } else {
            meta.textContent = "You";
        }

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";

        const content = document.createElement("div");
        content.className = "message-content";

        if (message.isLoading && !message.text) {
            content.appendChild(createTypingIndicator(message.model));
        } else {
            content.appendChild(renderMessageContent(message.text, message.isError, {
                markdown: message.role === "ai",
            }));
        }

        bubble.appendChild(content);
        shell.appendChild(meta);

        if (message.attachments?.length) {
            shell.appendChild(createAttachmentPills(message.attachments));
        }

        shell.appendChild(bubble);

        if (message.role === "ai" && !message.isLoading && message.text) {
            shell.appendChild(createResponseFooter(message));
        }

        row.appendChild(avatar);
        row.appendChild(shell);
        return row;
    }

    function createEmptyState() {
        const empty = document.createElement("section");
        empty.className = "empty-state";
        empty.innerHTML = `
            <span class="empty-kicker">AI Workspace</span>
            <h2>Start a focused AI research session.</h2>
            <p>Ask a question, choose a model, attach files, and keep every useful conversation organized in this workspace.</p>
            <div class="suggestions">
                ${SUGGESTIONS.map((suggestion) => `
                    <button class="suggestion-button" type="button" data-action="use-suggestion" data-suggestion="${escapeAttribute(suggestion)}">
                        ${escapeHtml(suggestion)}
                    </button>
                `).join("")}
            </div>
        `;
        return empty;
    }

    function renderChat(options = {}) {
        const conversation = getActiveConversation();
        const shouldScroll = options.forceScroll || (state.settings.autoScroll && isNearBottom());
        els.chatThread.innerHTML = "";

        if (conversation.messages.length === 0) {
            els.chatThread.appendChild(createEmptyState());
        } else {
            conversation.messages.forEach((message) => {
                els.chatThread.appendChild(createMessageElement(message));
            });
        }

        renderIcons();

        if (shouldScroll) {
            requestAnimationFrame(scrollMessagesToBottom);
        }
    }

    function renderApp(options = {}) {
        applyTheme();
        renderSidebar();
        renderTopbar();
        renderSystemNotice();
        renderControls();
        renderAttachmentTray();
        syncComposerState();
        renderChat(options);
        saveState();
        renderIcons();
    }

    function renderStreamingUpdate() {
        if (renderQueued) {
            return;
        }

        renderQueued = true;
        requestAnimationFrame(() => {
            renderQueued = false;
            renderChat({ forceScroll: true });
            saveState();
            renderIcons();
        });
    }

    function setLoading(isLoading, assistantId = null) {
        isSending = isLoading;
        currentAssistantId = assistantId;
        syncComposerState();
    }

    async function loadModels() {
        try {
            const response = await fetch("/models");
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Could not load models.");
            }

            if (Array.isArray(data.providers)) {
                availableProviders = data.providers;
                const providerIds = availableProviders.map((provider) => provider.id);

                if (
                    data.active_provider &&
                    state.selectedProvider === DEFAULT_PROVIDER &&
                    data.active_provider !== DEFAULT_PROVIDER
                ) {
                    state.selectedProvider = data.active_provider;
                    state.selectedModel = "";
                } else if (!providerIds.includes(state.selectedProvider)) {
                    state.selectedProvider = providerIds.includes(data.active_provider)
                        ? data.active_provider
                        : providerIds[0] || DEFAULT_PROVIDER;
                }

                syncSelectedModelWithProvider();
            } else {
                availableModels = Array.isArray(data.models) ? data.models : [];

                if (data.active && !state.selectedModel) {
                    state.selectedModel = data.active;
                }

                if (availableModels.length > 0 && !availableModels.includes(state.selectedModel)) {
                    state.selectedModel = availableModels.includes(data.active) ? data.active : availableModels[0];
                }
            }

            showNotice("");
        } catch (error) {
            availableProviders = [];
            availableModels = [state.selectedModel || DEFAULT_MODEL];
            showNotice("Model list unavailable. The app will use the configured model when you send a message.");
        } finally {
            renderApp();
        }
    }

    async function streamAIResponse(payload, onEvent) {
        abortController = new AbortController();
        const response = await fetch("/chat/stream", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: abortController.signal,
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || data.details || "Failed to generate a response.");
        }

        if (!response.body) {
            const data = await response.json();
            onEvent({ type: "token", text: data.reply || "" });
            onEvent({ type: "done", model: data.model });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim()) {
                    continue;
                }

                const event = JSON.parse(line);

                if (event.type === "error") {
                    throw new Error(event.error || event.details || "The response failed.");
                }

                onEvent(event);
            }
        }

        if (buffer.trim()) {
            const event = JSON.parse(buffer);

            if (event.type === "error") {
                throw new Error(event.error || event.details || "The response failed.");
            }

            onEvent(event);
        }
    }

    function getMessageById(messageId) {
        return getActiveConversation().messages.find((message) => message.id === messageId);
    }

    async function runAssistantRequest(userMessage, assistantMessage, forceScroll = true) {
        const payload = {
            message: userMessage.text,
            provider: assistantMessage.provider || state.selectedProvider,
            model: assistantMessage.model || state.selectedModel,
            attachments: userMessage.attachments || [],
        };

        setLoading(true, assistantMessage.id);
        renderApp({ forceScroll });

        try {
            await streamAIResponse(payload, (event) => {
                if (event.type === "meta") {
                    assistantMessage.provider = event.provider || assistantMessage.provider || state.selectedProvider;
                    assistantMessage.model = event.model || assistantMessage.model || state.selectedModel;
                    return;
                }

                if (event.type === "token" && event.text) {
                    assistantMessage.text += event.text;
                    assistantMessage.isLoading = false;
                    renderStreamingUpdate();
                    return;
                }

                if (event.type === "done") {
                    assistantMessage.provider = event.provider || assistantMessage.provider || state.selectedProvider;
                    assistantMessage.model = event.model || assistantMessage.model || state.selectedModel;
                }
            });

            if (!assistantMessage.text.trim()) {
                assistantMessage.text = "The selected provider did not return a response. Please try again.";
                assistantMessage.isError = true;
            }
        } catch (error) {
            if (error.name === "AbortError") {
                assistantMessage.isStopped = true;
                assistantMessage.text = assistantMessage.text.trim() || "Generation stopped.";
                showToast("Generation stopped");
            } else {
                assistantMessage.text = error.message || "Failed to generate a response.";
                assistantMessage.isError = true;
                showToast(assistantMessage.text, "error");
            }
        } finally {
            assistantMessage.isLoading = false;
            abortController = null;
            setLoading(false, null);
            getActiveConversation().updatedAt = Date.now();
            renderApp({ forceScroll: true });
            els.messageInput.focus();
        }
    }

    async function submitCurrentMessage() {
        if (isSending) {
            return;
        }

        const conversation = getActiveConversation();
        const rawText = els.messageInput.value.trim();
        const attachments = pendingAttachments.map((attachment) => ({ ...attachment }));

        if (!rawText && attachments.length === 0) {
            els.messageInput.focus();
            return;
        }

        const text = rawText || "Please analyze the attached file.";
        const wasEmpty = conversation.messages.length === 0;
        const userMessage = createMessage("user", text, {
            attachments,
            provider: state.selectedProvider,
            model: state.selectedModel,
        });
        const assistantMessage = createMessage("ai", "", {
            isLoading: true,
            provider: state.selectedProvider,
            model: state.selectedModel,
        });

        conversation.messages.push(userMessage, assistantMessage);
        conversation.updatedAt = Date.now();

        if (wasEmpty || conversation.title === "New chat") {
            conversation.title = getTitleFromMessage(text, attachments);
        }

        pendingAttachments = [];
        els.messageInput.value = "";
        autosizeInput();
        await runAssistantRequest(userMessage, assistantMessage);
    }

    async function regenerateResponse(assistantMessageId) {
        if (isSending) {
            return;
        }

        const conversation = getActiveConversation();
        const assistantIndex = conversation.messages.findIndex((message) => message.id === assistantMessageId);

        if (assistantIndex === -1) {
            return;
        }

        const userMessage = [...conversation.messages]
            .slice(0, assistantIndex)
            .reverse()
            .find((message) => message.role === "user");

        if (!userMessage) {
            return;
        }

        const assistantMessage = conversation.messages[assistantIndex];
        assistantMessage.text = "";
        assistantMessage.isError = false;
        assistantMessage.isStopped = false;
        assistantMessage.isLoading = true;
        assistantMessage.feedback = null;
        assistantMessage.provider = state.selectedProvider;
        assistantMessage.model = state.selectedModel;
        openMenuId = null;

        await runAssistantRequest(userMessage, assistantMessage);
    }

    function stopGeneration() {
        if (abortController) {
            abortController.abort();
        }

        const assistantMessage = currentAssistantId ? getMessageById(currentAssistantId) : null;

        if (assistantMessage) {
            assistantMessage.isStopped = true;
            assistantMessage.isLoading = false;
            assistantMessage.text = assistantMessage.text.trim() || "Generation stopped.";
        }

        setLoading(false, null);
        renderApp({ forceScroll: true });
    }

    function createNewConversation() {
        const conversation = createConversation();
        state.conversations.unshift(conversation);
        state.activeConversationId = conversation.id;
        searchTerm = "";
        isSearchOpen = false;
        if (els.searchInput) {
            els.searchInput.value = "";
        }
        openMenuId = null;
        renderApp({ forceScroll: true });
        els.messageInput.focus();

        if (mobileSidebarQuery.matches) {
            setSidebarOpen(false);
        }
    }

    function clearAllConversations() {
        const conversation = createConversation();
        state.conversations = [conversation];
        state.activeConversationId = conversation.id;
        pendingAttachments = [];
        openMenuId = null;
        renderApp({ forceScroll: true });
        showToast("Chat history cleared");
    }

    function deleteConversation(conversationId) {
        state.conversations = state.conversations.filter((conversation) => conversation.id !== conversationId);

        if (state.conversations.length === 0) {
            const conversation = createConversation();
            state.conversations = [conversation];
            state.activeConversationId = conversation.id;
        } else if (state.activeConversationId === conversationId) {
            state.activeConversationId = state.conversations[0].id;
        }

        renderApp({ forceScroll: true });
        showToast("Conversation deleted");
    }

    function openRenameDialog(conversationId) {
        const conversation = state.conversations.find((item) => item.id === conversationId);

        if (!conversation) {
            return;
        }

        renameTargetId = conversation.id;
        els.renameInput.value = conversation.title;
        openDialog(els.renameDialog, els.renameInput);
        els.renameInput.select();
    }

    function saveRename() {
        const conversation = state.conversations.find((item) => item.id === renameTargetId);
        const nextTitle = els.renameInput.value.trim();

        if (!conversation || !nextTitle) {
            return;
        }

        conversation.title = nextTitle;
        conversation.updatedAt = Date.now();
        closeDialog(els.renameDialog);
        renameTargetId = null;
        renderApp();
        showToast("Conversation renamed");
    }

    async function copyText(text, messageId) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                textarea.remove();
            }

            copiedMessageId = messageId;
            openMenuId = null;
            renderApp();
            window.setTimeout(() => {
                if (copiedMessageId === messageId) {
                    copiedMessageId = null;
                    renderApp();
                }
            }, 1400);
        } catch (error) {
            showToast("Could not copy the response", "error");
        }
    }

    function openDialog(dialog, focusTarget = null) {
        closeAllDialogs();
        dialog.classList.add("open");
        dialog.setAttribute("aria-hidden", "false");
        window.setTimeout(() => {
            const target = focusTarget || dialog.querySelector("button, input, select, textarea");
            target?.focus();
        }, 40);
    }

    function closeDialog(dialog) {
        dialog.classList.remove("open");
        dialog.setAttribute("aria-hidden", "true");
    }

    function closeAllDialogs() {
        [els.settingsDialog, els.renameDialog, els.confirmDialog].forEach((dialog) => closeDialog(dialog));
        confirmCallback = null;
    }

    function openConfirmDialog({ title, message, actionLabel, onConfirm }) {
        els.confirmTitle.textContent = title;
        els.confirmMessage.textContent = message;
        els.confirmAcceptButton.textContent = actionLabel;
        openDialog(els.confirmDialog, els.confirmAcceptButton);
        confirmCallback = onConfirm;
    }

    function setThemePreference(theme) {
        state.theme = theme;
        applyTheme();
        renderControls();
        saveState();
    }

    function cycleTheme() {
        const resolvedTheme = getResolvedTheme();
        setThemePreference(resolvedTheme === "dark" ? "light" : "dark");
    }

    function setSelectedProvider(provider) {
        state.selectedProvider = provider || DEFAULT_PROVIDER;
        const providerConfig = getProviderConfig(state.selectedProvider);
        const models = getModelsForProvider(state.selectedProvider);
        state.selectedModel = providerConfig?.default_model || models[0] || "";
        availableModels = models;
        renderControls();
        saveState();
    }

    function setSelectedModel(model) {
        const provider = getProviderConfig();
        state.selectedModel = model || provider?.default_model || "";

        if (hasPendingImageAttachment() && !currentModelSupportsImages()) {
            pendingAttachments = pendingAttachments.filter((attachment) => attachment.kind !== "image");
            showToast("This selected model does not support image input.", "error");
        }

        renderControls();
        saveState();
    }

    function autosizeInput() {
        els.messageInput.style.height = "auto";
        els.messageInput.style.height = `${Math.min(190, els.messageInput.scrollHeight)}px`;
        syncComposerState();
    }

    function isSupportedTextFile(file) {
        const extension = file.name.includes(".")
            ? file.name.split(".").pop().toLowerCase()
            : "";

        return file.type.startsWith("text/") ||
            file.type === "application/json" ||
            TEXT_EXTENSIONS.has(extension);
    }

    function isSupportedImageFile(file) {
        const extension = file.name.includes(".")
            ? file.name.split(".").pop().toLowerCase()
            : "";

        return IMAGE_MIME_TYPES.has(file.type) || ["png", "jpg", "jpeg", "webp"].includes(extension);
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(String(reader.result || "")));
            reader.addEventListener("error", () => reject(reader.error || new Error("Could not read image.")));
            reader.readAsDataURL(file);
        });
    }

    async function addFiles(files) {
        const selectedFiles = Array.from(files || []);

        for (const file of selectedFiles) {
            if (pendingAttachments.length >= MAX_ATTACHMENTS) {
                showToast(`You can attach up to ${MAX_ATTACHMENTS} files`, "error");
                break;
            }

            if (!isSupportedTextFile(file)) {
                showToast(`${file.name} is not a supported text file`, "error");
                continue;
            }

            if (file.size > MAX_ATTACHMENT_BYTES) {
                showToast(`${file.name} is larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}`, "error");
                continue;
            }

            try {
                const content = await file.text();
                pendingAttachments.push({
                    id: createId("file"),
                    kind: "text",
                    name: file.name,
                    mimeType: file.type || "text/plain",
                    size: file.size,
                    content,
                });
            } catch (error) {
                showToast(`Could not read ${file.name}`, "error");
            }
        }

        els.fileInput.value = "";
        renderApp();
    }

    async function addImages(files) {
        const selectedFiles = Array.from(files || []);

        if (selectedFiles.length === 0) {
            return;
        }

        if (!currentModelSupportsImages()) {
            showToast("This selected model does not support image input.", "error");
            els.imageInput.value = "";
            return;
        }

        isProcessingAttachment = true;
        renderApp();

        try {
            for (const file of selectedFiles) {
                if (pendingAttachments.length >= MAX_ATTACHMENTS) {
                    showToast(`You can attach up to ${MAX_ATTACHMENTS} files`, "error");
                    break;
                }

                if (!isSupportedImageFile(file)) {
                    showToast(`${file.name} is not a supported image file`, "error");
                    continue;
                }

                if (file.size > MAX_IMAGE_BYTES) {
                    showToast(`${file.name} is larger than ${formatBytes(MAX_IMAGE_BYTES)}`, "error");
                    continue;
                }

                const dataUrl = await readFileAsDataUrl(file);
                pendingAttachments.push({
                    id: createId("image"),
                    kind: "image",
                    name: file.name,
                    mimeType: file.type || "image/png",
                    size: file.size,
                    dataUrl,
                });
            }
        } catch (error) {
            showToast(error.message || "Could not process the image", "error");
        } finally {
            isProcessingAttachment = false;
            els.imageInput.value = "";
            renderApp();
        }
    }

    function removeAttachment(attachmentId) {
        pendingAttachments = pendingAttachments.filter((attachment) => attachment.id !== attachmentId);
        renderApp();
    }

    function bindEvents() {
        els.newChatButton.addEventListener("click", createNewConversation);
        els.clearAllButton.addEventListener("click", () => {
            openConfirmDialog({
                title: "Clear history?",
                message: "This removes every conversation stored in this browser.",
                actionLabel: "Clear history",
                onConfirm: clearAllConversations,
            });
        });
        els.clearHistoryButton.addEventListener("click", () => {
            openConfirmDialog({
                title: "Clear history?",
                message: "This removes every conversation stored in this browser.",
                actionLabel: "Clear history",
                onConfirm: clearAllConversations,
            });
        });
        els.searchToggleButton.addEventListener("click", () => {
            isSearchOpen = !isSearchOpen;

            if (isSearchOpen) {
                window.setTimeout(() => els.searchInput.focus(), 80);
            } else {
                searchTerm = "";
                els.searchInput.value = "";
            }

            renderApp();
        });
        els.searchInput.addEventListener("input", () => {
            searchTerm = els.searchInput.value;
            renderSidebar();
            renderIcons();
        });
        els.settingsButton.addEventListener("click", () => openDialog(els.settingsDialog));
        els.settingsCloseButton.addEventListener("click", () => closeDialog(els.settingsDialog));
        els.renameChatButton.addEventListener("click", () => openRenameDialog(state.activeConversationId));
        els.renameCloseButton.addEventListener("click", () => closeDialog(els.renameDialog));
        els.renameCancelButton.addEventListener("click", () => closeDialog(els.renameDialog));
        els.confirmCloseButton.addEventListener("click", () => closeDialog(els.confirmDialog));
        els.confirmCancelButton.addEventListener("click", () => closeDialog(els.confirmDialog));
        els.confirmAcceptButton.addEventListener("click", () => {
            const callback = confirmCallback;
            closeDialog(els.confirmDialog);

            if (callback) {
                callback();
            }
        });
        els.themeToggleButton.addEventListener("click", cycleTheme);
        document.querySelectorAll("[data-theme-option]").forEach((button) => {
            button.addEventListener("click", () => setThemePreference(button.dataset.themeOption));
        });
        els.modelSelect.addEventListener("change", () => setSelectedModel(els.modelSelect.value));
        els.settingsModelSelect.addEventListener("change", () => setSelectedModel(els.settingsModelSelect.value));
        els.autoScrollToggle.addEventListener("change", () => {
            state.settings.autoScroll = els.autoScrollToggle.checked;
            saveState();
        });
        els.attachButton.addEventListener("click", () => els.fileInput.click());
        els.fileInput.addEventListener("change", () => addFiles(els.fileInput.files));
        els.imageButton.addEventListener("click", () => els.imageInput.click());
        els.imageInput.addEventListener("change", () => addImages(els.imageInput.files));
        els.stopButton.addEventListener("click", stopGeneration);
        els.mobileMenuButton?.addEventListener("click", () => setSidebarOpen(true));
        els.sidebarCloseButton?.addEventListener("click", () => setSidebarOpen(false));
        els.sidebarScrim?.addEventListener("click", () => setSidebarOpen(false));

        els.attachmentTray.addEventListener("click", (event) => {
            const removeButton = event.target.closest("[data-action='remove-attachment']");

            if (!removeButton) {
                return;
            }

            const chip = event.target.closest(".attachment-chip");
            removeAttachment(chip?.dataset.attachmentId);
        });

        els.conversationList.addEventListener("click", (event) => {
            const actionButton = event.target.closest("[data-action]");

            if (!actionButton) {
                return;
            }

            const conversationId = actionButton.dataset.conversationId ||
                event.target.closest(".conversation-item")?.dataset.conversationId;

            if (!conversationId) {
                return;
            }

            const action = actionButton.dataset.action;

            if (action === "open-conversation") {
                state.activeConversationId = conversationId;
                openMenuId = null;
                renderApp({ forceScroll: true });

                if (mobileSidebarQuery.matches) {
                    setSidebarOpen(false);
                }
                return;
            }

            if (action === "rename-conversation") {
                openRenameDialog(conversationId);
                return;
            }

            if (action === "delete-conversation") {
                deleteConversation(conversationId);
            }
        });

        els.chatThread.addEventListener("click", (event) => {
            const suggestionButton = event.target.closest("[data-action='use-suggestion']");

            if (suggestionButton) {
                els.messageInput.value = suggestionButton.dataset.suggestion || "";
                autosizeInput();
                els.messageInput.focus();
                return;
            }

            const actionButton = event.target.closest("[data-action]");

            if (!actionButton) {
                return;
            }

            const aiRow = event.target.closest(".ai-message");
            const messageId = aiRow?.dataset.messageId;
            const message = messageId ? getMessageById(messageId) : null;

            if (!message) {
                return;
            }

            const action = actionButton.dataset.action;

            if (action === "like-response" || action === "dislike-response") {
                const nextFeedback = action === "like-response" ? "like" : "dislike";
                message.feedback = message.feedback === nextFeedback ? null : nextFeedback;
                renderApp();
                return;
            }

            if (action === "copy-response") {
                copyText(message.text, message.id);
                return;
            }

            if (action === "toggle-more") {
                event.stopPropagation();
                openMenuId = openMenuId === message.id ? null : message.id;
                renderApp();
                return;
            }

            if (action === "delete-response") {
                const conversation = getActiveConversation();
                conversation.messages = conversation.messages.filter((item) => item.id !== message.id);
                conversation.updatedAt = Date.now();
                openMenuId = null;
                renderApp();
                showToast("Response deleted");
                return;
            }

            if (action === "regenerate-response") {
                regenerateResponse(message.id);
            }
        });

        els.renameForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveRename();
        });

        els.messageForm.addEventListener("submit", (event) => {
            event.preventDefault();
            submitCurrentMessage();
        });

        els.messageInput.addEventListener("input", autosizeInput);
        els.messageInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                els.messageForm.requestSubmit();
            }
        });

        document.addEventListener("click", (event) => {
            if (openMenuId && !event.target.closest(".more-menu-wrapper")) {
                openMenuId = null;
                renderApp();
            }

            if (event.target.classList.contains("dialog-layer")) {
                closeDialog(event.target);
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") {
                return;
            }

            setSidebarOpen(false);
            openMenuId = null;
            closeAllDialogs();
            renderApp();
        });

        systemThemeQuery.addEventListener("change", () => {
            if (state.theme === "system") {
                applyTheme();
                renderControls();
                renderIcons();
            }
        });

        mobileSidebarQuery.addEventListener("change", (event) => {
            if (!event.matches) {
                setSidebarOpen(false);
            }
        });
    }

    bindEvents();
    renderApp({ forceScroll: true });
    loadModels();
});
