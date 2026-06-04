import React, { useState } from "react";
import { Button } from "../ui/Button";
import { useAuth } from "../../hooks/useAuth";

export function GoogleSignInButton({ children = "Continue with Google", className = "", onSignedIn, ...props }) {
  const { signInWithGoogle, loading, isConfigured, error } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleClick(event) {
    event.preventDefault();

    if (busy || loading || !isConfigured) {
      return;
    }

    setBusy(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        onSignedIn?.(user);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={busy || loading || !isConfigured}
      className={className}
      {...props}
    >
      {busy ? "Signing in..." : children}
      {error && <span className="sr-only">{error}</span>}
    </Button>
  );
}
