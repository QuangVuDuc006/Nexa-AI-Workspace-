import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getRedirectResult,
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const authButtons = document.querySelectorAll("[data-firebase-google]");
const logoutButtons = document.querySelectorAll("[data-firebase-logout]");
const statusNodes = document.querySelectorAll("[data-firebase-status]");
const requiresAuth = document.body?.dataset.requireAuth === "true";
const hasServerSession = document.body?.dataset.authenticated === "true";
const serverAuthProvider = document.body?.dataset.authProvider || "guest";
let authActionInProgress = false;
let csrfToken = document.body?.dataset.csrfToken || "";

const REDIRECT_FALLBACK_CODES = new Set([
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
]);

function formatFirebaseError(error) {
    const code = error?.code || "unknown";
    const message = error?.message || "Firebase sign-in failed.";
    const hints = {
        "auth/popup-closed-by-user": "The Google sign-in popup was closed before login finished.",
        "auth/cancelled-popup-request": "A second popup request cancelled the first one. Try again once.",
        "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication settings.",
        "auth/operation-not-allowed": "Google sign-in is not enabled in Firebase Authentication.",
        "auth/invalid-api-key": "The Firebase API key is invalid or missing.",
        "auth/invalid-auth-domain": "The Firebase authDomain value is invalid.",
        "auth/network-request-failed": "Network request failed while contacting Firebase.",
        "auth/popup-blocked": "The browser blocked the popup.",
    };

    return `${hints[code] || "Firebase Authentication returned an error."} (${code}) ${message}`;
}

function setStatus(message, isError = false) {
    statusNodes.forEach((node) => {
        node.hidden = !message;
        node.textContent = message;
        node.classList.toggle("auth-error", isError);
    });
}

function setButtonsDisabled(disabled) {
    authButtons.forEach((button) => {
        button.disabled = disabled;
    });
}

function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "/chat";
}

async function getCsrfToken() {
    if (csrfToken) {
        return csrfToken;
    }

    const response = await fetch("/api/csrf", {
        credentials: "same-origin",
    });
    const data = await response.json().catch(() => ({}));
    csrfToken = data.csrfToken || "";
    return csrfToken;
}

async function syncFlaskSession(user) {
    const idToken = await user.getIdToken();
    const token = await getCsrfToken();
    const response = await fetch("/api/firebase/session", {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
        },
        body: JSON.stringify({
            idToken,
            user: {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
            },
        }),
    });

    if (!response.ok) {
        throw new Error("Could not create a workspace session.");
    }

    return response.json();
}

async function clearFlaskSession() {
    const token = await getCsrfToken();
    await fetch("/api/firebase/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
        },
    }).catch(() => {});
}

async function loadFirebase() {
    const response = await fetch("/api/firebase/config");
    const data = await response.json();

    if (!data.configured) {
        throw new Error(`Missing Firebase environment values: ${data.missing.join(", ")}`);
    }

    const app = getApps().length ? getApps()[0] : initializeApp(data.config);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return { auth, provider };
}

loadFirebase()
    .then(({ auth, provider }) => {
        setStatus("");

        getRedirectResult(auth)
            .then(async (result) => {
                if (!result?.user) {
                    return;
                }

                await syncFlaskSession(result.user);
                window.location.href = getNextUrl();
            })
            .catch((error) => {
                console.error("Firebase redirect sign-in failed", error);
                setStatus(formatFirebaseError(error), true);
                setButtonsDisabled(false);
            });

        authButtons.forEach((button) => {
            button.addEventListener("click", async () => {
                if (authActionInProgress) {
                    return;
                }

                authActionInProgress = true;
                setButtonsDisabled(true);
                setStatus("Opening Google sign-in...");

                try {
                    const result = await signInWithPopup(auth, provider);
                    await syncFlaskSession(result.user);
                    window.location.href = getNextUrl();
                } catch (error) {
                    console.error("Firebase popup sign-in failed", error);
                    setStatus(formatFirebaseError(error), true);

                    if (REDIRECT_FALLBACK_CODES.has(error?.code)) {
                        console.warn("Falling back to Firebase redirect sign-in", error);
                        await signInWithRedirect(auth, provider);
                        return;
                    }

                    setButtonsDisabled(false);
                } finally {
                    authActionInProgress = false;
                }
            });
        });

        logoutButtons.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                await signOut(auth).catch(() => {});
                await clearFlaskSession();
                window.location.href = "/";
            });
        });

        onAuthStateChanged(auth, async (user) => {
            if (user && !hasServerSession) {
                await syncFlaskSession(user).catch(() => {});
                if (requiresAuth) {
                    window.location.reload();
                }
                return;
            }

            if (!user && requiresAuth && !hasServerSession && !authActionInProgress) {
                window.location.href = "/";
                return;
            }

            if (!user && requiresAuth && hasServerSession && serverAuthProvider === "firebase" && !authActionInProgress) {
                await clearFlaskSession();
                window.location.href = "/";
            }
        });
    })
    .catch((error) => {
        console.error("Firebase initialization failed", error);
        setStatus(formatFirebaseError(error), true);
        setButtonsDisabled(true);

        if (requiresAuth && !hasServerSession) {
            window.location.href = "/";
        }
    });
