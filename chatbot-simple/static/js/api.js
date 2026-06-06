function isUnsafeMethod(method) {
    return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
}

export function createApiClient(initialCsrfToken = "") {
    let csrfToken = initialCsrfToken;

    async function refreshCsrfToken() {
        const response = await fetch("/api/csrf", {
            credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));

        if (data.csrfToken) {
            csrfToken = data.csrfToken;
        }

        return csrfToken;
    }

    async function apiFetch(url, options = {}, retry = true) {
        const method = String(options.method || "GET").toUpperCase();
        const headers = new Headers(options.headers || {});

        if (isUnsafeMethod(method)) {
            if (!csrfToken) {
                await refreshCsrfToken();
            }
            headers.set("X-CSRF-Token", csrfToken);
        }

        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            method,
            headers,
        });

        if (response.status === 403 && retry) {
            const data = await response.clone().json().catch(() => ({}));

            if (data.code === "invalid_csrf_token") {
                await refreshCsrfToken();
                return apiFetch(url, options, false);
            }
        }

        return response;
    }

    return {
        apiFetch,
        refreshCsrfToken,
        get csrfToken() {
            return csrfToken;
        },
    };
}
