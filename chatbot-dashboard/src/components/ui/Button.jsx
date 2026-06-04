import React from "react";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { softSpring } from "../../utils/motion";

const variants = {
  primary:
    "border-violetx-400/40 bg-violetx-500 text-white shadow-purple hover:border-violetx-300/70 hover:bg-violetx-400",
  secondary:
    "border-white/[0.12] bg-white/[0.035] text-white hover:border-white/[0.24] hover:bg-white/[0.07]",
  ghost:
    "border-white/10 bg-black/20 text-mist-200 hover:border-violetx-400/40 hover:bg-violetx-800/30",
};

export function Button({ children, href, variant = "primary", icon = true, className = "", ...props }) {
  const Component = href ? motion.a : motion.button;

  return (
    <Component
      href={href}
      className={`group inline-flex min-h-11 items-center justify-center gap-3 rounded-[7px] border px-4 py-2.5 text-sm font-semibold tracking-[-0.01em] transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${variants[variant]} ${className}`}
      whileHover={{ y: -3, scale: 1.012 }}
      whileTap={{ scale: 0.985, y: 0 }}
      transition={softSpring}
      {...props}
    >
      <span>{children}</span>
      {icon && (
        <span className="grid h-6 w-6 place-items-center rounded-[5px] bg-white/[0.13] transition duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:bg-white/20">
          <ArrowUpRight size={14} strokeWidth={2} />
        </span>
      )}
    </Component>
  );
}
