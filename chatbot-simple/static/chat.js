import { createApiClient } from "./js/api.js";
import {
    findMathToken,
    normalizeEscapedLatex,
    normalizeLatexSource,
    renderKatexMathInElement,
    restoreMathPlaceholders,
} from "./js/render/markdown.js";
import {
    getAttachmentPreviewSource,
    renderPendingAttachmentTray,
} from "./js/render/attachments.js";
import {
    clearImagePreview,
    closeDialogElement,
    configureConfirmDialog,
    openDialogElement,
    setImagePreview,
} from "./js/features/dialogs.js";
import { createFeedbackPayload, createResponseFooter } from "./js/features/feedback.js";
import { replaceCitationMarkers } from "./js/render/citations.js";
import {
    getProviderModelName,
    renderActiveProviderSwitcher as renderProviderSwitcher,
    renderProviderSettingsPanel,
    setProviderStatusElements,
} from "./js/features/providers.js";
import { renderConversationList } from "./js/render/conversations.js";
import {
    createMessageElement as createRenderedMessageElement,
} from "./js/render/messages.js";
import {
    appendStreamingChunk as appendRenderedStreamingChunk,
    beginStreamingRender as beginRenderedStreamingRender,
    finalizeStreamingRender as finalizeRenderedStreamingRender,
    retargetStreamingRender as retargetRenderedStreamingRender,
} from "./js/render/streaming.js";
import { initModelSwitcher } from "./js/components/modelSwitcher.js";
import { createConversation, createId, createMessage, readJsonStorage } from "./js/state.js";
import {
    GLOBAL_STORAGE_KEY,
    IMAGE_MIME_TYPES,
    INITIAL_RENDERED_MESSAGES,
    LEGACY_STORAGE_KEY,
    MAX_ATTACHMENT_BYTES,
    MAX_ATTACHMENTS,
    RENDERED_MESSAGES_INCREMENT,
    TEXT_EXTENSIONS,
    THEME_STORAGE_KEY,
    WELCOME_PROMPTS,
    storageKeysForUser,
} from "./js/utils/constants.js";
import { escapeAttribute, escapeHtml, renderIcons } from "./js/utils/dom.js";
import { formatBytes, formatDate } from "./js/utils/format.js";


