import { IMAGE_MIME_TYPES, TEXT_EXTENSIONS } from "../utils/constants.js";

function extensionFor(file) {
    return file.name.includes(".")
        ? file.name.split(".").pop().toLowerCase()
        : "";
}

export function isSupportedTextFile(file) {
    const extension = extensionFor(file);

    return TEXT_EXTENSIONS.has(extension) ||
        file.type === "text/plain" ||
        file.type === "text/markdown" ||
        file.type === "application/pdf" ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function isSupportedImageFile(file) {
    const extension = extensionFor(file);
    return IMAGE_MIME_TYPES.has(file.type) || ["png", "jpg", "jpeg", "webp", "gif"].includes(extension);
}

export function unsupportedFileMessage(file) {
    return `${file.name} is not supported. Upload txt, md, pdf, docx, or image files.`;
}

export function createUploadsFeature(apiClient) {
    async function uploadFile(file) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await apiClient.apiFetch("/api/uploads", {
            method: "POST",
            body: formData,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Could not upload ${file.name}`);
        }

        return data.attachment;
    }

    return {
        isSupportedTextFile,
        isSupportedImageFile,
        unsupportedFileMessage,
        uploadFile,
    };
}
