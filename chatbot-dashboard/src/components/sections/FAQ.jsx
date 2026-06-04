import React from "react";
import { faqs } from "../../data/landingData";
import { FAQAccordion } from "../ui/FAQAccordion";
import { SectionHeader } from "../ui/SectionHeader";

export function FAQ() {
  return (
    <section id="faq" className="landing-section px-6 md:px-16">
      <SectionHeader
        label="FAQs"
        title="Questions before you connect a provider"
        description="Quick answers about supported APIs, model detection, switching, and key handling."
        typewriter
      />
      <FAQAccordion items={faqs} />
    </section>
  );
}
