import { renderModelSwitcher } from "../components/modelSwitcher.js";

export function getProviderModelName(provider) {
    const selectedModel = provider?.selectedModel || "";
    const model = (provider?.models || []).find((item) => item.id === selectedModel);
    return model?.name || selectedModel || "No Model Selected";
}

export function getProviderSwitcherLabel(provider) {
    return getProviderModelName(provider);
}

export function renderActiveProviderSwitcher(els, providerWorkspace, isSending) {
    if (!els.activeProviderSelect) {
        return;
    }

    const active = providerWorkspace.activeProvider;
    const providers = [...providerWorkspace.providers];

    if (active?.isEnvironment && !providers.some((provider) => provider.id === active.id)) {
        providers.unshift(active);
    }

    renderModelSwitcher({
        root: els.activeModelSwitcher,
        select: els.activeProviderSelect,
        prefix: els.activeModelPrefix,
        providers,
        activeProvider: active,
        activeProviderId: providerWorkspace.activeProviderId,
        isDisabled: isSending || providers.every((provider) => provider.isEnvironment),
    });
}

export function setProviderStatusElements(els, message, isError = false) {
    if (els.detectModelsStatus) {
        els.detectModelsStatus.textContent = message || "";
        els.detectModelsStatus.classList.toggle("error", isError);
    }

    if (els.connectionStatus && message) {
        els.connectionStatus.textContent = message;
        els.connectionStatus.classList.toggle("connected", !isError && /connected|detected|saved/i.test(message));
        els.connectionStatus.classList.toggle("error", isError);
    }
}

export function renderModelOptions(select, models, selectedModel, isSending) {
    if (!select) {
        return;
    }

    select.textContent = "";

    if (models.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No models detected";
        select.appendChild(option);
        select.disabled = true;
        return;
    }

    models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.name || model.id;
        select.appendChild(option);
    });

    select.value = models.some((model) => model.id === selectedModel)
        ? selectedModel
        : models[0].id;
    select.disabled = isSending;
}

export function createSavedProviderListHtml(providers, context) {
    if (providers.length === 0) {
        return `<div class="saved-provider-empty">No saved providers yet.</div>`;
    }

    return providers.map((provider) => `
        <div class="saved-provider-item${provider.isActive ? " active" : ""}" data-provider-id="${context.escapeAttribute(provider.id)}">
            <span class="saved-provider-copy">
                <strong>${context.escapeHtml(provider.provider || provider.label || provider.providerType)}</strong>
                <span>${context.escapeHtml(getProviderModelName(provider))}${provider.maskedApiKey ? ` \u00b7 ${context.escapeHtml(provider.maskedApiKey)}` : ""}</span>
            </span>
            <span class="saved-provider-actions">
                <button type="button" data-provider-action="activate" aria-label="Use ${context.escapeAttribute(provider.provider || provider.providerType)}" ${provider.isActive ? "disabled" : ""}>
                    <span class="material-symbols-outlined">check_circle</span>
                </button>
                <button type="button" data-provider-action="edit" aria-label="Edit ${context.escapeAttribute(provider.provider || provider.providerType)}">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="delete-provider-button" type="button" data-provider-action="delete" aria-label="Delete ${context.escapeAttribute(provider.provider || provider.providerType)}">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </span>
        </div>
    `).join("");
}

export function renderProviderSettingsPanel(els, context) {
    if (!els.providerForm) {
        return;
    }

    renderModelOptions(els.detectedModelSelect, context.models, context.selectedModel, context.isSending);

    if (els.manualModelField) {
        els.manualModelField.hidden = context.models.length > 0;
    }

    if (els.activeProviderSummary) {
        els.activeProviderSummary.textContent = context.providerWorkspace.activeProvider
            ? `Using ${getProviderModelName(context.providerWorkspace.activeProvider)}`
            : "No model selected";
    }

    if (els.connectionStatus) {
        const activeStatus = context.providerWorkspace.activeProvider?.connectionStatus || "Not connected";
        els.connectionStatus.textContent = activeStatus === "environment"
            ? "Environment fallback"
            : (activeStatus === "not_configured" ? "Not connected" : activeStatus);
        els.connectionStatus.classList.toggle("connected", ["connected", "environment"].includes(activeStatus));
        els.connectionStatus.classList.remove("error");
    }

    if (els.savedProviderList) {
        els.savedProviderList.innerHTML = createSavedProviderListHtml(context.providerWorkspace.providers, context);
    }

    renderActiveProviderSwitcher(els, context.providerWorkspace, context.isSending);
}
