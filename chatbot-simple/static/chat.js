document.addEventListener("DOMContentLoaded", () => {
    const rawUserId = document.body?.dataset.userId || "guest";
    const CURRENT_USER = {
        id: rawUserId,
        name: document.body?.dataset.userName || "Guest",
        authenticated: document.body?.dataset.authenticated === "true",
    };
    let csrfToken = document.body?.dataset.csrfToken || "";
    const USER_STORAGE_ID = String(rawUserId).replace(/[^a-zA-Z0-9_-]/g, "_") || "guest";
    const GLOBAL_STORAGE_KEY = "gemini-chat-workspace-state-v2";
    const LEGACY_STORAGE_KEY = "chatbot-simple-conversations";
    const STORAGE_KEY = `conversations_${USER_STORAGE_ID}`;
    const HISTORY_STORAGE_KEY = `chat_history_${USER_STORAGE_ID}`;
    const THEME_STORAGE_KEY = "workspace_theme_preference";
    const PREFERENCES_STORAGE_KEY = `workspace_preferences_${USER_STORAGE_ID}`;
    const MIGRATION_KEY = `workspace_migrated_${USER_STORAGE_ID}`;
    const MAX_ATTACHMENTS = 4;
    const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
    const TEXT_EXTENSIONS = new Set(["txt", "md", "pdf", "docx"]);
    const SUGGESTIONS = [
        "Draft a concise project plan.",
        "Summarize attached research notes.",
        "Compare implementation options.",
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
        activeModelPrefix: document.querySelector(".active-model-prefix"),
        activeProviderSelect: document.querySelector(".active-provider-select"),
        providerForm: document.querySelector(".provider-form"),
        providerConnectionId: document.querySelector(".provider-connection-id"),
        apiKeyInput: document.querySelector(".api-key-input"),
        apiBaseUrlInput: document.querySelector(".api-base-url-input"),
        detectModelsButton: document.querySelector(".detect-models-button"),
        detectModelsStatus: document.querySelector(".detect-models-status"),
        detectedModelSelect: document.querySelector(".detected-model-select"),
        manualModelField: document.querySelector(".manual-model-field"),
        manualModelInput: document.querySelector(".manual-model-input"),
        testConnectionButton: document.querySelector(".test-connection-button"),
        connectionStatus: document.querySelector(".connection-status"),
        savedProviderList: document.querySelector(".saved-provider-list"),
        activeProviderSummary: document.querySelector(".active-provider-summary"),
        autoScrollToggle: document.querySelector(".auto-scroll-toggle"),
        activeTitle: document.querySelector(".active-title"),
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
        imagePreviewDialog: document.querySelector(".image-preview-dialog"),
        imagePreviewCloseButton: document.querySelector(".image-preview-close-button"),
        imagePreviewTitle: document.querySelector(".image-preview-title"),
        imagePreviewLarge: document.querySelector(".image-preview-large"),
        imagePreviewMeta: document.querySelector(".image-preview-meta"),
        clearHistoryButton: document.querySelector(".clear-history-button"),
        toastRegion: document.querySelector(".toast-region"),
    };

    if (!els.messageForm || !els.chatThread || !els.conversationList) {
        return;
    }

    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const mobileSidebarQuery = window.matchMedia("(max-width: 900px)");
    const desktopSidebarQuery = window.matchMedia("(min-width: 901px)");
    let desktopSidebarCollapseTimer = null;

    let legacyConversationsForMigration = [];
    let state = loadState();
    let providerWorkspace = {
        providers: [],
        activeProvider: null,
        activeProviderId: "",
        supportedProviders: [],
    };
    let detectedProvider = null;
    let editingProviderId = "";
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
    let renderQueued = false;
    let preferencesSaveTimer = null;

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
            userId: CURRENT_USER.id,
            activeConversationId: conversation.id,
            conversations: [conversation],
            theme: getStoredThemePreference(),
            settings: {
                autoScroll: true,
            },
        };
    }

    function getStoredThemePreference(fallback = "dark") {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) || fallback;
        return ["system", "light", "dark"].includes(stored) ? stored : "dark";
    }

    function normalizeMessage(message) {
        return {
            ...createMessage(message?.role === "user" ? "user" : "ai", String(message?.text || "")),
            id: message?.id || createId("msg"),
            role: message?.role === "user" ? "user" : "ai",
            text: String(message?.text || ""),
            createdAt: Number(message?.createdAt) || Date.now(),
            provider: message?.provider || null,
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
            userId: CURRENT_USER.id,
            conversations,
            theme: getStoredThemePreference(saved?.theme),
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

    function readJsonStorage(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (error) {
            console.warn(`Could not read ${key}:`, error);
            return null;
        }
    }

    function readLegacyConversationsForMigration() {
        if (localStorage.getItem(MIGRATION_KEY) === "true") {
            return [];
        }

        const candidates = [
            readJsonStorage(STORAGE_KEY),
            readJsonStorage(HISTORY_STORAGE_KEY),
            readJsonStorage(GLOBAL_STORAGE_KEY),
            readJsonStorage(LEGACY_STORAGE_KEY),
        ];

        for (const candidate of candidates) {
            if (Array.isArray(candidate?.conversations) && candidate.conversations.length > 0) {
                return normalizeState(candidate).conversations;
            }
        }

        return [];
    }

    function clearLegacyConversationStorage() {
        [STORAGE_KEY, HISTORY_STORAGE_KEY, GLOBAL_STORAGE_KEY, LEGACY_STORAGE_KEY].forEach((key) => {
            localStorage.removeItem(key);
        });
        localStorage.setItem(MIGRATION_KEY, "true");
    }

    function loadPreferences() {
        const preferences = readJsonStorage(PREFERENCES_STORAGE_KEY) || {};
        return {
            theme: getStoredThemePreference(preferences.theme),
            settings: {
                autoScroll: preferences?.settings?.autoScroll !== false,
            },
        };
    }

    function loadState() {
        legacyConversationsForMigration = readLegacyConversationsForMigration();
        const next = createFreshState();
        const preferences = loadPreferences();

        next.theme = preferences.theme;
        next.settings = preferences.settings;
        return next;
    }

    function savePreferencesNow() {
        localStorage.setItem(THEME_STORAGE_KEY, state.theme);
        localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
            theme: state.theme,
            settings: {
                autoScroll: state.settings.autoScroll,
            },
        }));
    }

    function saveState() {
        window.clearTimeout(preferencesSaveTimer);
        preferencesSaveTimer = window.setTimeout(savePreferencesNow, 180);
    }

    function isUnsafeMethod(method) {
        return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
    }

    async function refreshCsrfToken() {
        if (window.NexaAiApi?.refreshCsrfToken) {
            csrfToken = await window.NexaAiApi.refreshCsrfToken();
            return csrfToken;
        }

        const response = await fetch("/api/csrf", {
            credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));

        if (data.csrfToken) {
            csrfToken = data.csrfToken;
        }

        return csrfToken;
    }

    async function apiFetch(url, options = {}, retry = true) {
        if (window.NexaAiApi?.apiFetch) {
            return window.NexaAiApi.apiFetch(url, options, retry);
        }

        const method = String(options.method || "GET").toUpperCase();
        const headers = new Headers(options.headers || {});

        if (isUnsafeMethod(method)) {
            if (!csrfToken) {
                await refreshCsrfToken();
            }
            headers.set("X-CSRF-Token", csrfToken);
        }

        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            method,
            headers,
        });

        if (response.status === 403 && retry) {
            const data = await response.clone().json().catch(() => ({}));

            if (data.code === "invalid_csrf_token") {
                await refreshCsrfToken();
                return apiFetch(url, options, false);
            }
        }

        return response;
    }

    async function loadConversations() {
        try {
            const response = await apiFetch("/api/conversations?limit=50");
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not load conversations.");
            }

            const conversations = Array.isArray(data.conversations)
                ? data.conversations.map(normalizeConversation)
                : [];

            if (conversations.length > 0) {
                state.conversations = conversations;
                state.activeConversationId = conversations[0].id;
            } else {
                const conversation = createConversation();
                state.conversations = [conversation];
                state.activeConversationId = conversation.id;
            }

            renderApp({ forceScroll: true });
        } catch (error) {
            showToast(error.message || "Could not load conversations", "error");
        }
    }

    async function migrateLegacyLocalHistory() {
        if (!CURRENT_USER.authenticated || legacyConversationsForMigration.length === 0) {
            clearLegacyConversationStorage();
            return;
        }

        try {
            const response = await apiFetch("/api/conversations/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    conversations: legacyConversationsForMigration,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Could not migrate local history.");
            }

            clearLegacyConversationStorage();
            legacyConversationsForMigration = [];
            await loadConversations();
        } catch (error) {
            showToast(error.message || "Could not migrate local history", "error");
        }
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

    function stripTransientAttachmentFields(attachment) {
        const {
            previewUrl: _previewUrl,
            objectUrl: _objectUrl,
            isReading: _isReading,
            ...cleanAttachment
        } = attachment || {};
        return cleanAttachment;
    }

    function revokeAttachmentObjectUrl(attachment) {
        if (attachment?.previewUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(attachment.previewUrl);
        }
    }

    function cleanupPendingAttachmentUrls(attachments = pendingAttachments) {
        attachments.forEach(revokeAttachmentObjectUrl);
    }

    function getAttachmentPreviewSource(attachment) {
        return attachment?.previewUrl || attachment?.url || attachment?.dataUrl || attachment?.data_url || "";
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
            return systemThemeQuery.matches ? "dark" : "light";
        }

        return state.theme;
    }

    function applyTheme() {
        const resolvedTheme = getResolvedTheme();
        els.html.dataset.theme = resolvedTheme;
        els.html.dataset.themeChoice = state.theme;

        if (els.metaTheme) {
            els.metaTheme.setAttribute("content", resolvedTheme === "dark" ? "#17161d" : "#fbf8fe");
        }
    }

    function setSidebarOpen(isOpen) {
        document.body.classList.toggle("sidebar-open", isOpen);
        els.mobileMenuButton?.setAttribute("aria-expanded", String(isOpen));
    }

    function setDesktopSidebarExpanded(isExpanded, immediate = false) {
        window.clearTimeout(desktopSidebarCollapseTimer);
        desktopSidebarCollapseTimer = null;

        const applySidebarState = () => {
            document.body.classList.toggle(
                "sidebar-expanded",
                Boolean(isExpanded && desktopSidebarQuery.matches),
            );
        };

        if (!isExpanded && desktopSidebarQuery.matches && !immediate) {
            desktopSidebarCollapseTimer = window.setTimeout(applySidebarState, 90);
            return;
        }

        applySidebarState();
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

    function setProviderWorkspace(data) {
        providerWorkspace = {
            providers: Array.isArray(data?.providers) ? data.providers : [],
            activeProvider: data?.activeProvider || null,
            activeProviderId: data?.activeProviderId || "",
            supportedProviders: Array.isArray(data?.supportedProviders)
                ? data.supportedProviders
                : providerWorkspace.supportedProviders,
        };
    }

    function getSavedProvider(connectionId) {
        return providerWorkspace.providers.find((provider) => provider.id === connectionId) || null;
    }

    function getProviderModelName(provider) {
        const selectedModel = provider?.selectedModel || "";
        const model = (provider?.models || []).find((item) => item.id === selectedModel);
        return model?.name || selectedModel || "No Model Selected";
    }

    function getProviderSwitcherLabel(provider) {
        return getProviderModelName(provider);
    }

    function renderActiveProviderSwitcher() {
        if (!els.activeProviderSelect) {
            return;
        }

        const active = providerWorkspace.activeProvider;
        const providers = [...providerWorkspace.providers];

        if (els.activeModelPrefix) {
            els.activeModelPrefix.textContent = active?.selectedModel ? "Using" : "";
        }

        if (active?.isEnvironment && !providers.some((provider) => provider.id === active.id)) {
            providers.unshift(active);
        }

        els.activeProviderSelect.textContent = "";

        if (providers.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No Model Selected";
            els.activeProviderSelect.appendChild(option);
            els.activeProviderSelect.disabled = true;
            return;
        }

        providers.forEach((provider) => {
            const option = document.createElement("option");
            option.value = provider.id;
            option.textContent = getProviderSwitcherLabel(provider);
            els.activeProviderSelect.appendChild(option);
        });

        els.activeProviderSelect.value = active?.id || providerWorkspace.activeProviderId || providers[0].id;
        els.activeProviderSelect.disabled = isSending || providers.every((provider) => provider.isEnvironment);
    }

    function setProviderStatus(message, isError = false) {
        if (els.detectModelsStatus) {
            els.detectModelsStatus.textContent = message || "";
            els.detectModelsStatus.classList.toggle("error", isError);
        }

        if (els.connectionStatus && message) {
            els.connectionStatus.textContent = message;
            els.connectionStatus.classList.toggle("connected", !isError && /connected|detected|saved/i.test(message));
            els.connectionStatus.classList.toggle("error", isError);
        }
    }

    function renderProviderSettings() {
        if (!els.providerForm) {
            return;
        }

        const editingProvider = getSavedProvider(editingProviderId);
        const models = Array.isArray(detectedProvider?.models)
            ? detectedProvider.models
            : (editingProvider?.models || []);
        const selectedModel = detectedProvider?.defaultModel ||
            editingProvider?.selectedModel ||
            els.detectedModelSelect?.value ||
            "";

        if (els.detectedModelSelect) {
            els.detectedModelSelect.textContent = "";

            if (models.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No models detected";
                els.detectedModelSelect.appendChild(option);
                els.detectedModelSelect.disabled = true;
            } else {
                models.forEach((model) => {
                    const option = document.createElement("option");
                    option.value = model.id;
                    option.textContent = model.name || model.id;
                    els.detectedModelSelect.appendChild(option);
                });
                els.detectedModelSelect.value = models.some((model) => model.id === selectedModel)
                    ? selectedModel
                    : models[0].id;
                els.detectedModelSelect.disabled = isSending;
            }
        }

        if (els.manualModelField) {
            els.manualModelField.hidden = models.length > 0;
        }

        if (els.activeProviderSummary) {
            els.activeProviderSummary.textContent = providerWorkspace.activeProvider
                ? `Using ${getProviderModelName(providerWorkspace.activeProvider)}`
                : "No model selected";
        }

        if (els.connectionStatus) {
            const activeStatus = providerWorkspace.activeProvider?.connectionStatus || "Not connected";
            els.connectionStatus.textContent = activeStatus === "environment"
                ? "Environment fallback"
                : (activeStatus === "not_configured" ? "Not connected" : activeStatus);
            els.connectionStatus.classList.toggle("connected", ["connected", "environment"].includes(activeStatus));
            els.connectionStatus.classList.remove("error");
        }

        if (els.savedProviderList) {
            els.savedProviderList.innerHTML = providerWorkspace.providers.length === 0
                ? `<div class="saved-provider-empty">No saved providers yet.</div>`
                : providerWorkspace.providers.map((provider) => `
                    <div class="saved-provider-item${provider.isActive ? " active" : ""}" data-provider-id="${escapeAttribute(provider.id)}">
                        <span class="saved-provider-copy">
                            <strong>${escapeHtml(provider.provider || provider.label || provider.providerType)}</strong>
                            <span>${escapeHtml(getProviderModelName(provider))}${provider.maskedApiKey ? ` \u00b7 ${escapeHtml(provider.maskedApiKey)}` : ""}</span>
                        </span>
                        <span class="saved-provider-actions">
                            <button type="button" data-provider-action="activate" aria-label="Use ${escapeAttribute(provider.provider || provider.providerType)}" ${provider.isActive ? "disabled" : ""}>
                                <span class="material-symbols-outlined">check_circle</span>
                            </button>
                            <button type="button" data-provider-action="edit" aria-label="Edit ${escapeAttribute(provider.provider || provider.providerType)}">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button class="delete-provider-button" type="button" data-provider-action="delete" aria-label="Delete ${escapeAttribute(provider.provider || provider.providerType)}">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        </span>
                    </div>
                `).join("");
        }

        renderActiveProviderSwitcher();
        renderIcons();
    }

    async function loadProviders() {
        try {
            const response = await apiFetch("/api/providers");
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not load provider settings.");
            }

            setProviderWorkspace(data);
            renderProviderSettings();
            renderControls();
        } catch (error) {
            setProviderStatus(error.message || "Could not load providers", true);
        }
    }

    function providerFormPayload({autoDetect = false} = {}) {
        const editingProvider = getSavedProvider(editingProviderId);
        return {
            connectionId: editingProviderId,
            providerType: autoDetect
                ? "auto"
                : (detectedProvider?.providerType || editingProvider?.providerType || "auto"),
            apiKey: els.apiKeyInput?.value.trim() || "",
            baseUrl: detectedProvider?.baseUrl || els.apiBaseUrlInput?.value.trim() || editingProvider?.baseUrl || "",
        };
    }

    async function detectProviderModels() {
        const payload = providerFormPayload({autoDetect: true});
        setProviderStatus("Detecting models...");
        els.detectModelsButton.disabled = true;

        try {
            const response = await apiFetch("/api/providers/detect-models", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || data.status || "Could not detect models.");
            }

            detectedProvider = data;
            if (els.apiBaseUrlInput && data.baseUrl) {
                els.apiBaseUrlInput.value = data.baseUrl;
            }
            if (els.manualModelInput) {
                els.manualModelInput.value = data.defaultModel || els.manualModelInput.value;
            }
            renderProviderSettings();
            setProviderStatus(
                data.models?.length
                    ? `${data.provider || "Provider"} \u00b7 Detected ${data.models.length} model${data.models.length === 1 ? "" : "s"}`
                    : `${data.provider || "Provider"} \u00b7 No models returned. Enter a model manually.`,
                false,
            );
        } catch (error) {
            setProviderStatus(error.message || "Model detection failed", true);
            showToast(error.message || "Model detection failed", "error");
        } finally {
            els.detectModelsButton.disabled = false;
        }
    }

    async function testProviderConnection() {
        setProviderStatus("Testing connection...");
        els.testConnectionButton.disabled = true;

        try {
            const response = await apiFetch("/api/providers/test", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(providerFormPayload()),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.status || data.error || "Connection test failed.");
            }

            setProviderStatus(data.status || "Connected");
            showToast(data.status || "Connected");
        } catch (error) {
            setProviderStatus(error.message || "Connection test failed", true);
            showToast(error.message || "Connection test failed", "error");
        } finally {
            els.testConnectionButton.disabled = false;
        }
    }

    async function saveProviderSettings(event) {
        event.preventDefault();
        const payload = providerFormPayload();
        const editingProvider = getSavedProvider(editingProviderId);
        const models = detectedProvider?.models || editingProvider?.models || [];

        if (payload.providerType === "auto") {
            showToast("Detect the provider before saving", "error");
            return;
        }

        payload.models = models;
        payload.selectedModel = els.detectedModelSelect?.value || els.manualModelInput?.value.trim() || "";

        if (!payload.selectedModel) {
            showToast("Select or enter a model", "error");
            return;
        }

        setProviderStatus("Saving provider...");

        try {
            const response = await apiFetch("/api/providers", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not save provider.");
            }

            setProviderWorkspace(data);
            editingProviderId = data.savedProvider?.id || editingProviderId;
            detectedProvider = data.savedProvider ? {
                providerType: data.savedProvider.providerType,
                provider: data.savedProvider.provider,
                baseUrl: data.savedProvider.baseUrl,
                models: data.savedProvider.models,
                defaultModel: data.savedProvider.selectedModel,
            } : detectedProvider;
            if (els.apiKeyInput) {
                els.apiKeyInput.value = "";
                els.apiKeyInput.placeholder = data.savedProvider?.maskedApiKey || "Paste a new key to update";
            }
            renderProviderSettings();
            setProviderStatus("Connected");
            showToast("Provider saved and activated");
        } catch (error) {
            setProviderStatus(error.message || "Could not save provider", true);
            showToast(error.message || "Could not save provider", "error");
        }
    }

    async function activateProvider(connectionId) {
        const provider = getSavedProvider(connectionId);
        if (!provider || provider.isEnvironment) {
            return;
        }

        try {
            const response = await apiFetch(`/api/providers/${encodeURIComponent(connectionId)}/activate`, {
                method: "POST",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not switch provider.");
            }

            setProviderWorkspace(data);
            renderProviderSettings();
            renderControls();
            showToast(`Using ${getProviderModelName(data.activeProvider)}`);
        } catch (error) {
            showToast(error.message || "Could not switch provider", "error");
            renderActiveProviderSwitcher();
        }
    }

    function editProvider(connectionId) {
        const provider = getSavedProvider(connectionId);
        if (!provider) {
            return;
        }

        editingProviderId = provider.id;
        detectedProvider = {
            providerType: provider.providerType,
            provider: provider.provider,
            baseUrl: provider.baseUrl,
            models: provider.models,
            defaultModel: provider.selectedModel,
        };
        els.providerConnectionId.value = provider.id;
        els.apiKeyInput.value = "";
        els.apiKeyInput.placeholder = provider.maskedApiKey || "Paste a new key to update";
        els.apiBaseUrlInput.value = provider.baseUrl || "";
        els.manualModelInput.value = provider.selectedModel || "";
        renderProviderSettings();
        openSettingsSection("provider");
    }

    async function updateSavedProviderModel() {
        if (!editingProviderId) {
            return;
        }

        const selectedModel = els.detectedModelSelect?.value || els.manualModelInput?.value.trim() || "";
        if (!selectedModel) {
            return;
        }

        try {
            const response = await apiFetch(`/api/providers/${encodeURIComponent(editingProviderId)}`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({selectedModel}),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not change model.");
            }

            setProviderWorkspace(data);
            const editingProvider = getSavedProvider(editingProviderId);
            if (detectedProvider && editingProvider) {
                detectedProvider.defaultModel = editingProvider.selectedModel;
            }
            renderProviderSettings();
            showToast(`Using ${getProviderModelName(data.activeProvider)}`);
        } catch (error) {
            showToast(error.message || "Could not change model", "error");
        }
    }

    async function deleteProvider(connectionId) {
        try {
            const response = await apiFetch(`/api/providers/${encodeURIComponent(connectionId)}`, {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not delete provider.");
            }

            if (editingProviderId === connectionId) {
                editingProviderId = "";
                detectedProvider = null;
            }
            setProviderWorkspace(data);
            renderProviderSettings();
            showToast("Provider removed");
        } catch (error) {
            showToast(error.message || "Could not delete provider", "error");
        }
    }

    function renderSidebar() {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const conversations = [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
        const visibleConversations = conversations.filter((conversation) =>
            conversation.title.toLowerCase().includes(normalizedSearch)
        );

        els.sidebar?.classList.toggle("search-open", isSearchOpen);
        document.body.classList.toggle("search-open", isSearchOpen);
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

    function renderControls() {
        const resolvedTheme = getResolvedTheme();
        const themeIcon = resolvedTheme === "dark" ? "light_mode" : "dark_mode";
        const themeLabel = resolvedTheme === "dark" ? "Light" : "Dark";
        els.themeToggleButton.innerHTML = `
            <span class="material-symbols-outlined" aria-hidden="true">${themeIcon}</span>
            <span class="theme-toggle-fallback">${themeLabel}</span>
        `;
        els.themeToggleButton.setAttribute("aria-label", `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`);

        document.querySelectorAll("[data-theme-option]").forEach((button) => {
            button.classList.toggle("active", button.dataset.themeOption === state.theme);
        });

        if (els.autoScrollToggle) {
            els.autoScrollToggle.checked = state.settings.autoScroll;
        }

        if (els.clearAllButton) {
            els.clearAllButton.disabled = state.conversations.length === 0;
        }

        renderActiveProviderSwitcher();
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
                const previewButton = document.createElement("button");
                previewButton.type = "button";
                previewButton.className = "attachment-image-trigger";
                previewButton.dataset.action = "open-image-preview";
                previewButton.setAttribute("aria-label", `Open preview for ${attachment.name}`);

                const preview = document.createElement("img");
                preview.src = getAttachmentPreviewSource(attachment);
                preview.alt = attachment.name || "Attached image";
                preview.className = "attachment-preview";
                previewButton.appendChild(preview);
                chip.appendChild(previewButton);
            } else {
                const icon = document.createElement("i");
                icon.dataset.lucide = "file-text";
                chip.appendChild(icon);
            }

            const name = document.createElement("span");
            name.textContent = attachment.name;
            chip.appendChild(name);

            const size = document.createElement("small");
            size.textContent = attachment.isReading ? "Preparing" : formatBytes(attachment.size);
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
                <span>Processing file</span>
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

    function createTypingIndicator() {
        const wrapper = document.createElement("div");
        wrapper.className = "typing-indicator";
        wrapper.innerHTML = `
            <span>Thinking...</span>
            <span class="typing-dots" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
            </span>
        `;
        return wrapper;
    }

    function splitMessageAttachments(attachments = []) {
        return {
            images: attachments.filter((attachment) => attachment.kind === "image"),
            files: attachments.filter((attachment) => attachment.kind !== "image"),
        };
    }

    function createMessageImageGrid(attachments) {
        const grid = document.createElement("div");
        grid.className = `message-image-grid image-count-${Math.min(attachments.length, 4)}`;

        attachments.forEach((attachment) => {
            const previewButton = document.createElement("button");
            previewButton.type = "button";
            previewButton.className = "message-image-trigger";
            previewButton.dataset.action = "open-image-preview";
            previewButton.dataset.attachmentId = attachment.id || "";
            previewButton.setAttribute("aria-label", `Open image preview${attachment.name ? ` for ${attachment.name}` : ""}`);

            const preview = document.createElement("img");
            preview.src = getAttachmentPreviewSource(attachment);
            preview.alt = attachment.name || "Attached image";
            preview.className = "message-inline-image";
            preview.loading = "lazy";
            previewButton.appendChild(preview);
            grid.appendChild(previewButton);
        });

        return grid;
    }

    function createAttachmentPills(attachments) {
        const container = document.createElement("div");
        container.className = "message-attachments";

        attachments.forEach((attachment) => {
            const pill = document.createElement("span");
            pill.className = "attachment-pill";
            pill.dataset.attachmentId = attachment.id || "";
            const icon = document.createElement("i");
            icon.dataset.lucide = "file-text";
            pill.appendChild(icon);

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
        const { images: imageAttachments, files: fileAttachments } = splitMessageAttachments(message.attachments || []);

        const meta = document.createElement("div");
        meta.className = "message-meta";

        if (message.role === "ai") {
            meta.innerHTML = `
                ${message.isError ? '<span class="status-chip error">error</span>' : ""}
                ${message.isStopped ? '<span class="status-chip stopped">stopped</span>' : ""}
            `.trim();
        } else {
            meta.textContent = "You";
        }

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";

        const content = document.createElement("div");
        content.className = "message-content";

        if (message.role === "user" && imageAttachments.length) {
            content.appendChild(createMessageImageGrid(imageAttachments));
        }

        if (message.isLoading && !message.text) {
            content.appendChild(createTypingIndicator());
        } else {
            content.appendChild(renderMessageContent(message.text, message.isError, {
                markdown: message.role === "ai",
            }));
        }

        bubble.appendChild(content);

        if (meta.textContent.trim()) {
            shell.appendChild(meta);
        }

        if (fileAttachments.length) {
            shell.appendChild(createAttachmentPills(fileAttachments));
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
            <span class="empty-kicker">Nexa AI</span>
            <h2>Start a focused chat session.</h2>
            <p>Ask a question, attach files, and keep useful conversations organized in the history panel.</p>
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

    function updateRenderedMessage(message, options = {}) {
        const existing = els.chatThread.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);

        if (!existing) {
            renderChat(options);
            return;
        }

        const shouldScroll = options.forceScroll || (state.settings.autoScroll && isNearBottom());
        existing.replaceWith(createMessageElement(message));
        renderIcons();

        if (shouldScroll) {
            requestAnimationFrame(scrollMessagesToBottom);
        }
    }

    function renderApp(options = {}) {
        applyTheme();
        renderSidebar();
        renderTopbar();
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
            const assistantMessage = currentAssistantId ? getMessageById(currentAssistantId) : null;

            if (assistantMessage) {
                updateRenderedMessage(assistantMessage, { forceScroll: true });
            } else {
                renderChat({ forceScroll: true });
            }
            renderIcons();
        });
    }

    function setLoading(isLoading, assistantId = null) {
        isSending = isLoading;
        currentAssistantId = assistantId;
        syncComposerState();
    }

    async function streamAIResponse(payload, onEvent) {
        abortController = new AbortController();
        const response = await apiFetch("/api/chat/stream", {
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
        const conversation = getActiveConversation();
        const payload = {
            message: userMessage.text,
            attachments: userMessage.attachments || [],
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            userMessageId: userMessage.id,
            assistantMessageId: assistantMessage.id,
        };

        setLoading(true, assistantMessage.id);
        renderApp({ forceScroll });

        try {
            await streamAIResponse(payload, (event) => {
                if (event.type === "meta") {
                    assistantMessage.provider = event.provider || assistantMessage.provider || null;
                    assistantMessage.model = event.model || assistantMessage.model || null;
                    if (event.conversationId) {
                        conversation.id = event.conversationId;
                        state.activeConversationId = event.conversationId;
                    }
                    if (event.userMessageId) {
                        userMessage.id = event.userMessageId;
                    }
                    if (event.assistantMessageId) {
                        assistantMessage.id = event.assistantMessageId;
                        currentAssistantId = assistantMessage.id;
                    }
                    if (event.conversation?.id) {
                        const normalized = normalizeConversation(event.conversation);
                        const index = state.conversations.findIndex((item) => item.id === normalized.id);

                        if (index >= 0) {
                            state.conversations[index] = {
                                ...state.conversations[index],
                                ...normalized,
                                messages: state.conversations[index].messages,
                            };
                        }
                    }
                    return;
                }

                if (event.type === "token" && event.text) {
                    assistantMessage.text += event.text;
                    assistantMessage.isLoading = false;
                    renderStreamingUpdate();
                    return;
                }

                if (event.type === "done") {
                    assistantMessage.provider = event.provider || assistantMessage.provider || null;
                    assistantMessage.model = event.model || assistantMessage.model || null;
                }
            });

            if (!assistantMessage.text.trim()) {
                assistantMessage.text = "The AI service did not return a response. Please try again.";
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
        const attachments = pendingAttachments.map(stripTransientAttachmentFields);

        if (!rawText && attachments.length === 0) {
            els.messageInput.focus();
            return;
        }

        const text = rawText || "Please analyze the attached file.";
        const wasEmpty = conversation.messages.length === 0;
        const userMessage = createMessage("user", text, {
            attachments,
        });
        const assistantMessage = createMessage("ai", "", {
            isLoading: true,
        });

        conversation.messages.push(userMessage, assistantMessage);
        conversation.updatedAt = Date.now();

        if (wasEmpty || conversation.title === "New chat") {
            conversation.title = getTitleFromMessage(text, attachments);
        }

        cleanupPendingAttachmentUrls();
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
        assistantMessage.provider = null;
        assistantMessage.model = null;
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

    async function createNewConversation() {
        const conversation = createConversation();
        state.conversations.unshift(conversation);
        state.activeConversationId = conversation.id;
        searchTerm = "";
        isSearchOpen = false;
        cleanupPendingAttachmentUrls();
        pendingAttachments = [];
        if (els.searchInput) {
            els.searchInput.value = "";
        }
        openMenuId = null;
        renderApp({ forceScroll: true });
        els.messageInput.focus();

        if (mobileSidebarQuery.matches) {
            setSidebarOpen(false);
        }

        try {
            const response = await apiFetch("/api/conversations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    id: conversation.id,
                    title: conversation.title,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not create conversation.");
            }

            if (data.conversation?.id) {
                Object.assign(conversation, normalizeConversation(data.conversation));
                state.activeConversationId = conversation.id;
                renderApp({ forceScroll: true });
            }
        } catch (error) {
            showToast(error.message || "Could not create conversation", "error");
        }
    }

    async function clearAllConversations() {
        const conversation = createConversation();
        state.conversations = [conversation];
        state.activeConversationId = conversation.id;
        cleanupPendingAttachmentUrls();
        pendingAttachments = [];
        openMenuId = null;
        renderApp({ forceScroll: true });
        showToast("Chat history cleared");

        try {
            const response = await apiFetch("/api/conversations", {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not clear history.");
            }

            if (data.conversation?.id) {
                state.conversations = [normalizeConversation(data.conversation)];
                state.activeConversationId = state.conversations[0].id;
                renderApp({ forceScroll: true });
            }
        } catch (error) {
            showToast(error.message || "Could not clear history", "error");
            await loadConversations();
        }
    }

    async function deleteConversation(conversationId) {
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

        try {
            const response = await apiFetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not delete conversation.");
            }
        } catch (error) {
            showToast(error.message || "Could not delete conversation", "error");
            await loadConversations();
        }
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

    async function saveRename() {
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

        try {
            const response = await apiFetch(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: nextTitle,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not rename conversation.");
            }

            if (data.conversation?.id) {
                Object.assign(conversation, normalizeConversation(data.conversation));
                renderApp();
            }
        } catch (error) {
            showToast(error.message || "Could not rename conversation", "error");
            await loadConversations();
        }
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

    async function persistMessageFeedback(message) {
        try {
            const response = await apiFetch(`/api/messages/${encodeURIComponent(message.id)}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    feedback: message.feedback || "",
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not save feedback.");
            }
        } catch (error) {
            showToast(error.message || "Could not save feedback", "error");
        }
    }

    async function persistMessageDelete(messageId) {
        try {
            const response = await apiFetch(`/api/messages/${encodeURIComponent(messageId)}`, {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not delete response.");
            }
        } catch (error) {
            showToast(error.message || "Could not delete response", "error");
            await loadConversations();
        }
    }

    function findAttachmentFromElement(element) {
        const attachmentElement = element?.closest("[data-attachment-id]");
        const attachmentId = attachmentElement?.dataset.attachmentId;

        if (!attachmentId) {
            return null;
        }

        const pendingAttachment = pendingAttachments.find((attachment) => attachment.id === attachmentId);

        if (pendingAttachment) {
            return pendingAttachment;
        }

        for (const conversation of state.conversations) {
            for (const message of conversation.messages || []) {
                const attachment = (message.attachments || []).find((item) => item.id === attachmentId);

                if (attachment) {
                    return attachment;
                }
            }
        }

        return null;
    }

    function openImagePreview(attachment) {
        const source = getAttachmentPreviewSource(attachment);

        if (!source) {
            showToast("Image preview is still loading", "error");
            return;
        }

        openDialog(els.imagePreviewDialog, els.imagePreviewCloseButton);

        if (els.imagePreviewTitle) {
            els.imagePreviewTitle.textContent = attachment.name || "Image preview";
        }

        if (els.imagePreviewLarge) {
            els.imagePreviewLarge.src = source;
            els.imagePreviewLarge.alt = attachment.name || "Attached image";
        }

        if (els.imagePreviewMeta) {
            els.imagePreviewMeta.textContent = `${attachment.mimeType || attachment.mime_type || "image"} · ${formatBytes(Number(attachment.size) || 0)}`;
        }
    }

    function closeImagePreview() {
        closeDialog(els.imagePreviewDialog);

        if (els.imagePreviewLarge) {
            els.imagePreviewLarge.removeAttribute("src");
            els.imagePreviewLarge.alt = "";
        }
    }

    function openDialog(dialog, focusTarget = null) {
        closeAllDialogs();
        if (!dialog) {
            return;
        }
        dialog.classList.add("open");
        dialog.setAttribute("aria-hidden", "false");
        window.setTimeout(() => {
            const target = focusTarget || dialog.querySelector("button, input, select, textarea");
            target?.focus();
        }, 40);
    }

    function closeDialog(dialog) {
        if (!dialog) {
            return;
        }
        dialog.classList.remove("open");
        dialog.setAttribute("aria-hidden", "true");
    }

    function closeAllDialogs() {
        [els.settingsDialog, els.renameDialog, els.confirmDialog, els.imagePreviewDialog].forEach((dialog) => closeDialog(dialog));
        if (els.imagePreviewLarge) {
            els.imagePreviewLarge.removeAttribute("src");
            els.imagePreviewLarge.alt = "";
        }
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

    function openSettingsSection(sectionName = null) {
        openDialog(els.settingsDialog);

        if (!sectionName) {
            return;
        }

        window.setTimeout(() => {
            const section = document.querySelector(`[data-settings-section="${sectionName}"]`);
            const focusTarget = section?.querySelector("select, input, button");
            section?.scrollIntoView({ block: "nearest" });
            focusTarget?.focus();
        }, 80);
    }

    function autosizeInput() {
        els.messageInput.style.height = "auto";
        els.messageInput.style.height = `${Math.min(190, els.messageInput.scrollHeight)}px`;
        syncComposerState();
    }

    function isSupportedTextFile(file) {
        if (window.NexaAiUploads?.isSupportedTextFile) {
            return window.NexaAiUploads.isSupportedTextFile(file);
        }

        const extension = file.name.includes(".")
            ? file.name.split(".").pop().toLowerCase()
            : "";

        return TEXT_EXTENSIONS.has(extension) ||
            file.type === "text/plain" ||
            file.type === "text/markdown" ||
            file.type === "application/pdf" ||
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    function getUnsupportedFileMessage(file) {
        if (window.NexaAiUploads?.unsupportedFileMessage) {
            return window.NexaAiUploads.unsupportedFileMessage(file);
        }

        return `${file.name} is not supported. Upload txt, md, pdf, docx, or image files.`;
    }

    function isSupportedImageFile(file) {
        if (window.NexaAiUploads?.isSupportedImageFile) {
            return window.NexaAiUploads.isSupportedImageFile(file);
        }

        const extension = file.name.includes(".")
            ? file.name.split(".").pop().toLowerCase()
            : "";

        return IMAGE_MIME_TYPES.has(file.type) || ["png", "jpg", "jpeg", "webp", "gif"].includes(extension);
    }

    function getImageMimeType(file) {
        if (IMAGE_MIME_TYPES.has(file.type)) {
            return file.type;
        }

        const extension = file.name.includes(".")
            ? file.name.split(".").pop().toLowerCase()
            : "";
        const fallbackTypes = {
            gif: "image/gif",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
        };

        return fallbackTypes[extension] || "image/png";
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(String(reader.result || "")));
            reader.addEventListener("error", () => reject(reader.error || new Error("Could not read image.")));
            reader.readAsDataURL(file);
        });
    }

    async function uploadFileToServer(file) {
        if (window.NexaAiUploads?.uploadFile) {
            return window.NexaAiUploads.uploadFile(file);
        }

        const formData = new FormData();
        formData.append("file", file);

        const response = await apiFetch("/api/uploads", {
            method: "POST",
            body: formData,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Could not upload ${file.name}`);
        }

        return data.attachment;
    }

    async function addFiles(files) {
        const selectedFiles = Array.from(files || []);

        if (selectedFiles.length === 0) {
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

                if (!isSupportedImageFile(file) && !isSupportedTextFile(file)) {
                    showToast(getUnsupportedFileMessage(file), "error");
                    continue;
                }

                if (file.size > MAX_ATTACHMENT_BYTES) {
                    showToast(`${file.name} is larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}`, "error");
                    continue;
                }

                try {
                    const attachment = await uploadFileToServer(file);
                    pendingAttachments.push({
                        id: attachment.id || createId(attachment.kind === "image" ? "image" : "file"),
                        ...attachment,
                        previewUrl: attachment.previewUrl || attachment.url || attachment.dataUrl || "",
                    });
                } catch (error) {
                    showToast(error.message || `Could not upload ${file.name}`, "error");
                }
            }
        } finally {
            isProcessingAttachment = false;
            els.fileInput.value = "";
            renderApp();
        }
    }

    async function addImages(files) {
        const selectedFiles = Array.from(files || []);

        if (selectedFiles.length === 0) {
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

                try {
                    const attachment = await uploadFileToServer(file);
                    pendingAttachments.push({
                        id: attachment.id || createId("image"),
                        ...attachment,
                        previewUrl: attachment.previewUrl || attachment.url || attachment.dataUrl || "",
                    });
                    renderApp();
                } catch (error) {
                    showToast(error.message || `Could not upload ${file.name}`, "error");
                }
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
        const attachment = pendingAttachments.find((item) => item.id === attachmentId);
        revokeAttachmentObjectUrl(attachment);
        pendingAttachments = pendingAttachments.filter((item) => item.id !== attachmentId);
        renderApp();
    }

    function bindEvents() {
        els.newChatButton.addEventListener("click", createNewConversation);
        document.querySelectorAll("[data-action='focus-search']").forEach((button) => {
            button.addEventListener("click", () => {
                isSearchOpen = true;
                renderApp();
                window.setTimeout(() => els.searchInput?.focus(), 80);

                if (mobileSidebarQuery.matches) {
                    setSidebarOpen(false);
                }
            });
        });
        document.querySelectorAll("[data-action='open-settings']").forEach((button) => {
            button.addEventListener("click", () => {
                openSettingsSection();

                if (mobileSidebarQuery.matches) {
                    setSidebarOpen(false);
                }
            });
        });
        document.querySelectorAll("[data-action='open-provider-settings']").forEach((button) => {
            button.addEventListener("click", () => {
                openSettingsSection("provider");

                if (mobileSidebarQuery.matches) {
                    setSidebarOpen(false);
                }
            });
        });
        document.querySelectorAll("[data-action='open-file-upload']").forEach((button) => {
            button.addEventListener("click", () => {
                els.fileInput.click();

                if (mobileSidebarQuery.matches) {
                    setSidebarOpen(false);
                }
            });
        });
        els.clearAllButton.addEventListener("click", () => {
            openConfirmDialog({
                title: "Clear history?",
                message: "This removes every saved conversation for your account.",
                actionLabel: "Clear history",
                onConfirm: clearAllConversations,
            });
        });
        els.clearHistoryButton.addEventListener("click", () => {
            openConfirmDialog({
                title: "Clear history?",
                message: "This removes every saved conversation for your account.",
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
        els.settingsButton.addEventListener("click", () => openSettingsSection());
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
        els.imagePreviewCloseButton?.addEventListener("click", closeImagePreview);
        els.themeToggleButton.addEventListener("click", cycleTheme);
        document.querySelectorAll("[data-theme-option]").forEach((button) => {
            button.addEventListener("click", () => setThemePreference(button.dataset.themeOption));
        });
        els.autoScrollToggle?.addEventListener("change", () => {
            state.settings.autoScroll = els.autoScrollToggle.checked;
            saveState();
        });
        els.activeProviderSelect?.addEventListener("change", () => activateProvider(els.activeProviderSelect.value));
        els.detectModelsButton?.addEventListener("click", detectProviderModels);
        els.testConnectionButton?.addEventListener("click", testProviderConnection);
        els.providerForm?.addEventListener("submit", saveProviderSettings);
        els.detectedModelSelect?.addEventListener("change", updateSavedProviderModel);
        els.manualModelInput?.addEventListener("change", updateSavedProviderModel);
        els.savedProviderList?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-provider-action]");
            const item = event.target.closest("[data-provider-id]");

            if (!button || !item) {
                return;
            }

            const connectionId = item.dataset.providerId;
            const action = button.dataset.providerAction;

            if (action === "activate") {
                activateProvider(connectionId);
            } else if (action === "edit") {
                editProvider(connectionId);
            } else if (action === "delete") {
                const provider = getSavedProvider(connectionId);
                openConfirmDialog({
                    title: "Remove provider?",
                    message: `This removes ${provider?.provider || "this provider"} and its saved credential.`,
                    actionLabel: "Remove provider",
                    onConfirm: () => deleteProvider(connectionId),
                });
            }
        });
        els.attachButton.addEventListener("click", () => els.fileInput.click());
        els.fileInput.addEventListener("change", () => addFiles(els.fileInput.files));
        els.imageButton.addEventListener("click", () => els.imageInput.click());
        els.imageInput.addEventListener("change", () => addImages(els.imageInput.files));
        els.stopButton.addEventListener("click", stopGeneration);
        els.mobileMenuButton?.addEventListener("click", () => setSidebarOpen(true));
        els.sidebarCloseButton?.addEventListener("click", () => setSidebarOpen(false));
        els.sidebarScrim?.addEventListener("click", () => setSidebarOpen(false));
        els.sidebar?.addEventListener("mouseenter", () => setDesktopSidebarExpanded(true));
        els.sidebar?.addEventListener("mouseleave", () => setDesktopSidebarExpanded(false));
        els.sidebar?.addEventListener("focusin", () => setDesktopSidebarExpanded(true));
        els.sidebar?.addEventListener("focusout", (event) => {
            if (!els.sidebar.contains(event.relatedTarget) && !els.sidebar.matches(":hover")) {
                setDesktopSidebarExpanded(false);
            }
        });

        els.attachmentTray.addEventListener("click", (event) => {
            const previewButton = event.target.closest("[data-action='open-image-preview']");

            if (previewButton) {
                const attachment = findAttachmentFromElement(previewButton);

                if (attachment) {
                    openImagePreview(attachment);
                }
                return;
            }

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

            const imagePreviewButton = event.target.closest("[data-action='open-image-preview']");

            if (imagePreviewButton) {
                const attachment = findAttachmentFromElement(imagePreviewButton);

                if (attachment) {
                    openImagePreview(attachment);
                }
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
                persistMessageFeedback(message);
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
                persistMessageDelete(message.id);
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
                if (event.target === els.imagePreviewDialog) {
                    closeImagePreview();
                } else {
                    closeDialog(event.target);
                }
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

        desktopSidebarQuery.addEventListener("change", () => setDesktopSidebarExpanded(false, true));

        window.addEventListener("beforeunload", () => cleanupPendingAttachmentUrls());
    }

    bindEvents();
    renderApp({ forceScroll: true });
    loadProviders();
    loadConversations().then(migrateLegacyLocalHistory);
});
