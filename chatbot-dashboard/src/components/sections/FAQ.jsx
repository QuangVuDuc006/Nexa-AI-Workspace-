import React from "react";
import { faqs } from "../../data/landingData";
import { FAQAccordion } from "../ui/FAQAccordion";
import { SectionHeader } from "../ui/SectionHeader";

export function FAQ() {
  return (
    <section id="faq" className="landing-section px-6 md:px-16">
      <SectionHeader
        label="FAQs"
        title="Questions before you launch Nexa"
        description="Provider support, memory, documents, security, and self-hosting."
        typewriter
      />
      <FAQAccordion items={faqs} />
    </section>
  );
}
