import React from "react";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";

export function SectionHeader({ label, title, description, className = "", align = "center" }) {
  const centered = align === "center";

  return (
    <Reveal
      className={`mx-auto mb-14 grid max-w-4xl gap-4 ${
        centered ? "justify-items-center text-center" : "justify-items-start text-left"
      } ${className}`}
    >
      {label && <SectionLabel>{label}</SectionLabel>}
      <h2 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.055em] text-white md:text-5xl lg:text-[3.45rem]">
        {title}
      </h2>
      {description && <p className="max-w-2xl text-base leading-7 text-mist-200 md:text-lg">{description}</p>}
    </Reveal>
  );
}
