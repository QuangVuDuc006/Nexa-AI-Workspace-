import React from "react";
import { motion } from "framer-motion";
import { revealVariants } from "../../utils/motion";

export function Reveal({ children, className = "", variants = revealVariants, delay = 0, once = true }) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: 0.18, margin: "0px 0px -10% 0px" }}
      transition={delay ? { delay } : undefined}
    >
      {children}
    </motion.div>
  );
}
