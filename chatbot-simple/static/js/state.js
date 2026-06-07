export function createId(prefix) {
    if (window.crypto?.randomUUID) {
        return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createMessage(role, text, extra = {}) {
    const now = Date.now();

    return {
        id: createId("msg"),
        role,
        text,
        createdAt: now,
        provider: null,
        model: null,
        attachments: [],
        citations: [],
        feedback: null,
        isError: false,
        isLoading: false,
        isStopped: false,
        ...extra,
    };
}

export function createConversation(title = "New chat", messages = []) {
    const now = Date.now();

    return {
        id: createId("conv"),
        title,
        messages,
        createdAt: now,
        updatedAt: now,
    };
}

export function readJsonStorage(key) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch (error) {
        console.warn(`Could not read ${key}:`, error);
        return null;
    }
}
