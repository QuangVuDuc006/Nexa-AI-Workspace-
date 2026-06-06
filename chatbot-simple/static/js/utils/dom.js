export function renderIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

export function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

export function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, "&quot;");
}
