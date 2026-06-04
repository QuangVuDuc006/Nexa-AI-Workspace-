import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { navItems } from "../../data/landingData";
import { WorkspaceButton } from "../auth/WorkspaceButton";
import { useAuth } from "../../hooks/useAuth";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

const TOPBAR_TOP_ZONE = 40;
const HIDE_SCROLL_THRESHOLD = 10;
const SHOW_SCROLL_THRESHOLD = 4;

function Logo() {
  return (
    <a className="flex min-w-0 shrink-0 items-center" href="/" aria-label="Nexa AI home">
      <img className="h-[40px] w-auto max-w-[190px] bg-transparent object-contain sm:h-[52px] sm:max-w-[260px]" src="/assets/Landing.png" alt="Nexa AI logo" />
    </a>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const previousScrollY = useRef(0);
  const scrollDirection = useRef(null);
  const scrollDistance = useRef(0);
  const reducedMotion = usePrefersReducedMotion();
  const { user, logout } = useAuth();

  useEffect(() => {
    let frameId;
    previousScrollY.current = window.scrollY;
    scrollDirection.current = null;
    scrollDistance.current = 0;

    const updateVisibility = () => {
      frameId = undefined;

      const currentScrollY = Math.max(window.scrollY, 0);
      const scrollDelta = currentScrollY - previousScrollY.current;
      previousScrollY.current = currentScrollY;

      if (currentScrollY <= TOPBAR_TOP_ZONE || open) {
        setIsVisible(true);
        scrollDirection.current = null;
        scrollDistance.current = 0;
        return;
      }

      if (Math.abs(scrollDelta) < 0.5) {
        return;
      }

      const nextDirection = scrollDelta > 0 ? "down" : "up";

      if (scrollDirection.current !== nextDirection) {
        scrollDirection.current = nextDirection;
        scrollDistance.current = 0;
      }

      scrollDistance.current += Math.abs(scrollDelta);

      if (nextDirection === "down" && scrollDistance.current >= HIDE_SCROLL_THRESHOLD) {
        setIsVisible(false);
        scrollDistance.current = 0;
      } else if (nextDirection === "up" && scrollDistance.current >= SHOW_SCROLL_THRESHOLD) {
        setIsVisible(true);
        scrollDistance.current = 0;
      }
    };

    const handleScroll = () => {
      if (frameId === undefined) {
        frameId = window.requestAnimationFrame(updateVisibility);
      }
    };

    if (open) {
      setIsVisible(true);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [open]);

  return (
    <>
      <div className="h-[64px] w-full sm:h-[76px]" aria-hidden="true" />
      <header
        className={`topbar topbar-${isVisible ? "visible" : "hidden"} fixed inset-x-0 top-0 z-40 w-full`}
      >
        <motion.nav
          className="topbar-surface w-full"
          initial={reducedMotion ? false : { y: -20, scale: 0.985 }}
          animate={{ y: 0, scale: 1 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="topbar-container mx-auto w-full max-w-[1600px] px-4 py-3 sm:px-8 lg:px-12">
            <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
              <div className="flex min-w-0 justify-start">
                <Logo />
              </div>
              <nav className="hidden min-w-0 items-center justify-center gap-7 md:flex lg:gap-9" aria-label="Primary navigation">
                {navItems.map((item) => (
                  <a
                    key={item.label}
                    className="whitespace-nowrap text-sm font-semibold text-white/90 transition duration-500 hover:text-violetx-300"
                    href={item.href}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="hidden min-w-0 items-center justify-end gap-3 md:flex">
                {user && (
                  <button
                    className="flex min-h-9 items-center gap-2 rounded-[8px] border border-white/10 bg-black/40 px-2.5 py-1.5 text-left text-xs font-semibold text-white transition hover:border-violetx-400/40 hover:bg-violetx-800/50"
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
              <div className="flex justify-end md:hidden">
                <button
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-white/10 bg-black/40 text-white"
                  type="button"
                  aria-label="Toggle navigation"
                  aria-expanded={open}
                  aria-controls="mobile-navigation"
                  onClick={() => setOpen((value) => !value)}
                >
                  {open ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
            </div>
            <AnimatePresence>
              {open && (
                <motion.div
                  id="mobile-navigation"
                  className="mt-4 grid gap-2 border-t border-white/10 pt-4 md:hidden"
                  initial={reducedMotion ? false : { opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{ duration: reducedMotion ? 0 : 0.35 }}
                >
                  {navItems.map((item) => (
                    <a
                      key={item.label}
                      className="rounded-[7px] px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
                      href={item.href}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </a>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.nav>
      </header>
    </>
  );
}

export { Logo };
