export function getAttachmentPreviewSource(attachment) {
    return attachment?.previewUrl || attachment?.url || attachment?.dataUrl || attachment?.data_url || "";
}

export function createMessageImageGrid(attachments, context) {
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
        preview.src = context.getAttachmentPreviewSource(attachment);
        preview.alt = attachment.name || "Attached image";
        preview.className = "message-inline-image";
        preview.loading = "lazy";
        previewButton.appendChild(preview);
        grid.appendChild(previewButton);
    });

    return grid;
}

export function createAttachmentPills(attachments, context) {
    const container = document.createElement("div");
    container.className = "message-file-list";

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
        size.textContent = context.formatBytes(Number(attachment.size) || 0);
        pill.appendChild(size);
        container.appendChild(pill);
    });

    return container;
}

export function createUserMessageAttachments(imageAttachments, fileAttachments, context) {
    const container = document.createElement("div");
    container.className = "message-attachments";

    if (imageAttachments.length) {
        container.appendChild(createMessageImageGrid(imageAttachments, context));
    }

    if (fileAttachments.length) {
        container.appendChild(createAttachmentPills(fileAttachments, context));
    }

    return container;
}

export function createPendingAttachmentChip(attachment, context) {
    const chip = document.createElement("div");
    chip.className = `attachment-chip ${attachment.kind === "image" ? "image-chip" : ""}`;
    chip.dataset.attachmentId = attachment.id;

    if (attachment.kind === "image") {
        const previewButton = document.createElement("button");
        previewButton.type = "button";
        previewButton.className = "attachment-image-trigger";
        previewButton.dataset.action = "open-image-preview";
        previewButton.dataset.attachmentId = attachment.id || "";
        previewButton.setAttribute("aria-label", `Open preview for ${attachment.name}`);

        const preview = document.createElement("img");
        preview.src = context.getAttachmentPreviewSource(attachment);
        preview.alt = attachment.name || "Attached image";
        preview.className = "attachment-preview";
        previewButton.appendChild(preview);
        chip.appendChild(previewButton);
    } else {
        const name = document.createElement("span");
        name.textContent = attachment.name;
        chip.appendChild(name);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.dataset.action = "remove-attachment";
    removeButton.setAttribute("aria-label", `Remove ${attachment.name}`);
    removeButton.innerHTML = '<i data-lucide="x"></i>';
    chip.appendChild(removeButton);

    return chip;
}

export function createProcessingAttachmentChip() {
    const chip = document.createElement("div");
    chip.className = "attachment-chip processing-chip";
    chip.innerHTML = `
        <span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>Processing file</span>
    `;
    return chip;
}

export function renderPendingAttachmentTray(attachmentTray, attachments, context) {
    if (!attachmentTray) {
        return;
    }

    attachmentTray.hidden = attachments.length === 0 && !context.isProcessingAttachment;
    attachmentTray.textContent = "";

    attachments.forEach((attachment) => {
        attachmentTray.appendChild(createPendingAttachmentChip(attachment, context));
    });

    if (context.isProcessingAttachment) {
        attachmentTray.appendChild(createProcessingAttachmentChip());
    }
}
