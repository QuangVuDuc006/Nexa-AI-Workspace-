import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth, firebaseMissingKeys, googleProvider, isFirebaseConfigured } from "../lib/firebase";

const AuthContext = createContext(null);

const REDIRECT_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

let csrfToken = "";

function formatFirebaseError(error) {
  const code = error?.code || "unknown";
  const message = error?.message || "Firebase sign-in failed.";

  const hints = {
    "auth/popup-closed-by-user": "The Google sign-in popup was closed before the login finished.",
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

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

async function postWithCsrf(url, body, retry = true) {
  const token = await getCsrfToken();
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseJson(response);

  if (data.csrfToken) {
    csrfToken = data.csrfToken;
  }

  if (!response.ok && retry && data.code === "invalid_csrf_token") {
    csrfToken = "";
    await getCsrfToken();
    return postWithCsrf(url, body, false);
  }

  return { response, data };
}

async function syncFlaskSession(user) {
  if (!user) {
    await postWithCsrf("/api/firebase/logout").catch(() => {});
    return;
  }

  const idToken = await user.getIdToken();
  const { response, data } = await postWithCsrf("/api/firebase/session", {
    idToken,
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    },
  });

  if (!response.ok) {
    const error = new Error(data.details || data.error || "Could not create a Flask workspace session.");
    error.code = data.code || "workspace_session_error";
    throw error;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState("");
  const [authActionInProgress, setAuthActionInProgress] = useState(false);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    getRedirectResult(auth)
      .then(async (result) => {
        if (!result?.user) {
          return;
        }

        await syncFlaskSession(result.user);
        setUser(result.user);
        setError("");
      })
      .catch((redirectError) => {
        console.error("Firebase redirect sign-in failed", redirectError);
        setError(formatFirebaseError(redirectError));
      });

    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setLoading(false);

      if (nextUser) {
        await syncFlaskSession(nextUser).catch((sessionError) => {
          setError(sessionError.message || "Signed in, but the workspace session could not be created.");
        });
      }
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      const configError = `Firebase is missing config: ${firebaseMissingKeys.join(", ")}`;
      console.error(configError);
      setError(configError);
      return null;
    }

    setError("");
    setAuthActionInProgress(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      await syncFlaskSession(result.user);
      setUser(result.user);
      return result.user;
    } catch (popupError) {
      console.error("Firebase popup sign-in failed", popupError);
      const readableError = String(popupError?.code || "").startsWith("auth/")
        ? formatFirebaseError(popupError)
        : (popupError.message || "Signed in, but the workspace session could not be created.");
      setError(readableError);

      if (REDIRECT_FALLBACK_CODES.has(popupError?.code)) {
        console.warn("Falling back to Firebase redirect sign-in", popupError);
        await signInWithRedirect(auth, googleProvider);
      }

      return null;
    } finally {
      setAuthActionInProgress(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (auth) {
      await signOut(auth);
    }

    await syncFlaskSession(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      authActionInProgress,
      isConfigured: isFirebaseConfigured,
      missingKeys: firebaseMissingKeys,
      signInWithGoogle,
      logout,
    }),
    [authActionInProgress, error, loading, logout, signInWithGoogle, user]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
