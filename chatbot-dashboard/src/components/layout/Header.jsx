import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { navItems } from "../../data/landingData";
import { WorkspaceButton } from "../auth/WorkspaceButton";
import { useAuth } from "../../hooks/useAuth";

function Logo() {
  return (
    <a className="flex min-w-0 shrink-0 items-center" href="/" aria-label="Nexa AI home">
      <img className="h-[40px] w-auto max-w-[190px] bg-transparent object-contain sm:h-[52px] sm:max-w-[260px]" src="/assets/Landing.png" alt="Nexa AI logo" />
    </a>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-4 z-20 mx-auto w-full max-w-[1280px] px-3 sm:px-6 lg:px-8">
      <motion.nav
        className="max-w-full rounded-[15px] border border-white/10 bg-black/[0.78] px-4 py-3 shadow-[0_18px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:px-5"
        initial={{ opacity: 0, y: -20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex min-w-0 items-center justify-between gap-4">
          <Logo />
          <div className="hidden min-w-0 items-center gap-5 md:flex lg:gap-8">
            {navItems.map((item) => (
              <a
                key={item.label}
                className="whitespace-nowrap text-sm font-semibold text-white/90 transition duration-500 hover:text-violetx-300"
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="hidden items-center gap-3 md:flex">
            {user && (
              <button
                className="flex min-h-9 items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-left text-xs font-semibold text-white transition hover:border-violetx-400/40 hover:bg-violetx-800/30"
                type="button"
                onClick={logout}
                title="Sign out"
              >
                {user.photoURL ? (
                  <img className="h-6 w-6 rounded-[6px] object-cover" src={user.photoURL} alt="" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-violetx-500 text-[10px]">
                    {(user.displayName || user.email || "U").slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[120px] truncate">{user.displayName || user.email}</span>
              </button>
            )}
            <WorkspaceButton icon={false} className="min-h-9 px-4 py-2">
              Open workspace
            </WorkspaceButton>
          </div>
          <button
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-white/10 bg-white/[0.04] text-white md:hidden"
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              className="mt-4 grid gap-2 border-t border-white/10 pt-4 md:hidden"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
            >
              {navItems.map((item) => (
                <a
                  key={item.label}
                  className="rounded-[7px] px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/[0.05]"
                  href={item.href}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </header>
  );
}

export { Logo };
