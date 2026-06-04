import React from "react";
import { PageShell } from "./components/layout/PageShell";
import { Footer } from "./components/layout/Footer";
import { Benefits } from "./components/sections/Benefits";
import { CaseStudies } from "./components/sections/CaseStudies";
import { CTA } from "./components/sections/CTA";
import { FAQ } from "./components/sections/FAQ";
import { Hero } from "./components/sections/Hero";
import { Pricing } from "./components/sections/Pricing";
import { Process } from "./components/sections/Process";
import { Services } from "./components/sections/Services";
import { Testimonials } from "./components/sections/Testimonials";

export default function App() {
  return (
    <PageShell>
      <Hero />
      <Services />
      <Process />
      <CaseStudies />
      <Benefits />
      <Pricing />
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </PageShell>
  );
}
