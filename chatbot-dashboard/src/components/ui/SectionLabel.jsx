import React from "react";

export function SectionLabel({ children, className = "" }) {
  return (
    <span
      className={`inline-flex w-max items-center justify-center rounded-[6px] border border-white/[0.12] bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${className}`}
    >
      {children}
    </span>
  );
}
