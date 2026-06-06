export const GLOBAL_STORAGE_KEY = "gemini-chat-workspace-state-v2";
export const LEGACY_STORAGE_KEY = "chatbot-simple-conversations";
export const THEME_STORAGE_KEY = "workspace_theme_preference";
export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
export const STREAM_RENDER_INTERVAL_MS = 120;
export const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
export const TEXT_EXTENSIONS = new Set(["txt", "md", "pdf", "docx"]);
export const WELCOME_PROMPTS = [
    "What would you like to do today?",
    "What's on your mind?",
    "Where would you like to begin?",
    "Need help with an idea?",
    "Let's build something great.",
    "Ready to learn something new?",
    "Need writing, coding, or research assistance?",
    "Ask me anything.",
];

export function storageKeysForUser(userId) {
    const safeUserId = String(userId || "guest").replace(/[^a-zA-Z0-9_-]/g, "_") || "guest";

    return {
        userStorageId: safeUserId,
        storageKey: `conversations_${safeUserId}`,
        historyStorageKey: `chat_history_${safeUserId}`,
        preferencesStorageKey: `workspace_preferences_${safeUserId}`,
        migrationKey: `workspace_migrated_${safeUserId}`,
    };
}
