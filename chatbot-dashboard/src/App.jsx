import React from "react";
import { PageShell } from "./components/layout/PageShell";
import { Footer } from "./components/layout/Footer";
import { CTA } from "./components/sections/CTA";
import { FAQ } from "./components/sections/FAQ";
import { Hero } from "./components/sections/Hero";
import { ProductSections } from "./components/sections/ProductSections";

export default function App() {
  return (
    <PageShell>
      <Hero />
      <ProductSections />
      <FAQ />
      <CTA />
      <Footer />
    </PageShell>
  );
}
