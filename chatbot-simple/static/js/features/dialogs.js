export function openDialogElement(dialog, focusTarget = null) {
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

export function closeDialogElement(dialog) {
    if (!dialog) {
        return;
    }

    dialog.classList.remove("open");
    dialog.setAttribute("aria-hidden", "true");
}

export function clearImagePreview(imagePreviewLarge) {
    if (!imagePreviewLarge) {
        return;
    }

    imagePreviewLarge.removeAttribute("src");
    imagePreviewLarge.alt = "";
}

export function setImagePreview(imagePreviewLarge, attachment, source) {
    if (!imagePreviewLarge) {
        return;
    }

    imagePreviewLarge.src = source;
    imagePreviewLarge.alt = attachment.name || "Attached image";
}

export function configureConfirmDialog(els, { title, message, actionLabel }) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmAcceptButton.textContent = actionLabel;
}
