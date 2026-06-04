import React from "react";
import { motion } from "framer-motion";
import { AuthStatus } from "../auth/AuthStatus";
import { Header } from "./Header";

export function PageShell({ children }) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-purple-field text-white">
      <motion.div
        className="pointer-events-none fixed inset-0 z-0"
        animate={{
          backgroundPosition: ["0% 0%", "100% 40%", "20% 100%", "0% 0%"],
        }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(circle at 8% 0%, rgba(141,77,232,0.16), transparent 28%), radial-gradient(circle at 92% 4%, rgba(111,52,197,0.14), transparent 30%), radial-gradient(circle at 50% 0%, rgba(255,255,255,0.045), transparent 22%)",
          backgroundSize: "140% 140%",
        }}
      />
      <div className="noise-overlay" />
      <div className="relative z-10 min-h-[100dvh] w-full">
        <Header />
        <main className="site-main w-full overflow-x-hidden">{children}</main>
        <AuthStatus />
      </div>
    </div>
  );
}
