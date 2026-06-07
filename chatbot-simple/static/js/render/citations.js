const CITATION_MARKER_RE = /\[\[(?:cite|source):(\d+)\]\]|\[(\d+)\]/g;

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

export function createCitationReference(citation, citationId = "", documentRef = document) {
    const reference = documentRef.createElement("span");
    reference.className = "citation-ref";
    reference.title = citationTitle(citation);
    reference.setAttribute("aria-hidden", "true");
    reference.textContent = "";
    return reference;
}

export function citationMarkerParts(text, citations = []) {
    const lookup = citationLookup(citations);
    const parts = [];
    let cursor = 0;
    CITATION_MARKER_RE.lastIndex = 0;
    String(text || "").replace(CITATION_MARKER_RE, (match, markerId, bareId, offset) => {
        if (offset > cursor) {
            parts.push({ type: "text", text: String(text || "").slice(cursor, offset) });
        }

        const id = markerId || bareId;
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

            if (!parent || parent.closest("code, pre, kbd, samp, .katex, .math-inline, .math-block, .citation-ref")) {
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
                fragment.appendChild(createCitationReference(part.citation, part.citationId, documentRef));
                replacements += 1;
            } else {
                fragment.appendChild(documentRef.createTextNode(part.text));
            }
        });

        node.replaceWith(fragment);
    });

    return replacements;
}
