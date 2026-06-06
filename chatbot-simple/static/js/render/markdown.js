export function normalizeEscapedLatex(source) {
    return String(source || "")
        .replace(/\\\\(?=[\[\]\(\)])/g, "\\")
        .replace(/\\\\(?=(?:begin|end|frac|dfrac|tfrac|sqrt|det|operatorname|lambda|mathbb|mathrm|mathbf|mathcal|text|times|cdot|neq|ne|leq?|geq?|approx|div|pm|mp|sum|prod|int|lim|infty|left|right|to|Rightarrow|Leftrightarrow|sin|cos|tan|log|ln)\b)/g, "\\");
}

export function normalizeLatexSource(source) {
    return normalizeEscapedLatex(source)
        .replace(/âˆš\s*\(([^)]+)\)/g, "\\sqrt{$1}")
        .replace(/âˆš\s*([A-Za-z0-9]+)/g, "\\sqrt{$1}")
        .replace(/â‰ /g, "\\ne")
        .replace(/â‰¤/g, "\\le")
        .replace(/â‰¥/g, "\\ge")
        .replace(/â‰ˆ/g, "\\approx")
        .replace(/Ã—/g, "\\times")
        .replace(/Ã·/g, "\\div")
        .replace(/Â±/g, "\\pm")
        .replace(/âˆ“/g, "\\mp")
        .replace(/âˆš/g, "\\sqrt{}")
        .replace(/âˆ‘/g, "\\sum")
        .replace(/âˆ«/g, "\\int")
        .replace(/âˆž/g, "\\infty")
        .replace(/â†’/g, "\\to")
        .replace(/â‡’/g, "\\Rightarrow")
        .replace(/â‡”/g, "\\Leftrightarrow")
        .replace(/âˆ’/g, "-")
        .replace(/[â€œâ€]/g, "\"")
        .replace(/[â€˜â€™]/g, "'");
}

export function findMathToken(source) {
    const delimiters = [
        { open: "\\[", close: "\\]", display: true },
        { open: "$$", close: "$$", display: true },
        { open: "\\(", close: "\\)", display: false },
        { open: "$", close: "$", display: false },
    ];
    let firstToken = null;

    for (const delimiter of delimiters) {
        let start = source.indexOf(delimiter.open);

        while (start !== -1) {
            if (delimiter.open === "$") {
                const previous = source[start - 1] || "";
                const next = source[start + 1] || "";

                if (previous === "\\" || /\s/.test(next)) {
                    start = source.indexOf(delimiter.open, start + delimiter.open.length);
                    continue;
                }
            }

            const end = source.indexOf(delimiter.close, start + delimiter.open.length);

            if (end !== -1) {
                const raw = source.slice(start + delimiter.open.length, end).trim();
                const beforeClose = source[end - 1] || "";

                if (raw && (delimiter.open !== "$" || !/\s/.test(beforeClose))) {
                    const token = {
                        start,
                        end: end + delimiter.close.length,
                        raw,
                        display: delimiter.display,
                    };

                    if (!firstToken || token.start < firstToken.start) {
                        firstToken = token;
                    }
                }
            }

            break;
        }
    }

    return firstToken;
}

function getDelimitedMathSource(source, displayMode) {
    return displayMode ? `\\[${source}\\]` : `\\(${source}\\)`;
}

export function createMathNode(source, displayMode) {
    const normalizedSource = normalizeLatexSource(source);
    const fallbackText = getDelimitedMathSource(normalizedSource, displayMode);

    if (!window.katex) {
        return document.createTextNode(fallbackText);
    }

    const wrapper = document.createElement(displayMode ? "div" : "span");
    wrapper.className = displayMode ? "math-block" : "math-inline";

    try {
        wrapper.innerHTML = window.katex.renderToString(normalizedSource, {
            displayMode,
            strict: "ignore",
            throwOnError: false,
            trust: false,
        });
        return wrapper;
    } catch (error) {
        return document.createTextNode(fallbackText);
    }
}

export function appendMathNode(fragment, source, displayMode) {
    fragment.appendChild(createMathNode(source, displayMode));
}

export function restoreMathPlaceholders(root, tokens = []) {
    if (!root || tokens.length === 0) {
        return;
    }

    const placeholderPattern = /@@nexamath(\d+)@@/g;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;

            if (!parent || parent.closest("code, pre, kbd, samp")) {
                return NodeFilter.FILTER_REJECT;
            }

            return /@@nexamath\d+@@/.test(node.nodeValue || "")
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });
    const nodes = [];

    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    nodes.forEach((node) => {
        const source = node.nodeValue || "";
        const parent = node.parentElement;
        const onlyDisplayMath = source.trim().match(/^@@nexamath(\d+)@@$/);

        if (
            onlyDisplayMath &&
            parent?.tagName === "P" &&
            parent.textContent.trim() === source.trim() &&
            tokens[Number(onlyDisplayMath[1])]?.display
        ) {
            const token = tokens[Number(onlyDisplayMath[1])];
            parent.replaceWith(createMathNode(token.source, token.display));
            return;
        }

        const fragment = document.createDocumentFragment();
        let cursor = 0;
        placeholderPattern.lastIndex = 0;
        source.replace(placeholderPattern, (match, index, offset) => {
            if (offset > cursor) {
                fragment.appendChild(document.createTextNode(source.slice(cursor, offset)));
            }

            const token = tokens[Number(index)];
            fragment.appendChild(token ? createMathNode(token.source, token.display) : document.createTextNode(match));
            cursor = offset + match.length;
            return match;
        });

        if (cursor < source.length) {
            fragment.appendChild(document.createTextNode(source.slice(cursor)));
        }

        node.replaceWith(fragment);
    });
}

function replaceMathTextNode(textNode) {
    const source = normalizeEscapedLatex(textNode.nodeValue || "");

    if (!/[\\$]/.test(source)) {
        return;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let token = findMathToken(source.slice(cursor));

    while (token) {
        const absoluteStart = cursor + token.start;
        const absoluteEnd = cursor + token.end;

        if (absoluteStart > cursor) {
            fragment.appendChild(document.createTextNode(source.slice(cursor, absoluteStart)));
        }

        appendMathNode(fragment, token.raw, token.display);
        cursor = absoluteEnd;
        token = findMathToken(source.slice(cursor));
    }

    if (cursor < source.length) {
        fragment.appendChild(document.createTextNode(source.slice(cursor)));
    }

    textNode.replaceWith(fragment);
}

export function renderKatexMathInElement(element) {
    if (!element) {
        return;
    }

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;

            if (!parent || parent.closest("code, pre, kbd, samp, .katex, .math-inline, .math-block")) {
                return NodeFilter.FILTER_REJECT;
            }

            return /[\\$]/.test(node.nodeValue || "")
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });
    const nodes = [];

    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    nodes.forEach(replaceMathTextNode);

    if (!window.renderMathInElement || element.querySelector(".katex")) {
        return;
    }

    window.renderMathInElement(element, {
        delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
    });
}

export function renderAllAssistantMath() {
    document.querySelectorAll(".assistant-message .message-content, .ai-message .message-content")
        .forEach((element) => renderKatexMathInElement(element));
}
