import { STREAM_RENDER_INTERVAL_MS } from "../utils/constants.js";
import { renderKatexMathInElement } from "./markdown.js";

function createStreamingTextNode(state) {
    const textNode = document.createTextNode(state.text);
    const paragraph = document.createElement("p");
    paragraph.className = "streaming-text";
    paragraph.appendChild(textNode);
    state.content.replaceChildren(paragraph);
    state.textNode = textNode;
}

function renderStreamingPlainText(state) {
    if (!state.textNode) {
        createStreamingTextNode(state);
        return;
    }

    state.textNode.textContent = state.text;
}

function renderStreamingMarkdownContent(state, force = false, context) {
    const rendered = context.buildSanitizedMarkdownContent(state.text);

    if (!rendered) {
        renderStreamingPlainText(state);
        return;
    }

    if (!force && rendered.html === state.lastRenderedHtml) {
        return;
    }

    state.content.replaceChildren(rendered.fragment);
    state.textNode = null;
    state.lastRenderedHtml = rendered.html;

    try {
        renderKatexMathInElement(state.content);
    } catch (error) {
        renderStreamingPlainText(state);
    }
}

function flushStreamingMarkdown(context) {
    const state = context.getStreamingRenderState();

    if (!state) {
        return;
    }

    state.renderTimerId = null;
    renderStreamingMarkdownContent(state, false, context);
    state.lastRenderTime = performance.now();

    if (context.shouldAutoScroll()) {
        context.scrollMessagesToBottom();
    }
}

export function beginStreamingRender(message, context) {
    let content = context.getRenderedMessageContent(message.id);

    if (!content) {
        context.renderChat({ forceScroll: true });
        content = context.getRenderedMessageContent(message.id);
    }

    if (!content) {
        context.setStreamingRenderState(null);
        return;
    }

    const nextState = {
        messageId: message.id,
        content,
        textNode: null,
        text: message.text || "",
        renderTimerId: null,
        lastRenderTime: 0,
        lastRenderedHtml: "",
    };

    context.setStreamingRenderState(nextState);

    if (message.text) {
        renderStreamingMarkdownContent(nextState, true, context);
    }
}

export function retargetStreamingRender(oldMessageId, newMessageId, context) {
    if (!oldMessageId || !newMessageId || oldMessageId === newMessageId) {
        return;
    }

    const row = context.getRenderedMessageElement(oldMessageId);

    if (row) {
        row.dataset.messageId = newMessageId;
    }

    const state = context.getStreamingRenderState();

    if (state?.messageId === oldMessageId) {
        state.messageId = newMessageId;
    }
}

export function appendStreamingChunk(message, chunk, context) {
    let state = context.getStreamingRenderState();

    if (!state || state.messageId !== message.id) {
        beginStreamingRender(message, context);
        state = context.getStreamingRenderState();
    }

    if (!state) {
        return;
    }

    state.text += chunk;

    // Streaming can produce many tiny tokens. Buffering them and rendering
    // Markdown on a short throttle keeps formatting progressive while the
    // existing bubble/avatar stay mounted, preventing the old flicker.
    if (state.renderTimerId === null) {
        const elapsed = performance.now() - state.lastRenderTime;
        const delay = Math.max(0, STREAM_RENDER_INTERVAL_MS - elapsed);
        state.renderTimerId = window.setTimeout(() => {
            requestAnimationFrame(() => flushStreamingMarkdown(context));
        }, delay);
    }
}

export function finalizeStreamingRender(message, options = {}, context) {
    const state = context.getStreamingRenderState();

    if (state?.renderTimerId !== null) {
        window.clearTimeout(state?.renderTimerId);
    }

    const content = context.getRenderedMessageContent(message.id) || state?.content;

    if (!content) {
        context.updateRenderedMessage(message, options);
        context.setStreamingRenderState(null);
        return;
    }

    content.replaceChildren(context.renderMessageContent(message.text, message.isError, {
        markdown: message.role === "ai",
    }));

    if (!message.isError) {
        renderKatexMathInElement(content);
    }

    const row = context.getRenderedMessageElement(message.id);
    context.ensureAssistantMeta(row, message);
    context.appendResponseFooterIfNeeded(message);
    context.setStreamingRenderState(null);

    if (options.forceScroll || context.shouldAutoScroll()) {
        requestAnimationFrame(context.scrollMessagesToBottom);
    }
}
