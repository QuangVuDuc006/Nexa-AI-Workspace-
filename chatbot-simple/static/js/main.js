import { createApiClient } from "./api.js";
import { createUploadsFeature } from "./features/uploads.js";
import { initChatWorkspace } from "../chat.js?v=math-error-fallback-1";

const apiClient = createApiClient(document.body?.dataset.csrfToken || "");

window.NexaAiApi = apiClient;
window.NexaAiUploads = createUploadsFeature(apiClient);

initChatWorkspace();
