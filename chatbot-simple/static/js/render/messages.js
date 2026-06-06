import {
    createAttachmentPills,
    createUserMessageAttachments,
} from "./attachments.js";
import { createResponseFooter } from "../features/feedback.js";

export function createTypingIndicator() {
    const wrapper = document.createElement("div");
    wrapper.className = "typing-indicator";
    const label = document.createElement("span");
    label.className = "thinking-text";
    label.textContent = "Thinking";
    wrapper.appendChild(label);
    return wrapper;
}

function splitMessageAttachments(attachments = []) {
    return {
        images: attachments.filter((attachment) => attachment.kind === "image"),
        files: attachments.filter((attachment) => attachment.kind !== "image"),
    };
}

export function createMessageElement(message, context) {
    const row = document.createElement("article");
    row.className = `message ${message.role === "user" ? "user-message" : "ai-message assistant-message"}`;
    row.dataset.messageId = message.id;

    const avatar = document.createElement("span");
    avatar.className = `message-avatar ${message.role === "ai" ? "ai-avatar assistant-avatar" : "user-avatar"}`;
    avatar.setAttribute("aria-hidden", "true");

    if (message.role === "ai") {
        const assistantLogo = document.createElement("img");
        assistantLogo.src = "/static/assets/Hover.png";
        assistantLogo.alt = "";
        assistantLogo.loading = "eager";
        avatar.appendChild(assistantLogo);
    } else {
        avatar.innerHTML = '<i data-lucide="user-round"></i>';
    }

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

    if (meta.textContent.trim()) {
        shell.appendChild(meta);
    }

    if (message.role !== "user" && fileAttachments.length) {
        shell.appendChild(createAttachmentPills(fileAttachments, context));
    }

    if (message.role === "user") {
        if (imageAttachments.length || fileAttachments.length) {
            const attachmentBubble = document.createElement("div");
            attachmentBubble.className = "message-bubble attachment-bubble";
            attachmentBubble.appendChild(createUserMessageAttachments(imageAttachments, fileAttachments, context));
            shell.appendChild(attachmentBubble);
        }

        if (String(message.text || "").trim() || message.isError) {
            const textBubble = document.createElement("div");
            textBubble.className = "message-bubble text-bubble";
            const textContent = document.createElement("div");
            textContent.className = "message-content message-text";
            textContent.appendChild(context.renderMessageContent(message.text, message.isError, {
                markdown: false,
            }));

            if (!message.isError) {
                context.renderKatexMathInElement(textContent);
            }

            textBubble.appendChild(textContent);
            shell.appendChild(textBubble);
        }
    } else {
        const bubble = document.createElement("div");
        bubble.className = "message-bubble";

        const content = document.createElement("div");
        content.className = "message-content";

        if (message.isLoading && !message.text) {
            content.appendChild(createTypingIndicator());
        } else {
            content.appendChild(context.renderMessageContent(message.text, message.isError, {
                markdown: true,
            }));

            if (!message.isError) {
                context.renderKatexMathInElement(content);
            }
        }

        bubble.appendChild(content);
        shell.appendChild(bubble);
    }

    if (message.role === "ai" && !message.isLoading && message.text) {
        shell.appendChild(createResponseFooter(message, context));
    }

    row.appendChild(avatar);
    row.appendChild(shell);

    return row;
}
