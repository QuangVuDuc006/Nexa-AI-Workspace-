const FALLBACK_METADATA = {
    description: "General chat",
    badge: "CHAT",
    icon: "auto_awesome",
    category: "general",
};

const EXPLICIT_METADATA = [
    {
        match: /\bgpt[-\s]?5\.5\b/i,
        description: "Top reasoning",
        badge: "BEST",
        icon: "psychology",
        category: "reasoning",
    },
    {
        match: /\bgpt[-\s]?5\.4\b/i,
        description: "Fast replies",
        badge: "FAST",
        icon: "bolt",
        category: "fast",
    },
    {
        match: /deepseek.*v4.*pro/i,
        description: "Code tasks",
        badge: "CODE",
        icon: "code",
        category: "coding",
    },
    {
        match: /qwen3.*max/i,
        description: "Multilingual reasoning",
        badge: "SMART",
        icon: "psychology",
        category: "reasoning",
    },
    {
        match: /claude.*opus/i,
        description: "Deep analysis",
        badge: "PREMIUM",
        icon: "psychology",
        category: "reasoning",
    },
    {
        match: /claude.*sonnet/i,
        description: "Balanced speed",
        badge: "POPULAR",
        icon: "auto_awesome",
        category: "general",
    },
    {
        match: /gemini.*pro/i,
        description: "Research tasks",
        badge: "RESEARCH",
        icon: "search",
        category: "research",
    },
];

const HEURISTIC_METADATA = [
    {
        match: /coder|code|codestral/i,
        description: "Code workflows",
        badge: "CODE",
        icon: "code",
        category: "coding",
    },
    {
        match: /\b(reason|r1|reasoning)\b/i,
        description: "Problem solving",
        badge: "REASON",
        icon: "psychology",
        category: "reasoning",
    },
    {
        match: /\b(flash|turbo|mini)\b/i,
        description: "Fast replies",
        badge: "FAST",
        icon: "bolt",
        category: "fast",
    },
    {
        match: /\b(vision|vl)\b/i,
        description: "Image analysis",
        badge: "VISION",
        icon: "image",
        category: "vision",
    },
    {
        match: /\bopus\b/i,
        description: "Deep analysis",
        badge: "PREMIUM",
        icon: "psychology",
        category: "reasoning",
    },
    {
        match: /\bsonnet\b/i,
        description: "Balanced speed",
        badge: "POPULAR",
        icon: "auto_awesome",
        category: "general",
    },
];

const CAPABILITY_METADATA = {
    vision: {
        description: "Image analysis",
        badge: "VISION",
        icon: "image",
        category: "vision",
    },
    reasoning: {
        description: "Problem solving",
        badge: "REASON",
        icon: "psychology",
        category: "reasoning",
    },
    code_execution: {
        description: "Research tasks",
        badge: "RESEARCH",
        icon: "search",
        category: "research",
    },
};

function normalizeText(value) {
    return String(value || "").trim();
}

function getSearchableModelText(model) {
    return [
        model?.name,
        model?.id,
        model?.provider,
        ...(Array.isArray(model?.capabilities) ? model.capabilities : []),
    ].map(normalizeText).filter(Boolean).join(" ");
}

function findCapabilityMetadata(model) {
    const capabilities = Array.isArray(model?.capabilities) ? model.capabilities : [];
    const priority = ["reasoning", "vision", "code_execution"];
    const capability = priority.find((item) => capabilities.includes(item));

    return capability ? CAPABILITY_METADATA[capability] : null;
}

export function getModelMetadata(model = {}) {
    const name = normalizeText(model.name) || normalizeText(model.id) || "No Model Selected";
    const searchable = getSearchableModelText({...model, name});
    const explicit = EXPLICIT_METADATA.find((item) => item.match.test(searchable));
    const heuristic = HEURISTIC_METADATA.find((item) => item.match.test(searchable));
    const capability = findCapabilityMetadata(model);
    const metadata = explicit || heuristic || capability || FALLBACK_METADATA;

    return {
        name,
        description: metadata.description,
        badge: metadata.badge,
        icon: metadata.icon,
        category: metadata.category,
    };
}
