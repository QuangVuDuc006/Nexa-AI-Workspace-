import React from "react";
import { faqs } from "../../data/landingData";
import { FAQAccordion } from "../ui/FAQAccordion";
import { SectionHeader } from "../ui/SectionHeader";

export function FAQ() {
  return (
    <section id="faq" className="px-6 py-24 md:px-16 md:py-32">
      <SectionHeader label="FAQs" title="Questions before you connect a provider" description="Quick answers about supported APIs, model detection, switching, and key handling." />
      <FAQAccordion items={faqs} />
    </section>
  );
}
