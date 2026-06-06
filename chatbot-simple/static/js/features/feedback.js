export function getFeedbackButtonClass(message, value) {
    return message.feedback === value ? "active" : "";
}

export function createFeedbackPayload(message) {
    return {
        feedback: message.feedback || "",
    };
}

export function createResponseFooter(message, context) {
    const footer = document.createElement("div");
    footer.className = "response-footer";
    footer.innerHTML = `
        <div class="reaction-buttons" aria-label="Response actions">
            <button class="${getFeedbackButtonClass(message, "like")}" type="button" data-action="like-response" aria-label="Like response">
                <i data-lucide="thumbs-up"></i>
            </button>
            <button class="${getFeedbackButtonClass(message, "dislike")}" type="button" data-action="dislike-response" aria-label="Dislike response">
                <i data-lucide="thumbs-down"></i>
            </button>
            <button type="button" data-action="copy-response" aria-label="Copy response">
                <i data-lucide="copy"></i>
            </button>
            <span class="more-menu-wrapper">
                <button type="button" data-action="toggle-more" aria-label="More response options">
                    <i data-lucide="more-horizontal"></i>
                </button>
                <span class="more-menu ${context.openMenuId === message.id ? "open" : ""}">
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
            ${context.copiedMessageId === message.id ? '<span class="copy-feedback">Copied</span>' : ""}
        </div>
        <button class="regenerate-button" type="button" data-action="regenerate-response">
            <i data-lucide="rotate-ccw"></i>
            <span>Regenerate</span>
        </button>
    `;
    return footer;
}
