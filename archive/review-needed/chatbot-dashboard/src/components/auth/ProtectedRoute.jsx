import React, { useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";

export function ProtectedRoute({ children, redirectTo = "/" }) {
  const { user, loading, authActionInProgress } = useAuth();

  useEffect(() => {
    if (!loading && !authActionInProgress && !user) {
      window.location.href = redirectTo;
    }
  }, [authActionInProgress, loading, redirectTo, user]);

  if (loading || authActionInProgress || !user) {
    return null;
  }

  return children;
}
