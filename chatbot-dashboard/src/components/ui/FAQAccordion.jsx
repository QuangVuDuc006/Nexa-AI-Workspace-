import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMobilePerformanceMode } from "../../hooks/useMobilePerformanceMode";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

export function FAQAccordion({ items }) {
  const [openIndex, setOpenIndex] = useState(0);
  const mobilePerformanceMode = useMobilePerformanceMode();
  const reducedMotion = usePrefersReducedMotion();
  const motionDisabled = mobilePerformanceMode || reducedMotion;

  return (
    <div className="mx-auto grid max-w-2xl gap-2">
      {items.map((item, index) => {
        const isOpen = openIndex === index;

        return (
          <div
            key={item.question}
            className="overflow-hidden rounded-[7px] border border-white/10 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <button
              className="flex min-h-12 w-full items-center justify-between gap-4 px-4 text-left text-sm font-semibold text-white transition duration-500 hover:bg-white/[0.035]"
              type="button"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
            >
              <span>{item.question}</span>
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: motionDisabled ? 0 : 0.28 }}>
                <ChevronDown size={16} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={motionDisabled ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={motionDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: motionDisabled ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="px-4 pb-4 text-sm leading-6 text-mist-300">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
