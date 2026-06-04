(function () {
    const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
    const TEXT_EXTENSIONS = new Set(["txt", "md", "pdf", "docx"]);

    function extensionFor(file) {
        return file.name.includes(".")
            ? file.name.split(".").pop().toLowerCase()
            : "";
    }

    function isSupportedTextFile(file) {
        const extension = extensionFor(file);

        return TEXT_EXTENSIONS.has(extension) ||
            file.type === "text/plain" ||
            file.type === "text/markdown" ||
            file.type === "application/pdf" ||
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    function isSupportedImageFile(file) {
        const extension = extensionFor(file);
        return IMAGE_MIME_TYPES.has(file.type) || ["png", "jpg", "jpeg", "webp", "gif"].includes(extension);
    }

    function unsupportedFileMessage(file) {
        return `${file.name} is not supported. Upload txt, md, pdf, docx, or image files.`;
    }

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await window.NexaAiApi.apiFetch("/api/uploads", {
            method: "POST",
            body: formData,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Could not upload ${file.name}`);
        }

        return data.attachment;
    }

    window.NexaAiUploads = {
        isSupportedTextFile,
        isSupportedImageFile,
        unsupportedFileMessage,
        uploadFile,
    };
}());
