export function getConversationPreview(conversation) {
    const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
    const lastMessage = [...messages]
        .reverse()
        .find((message) => String(message?.text || "").trim() || (message?.attachments || []).length > 0);

    if (!lastMessage) {
        return "No messages yet";
    }

    const text = String(lastMessage.text || "").replace(/\s+/g, " ").trim();
    if (text) {
        return text.length > 76 ? `${text.slice(0, 76).trim()}...` : text;
    }

    const count = (lastMessage.attachments || []).length;
    return count === 1 ? "1 attachment" : `${count} attachments`;
}

export function createEmptyConversationListHtml(hasSearchTerm) {
    return hasSearchTerm
        ? `<div class="empty-search"><strong>No matching chats</strong><span class="empty-caption">Try another search term.</span></div>`
        : `<div class="empty-history"><strong>No chats yet</strong><span class="empty-caption">Start a new conversation to build history.</span></div>`;
}

export function createConversationListItemHtml(conversation, context) {
    const isActive = conversation.id === context.activeConversationId;
    const activeClass = isActive ? " active" : "";

    return `
        <div class="conversation-item${activeClass}" data-conversation-id="${context.escapeAttribute(conversation.id)}">
            <button class="conversation-main" type="button" data-action="open-conversation" data-conversation-id="${context.escapeAttribute(conversation.id)}" aria-current="${isActive ? "true" : "false"}">
                <i data-lucide="message-square"></i>
                <span class="conversation-copy">
                    <span class="conversation-name">${context.escapeHtml(conversation.title)}</span>
                    <span class="conversation-preview">${context.escapeHtml(getConversationPreview(conversation))}</span>
                    <span class="conversation-date">${context.formatDate(conversation.updatedAt)}</span>
                </span>
            </button>
            <span class="conversation-actions">
                <button type="button" data-action="rename-conversation" data-conversation-id="${context.escapeAttribute(conversation.id)}" aria-label="Rename ${context.escapeAttribute(conversation.title)}">
                    <i data-lucide="pencil"></i>
                </button>
                <button type="button" data-action="delete-conversation" data-conversation-id="${context.escapeAttribute(conversation.id)}" aria-label="Delete ${context.escapeAttribute(conversation.title)}">
                    <i data-lucide="trash-2"></i>
                </button>
            </span>
        </div>
    `;
}

export function renderConversationList(conversationList, conversations, context) {
    if (!conversationList) {
        return;
    }

    if (conversations.length === 0) {
        conversationList.innerHTML = createEmptyConversationListHtml(context.hasSearchTerm);
        return;
    }

    conversationList.innerHTML = conversations
        .map((conversation) => createConversationListItemHtml(conversation, context))
        .join("");
}
