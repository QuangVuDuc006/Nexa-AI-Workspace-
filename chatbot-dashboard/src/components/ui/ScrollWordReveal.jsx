import React from "react";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { premiumEase } from "../../utils/motion";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.035,
    },
  },
};

const wordVariants = {
  hidden: {
    opacity: 0,
    y: "0.32em",
    filter: "blur(5px)",
  },
  visible: {
    opacity: 1,
    y: "0em",
    filter: "blur(0px)",
    transition: {
      duration: 0.52,
      ease: premiumEase,
    },
  },
};

function RevealWord({ children, reducedMotion }) {
  return (
    <motion.span
      className="inline-block"
      variants={reducedMotion ? undefined : wordVariants}
      aria-hidden="true"
    >
      {children}
    </motion.span>
  );
}

export function ScrollWordReveal({ text, className = "" }) {
  const reducedMotion = usePrefersReducedMotion();
  const words = text.trim().split(/\s+/);

  return (
    <motion.p
      className={className}
      aria-label={text}
      variants={reducedMotion ? undefined : containerVariants}
      initial={reducedMotion ? false : "hidden"}
      whileInView={reducedMotion ? undefined : "visible"}
      viewport={{ once: true, amount: 0.45, margin: "0px 0px -6% 0px" }}
    >
      {words.map((word, index) => (
        <React.Fragment key={`${word}-${index}`}>
          <RevealWord reducedMotion={reducedMotion}>
            {word}
          </RevealWord>
          {index < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </motion.p>
  );
}

export default ScrollWordReveal;
