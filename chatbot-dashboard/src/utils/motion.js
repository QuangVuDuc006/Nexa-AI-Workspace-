export const premiumEase = [0.22, 1, 0.36, 1];
export const softSpring = { type: "spring", stiffness: 170, damping: 24, mass: 0.9 };

export const revealVariants = {
  hidden: { opacity: 0, y: 44, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.85, ease: premiumEase },
  },
};

export const leftRevealVariants = {
  hidden: { opacity: 0, x: -42, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: premiumEase },
  },
};

export const rightRevealVariants = {
  hidden: { opacity: 0, x: 42, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: premiumEase },
  },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.11,
      delayChildren: 0.08,
    },
  },
};

export const heroContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.13,
      delayChildren: 0.18,
    },
  },
};

export const heroItem = {
  hidden: { opacity: 0, y: 28, scale: 0.985, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: premiumEase },
  },
};

