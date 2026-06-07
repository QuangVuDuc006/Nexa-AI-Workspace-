const CITATION_MARKER_RE = /\[\[(?:cite|source):(\d+)\]\]/g;

export function normalizeCitationId(value) {
    return String(value ?? "").trim();
}

export function citationLookup(citations = []) {
    const lookup = new Map();

    citations.forEach((citation) => {
        const id = normalizeCitationId(citation.id || citation.citation_id || citation.citationId || citation.index);

        if (id) {
            lookup.set(id, citation);
        }
    });

    return lookup;
}

export function citationDisplayText(citation) {
    const filename = String(citation?.filename || "source").replace(/\.[^.]+$/, "");
    const pageNumber = citation?.page_number ?? citation?.pageNumber;
    const base = filename.length > 28 ? `${filename.slice(0, 25).trim()}...` : filename;

    return pageNumber ? `${base} p.${pageNumber}` : base;
}

export function citationTitle(citation) {
    const parts = [String(citation?.filename || "Uploaded document")];
    const pageNumber = citation?.page_number ?? citation?.pageNumber;
    const sectionTitle = citation?.section_title || citation?.sectionTitle;
    const chunkIndex = citation?.chunk_index ?? citation?.chunkIndex;

    if (pageNumber) {
        parts.push(`page ${pageNumber}`);
    }

    if (sectionTitle) {
        parts.push(`section "${sectionTitle}"`);
    }

    if (chunkIndex !== undefined && chunkIndex !== null) {
        parts.push(`chunk ${Number(chunkIndex) + 1}`);
    }

    return parts.join(" - ");
}

export function citationHref(citation) {
    const explicitUrl = String(citation?.url || "").trim();

    if (explicitUrl) {
        return explicitUrl;
    }

    const documentId = String(citation?.document_id || citation?.documentId || "").trim();

    if (!documentId) {
        return "";
    }

    const pageNumber = citation?.page_number ?? citation?.pageNumber;
    let href = `/api/documents/${encodeURIComponent(documentId)}/content`;

    if (pageNumber) {
        href += `#page=${encodeURIComponent(String(pageNumber))}`;
    }

    return href;
}

export function createCitationPill(citation, documentRef = document) {
    const href = citationHref(citation);
    const pill = documentRef.createElement(href ? "a" : "span");
    pill.className = "citation-pill";
    pill.title = citationTitle(citation);

    if (href) {
        pill.href = href;
        pill.target = "_blank";
        pill.rel = "noreferrer";
    } else {
        pill.setAttribute("role", "note");
    }

    const icon = documentRef.createElement("span");
    icon.className = "citation-pill-icon";
    icon.setAttribute("aria-hidden", "true");
    pill.appendChild(icon);

    const label = documentRef.createElement("span");
    label.textContent = citationDisplayText(citation);
    pill.appendChild(label);

    return pill;
}

export function citationMarkerParts(text, citations = []) {
    const lookup = citationLookup(citations);
    const parts = [];
    let cursor = 0;
    CITATION_MARKER_RE.lastIndex = 0;
    String(text || "").replace(CITATION_MARKER_RE, (match, id, offset) => {
        if (offset > cursor) {
            parts.push({ type: "text", text: String(text || "").slice(cursor, offset) });
        }

        const citation = lookup.get(normalizeCitationId(id));

        if (citation) {
            parts.push({ type: "citation", citationId: normalizeCitationId(id), citation });
        } else {
            parts.push({ type: "text", text: match });
        }

        cursor = offset + match.length;
        return match;
    });

    if (cursor < String(text || "").length) {
        parts.push({ type: "text", text: String(text || "").slice(cursor) });
    }

    return parts;
}

export function replaceCitationMarkers(root, citations = [], documentRef = document) {
    if (!root || !citations.length) {
        return 0;
    }

    const lookup = citationLookup(citations);

    if (lookup.size === 0) {
        return 0;
    }

    const walker = documentRef.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;

            if (!parent || parent.closest("code, pre, kbd, samp, .katex, .math-inline, .math-block, .citation-pill")) {
                return NodeFilter.FILTER_REJECT;
            }

            CITATION_MARKER_RE.lastIndex = 0;
            return CITATION_MARKER_RE.test(node.nodeValue || "")
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });
    const nodes = [];

    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    let replacements = 0;

    nodes.forEach((node) => {
        const source = node.nodeValue || "";
        const fragment = documentRef.createDocumentFragment();
        const parts = citationMarkerParts(source, citations);

        parts.forEach((part) => {
            if (part.type === "citation") {
                fragment.appendChild(createCitationPill(part.citation, documentRef));
                replacements += 1;
            } else {
                fragment.appendChild(documentRef.createTextNode(part.text));
            }
        });

        node.replaceWith(fragment);
    });

    return replacements;
}
