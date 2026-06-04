import React from "react";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

const stars = Array.from({ length: 118 }, (_, index) => ({
  id: index,
  x: (index * 47 + 13) % 100,
  y: (index * 83 + 19) % 100,
  size: index % 9 === 0 ? 2 : 1,
  delay: (index % 11) * 0.42,
  opacity: 0.26 + ((index * 17) % 50) / 100,
}));

export function StarField() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      animate={reducedMotion ? undefined : { x: [0, -10, 8, 0], y: [0, 8, -6, 0] }}
      transition={reducedMotion ? undefined : { duration: 28, repeat: Infinity, ease: "linear" }}
      aria-hidden="true"
    >
      {stars.map((star) => (
        <motion.span
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
          animate={reducedMotion ? undefined : { opacity: [star.opacity * 0.35, star.opacity, star.opacity * 0.55] }}
          transition={reducedMotion ? undefined : { duration: 4.8, repeat: Infinity, delay: star.delay, ease: "easeInOut" }}
        />
      ))}
    </motion.div>
  );
}
