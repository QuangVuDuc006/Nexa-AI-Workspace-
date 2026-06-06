export function formatDate(timestamp) {
    const value = Number(timestamp);

    if (!value) {
        return "No activity";
    }

    const diff = Date.now() - value;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
        return "now";
    }

    if (diff < hour) {
        return `${Math.floor(diff / minute)} min ago`;
    }

    if (diff < day) {
        return `${Math.floor(diff / hour)} hr ago`;
    }

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
    }).format(new Date(value));
}

export function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