export function initChatWorkspace() {
document.addEventListener("DOMContentLoaded", () => {
    const rawUserId = document.body?.dataset.userId || "guest";
    const CURRENT_USER = {
        id: rawUserId,
        name: document.body?.dataset.userName || "Guest",
        email: document.body?.dataset.userEmail || "",
        authenticated: document.body?.dataset.authenticated === "true",
    };
    const {
        userStorageId: USER_STORAGE_ID,
        storageKey: STORAGE_KEY,
        historyStorageKey: HISTORY_STORAGE_KEY,
        preferencesStorageKey: PREFERENCES_STORAGE_KEY,
        migrationKey: MIGRATION_KEY,
    } = storageKeysForUser(rawUserId);
    const apiClient = window.NexaAiApi || createApiClient(document.body?.dataset.csrfToken || "");
    window.NexaAiApi = apiClient;
    const apiFetch = apiClient.apiFetch;

    const els = {
        html: document.documentElement,
        metaTheme: document.querySelector('meta[name="theme-color"]'),
        sidebar: document.querySelector(".sidebar"),
        conversationList: document.querySelector(".conversation-list"),
        newChatButton: document.querySelector(".new-chat-button"),
        clearAllButton: document.querySelector(".clear-all-button"),
        searchToggleButton: document.querySelector(".search-toggle-button"),
        searchInput: document.querySelector(".conversation-search-input"),
        renameChatButton: document.querySelector(".rename-chat-button"),
        themeToggleButton: document.querySelector(".theme-toggle-button"),
        activeModelSwitcher: document.querySelector(".active-model-switcher"),
        activeModelPrefix: document.querySelector(".active-model-prefix"),
        activeProviderSelect: document.querySelector(".active-provider-select"),
        personalizationForm: document.querySelector(".personalization-form"),
        personalizationTextarea: document.querySelector(".personalization-textarea"),
        personalizationStatus: document.querySelector(".personalization-status"),
        memoryList: document.querySelector(".memory-list"),
        memoryCount: document.querySelector(".memory-count"),
        memoryForm: document.querySelector(".memory-form"),
        memoryEditId: document.querySelector(".memory-edit-id"),
        memoryInput: document.querySelector(".memory-input"),
        memoryCancelEditButton: document.querySelector(".memory-cancel-edit-button"),
        memorySaveButton: document.querySelector(".memory-save-button"),
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
        storagePlanBadge: document.querySelector(".storage-plan-badge"),
        storageWarning: document.querySelector(".storage-warning"),
        storageUsageLabel: document.querySelector(".storage-usage-label"),
        storagePercentLabel: document.querySelector(".storage-percent-label"),
        storageProgressBar: document.querySelector(".storage-progress-bar"),
        storageBreakdown: document.querySelector(".storage-breakdown"),
        documentSearchInput: document.querySelector(".document-search-input"),
        documentSortSelect: document.querySelector(".document-sort-select"),
        documentList: document.querySelector(".document-list"),
        autoScrollToggle: document.querySelector(".auto-scroll-toggle"),
        activeTitle: document.querySelector(".active-title"),
        messageForm: document.querySelector(".composer"),
        messageInput: document.querySelector(".message-input"),
        sendButton: document.querySelector(".send-button"),
        stopButton: document.querySelector(".stop-button"),
        attachButton: document.querySelector(".attach-button"),
        fileInput: document.querySelector(".file-input"),
        attachmentTray: document.querySelector(".attachment-tray"),
        chatThread: document.querySelector(".chat-thread"),
        messagesViewport: document.querySelector(".messages"),
        mobileMenuButton: document.querySelector(".mobile-menu-button"),
        sidebarCloseButton: document.querySelector(".sidebar-close-button"),
        sidebarScrim: document.querySelector(".sidebar-scrim"),
        sidebarToggleButtons: Array.from(document.querySelectorAll(".sidebar-toggle-lock")),
        settingsDialog: document.querySelector(".settings-dialog"),
        settingsCloseButton: document.querySelector(".dialog-close-button"),
        usageDialog: document.querySelector(".usage-dialog"),
        usageCloseButton: document.querySelector(".usage-close-button"),
        personalizationDialog: document.querySelector(".personalization-dialog"),
        personalizationCloseButton: document.querySelector(".personalization-close-button"),
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
        imagePreviewLarge: document.querySelector(".image-preview-large"),
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
    let sidebarPinnedOpen = false;

    let legacyConversationsForMigration = [];
    let state = loadState();
    let providerWorkspace = {
        providers: [],
        activeProvider: null,
        activeProviderId: "",
        supportedProviders: [],
    };
    let personalizationWorkspace = {
        personalizationText: "",
        memories: [],
        loaded: false,
        editingMemoryId: "",
        isSavingPersonalization: false,
        isSavingMemory: false,
    };
    let storageWorkspace = {
        storage: null,
        documents: [],
        loaded: false,
        search: "",
        sort: "date-desc",
        deletingId: "",
    };
    let detectedProvider = null;
    let editingProviderId = "";
    let searchTerm = "";
    let isSearchOpen = false;
    let pendingAttachments = [];
    let isSending = false;
    let isProcessingAttachment = false;
    let providerActivationRequestId = 0;
    let abortController = null;
    let currentAssistantId = null;
    let copiedMessageId = null;
    let openMenuId = null;
    let renameTargetId = null;
    let confirmCallback = null;
    let streamingRenderState = null;
    let renderedMessageLimits = {};
    let preferencesSaveTimer = null;
    let welcomePromptIndex = Math.floor(Math.random() * WELCOME_PROMPTS.length);

    const isMemoryDebugEnabled = document.body?.dataset.memoryDebug === "true";

    function memoryDebug(label, details = {}) {
        if (!isMemoryDebugEnabled) {
            return;
        }

        console.warn(`[Nexa memory debug] ${label}`, details);
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
            citations: Array.isArray(message?.citations) ? message.citations : [],
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

    function getRenderedMessageLimit(conversation) {
        const conversationId = conversation?.id || state.activeConversationId || "default";
        const savedLimit = Number(renderedMessageLimits[conversationId]) || INITIAL_RENDERED_MESSAGES;
        const totalMessages = Array.isArray(conversation?.messages) ? conversation.messages.length : 0;

        return Math.min(Math.max(savedLimit, INITIAL_RENDERED_MESSAGES), Math.max(totalMessages, INITIAL_RENDERED_MESSAGES));
    }

    function setRenderedMessageLimit(conversationId, limit) {
        if (!conversationId) {
            return;
        }

        renderedMessageLimits = {
            ...renderedMessageLimits,
            [conversationId]: limit,
        };
    }

    function ensureConversation() {
        if (state.conversations.length === 0) {
            const conversation = createConversation();
            state.conversations.unshift(conversation);
            state.activeConversationId = conversation.id;
            memoryDebug("created fallback conversation", {
                conversationId: conversation.id,
                activeConversationId: state.activeConversationId,
            });
            return conversation;
        }

        memoryDebug("recovered missing active conversation", {
            previousActiveConversationId: state.activeConversationId,
            nextActiveConversationId: state.conversations[0].id,
        });
        state.activeConversationId = state.conversations[0].id;
        return state.conversations[0];
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

    function normalizeDisplayName(value) {
        const name = String(value || "").trim();
        if (!name || /^guest(?:\s+workspace)?$/i.test(name)) {
            return "";
        }

        return name;
    }

    function getGlobalUserField(fieldName) {
        const candidates = [
            window.user,
            window.currentUser,
            window.profile,
            window.auth?.currentUser,
            window.firebase?.auth?.currentUser,
        ];

        for (const candidate of candidates) {
            const value = candidate?.[fieldName];
            if (value) {
                return value;
            }
        }

        return "";
    }

    function getWelcomeName() {
        const displayName = normalizeDisplayName(CURRENT_USER.name) ||
            normalizeDisplayName(getGlobalUserField("displayName")) ||
            normalizeDisplayName(getGlobalUserField("name"));

        if (displayName) {
            return displayName;
        }

        const email = CURRENT_USER.email || getGlobalUserField("email") || "";
        const emailName = String(email).split("@")[0]?.replace(/[._-]+/g, " ").trim();
        return normalizeDisplayName(emailName) || "there";
    }

    function titleCaseName(value) {
        return String(value || "")
            .trim()
            .toLocaleLowerCase("vi-VN")
            .replace(/(^|\s|-)\p{L}/gu, (match) => match.toLocaleUpperCase("vi-VN"));
    }

    function getMobileWelcomeName() {
        const name = getWelcomeName();
        if (!name || /^there$/i.test(name)) {
            return "there";
        }

        const firstName = name.trim().split(/\s+/)[0] || name;
        return titleCaseName(firstName);
    }

    function getTimeBasedGreeting() {
        const hour = new Date().getHours();
        const name = getWelcomeName();

        if (hour >= 5 && hour < 12) {
            return `Good morning, ${name}.`;
        }

        if (hour >= 12 && hour < 18) {
            return `Good afternoon, ${name}.`;
        }

        if (hour >= 18) {
            return `Good evening, ${name}.`;
        }

        return `Working late, ${name}?`;
    }

    function getNextWelcomePromptIndex() {
        if (WELCOME_PROMPTS.length <= 1) {
            return 0;
        }

        let nextIndex = welcomePromptIndex;
        while (nextIndex === welcomePromptIndex) {
            nextIndex = Math.floor(Math.random() * WELCOME_PROMPTS.length);
        }

        return nextIndex;
    }

    function rotateWelcomePrompt() {
        const prompt = els.chatThread?.querySelector(".welcome-prompt");
        const conversation = getActiveConversation();
        const isTyping = document.activeElement === els.messageInput && els.messageInput.value.trim().length > 0;

        if (!prompt || conversation.messages.length > 0 || isTyping || mobileSidebarQuery.matches) {
            return;
        }

        welcomePromptIndex = getNextWelcomePromptIndex();
        prompt.classList.add("is-changing");

        window.setTimeout(() => {
            prompt.textContent = WELCOME_PROMPTS[welcomePromptIndex];
            prompt.classList.remove("is-changing");
        }, 180);
    }

    function getWelcomePromptText() {
        if (mobileSidebarQuery.matches) {
            return `What's next, ${getMobileWelcomeName()}?`;
        }

        return WELCOME_PROMPTS[welcomePromptIndex];
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
            els.metaTheme.setAttribute("content", resolvedTheme === "dark" ? "#050505" : "#fbf8fe");
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

    function setSidebarPinnedOpen(isPinnedOpen) {
        sidebarPinnedOpen = Boolean(isPinnedOpen);
        setDesktopSidebarExpanded(sidebarPinnedOpen, true);
        renderControls();
    }

    function toggleSidebarPinnedOpen() {
        setSidebarPinnedOpen(!document.body.classList.contains("sidebar-expanded"));
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

    function setOptimisticActiveProvider(connectionId) {
        const nextProviders = providerWorkspace.providers.map((provider) => ({
            ...provider,
            isActive: provider.id === connectionId,
        }));
        const activeProvider = nextProviders.find((provider) => provider.id === connectionId) || null;

        providerWorkspace = {
            ...providerWorkspace,
            providers: nextProviders,
            activeProvider,
            activeProviderId: activeProvider?.id || "",
        };
    }

    function renderActiveProviderSwitcher() {
        renderProviderSwitcher(els, providerWorkspace, isSending);
    }

    function setProviderStatus(message, isError = false) {
        setProviderStatusElements(els, message, isError);
    }

    function renderProviderSettings() {
        const editingProvider = getSavedProvider(editingProviderId);
        const models = Array.isArray(detectedProvider?.models)
            ? detectedProvider.models
            : (editingProvider?.models || []);
        const selectedModel = detectedProvider?.defaultModel ||
            editingProvider?.selectedModel ||
            els.detectedModelSelect?.value ||
            "";

        renderProviderSettingsPanel(els, {
            escapeAttribute,
            escapeHtml,
            isSending,
            models,
            providerWorkspace,
            selectedModel,
        });
        renderIcons();
    }

    function resetProviderForm() {
        editingProviderId = "";
        detectedProvider = null;

        if (els.providerConnectionId) {
            els.providerConnectionId.value = "";
        }

        if (els.apiKeyInput) {
            els.apiKeyInput.value = "";
            els.apiKeyInput.placeholder = "Paste API key";
        }

        if (els.apiBaseUrlInput) {
            els.apiBaseUrlInput.value = "";
        }

        if (els.manualModelInput) {
            els.manualModelInput.value = "";
        }
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

    function normalizeMemory(memory) {
        return {
            id: String(memory?.id || ""),
            value: String(memory?.value || ""),
            updatedAt: Number(memory?.updatedAt) || Date.now(),
        };
    }

    function setPersonalizationWorkspace(profileData, memoryData) {
        personalizationWorkspace.personalizationText = String(
            profileData?.personalizationText ||
            profileData?.profile?.personalizationText ||
            profileData?.profile?.personalization_text ||
            "",
        );
        personalizationWorkspace.memories = Array.isArray(memoryData?.memories)
            ? memoryData.memories.map(normalizeMemory).filter((memory) => memory.id && memory.value)
            : [];
        personalizationWorkspace.loaded = true;
    }

    function renderMemorySettings() {
        if (els.personalizationTextarea && document.activeElement !== els.personalizationTextarea) {
            els.personalizationTextarea.value = personalizationWorkspace.personalizationText;
        }

        if (els.memoryCount) {
            els.memoryCount.textContent = `${personalizationWorkspace.memories.length}/30`;
        }

        if (els.memoryList) {
            if (personalizationWorkspace.memories.length === 0) {
                els.memoryList.innerHTML = `<div class="memory-empty">Nexa chưa có memory nào về bạn.</div>`;
            } else {
                els.memoryList.innerHTML = personalizationWorkspace.memories.map((memory) => `
                    <div class="memory-item" data-memory-id="${escapeAttribute(memory.id)}">
                        <p>${escapeHtml(memory.value)}</p>
                        <span class="memory-item-actions">
                            <button type="button" data-memory-action="edit" aria-label="Sửa memory">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button class="delete-memory-button" type="button" data-memory-action="delete" aria-label="Xóa memory">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        </span>
                    </div>
                `).join("");
            }
        }

        if (els.personalizationStatus && !personalizationWorkspace.isSavingPersonalization) {
            els.personalizationStatus.textContent = personalizationWorkspace.loaded ? "" : "Đang tải...";
        }

        if (els.memorySaveButton) {
            els.memorySaveButton.textContent = personalizationWorkspace.editingMemoryId ? "Lưu memory" : "Thêm memory";
            els.memorySaveButton.disabled = personalizationWorkspace.isSavingMemory;
        }

        if (els.memoryCancelEditButton) {
            els.memoryCancelEditButton.hidden = !personalizationWorkspace.editingMemoryId;
        }

        renderIcons();
    }

    async function loadPersonalizationSettings() {
        if (!els.personalizationForm && !els.memoryList) {
            return;
        }

        renderMemorySettings();

        try {
            const [profileResponse, memoryResponse] = await Promise.all([
                apiFetch("/api/personalization"),
                apiFetch("/api/memory"),
            ]);
            const profileData = await profileResponse.json().catch(() => ({}));
            const memoryData = await memoryResponse.json().catch(() => ({}));

            if (!profileResponse.ok) {
                throw new Error(profileData.error || "Could not load personalization.");
            }

            if (!memoryResponse.ok) {
                throw new Error(memoryData.error || "Could not load memories.");
            }

            setPersonalizationWorkspace(profileData, memoryData);
            renderMemorySettings();
        } catch (error) {
            personalizationWorkspace.loaded = true;
            renderMemorySettings();
            showToast(error.message || "Could not load personalization", "error");
        }
    }

    async function savePersonalization(event) {
        event.preventDefault();
        personalizationWorkspace.isSavingPersonalization = true;

        if (els.personalizationStatus) {
            els.personalizationStatus.textContent = "Đang lưu...";
        }

        const saveButton = els.personalizationForm?.querySelector("button[type='submit']");
        if (saveButton) {
            saveButton.disabled = true;
        }

        try {
            const response = await apiFetch("/api/personalization", {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    personalizationText: els.personalizationTextarea?.value || "",
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not save personalization.");
            }

            personalizationWorkspace.personalizationText = data.personalizationText || data.profile?.personalizationText || "";
            if (els.personalizationStatus) {
                els.personalizationStatus.textContent = "Đã lưu";
            }
            showToast("Đã lưu cá nhân hóa");
        } catch (error) {
            if (els.personalizationStatus) {
                els.personalizationStatus.textContent = "";
            }
            showToast(error.message || "Could not save personalization", "error");
        } finally {
            personalizationWorkspace.isSavingPersonalization = false;
            if (saveButton) {
                saveButton.disabled = false;
            }
        }
    }

    function resetMemoryForm() {
        personalizationWorkspace.editingMemoryId = "";

        if (els.memoryEditId) {
            els.memoryEditId.value = "";
        }

        if (els.memoryInput) {
            els.memoryInput.value = "";
        }

        renderMemorySettings();
    }

    function editMemory(memoryId) {
        const memory = personalizationWorkspace.memories.find((item) => item.id === memoryId);

        if (!memory) {
            return;
        }

        personalizationWorkspace.editingMemoryId = memory.id;
        if (els.memoryEditId) {
            els.memoryEditId.value = memory.id;
        }
        if (els.memoryInput) {
            els.memoryInput.value = memory.value;
            els.memoryInput.focus();
        }
        renderMemorySettings();
    }

    async function saveMemory(event) {
        event.preventDefault();
        const value = els.memoryInput?.value.trim() || "";
        const editingId = personalizationWorkspace.editingMemoryId;

        if (!value) {
            showToast("Nhập memory trước khi lưu", "error");
            return;
        }

        personalizationWorkspace.isSavingMemory = true;
        renderMemorySettings();

        try {
            const response = await apiFetch(editingId ? `/api/memory/${encodeURIComponent(editingId)}` : "/api/memory", {
                method: editingId ? "PATCH" : "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({value}),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not save memory.");
            }

            const memory = normalizeMemory(data.memory);

            if (editingId) {
                personalizationWorkspace.memories = personalizationWorkspace.memories.map((item) =>
                    item.id === editingId ? memory : item
                );
            } else if (memory.id) {
                personalizationWorkspace.memories = [memory, ...personalizationWorkspace.memories]
                    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
                    .slice(0, 30);
            }

            resetMemoryForm();
            showToast(editingId ? "Đã cập nhật memory" : "Đã thêm memory");
            await loadPersonalizationSettings();
        } catch (error) {
            showToast(error.message || "Could not save memory", "error");
        } finally {
            personalizationWorkspace.isSavingMemory = false;
            renderMemorySettings();
        }
    }

    async function deleteMemory(memoryId) {
        try {
            const response = await apiFetch(`/api/memory/${encodeURIComponent(memoryId)}`, {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not delete memory.");
            }

            personalizationWorkspace.memories = personalizationWorkspace.memories.filter((memory) => memory.id !== memoryId);
            resetMemoryForm();
            showToast("Đã xóa memory");
        } catch (error) {
            showToast(error.message || "Could not delete memory", "error");
        }
    }

    function normalizeStoragePayload(storage) {
        const usedBytes = Number(storage?.usedBytes ?? storage?.used_bytes) || 0;
        const limitBytes = Number(storage?.limitBytes ?? storage?.limit_bytes) || 0;
        const percentUsed = Number(storage?.percentUsed ?? storage?.percent_used) || (limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0);

        return {
            plan: String(storage?.plan || "free"),
            usedBytes,
            limitBytes,
            remainingBytes: Number(storage?.remainingBytes ?? storage?.remaining_bytes) || Math.max(0, limitBytes - usedBytes),
            percentUsed,
            isWarning: Boolean(storage?.isWarning ?? storage?.is_warning),
            isFull: Boolean(storage?.isFull ?? storage?.is_full),
            breakdown: storage?.breakdown || {},
        };
    }

    function normalizeDocument(document) {
        return {
            id: String(document?.id || ""),
            filename: String(document?.filename || "document"),
            size: Number(document?.size) || 0,
            chunkCount: Number(document?.chunkCount ?? document?.chunk_count) || 0,
            createdAt: Number(document?.createdAt) || 0,
            lastUsedAt: Number(document?.lastUsedAt) || 0,
            url: String(document?.url || ""),
        };
    }

    function documentTimestampLabel(value) {
        return value ? formatDate(value) : "Never used";
    }

    function sortedStorageDocuments() {
        const query = storageWorkspace.search.trim().toLowerCase();
        const documents = storageWorkspace.documents.filter((document) =>
            document.filename.toLowerCase().includes(query)
        );

        documents.sort((left, right) => {
            switch (storageWorkspace.sort) {
                case "date-asc":
                    return left.createdAt - right.createdAt || left.filename.localeCompare(right.filename);
                case "size-desc":
                    return right.size - left.size || left.filename.localeCompare(right.filename);
                case "size-asc":
                    return left.size - right.size || left.filename.localeCompare(right.filename);
                case "name-asc":
                    return left.filename.localeCompare(right.filename);
                case "date-desc":
                default:
                    return right.createdAt - left.createdAt || left.filename.localeCompare(right.filename);
            }
        });

        return documents;
    }

    function renderStorageSettings() {
        const storage = storageWorkspace.storage || normalizeStoragePayload({});
        const percent = Math.max(0, Math.min(100, storage.percentUsed || 0));
        const breakdown = storage.breakdown || {};

        if (els.storagePlanBadge) {
            els.storagePlanBadge.textContent = storage.plan || "Free";
        }

        if (els.storageUsageLabel) {
            els.storageUsageLabel.textContent = `${formatBytes(storage.usedBytes)} / ${formatBytes(storage.limitBytes || 0)}`;
        }

        if (els.storagePercentLabel) {
            els.storagePercentLabel.textContent = `${Math.round(percent)}%`;
        }

        if (els.storageProgressBar) {
            els.storageProgressBar.style.width = `${percent}%`;
            els.storageProgressBar.classList.toggle("full", storage.isFull);
        }

        if (els.storageWarning) {
            els.storageWarning.hidden = !storage.isWarning;
            els.storageWarning.textContent = storage.isFull
                ? `Không thể tải thêm file. Dung lượng hiện tại: ${formatBytes(storage.usedBytes)} / ${formatBytes(storage.limitBytes)}. Hãy xóa file cũ hoặc nâng cấp gói.`
                : "Bạn đã sử dụng 80% dung lượng lưu trữ. Hãy xóa các file không cần thiết hoặc nâng cấp gói.";
        }

        if (els.storageBreakdown) {
            const items = [
                ["Files", breakdown.filesBytes ?? breakdown.files_bytes ?? 0],
                ["Embeddings", breakdown.embeddingsBytes ?? breakdown.embeddings_bytes ?? 0],
                ["Memory", breakdown.memoryBytes ?? breakdown.memory_bytes ?? 0],
                ["Other", breakdown.otherBytes ?? breakdown.other_bytes ?? 0],
            ];
            els.storageBreakdown.innerHTML = items.map(([label, value]) => `
                <div class="storage-breakdown-item">
                    <span>${escapeHtml(label)}</span>
                    <strong>${formatBytes(Number(value) || 0)}</strong>
                </div>
            `).join("");
        }

        if (els.documentSearchInput && document.activeElement !== els.documentSearchInput) {
            els.documentSearchInput.value = storageWorkspace.search;
        }

        if (els.documentSortSelect && document.activeElement !== els.documentSortSelect) {
            els.documentSortSelect.value = storageWorkspace.sort;
        }

        if (els.documentList) {
            const documents = sortedStorageDocuments();

            if (!storageWorkspace.loaded) {
                els.documentList.innerHTML = `<div class="document-empty">Loading documents...</div>`;
            } else if (documents.length === 0) {
                els.documentList.innerHTML = `<div class="document-empty">No uploaded documents found.</div>`;
            } else {
                els.documentList.innerHTML = documents.map((documentItem) => `
                    <div class="document-item" data-document-id="${escapeAttribute(documentItem.id)}">
                        <div class="document-copy">
                            <strong>${escapeHtml(documentItem.filename)}</strong>
                            <span>${formatBytes(documentItem.size)} · ${documentItem.chunkCount} chunks · Uploaded ${documentTimestampLabel(documentItem.createdAt)} · Last used ${documentTimestampLabel(documentItem.lastUsedAt)}</span>
                        </div>
                        <button class="document-delete-button" type="button" data-document-action="delete" aria-label="Delete ${escapeAttribute(documentItem.filename)}" ${storageWorkspace.deletingId === documentItem.id ? "disabled" : ""}>
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                `).join("");
            }
        }

        renderIcons();
    }

    async function loadStorageSettings() {
        if (!els.storageUsageLabel && !els.documentList) {
            return;
        }

        renderStorageSettings();

        try {
            const response = await apiFetch("/api/documents");
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not load storage usage.");
            }

            storageWorkspace.documents = Array.isArray(data.documents)
                ? data.documents.map(normalizeDocument).filter((documentItem) => documentItem.id)
                : [];
            storageWorkspace.storage = normalizeStoragePayload(data.storage || {});
            storageWorkspace.loaded = true;
            renderStorageSettings();
        } catch (error) {
            storageWorkspace.loaded = true;
            renderStorageSettings();
            showToast(error.message || "Could not load storage usage", "error");
        }
    }

    async function deleteStorageDocument(documentId) {
        const documentItem = storageWorkspace.documents.find((item) => item.id === documentId);

        if (!documentItem) {
            return;
        }

        storageWorkspace.deletingId = documentId;
        renderStorageSettings();

        try {
            const response = await apiFetch(`/api/documents/${encodeURIComponent(documentId)}`, {
                method: "DELETE",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not delete document.");
            }

            storageWorkspace.documents = storageWorkspace.documents.filter((item) => item.id !== documentId);
            storageWorkspace.storage = normalizeStoragePayload(data.storage || storageWorkspace.storage || {});
            showToast("Document deleted");
            await loadStorageSettings();
        } catch (error) {
            showToast(error.message || "Could not delete document", "error");
        } finally {
            storageWorkspace.deletingId = "";
            renderStorageSettings();
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
            resetProviderForm();
            renderProviderSettings();
            setProviderStatus("Connected");
            showToast("Provider saved and activated");
        } catch (error) {
            setProviderStatus(error.message || "Could not save provider", true);
            showToast(error.message || "Could not save provider", "error");
        }
    }

    async function activateProvider(connectionId, {renderSettings = false} = {}) {
        const provider = getSavedProvider(connectionId);
        if (!provider || provider.isEnvironment) {
            return;
        }

        if (providerWorkspace.activeProviderId === connectionId && provider.isActive) {
            return;
        }

        const previousWorkspace = providerWorkspace;
        const requestId = ++providerActivationRequestId;

        setOptimisticActiveProvider(connectionId);
        renderControls();

        if (renderSettings) {
            renderProviderSettings();
        }

        try {
            const response = await apiFetch(`/api/providers/${encodeURIComponent(connectionId)}/activate`, {
                method: "POST",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Could not switch provider.");
            }

            if (requestId !== providerActivationRequestId) {
                return;
            }

            setProviderWorkspace(data);
            if (renderSettings) {
                renderProviderSettings();
            }
            renderControls();
            showToast(`Using ${getProviderModelName(data.activeProvider)}`);
        } catch (error) {
            if (requestId !== providerActivationRequestId) {
                return;
            }

            providerWorkspace = previousWorkspace;
            showToast(error.message || "Could not switch provider", "error");
            renderControls();

            if (renderSettings) {
                renderProviderSettings();
            }
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

        renderConversationList(els.conversationList, visibleConversations, {
            activeConversationId: state.activeConversationId,
            escapeAttribute,
            escapeHtml,
            formatDate,
            hasSearchTerm: Boolean(normalizedSearch),
        });
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

        if (els.sidebarToggleButtons.length > 0) {
            const isExpanded = document.body.classList.contains("sidebar-expanded");
            const nextLabel = isExpanded ? "Collapse sidebar" : "Expand sidebar";
            els.sidebarToggleButtons.forEach((button) => {
                button.setAttribute("aria-label", nextLabel);
                button.setAttribute("aria-pressed", String(sidebarPinnedOpen));
                button.innerHTML = `
                    <span class="sidebar-toggle-glyph" aria-hidden="true"></span>
                `;
            });
        }

        renderActiveProviderSwitcher();
    }

    function renderAttachmentTray() {
        renderPendingAttachmentTray(els.attachmentTray, pendingAttachments, {
            formatBytes,
            getAttachmentPreviewSource,
            isProcessingAttachment,
        });
    }

    function syncComposerState() {
        const hasText = els.messageInput.value.trim().length > 0;
        const hasAttachments = pendingAttachments.length > 0;
        els.sendButton.hidden = isSending;
        els.sendButton.disabled = isSending || isProcessingAttachment || (!hasText && !hasAttachments);
        els.messageInput.disabled = isSending;
        els.attachButton.disabled = isSending;
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

    function hasBareBracketMathIndicators(source) {
        const text = String(source || "").trim();

        if (!text) {
            return false;
        }

        return /\\(begin|frac|sqrt|sum|int|det|mathbb|times|cdot|neq|ne|leq|geq|approx)\b/.test(text) ||
            /[≠≤≥≈×÷±∓√∑∫∞]/.test(text) ||
            /[\^_=]/.test(text) ||
            (/\{[^}]+\}/.test(text) && /[a-zA-Z0-9\\]/.test(text)) ||
            /\b[a-zA-Z]\s*[\+\-*\/]\s*[a-zA-Z0-9\\{]/.test(text);
    }

    function protectBareBracketMathBlocks(source) {
        const tokens = [];
        const text = String(source || "").replace(
            /(^|\n)([ \t]*)\[\s*\r?\n([\s\S]*?)\r?\n[ \t]*\](?=\s*(?:\n|$))/g,
            (match, lineStart, indent, content) => {
                if (!hasBareBracketMathIndicators(content)) {
                    return match;
                }

                const index = tokens.push(content.trim()) - 1;
                return `${lineStart}${indent}@@nexabaremath${index}@@`;
            }
        );

        return { text, tokens };
    }

    function restoreBareBracketMathBlocks(source, tokens = []) {
        if (tokens.length === 0) {
            return source;
        }

        return String(source || "").replace(/@@nexabaremath(\d+)@@/g, (match, index) => {
            const content = tokens[Number(index)];
            return typeof content === "string" ? `\\[\n${content}\n\\]` : match;
        });
    }

    function hasMathOperator(source) {
        return /\\(begin|frac|sqrt|sum|int|det|mathbb|times|cdot|neq|ne|leq?|geq?|approx|div|pm|mp|to|Rightarrow|Leftrightarrow)\b/.test(source) ||
            /[≠≤≥≈=<>×÷±∓√∑∫∞^_]/.test(source);
    }

    function looksLikeStandaloneMathLine(line) {
        const text = String(line || "").trim();

        if (
            !text ||
            text.length > 220 ||
            /^\d+[\).]\s+/.test(text) ||
            /^\\[\[(][\s\S]*\\[\])]$/.test(text) ||
            /[.!?。！？]\s*$/.test(text)
        ) {
            return false;
        }

        if (!hasMathOperator(text)) {
            return false;
        }

        if (/\\begin\{(?:pmatrix|matrix|bmatrix|vmatrix|align|array|cases|split)\}/.test(text)) {
            return true;
        }

        const letters = (text.match(/[a-zA-Z]/g) || []).length;
        const mathSymbols = (text.match(/[=<>≠≤≥≈+\-*\/×÷^_]/g) || []).length;
        const words = text.match(/[a-zA-ZÀ-ỹ]{4,}/g) || [];
        const hasEquation = /(?:[A-Za-z0-9)\]}]|\\\})\s*(?:=|≠|≤|≥|≈|<|>|\\ne|\\le|\\ge|\\approx)\s*(?:[A-Za-z0-9\\({\[])/.test(text);
        const isMostlySymbols = mathSymbols >= 1 && words.length <= 2 && letters <= 18;

        return hasEquation || isMostlySymbols;
    }

    function normalizeStandaloneMathLines(source) {
        return String(source || "")
            .split(/(\r?\n)/)
            .map((part) => {
                if (/^\r?\n$/.test(part)) {
                    return part;
                }

                const leading = part.match(/^\s*/)?.[0] || "";
                const trailing = part.match(/\s*$/)?.[0] || "";
                const text = part.trim();

                if (!looksLikeStandaloneMathLine(text)) {
                    return part;
                }

                const displayMode = text.length > 34 || /\\begin\{|\\\\/.test(text);
                const normalized = normalizeLatexSource(text);

                return displayMode
                    ? `${leading}\\[ ${normalized} \\]${trailing}`
                    : `${leading}\\( ${normalized} \\)${trailing}`;
            })
            .join("");
    }

    function normalizeMathContent(text) {
        if (typeof text !== "string") return text;

        const codePattern = /(```[\s\S]*?```|`[^`\n]*`)/g;

        return String(text || "").split(codePattern).map((chunk) => {
            if (chunk.startsWith("`")) {
                return chunk;
            }

            const normalizedChunk = normalizeEscapedLatex(chunk);
            const mathPattern = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^\$\n]+?\$)/g;

            return normalizedChunk.split(mathPattern).map((part, index) => {
                if (index % 2 === 1) {
                    return part;
                }

                const protectedBareMath = protectBareBracketMathBlocks(part);
                return restoreBareBracketMathBlocks(
                    normalizeStandaloneMathLines(normalizePlainMath(protectedBareMath.text)),
                    protectedBareMath.tokens
                );
            }).join("");
        }).join("");
    }

    function normalizePlainMath(text) {
        let result = "";
        let i = 0;

        const patterns = [
            { name: "env", regex: /^\\begin\{([a-zA-Z]+)\}[\s\S]*?\\end\{\1\}/ },
            { name: "text", regex: /^\\text\{[^\}]*\}/ },
            { name: "command", regex: /^\\[a-zA-Z]+/ },
            { name: "braces", regex: /^\{[^\}]*\}/ },
            { name: "shortWord", regex: /^[a-zA-Z]{1,3}/ },
            { name: "number", regex: /^\d+/ },
            { name: "symbol", regex: /^[\+\-\*\/=\<\>\(\)\[\]\.,;\!\?&\|_^\'\"~′≠≤≥≈×÷±∓√∑∫∞−→⇒⇔]+/ },
            { name: "space", regex: /^[ \t\r\n](?!\r?\n)/ }
        ];

        const COMMON_TEXT_WORDS = new Set([
            "khi", "thì", "và", "cho", "với", "nếu", "của", "là", "có", "tìm", "tính", "nên", "chỉ",
            "một", "hai", "ba", "như", "các", "nó", "qua", "tại", "mọi", "mỗi", "bởi", "về", "ra", "vào", "lên", "này",
            "for", "let", "and", "the", "with", "then", "are", "is", "a", "an", "in", "on", "at", "by", "to", "of", "or", "but", "not", "if", "has", "its", "any", "all"
        ]);

        function isCommonTextWord(word) {
            if (word === word.toUpperCase() && /[a-zA-Z]/.test(word)) {
                return false;
            }
            return COMMON_TEXT_WORDS.has(word.toLowerCase());
        }

        while (i < text.length) {
            let index = i;
            const tokens = [];

            while (index < text.length) {
                let matched = false;
                const remaining = text.slice(index);
                for (const p of patterns) {
                    const match = remaining.match(p.regex);
                    if (match) {
                        if (p.name === "shortWord") {
                            const nextChar = remaining[match[0].length] || "";
                            if (/^[a-zA-Z\u00C0-\u1EF9]/.test(nextChar)) {
                                continue;
                            }
                        }
                        tokens.push({
                            type: p.name,
                            value: match[0]
                        });
                        index += match[0].length;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    break;
                }
            }

            if (tokens.length > 0) {
                let startIndex = 0;
                let endIndex = tokens.length;

                while (startIndex < endIndex && tokens[startIndex].type === "space") {
                    startIndex++;
                }

                while (startIndex + 1 < endIndex && tokens[startIndex].type === "shortWord" && isCommonTextWord(tokens[startIndex].value) && tokens[startIndex + 1].type === "space") {
                    startIndex += 2;
                }

                while (endIndex > startIndex && tokens[endIndex - 1].type === "space") {
                    endIndex--;
                }

                while (endIndex - 2 >= startIndex && tokens[endIndex - 1].type === "shortWord" && isCommonTextWord(tokens[endIndex - 1].value) && tokens[endIndex - 2].type === "space") {
                    endIndex -= 2;
                }

                while (endIndex > startIndex && tokens[endIndex - 1].type === "symbol" && /^[.,;:!?]$/.test(tokens[endIndex - 1].value)) {
                    endIndex--;
                }

                if (startIndex < endIndex) {
                    const leadingString = tokens.slice(0, startIndex).map(t => t.value).join("");
                    const mathString = tokens.slice(startIndex, endIndex).map(t => t.value).join("");
                    const trailingString = tokens.slice(endIndex).map(t => t.value).join("");

                    const hasTrigger = /\\(begin|frac|sqrt|sum|int|det|mathbb|times|cdot|neq|ne|leq?|geq?|approx|div|pm|mp)\b/.test(mathString) ||
                                        /\\(begin|frac|sqrt|sum|int|det|mathbb|times|cdot|neq|ne|leq?|geq?|approx|div|pm|mp)/.test(mathString) ||
                                        /[≠≤≥≈×÷±∓√∑∫∞^_]/.test(mathString) ||
                                        looksLikeStandaloneMathLine(mathString);

                    if (hasTrigger && mathString.trim().length > 0) {
                        const isBlock = /\\begin\{(pmatrix|matrix|bmatrix|vmatrix|align|array|cases|split)\}/.test(mathString) ||
                                        /\\\\/.test(mathString) ||
                                        mathString.includes("\n") ||
                                        mathString.length > 50;

                        result += leadingString;
                        if (isBlock) {
                            result += `\\[ ${normalizeLatexSource(mathString.trim())} \\]`;
                        } else {
                            result += `\\( ${normalizeLatexSource(mathString.trim())} \\)`;
                        }
                        result += trailingString;
                        i = index;
                    } else {
                        result += tokens[0].value;
                        i += tokens[0].value.length;
                    }
                } else {
                    result += tokens[0].value;
                    i += tokens[0].value.length;
                }
            } else {
                result += text[i];
                i++;
            }
        }

        return result;
    }

    function buildSanitizedMarkdownContent(text) {
        if (!window.marked || !window.DOMPurify) {
            return null;
        }

        try {
            window.marked.setOptions({
                breaks: true,
                gfm: true,
            });

            const normalizedText = normalizeMathContent(String(text || ""));
            const protectedMarkdown = protectMathInMarkdown(normalizedText);
            const rawHtml = window.marked.parse(protectedMarkdown.markdown);
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

            restoreMathPlaceholders(template.content, protectedMarkdown.tokens);
            return {
                fragment: template.content,
                html: cleanHtml,
            };
        } catch (error) {
            return null;
        }
    }

    function renderSanitizedMarkdown(fragment, text) {
        const rendered = buildSanitizedMarkdownContent(text);

        if (!rendered) {
            return false;
        }

        fragment.appendChild(rendered.fragment);
        return true;
    }

    function protectMathInMarkdown(source) {
        const tokens = [];
        const chunks = String(source || "").split(/(```[\s\S]*?```)/g);
        const markdown = chunks.map((chunk) => {
            if (chunk.startsWith("```")) {
                return chunk;
            }

            return chunk
                .split(/(`[^`\n]+`)/g)
                .map((part) => part.startsWith("`") ? part : replaceMathWithPlaceholders(part, tokens))
                .join("");
        }).join("");

        return { markdown, tokens };
    }

    function replaceMathWithPlaceholders(source, tokens) {
        let output = "";
        let cursor = 0;
        const normalizedSource = normalizeEscapedLatex(source);
        let token = findMathToken(normalizedSource);

        while (token) {
            output += normalizedSource.slice(cursor, token.start);
            const index = tokens.push({
                source: normalizeLatexSource(token.raw),
                display: token.display,
            }) - 1;
            output += `@@nexamath${index}@@`;
            cursor = token.end;
            token = findMathToken(normalizedSource.slice(cursor));

            if (token) {
                token = {
                    ...token,
                    start: token.start + cursor,
                    end: token.end + cursor,
                };
            }
        }

        return output + normalizedSource.slice(cursor);
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
            replaceCitationMarkers(fragment, options.citations || []);
            return fragment;
        }

        const parts = normalizeMathContent(String(text || "")).split("```");

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

        replaceCitationMarkers(fragment, options.citations || []);
        return fragment;
    }

    function getMessageRenderContext() {
        return {
            copiedMessageId,
            formatBytes,
            getAttachmentPreviewSource,
            openMenuId,
            renderKatexMathInElement,
            renderMessageContent,
        };
    }

    function createMessageElement(message) {
        return createRenderedMessageElement(message, getMessageRenderContext());
    }

    function createEmptyState() {
        const empty = document.createElement("section");
        empty.className = "empty-state";
        empty.innerHTML = `
            <div class="welcome-copy" aria-live="polite">
                <span class="welcome-spark" aria-hidden="true"></span>
                <p class="welcome-greeting">${escapeHtml(getTimeBasedGreeting())}</p>
                <h2 class="welcome-prompt">${escapeHtml(getWelcomePromptText())}</h2>
            </div>
        `;
        return empty;
    }

    function createLoadEarlierMessagesButton(hiddenCount) {
        const wrapper = document.createElement("div");
        wrapper.className = "load-earlier-messages";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "load-earlier-messages-button";
        button.dataset.action = "load-earlier-messages";
        button.textContent = `Load ${Math.min(hiddenCount, RENDERED_MESSAGES_INCREMENT)} earlier messages`;
        wrapper.appendChild(button);
        return wrapper;
    }

    function renderChat(options = {}) {
        const conversation = getActiveConversation();
        const shouldScroll = options.forceScroll || (state.settings.autoScroll && isNearBottom());
        const isEmptyConversation = conversation.messages.length === 0;
        const renderLimit = getRenderedMessageLimit(conversation);
        const hiddenMessageCount = Math.max(0, conversation.messages.length - renderLimit);
        const visibleMessages = hiddenMessageCount > 0
            ? conversation.messages.slice(hiddenMessageCount)
            : conversation.messages;
        els.chatThread.innerHTML = "";
        document.body.classList.toggle("home-empty", isEmptyConversation);

        if (isEmptyConversation) {
            els.chatThread.appendChild(createEmptyState());
        } else {
            if (hiddenMessageCount > 0) {
                els.chatThread.appendChild(createLoadEarlierMessagesButton(hiddenMessageCount));
            }

            visibleMessages.forEach((message) => {
                const messageElement = createMessageElement(message);
                els.chatThread.appendChild(messageElement);
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
        const messageElement = createMessageElement(message);
        existing.replaceWith(messageElement);
        renderIcons();

        if (shouldScroll) {
            requestAnimationFrame(scrollMessagesToBottom);
        }
    }

    function getRenderedMessageElement(messageId) {
        if (!messageId) {
            return null;
        }

        return els.chatThread.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    }

    function getRenderedMessageContent(messageId) {
        return getRenderedMessageElement(messageId)?.querySelector(".message-content") || null;
    }

    function ensureAssistantMeta(row, message) {
        if (!row || message.role !== "ai") {
            return;
        }

        const shell = row.querySelector(".message-shell");
        const bubble = row.querySelector(".message-bubble");

        if (!shell || !bubble) {
            return;
        }

        let meta = shell.querySelector(".message-meta");
        const html = `
            ${message.isError ? '<span class="status-chip error">error</span>' : ""}
            ${message.isStopped ? '<span class="status-chip stopped">stopped</span>' : ""}
        `.trim();

        if (!html) {
            meta?.remove();
            return;
        }

        if (!meta) {
            meta = document.createElement("div");
            meta.className = "message-meta";
            shell.insertBefore(meta, bubble);
        }

        meta.innerHTML = html;
    }

    function appendResponseFooterIfNeeded(message) {
        if (message.role !== "ai" || message.isLoading || !message.text || message.isError) {
            return;
        }

        const row = getRenderedMessageElement(message.id);
        const shell = row?.querySelector(".message-shell");

        if (!shell || shell.querySelector(".response-footer")) {
            return;
        }

        shell.appendChild(createResponseFooter(message, getMessageRenderContext()));
        renderIcons();
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

    function renderAppChromeOnly() {
        applyTheme();
        renderSidebar();
        renderTopbar();
        renderControls();
        renderAttachmentTray();
        syncComposerState();
        saveState();
        renderIcons();
    }

    function shouldAutoScroll() {
        return state.settings.autoScroll && isNearBottom();
    }

    function getStreamingRenderContext() {
        return {
            appendResponseFooterIfNeeded,
            buildSanitizedMarkdownContent,
            ensureAssistantMeta,
            getRenderedMessageContent,
            getRenderedMessageElement,
            getStreamingRenderState: () => streamingRenderState,
            renderChat,
            renderMessageContent,
            scrollMessagesToBottom,
            setStreamingRenderState: (nextState) => {
                streamingRenderState = nextState;
            },
            shouldAutoScroll,
            updateRenderedMessage,
        };
    }

    // Thin wrappers stay in chat.js because they bridge live chat state into the
    // streaming renderer without moving send/stop orchestration.
    function beginStreamingRender(message) {
        return beginRenderedStreamingRender(message, getStreamingRenderContext());
    }

    function retargetStreamingRender(oldMessageId, newMessageId) {
        return retargetRenderedStreamingRender(oldMessageId, newMessageId, getStreamingRenderContext());
    }

    function appendStreamingChunk(message, chunk) {
        return appendRenderedStreamingChunk(message, chunk, getStreamingRenderContext());
    }

    function finalizeStreamingRender(message, options = {}) {
        return finalizeRenderedStreamingRender(message, options, getStreamingRenderContext());
    }

    function loadEarlierMessages() {
        const conversation = getActiveConversation();
        const previousScrollHeight = els.messagesViewport.scrollHeight;
        const previousScrollTop = els.messagesViewport.scrollTop;
        const currentLimit = getRenderedMessageLimit(conversation);
        const nextLimit = Math.min(
            conversation.messages.length,
            currentLimit + RENDERED_MESSAGES_INCREMENT,
        );

        if (nextLimit <= currentLimit) {
            return;
        }

        setRenderedMessageLimit(conversation.id, nextLimit);
        renderChat();

        requestAnimationFrame(() => {
            const nextScrollHeight = els.messagesViewport.scrollHeight;
            els.messagesViewport.scrollTop = previousScrollTop + (nextScrollHeight - previousScrollHeight);
        });
    }

    function setLoading(isLoading, assistantId = null) {
        isSending = isLoading;
        currentAssistantId = assistantId;
        syncComposerState();
    }

    async function streamAIResponse(payload, onEvent) {
        memoryDebug("request payload", {
            conversationId: payload.conversationId,
            userMessageId: payload.userMessageId,
            assistantMessageId: payload.assistantMessageId,
            messagePreview: String(payload.message || "").slice(0, 160),
        });
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

        memoryDebug("run assistant request", {
            activeConversationId: state.activeConversationId,
            payloadConversationId: payload.conversationId,
            localConversationId: conversation.id,
            localMessageCount: conversation.messages.length,
            lastLocalMessages: conversation.messages.slice(-4).map((message) => ({
                id: message.id,
                role: message.role,
                isLoading: message.isLoading,
                textPreview: String(message.text || "").slice(0, 120),
            })),
            isSending,
        });
        setLoading(true, assistantMessage.id);
        renderApp({ forceScroll });
        beginStreamingRender(assistantMessage);

        try {
            await streamAIResponse(payload, (event) => {
                if (event.type === "meta") {
                    const previousAssistantId = assistantMessage.id;
                    memoryDebug("stream meta", {
                        previousActiveConversationId: state.activeConversationId,
                        localConversationId: conversation.id,
                        backendConversationId: event.conversationId,
                        backendConversationMessages: event.conversation?.messages?.length,
                        userMessageId: event.userMessageId,
                        assistantMessageId: event.assistantMessageId,
                    });
                    assistantMessage.provider = event.provider || assistantMessage.provider || null;
                    assistantMessage.model = event.model || assistantMessage.model || null;
                    assistantMessage.citations = Array.isArray(event.citations) ? event.citations : assistantMessage.citations || [];
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
                        retargetStreamingRender(previousAssistantId, assistantMessage.id);
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
                    appendStreamingChunk(assistantMessage, event.text);
                    return;
                }

                if (event.type === "done") {
                    memoryDebug("stream done", {
                        activeConversationId: state.activeConversationId,
                        localConversationId: conversation.id,
                        assistantMessageId: assistantMessage.id,
                        textLength: assistantMessage.text.length,
                    });
                    assistantMessage.provider = event.provider || assistantMessage.provider || null;
                    assistantMessage.model = event.model || assistantMessage.model || null;
                    assistantMessage.citations = Array.isArray(event.citations) ? event.citations : assistantMessage.citations || [];
                    assistantMessage.isLoading = false;
                    finalizeStreamingRender(assistantMessage, { forceScroll: true });
                }
            });

            if (!assistantMessage.text.trim()) {
                assistantMessage.text = "The AI service did not return a response. Please try again.";
                assistantMessage.isError = true;
                finalizeStreamingRender(assistantMessage, { forceScroll: true });
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
            finalizeStreamingRender(assistantMessage, { forceScroll: true });
        } finally {
            assistantMessage.isLoading = false;
            abortController = null;
            setLoading(false, null);
            getActiveConversation().updatedAt = Date.now();
            renderAppChromeOnly();
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

        memoryDebug("submit message", {
            activeConversationId: state.activeConversationId,
            conversationId: conversation.id,
            wasEmpty,
            existingMessageCount: conversation.messages.length,
            textPreview: text.slice(0, 160),
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
            await loadStorageSettings();
        } catch (error) {
            showToast(error.message || "Could not clear history", "error");
            await loadConversations();
            await loadStorageSettings();
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
            await loadStorageSettings();
        } catch (error) {
            showToast(error.message || "Could not delete conversation", "error");
            await loadConversations();
            await loadStorageSettings();
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
                body: JSON.stringify(createFeedbackPayload(message)),
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
            await loadStorageSettings();
        } catch (error) {
            showToast(error.message || "Could not delete response", "error");
            await loadConversations();
            await loadStorageSettings();
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

        closeAllDialogs();
        setImagePreview(els.imagePreviewLarge, attachment, source);
        openDialogElement(els.imagePreviewDialog, els.imagePreviewCloseButton);
    }

    function closeImagePreview() {
        closeDialog(els.imagePreviewDialog);
        clearImagePreview(els.imagePreviewLarge);
    }

    function openDialog(dialog, focusTarget = null) {
        closeAllDialogs();
        openDialogElement(dialog, focusTarget);
    }

    function closeDialog(dialog) {
        closeDialogElement(dialog);
    }

    function closeAllDialogs() {
        [
            els.settingsDialog,
            els.usageDialog,
            els.personalizationDialog,
            els.renameDialog,
            els.confirmDialog,
            els.imagePreviewDialog,
        ].forEach((dialog) => closeDialog(dialog));
        clearImagePreview(els.imagePreviewLarge);
        confirmCallback = null;
    }

    function openPersonalizationDialog() {
        openDialog(els.personalizationDialog, els.personalizationTextarea || els.memoryInput);
    }

    function openConfirmDialog({ title, message, actionLabel, onConfirm }) {
        configureConfirmDialog(els, { title, message, actionLabel });
        closeDialog(els.confirmDialog);
        openDialogElement(els.confirmDialog, els.confirmAcceptButton);
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
            const focusTarget = section?.querySelector("textarea, select, input, button");
            section?.scrollIntoView({ block: "nearest" });
            focusTarget?.focus();
        }, 80);
    }

    function openUsageDialog() {
        openDialog(els.usageDialog, els.documentSearchInput);
        loadStorageSettings();

        window.setTimeout(() => {
            els.documentSearchInput?.focus();
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

    function getClipboardImageFiles(event) {
        const clipboardData = event.clipboardData;
        const files = [];
        const seenFiles = new Set();
        const seenFileSignatures = new Set();

        function clipboardFileSignature(file) {
            return `${file.type || ""}:${file.size || 0}`;
        }

        function addImageFile(file) {
            if (!file || seenFiles.has(file)) {
                return;
            }

            if (String(file.type || "").startsWith("image/") || isSupportedImageFile(file)) {
                const fileSignature = clipboardFileSignature(file);
                if (seenFileSignatures.has(fileSignature)) {
                    return;
                }

                seenFiles.add(file);
                seenFileSignatures.add(fileSignature);
                files.push(file);
            }
        }

        Array.from(clipboardData?.items || []).forEach((item) => {
            if (item.kind !== "file") {
                return;
            }

            if (!String(item.type || "").startsWith("image/")) {
                return;
            }

            addImageFile(item.getAsFile());
        });

        Array.from(clipboardData?.files || []).forEach(addImageFile);

        return files;
    }

    function shouldSkipDocumentPaste(event) {
        const target = event.target;

        if (target === els.messageInput) {
            return false;
        }

        if (!(target instanceof Element)) {
            return false;
        }

        const editableTarget = target.closest("[contenteditable]");
        if (editableTarget && editableTarget.getAttribute("contenteditable") !== "false") {
            return true;
        }

        return Boolean(target.closest("input, textarea, select"));
    }

    function handleImagePaste(event) {
        if (event.defaultPrevented || shouldSkipDocumentPaste(event)) {
            return;
        }

        const files = getClipboardImageFiles(event);

        if (files.length === 0) {
            return;
        }

        event.preventDefault();
        addFiles(files);
    }

    function getDroppedFiles(event) {
        return Array.from(event.dataTransfer?.files || []);
    }

    function hasDroppedFiles(event) {
        if (getDroppedFiles(event).length > 0) {
            return true;
        }

        return Array.from(event.dataTransfer?.types || []).includes("Files");
    }

    function handleFileDrag(event) {
        if (!hasDroppedFiles(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        els.messageForm.classList.add("drag-over");
    }

    function handleFileDragLeave(event) {
        if (event.relatedTarget instanceof Node && els.messageForm.contains(event.relatedTarget)) {
            return;
        }

        els.messageForm.classList.remove("drag-over");
    }

    function handleFileDrop(event) {
        const files = getDroppedFiles(event);

        if (files.length === 0) {
            return;
        }

        event.preventDefault();
        els.messageForm.classList.remove("drag-over");
        addFiles(files);
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
                        ...attachment,
                        id: attachment.id || createId(attachment.kind === "image" ? "image" : "file"),
                        previewUrl: attachment.previewUrl || attachment.url || attachment.dataUrl || "",
                    });
                    loadStorageSettings();
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

    function removeAttachment(attachmentId) {
        if (!attachmentId) {
            return;
        }

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
        document.querySelectorAll("[data-action='open-storage-settings']").forEach((button) => {
            button.addEventListener("click", () => {
                openUsageDialog();

                if (mobileSidebarQuery.matches) {
                    setSidebarOpen(false);
                }
            });
        });
        document.querySelectorAll("[data-action='open-personalization-settings']").forEach((button) => {
            button.addEventListener("click", () => {
                openPersonalizationDialog();

                if (mobileSidebarQuery.matches) {
                    setSidebarOpen(false);
                }
            });
        });
        document.querySelectorAll("[data-action='open-file-upload']").forEach((button) => {
            button.addEventListener("click", () => {
                openUsageDialog();

                if (mobileSidebarQuery.matches) {
                    setSidebarOpen(false);
                }
            });
        });
        els.clearAllButton?.addEventListener("click", () => {
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
        els.settingsCloseButton.addEventListener("click", () => closeDialog(els.settingsDialog));
        els.usageCloseButton?.addEventListener("click", () => closeDialog(els.usageDialog));
        els.personalizationCloseButton?.addEventListener("click", () => closeDialog(els.personalizationDialog));
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
        initModelSwitcher(els.activeModelSwitcher, activateProvider);
        els.activeProviderSelect?.addEventListener("change", () => activateProvider(els.activeProviderSelect.value));
        els.chatThread?.addEventListener("click", (event) => {
            const loadButton = event.target.closest("[data-action='load-earlier-messages']");

            if (loadButton) {
                loadEarlierMessages();
            }
        });
        els.personalizationForm?.addEventListener("submit", savePersonalization);
        els.memoryForm?.addEventListener("submit", saveMemory);
        els.memoryCancelEditButton?.addEventListener("click", resetMemoryForm);
        els.memoryList?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-memory-action]");
            const item = event.target.closest("[data-memory-id]");

            if (!button || !item) {
                return;
            }

            const memoryId = item.dataset.memoryId;

            if (button.dataset.memoryAction === "edit") {
                editMemory(memoryId);
                return;
            }

            if (button.dataset.memoryAction === "delete") {
                openConfirmDialog({
                    title: "Xóa memory?",
                    message: "Xóa memory này khỏi Nexa?",
                    actionLabel: "Xóa memory",
                    onConfirm: () => deleteMemory(memoryId),
                });
            }
        });
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
                activateProvider(connectionId, {renderSettings: true});
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
        document.addEventListener("paste", handleImagePaste);
        els.messageForm.addEventListener("dragenter", handleFileDrag);
        els.messageForm.addEventListener("dragover", handleFileDrag);
        els.messageForm.addEventListener("dragleave", handleFileDragLeave);
        els.messageForm.addEventListener("drop", handleFileDrop);
        els.stopButton.addEventListener("click", stopGeneration);
        els.mobileMenuButton?.addEventListener("click", () => setSidebarOpen(true));
        els.sidebarCloseButton?.addEventListener("click", () => setSidebarOpen(false));
        els.sidebarScrim?.addEventListener("click", () => setSidebarOpen(false));
        els.sidebarToggleButtons.forEach((button) => {
            button.addEventListener("click", toggleSidebarPinnedOpen);
        });

        els.attachmentTray.addEventListener("click", (event) => {
            const removeButton = event.target.closest("[data-action='remove-attachment']");

            if (removeButton) {
                const chip = event.target.closest(".attachment-chip");
                removeAttachment(chip?.dataset.attachmentId);
                return;
            }

            const previewButton = event.target.closest("[data-action='open-image-preview']");
            const imageChip = event.target.closest(".attachment-chip.image-chip");

            if (previewButton || imageChip) {
                event.preventDefault();
                event.stopPropagation();

                const attachment = findAttachmentFromElement(previewButton || imageChip);

                if (attachment) {
                    openImagePreview(attachment);
                }
                return;
            }
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

        els.documentSearchInput?.addEventListener("input", () => {
            storageWorkspace.search = els.documentSearchInput.value;
            renderStorageSettings();
        });

        els.documentSortSelect?.addEventListener("change", () => {
            storageWorkspace.sort = els.documentSortSelect.value || "date-desc";
            renderStorageSettings();
        });

        els.documentList?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-document-action='delete']");

            if (!button) {
                return;
            }

            const documentId = event.target.closest(".document-item")?.dataset.documentId;
            const documentItem = storageWorkspace.documents.find((item) => item.id === documentId);

            if (!documentItem) {
                return;
            }

            openConfirmDialog({
                title: "Delete document?",
                message: `Delete ${documentItem.filename}? This removes the uploaded file and its RAG chunks.`,
                actionLabel: "Delete",
                onConfirm: () => deleteStorageDocument(documentId),
            });
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

        desktopSidebarQuery.addEventListener("change", () => {
            sidebarPinnedOpen = false;
            setDesktopSidebarExpanded(false, true);
            renderControls();
        });

        window.addEventListener("beforeunload", () => cleanupPendingAttachmentUrls());
    }

    bindEvents();
    window.setInterval(rotateWelcomePrompt, 12000);
    renderApp({ forceScroll: true });
    loadProviders();
    loadPersonalizationSettings();
    loadStorageSettings();
    loadConversations().then(migrateLegacyLocalHistory);
});
}
