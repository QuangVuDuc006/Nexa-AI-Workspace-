import React from "react";
import { motion } from "framer-motion";
import { benefits } from "../../data/landingData";
import { staggerContainer } from "../../utils/motion";
import { GlowCard } from "../ui/GlowCard";
import { SectionHeader } from "../ui/SectionHeader";

export function Benefits() {
  return (
    <section id="benefits" className="px-6 py-24 md:px-16 md:py-32">
      <SectionHeader
        label="Benefits"
        title="Many models, one clear interface"
        description="Nexa AI keeps provider choice visible and the everyday chat experience simple."
      />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.12 }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {benefits.map(({ icon: Icon, title, description }) => (
          <GlowCard key={title} innerClassName="min-h-[180px] p-7">
            <Icon size={24} fill="currentColor" className="mb-7 text-white" />
            <h3 className="text-2xl font-semibold tracking-[-0.045em] text-white">{title}</h3>
            <p className="mt-4 text-sm leading-6 text-mist-200">{description}</p>
          </GlowCard>
        ))}
      </motion.div>
    </section>
  );
}
