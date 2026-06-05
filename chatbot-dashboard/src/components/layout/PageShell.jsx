import React from "react";
import { AuthStatus } from "../auth/AuthStatus";
import { Header } from "./Header";

export function PageShell({ children }) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-purple-field text-white">
      <div className="landing-background-field pointer-events-none fixed inset-0 z-0" />
      <div className="noise-overlay" />
      <div className="relative z-10 min-h-[100dvh] w-full">
        <Header />
        <main className="site-main w-full overflow-x-hidden">{children}</main>
        <AuthStatus />
      </div>
    </div>
  );
}
