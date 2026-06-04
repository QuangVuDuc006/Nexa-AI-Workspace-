import React from "react";
import { motion } from "framer-motion";
import { revealVariants, softSpring } from "../../utils/motion";

export function GlowCard({ children, className = "", innerClassName = "", hover = true }) {
  return (
    <motion.div
      variants={revealVariants}
      whileHover={hover ? { y: -6, scale: 1.01 } : undefined}
      transition={softSpring}
      className={`group rounded-card border border-white/10 bg-white/[0.035] p-[1px] shadow-card ${className}`}
    >
      <div
        className={`relative h-full overflow-hidden rounded-[13px] bg-card-glow p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:border-white/20 ${innerClassName}`}
      >
        <div className="pointer-events-none absolute inset-x-6 bottom-0 h-24 translate-y-1/2 rounded-full bg-violetx-500/[0.16] blur-3xl opacity-60 transition duration-700 group-hover:opacity-100" />
        <div className="relative z-10 h-full">{children}</div>
      </div>
    </motion.div>
  );
}
