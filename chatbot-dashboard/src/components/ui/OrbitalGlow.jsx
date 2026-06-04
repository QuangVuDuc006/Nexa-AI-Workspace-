import React from "react";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

export function OrbitalGlow({ className = "" }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.div
      className={`pointer-events-none absolute rounded-full opacity-80 blur-2xl ${className}`}
      animate={
        reducedMotion
          ? undefined
          : {
              rotate: [0, 360],
              scale: [0.94, 1.04, 0.98, 0.94],
              x: [0, 18, -12, 0],
              y: [0, -14, 10, 0],
            }
      }
      transition={reducedMotion ? undefined : { duration: 24, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_40deg,transparent_0deg,rgba(141,77,232,0.78)_62deg,transparent_132deg,rgba(111,52,197,0.76)_210deg,transparent_300deg)]" />
      <div className="absolute inset-[22%] rounded-full bg-black blur-xl" />
    </motion.div>
  );
}
