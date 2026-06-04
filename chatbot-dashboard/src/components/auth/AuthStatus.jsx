import React from "react";
import { useAuth } from "../../hooks/useAuth";

export function AuthStatus() {
  const { error, isConfigured, missingKeys } = useAuth();
  const message = error || (!isConfigured ? `Firebase config missing: ${missingKeys.join(", ")}` : "");

  if (!message) {
    return null;
  }

  return (
    <div className="fixed bottom-5 left-1/2 z-50 w-[min(720px,calc(100vw-32px))] -translate-x-1/2 rounded-[10px] border border-red-300/30 bg-black/85 px-4 py-3 text-sm font-semibold leading-6 text-red-100 shadow-card backdrop-blur-xl">
      {message}
    </div>
  );
}
