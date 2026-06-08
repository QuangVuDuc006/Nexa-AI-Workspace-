import { getModelMetadata } from "../utils/modelMetadata.js";

function normalizeText(value) {
    return String(value || "").trim();
}

function getSelectedModel(provider) {
    const selectedModel = normalizeText(provider?.selectedModel);
    const model = (provider?.models || []).find((item) => item.id === selectedModel);

    return {
        id: selectedModel,
        name: normalizeText(model?.name) || selectedModel || "No Model Selected",
        provider: normalizeText(model?.provider || provider?.providerType || provider?.provider || provider?.label),
        capabilities: Array.isArray(model?.capabilities) ? model.capabilities : [],
        contextWindow: model?.contextWindow || null,
        supportsVision: Boolean(model?.supportsVision),
        supportsTools: Boolean(model?.supportsTools),
        supportsStreaming: model?.supportsStreaming !== false,
    };
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, "&quot;");
}

export function renderModelSwitcher({root, select, prefix, providers, activeProvider, activeProviderId, isDisabled}) {
    if (!root || !select) {
        return;
    }

    const button = root.querySelector(".model-switcher-button");
    const menu = root.querySelector(".model-switcher-menu");
    const buttonName = root.querySelector(".model-switcher-current-name");
    const buttonIcon = root.querySelector(".model-switcher-current-icon");
    const hasProviders = providers.length > 0;
    const selectedId = activeProvider?.id || activeProviderId || providers[0]?.id || "";
    const selectedProvider = providers.find((provider) => provider.id === selectedId) || activeProvider || providers[0] || null;
    const selectedModel = getSelectedModel(selectedProvider);
    const disabled = Boolean(isDisabled || !hasProviders);

    if (prefix) {
        prefix.textContent = selectedProvider?.selectedModel ? "Using" : "";
    }

    select.textContent = "";

    if (!hasProviders) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No Model Selected";
        select.appendChild(option);
    } else {
        providers.forEach((provider) => {
            const model = getSelectedModel(provider);
            const option = document.createElement("option");
            option.value = provider.id;
            option.textContent = model.name;
            select.appendChild(option);
        });
    }

    select.value = selectedId;
    select.disabled = disabled;

    if (button) {
        button.disabled = disabled;
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-disabled", String(disabled));
    }

    if (buttonName) {
        buttonName.textContent = selectedModel.name;
    }

    if (buttonIcon) {
        buttonIcon.textContent = getModelMetadata(selectedModel).icon;
    }

    if (menu) {
        menu.innerHTML = hasProviders
            ? providers.map((provider) => {
                const model = getSelectedModel(provider);
                const metadata = getModelMetadata(model);
                const selected = provider.id === selectedId;
                const itemId = `model-switcher-option-${escapeAttribute(provider.id)}`;

                return `
                    <button
                        class="model-switcher-item${selected ? " is-selected" : ""}"
                        id="${itemId}"
                        type="button"
                        role="option"
                        aria-selected="${selected ? "true" : "false"}"
                        tabindex="-1"
                        data-provider-id="${escapeAttribute(provider.id)}"
                    >
                        <span class="material-symbols-outlined model-switcher-item-icon" aria-hidden="true">${escapeHtml(metadata.icon)}</span>
                        <span class="model-switcher-item-copy">
                            <span class="model-switcher-item-heading">
                                <span class="model-switcher-item-name">${escapeHtml(metadata.name)}</span>
                                ${metadata.badge ? `<span class="model-switcher-badge">${escapeHtml(metadata.badge)}</span>` : ""}
                            </span>
                            <span class="model-switcher-item-description">${escapeHtml(metadata.description)}</span>
                        </span>
                        <span class="material-symbols-outlined model-switcher-check" aria-hidden="true">check</span>
                    </button>
                `;
            }).join("")
            : `
                <div class="model-switcher-empty" role="option" aria-selected="true">
                    <span>No model selected</span>
                    <small>Connect a provider in settings</small>
                </div>
            `;
        menu.setAttribute("aria-hidden", "true");
    }

    root.classList.toggle("is-disabled", disabled);
    root.classList.remove("is-open");
}

export function initModelSwitcher(root, onSelect) {
    if (!root) {
        return;
    }

    const button = root.querySelector(".model-switcher-button");
    const menu = root.querySelector(".model-switcher-menu");

    if (!button || !menu) {
        return;
    }

    function getItems() {
        return Array.from(menu.querySelectorAll(".model-switcher-item"));
    }

    function updateActiveItem(index) {
        const items = getItems();
        items.forEach((item, itemIndex) => {
            item.classList.toggle("is-keyboard-active", itemIndex === index);
        });

        if (items[index]) {
            button.setAttribute("aria-activedescendant", items[index].id);
        } else {
            button.removeAttribute("aria-activedescendant");
        }
    }

    function selectedIndex() {
        const items = getItems();
        const index = items.findIndex((item) => item.getAttribute("aria-selected") === "true");

        return index >= 0 ? index : 0;
    }

    function openMenu(index = selectedIndex()) {
        if (button.disabled) {
            return;
        }

        root.classList.add("is-open");
        button.setAttribute("aria-expanded", "true");
        menu.setAttribute("aria-hidden", "false");
        updateActiveItem(index);

        const items = getItems();
        items[index]?.focus({preventScroll: true});
    }

    function closeMenu({focusButton = false} = {}) {
        root.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
        menu.setAttribute("aria-hidden", "true");
        button.removeAttribute("aria-activedescendant");
        updateActiveItem(-1);

        if (focusButton) {
            button.focus({preventScroll: true});
        }
    }

    function chooseItem(item) {
        const providerId = item?.dataset.providerId;

        if (!providerId) {
            return;
        }

        closeMenu({focusButton: true});
        onSelect(providerId);
    }

    button.addEventListener("click", () => {
        if (root.classList.contains("is-open")) {
            closeMenu();
            return;
        }

        openMenu();
    });

    root.addEventListener("click", (event) => {
        const item = event.target instanceof Element
            ? event.target.closest(".model-switcher-item")
            : null;

        if (item && root.contains(item)) {
            chooseItem(item);
        }
    });

    root.addEventListener("keydown", (event) => {
        const items = getItems();
        const activeIndex = Math.max(0, items.findIndex((item) => item.classList.contains("is-keyboard-active")));
        const isOpen = root.classList.contains("is-open");

        if (event.key === "Escape") {
            if (isOpen) {
                event.preventDefault();
                closeMenu({focusButton: true});
            }
            return;
        }

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();

            if (!isOpen) {
                openMenu(event.key === "ArrowDown" ? selectedIndex() : items.length - 1);
                return;
            }

            const direction = event.key === "ArrowDown" ? 1 : -1;
            const nextIndex = (activeIndex + direction + items.length) % items.length;
            updateActiveItem(nextIndex);
            items[nextIndex]?.focus({preventScroll: true});
            return;
        }

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();

            if (!isOpen) {
                openMenu();
                return;
            }

            chooseItem(document.activeElement?.closest(".model-switcher-item") || items[activeIndex]);
        }
    });

    document.addEventListener("pointerdown", (event) => {
        if (event.target instanceof Node && !root.contains(event.target)) {
            closeMenu();
        }
    });

    window.addEventListener("resize", () => closeMenu());
}
