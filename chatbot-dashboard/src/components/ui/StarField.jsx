import React from "react";
import { motion } from "framer-motion";
import { useMobilePerformanceMode } from "../../hooks/useMobilePerformanceMode";
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
  const mobilePerformanceMode = useMobilePerformanceMode();
  const visibleStars = mobilePerformanceMode ? stars.slice(0, 44) : stars;
  const shouldAnimate = !reducedMotion && !mobilePerformanceMode;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      animate={shouldAnimate ? { x: [0, -10, 8, 0], y: [0, 8, -6, 0] } : undefined}
      transition={shouldAnimate ? { duration: 28, repeat: Infinity, ease: "linear" } : undefined}
      aria-hidden="true"
    >
      {visibleStars.map((star) => (
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
          animate={shouldAnimate ? { opacity: [star.opacity * 0.35, star.opacity, star.opacity * 0.55] } : undefined}
          transition={shouldAnimate ? { duration: 4.8, repeat: Infinity, delay: star.delay, ease: "easeInOut" } : undefined}
        />
      ))}
    </motion.div>
  );
}
