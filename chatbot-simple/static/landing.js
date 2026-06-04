document.addEventListener("DOMContentLoaded", () => {
    const THEME_STORAGE_KEY = "workspace_theme_preference";
    const nav = document.querySelector(".site-nav");
    const sentinel = document.querySelector(".nav-sentinel");
    const navToggle = document.querySelector(".nav-toggle");
    const themeToggle = document.querySelector(".auth-theme-toggle");
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    const revealItems = document.querySelectorAll(".reveal, .stagger > *");
    const year = document.querySelector("[data-year]");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const prefersReducedMotion = () => reducedMotionQuery.matches;

    if (window.lucide) {
        window.lucide.createIcons();
    }

    function getStoredTheme() {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) || "dark";
        return ["system", "light", "dark"].includes(stored) ? stored : "dark";
    }

    function getResolvedTheme(theme = getStoredTheme()) {
        if (theme === "system") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }

        return theme;
    }

    function applyTheme(theme = getStoredTheme()) {
        const resolvedTheme = getResolvedTheme(theme);
        document.documentElement.dataset.theme = resolvedTheme;
        localStorage.setItem(THEME_STORAGE_KEY, theme);

        if (metaTheme) {
            metaTheme.setAttribute("content", resolvedTheme === "dark" ? "#020103" : "#f7f4ff");
        }

        if (themeToggle) {
            const nextLabel = resolvedTheme === "dark" ? "Light" : "Dark";
            const icon = themeToggle.querySelector("[data-theme-icon]");
            if (icon) {
                icon.textContent = nextLabel;
            }
            themeToggle.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()} theme`);
        }
    }

    applyTheme();

    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            const nextTheme = getResolvedTheme() === "dark" ? "light" : "dark";
            applyTheme(nextTheme);
        });
    }

    if (year) {
        year.textContent = new Date().getFullYear();
    }

    if (navToggle) {
        navToggle.addEventListener("click", () => {
            const isOpen = document.body.classList.toggle("nav-open");
            navToggle.setAttribute("aria-expanded", String(isOpen));
        });

        document.querySelectorAll(".nav-links a, .nav-actions a").forEach((link) => {
            link.addEventListener("click", () => {
                document.body.classList.remove("nav-open");
                navToggle.setAttribute("aria-expanded", "false");
            });
        });
    }

    if ("IntersectionObserver" in window && nav && sentinel) {
        const navObserver = new IntersectionObserver(
            ([entry]) => {
                nav.classList.toggle("is-scrolled", !entry.isIntersecting);
            },
            {
                root: null,
                threshold: 0,
                rootMargin: "-72px 0px 0px 0px",
            }
        );

        navObserver.observe(sentinel);
    } else if (nav) {
        nav.classList.add("is-scrolled");
    }

    function isInViewport(element) {
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        return rect.top < viewportHeight * 0.92 && rect.bottom > 0;
    }

    if ("IntersectionObserver" in window) {
        const pendingRevealItems = new Set(revealItems);

        function revealItem(item) {
            item.classList.add("is-visible");
            pendingRevealItems.delete(item);
        }

        function revealVisibleItems(observer = null) {
            pendingRevealItems.forEach((item) => {
                if (!isInViewport(item)) {
                    return;
                }

                revealItem(item);
                observer?.unobserve(item);
            });
        }

        const revealObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        return;
                    }

                    const target = entry.target;
                    const siblings = Array.from(target.parentElement?.children || []);
                    const staggerIndex = siblings.indexOf(target);
                    const delay = !prefersReducedMotion() && target.parentElement?.classList.contains("stagger")
                        ? Math.max(0, staggerIndex) * 100
                        : 0;

                    window.setTimeout(() => revealItem(target), delay);
                    observer.unobserve(target);
                });
            },
            {
                threshold: 0.14,
                rootMargin: "0px 0px -8% 0px",
            }
        );

        revealItems.forEach((item) => {
            if (isInViewport(item)) {
                revealItem(item);
                return;
            }

            revealObserver.observe(item);
        });
        window.setTimeout(() => revealVisibleItems(revealObserver), 120);
        window.setTimeout(() => revealVisibleItems(revealObserver), 700);

        if (window.location.hash) {
            window.setTimeout(() => {
                pendingRevealItems.forEach((item) => {
                    revealItem(item);
                    revealObserver.unobserve(item);
                });
            }, 300);
        }
    } else {
        revealItems.forEach((item) => item.classList.add("is-visible"));
    }

    document.querySelectorAll(".faq-list details").forEach((details) => {
        const summary = details.querySelector("summary");
        const content = details.querySelector(".faq-content");

        if (!summary || !content) {
            return;
        }

        if (details.open) {
            content.style.height = "auto";
        }

        summary.addEventListener("click", (event) => {
            if (prefersReducedMotion()) {
                return;
            }

            event.preventDefault();

            if (details.dataset.animating === "true") {
                return;
            }

            if (details.open) {
                closeDetails(details, content);
                return;
            }

            openDetails(details, content);
        });
    });

    function openDetails(details, content) {
        details.dataset.animating = "true";
        details.open = true;
        content.style.height = "0px";
        content.style.opacity = "0";

        window.requestAnimationFrame(() => {
            content.style.height = `${content.scrollHeight}px`;
            content.style.opacity = "1";
        });

        function finishOpen(event) {
            if (event.propertyName !== "height") {
                return;
            }

            content.style.height = "auto";
            details.dataset.animating = "false";
            content.removeEventListener("transitionend", finishOpen);
        }

        content.addEventListener("transitionend", finishOpen);
    }

    function closeDetails(details, content) {
        details.dataset.animating = "true";
        content.style.height = `${content.scrollHeight}px`;
        content.style.opacity = "1";

        window.requestAnimationFrame(() => {
            content.style.height = "0px";
            content.style.opacity = "0";
        });

        function finishClose(event) {
            if (event.propertyName !== "height") {
                return;
            }

            details.open = false;
            details.dataset.animating = "false";
            content.style.height = "";
            content.style.opacity = "";
            content.removeEventListener("transitionend", finishClose);
        }

        content.addEventListener("transitionend", finishClose);
    }
});
