import React, { useState } from "react";
import { Button } from "../ui/Button";
import { useAuth } from "../../hooks/useAuth";

export function WorkspaceButton({ children = "Open workspace", className = "", variant = "primary", icon = true }) {
  const { user, loading, isConfigured, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleClick(event) {
    if (user) {
      return;
    }

    event.preventDefault();

    if (busy || loading || !isConfigured) {
      window.location.href = "/";
      return;
    }

    setBusy(true);
    try {
      const signedInUser = await signInWithGoogle();
      if (signedInUser) {
        window.location.href = "/chat";
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button href="/chat" onClick={handleClick} variant={variant} icon={icon} className={className}>
      {busy ? "Signing in..." : children}
    </Button>
  );
}
