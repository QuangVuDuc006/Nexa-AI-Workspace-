import React from "react";
import { motion } from "framer-motion";

export function PricingToggle({ value, onChange }) {
  const isAnnual = value === "annual";

  return (
    <div
      className="mx-auto mb-8 flex w-max items-center gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-1.5 text-sm font-semibold text-mist-200"
      role="radiogroup"
      aria-label="Billing cycle"
    >
      <button
        className={`rounded-[7px] px-3 py-2 transition duration-300 ${
          value === "monthly" ? "bg-white text-ink-950" : "text-mist-300 hover:text-white"
        }`}
        type="button"
        role="radio"
        aria-checked={value === "monthly"}
        onClick={() => onChange("monthly")}
      >
        Monthly
      </button>
      <button
        type="button"
        aria-label="Toggle billing period"
        aria-pressed={isAnnual}
        className="relative h-8 w-[62px] rounded-full border border-violetx-300/30 bg-violetx-600/80 p-1 shadow-purple transition duration-300 hover:border-violetx-300/60"
        onClick={() => onChange(value === "monthly" ? "annual" : "monthly")}
      >
        <motion.span
          className="block h-6 w-6 rounded-full bg-white shadow-[0_8px_22px_rgba(0,0,0,0.32)]"
          animate={{ x: isAnnual ? 30 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        />
      </button>
      <button
        className={`rounded-[7px] px-3 py-2 transition duration-300 ${
          isAnnual ? "bg-violetx-500 text-white shadow-purple" : "text-mist-300 hover:text-white"
        }`}
        type="button"
        role="radio"
        aria-checked={isAnnual}
        onClick={() => onChange("annual")}
      >
        Annually
      </button>
    </div>
  );
}
