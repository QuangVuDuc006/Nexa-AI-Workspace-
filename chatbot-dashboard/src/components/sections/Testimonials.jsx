import React from "react";
import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { testimonials } from "../../data/landingData";
import { staggerContainer } from "../../utils/motion";
import { GlowCard } from "../ui/GlowCard";
import { SectionHeader } from "../ui/SectionHeader";

export function Testimonials() {
  return (
    <section id="testimonials" className="px-6 py-24 md:px-16 md:py-32">
      <SectionHeader
        label="Testimonials"
        title="Built for people who use more than one AI API"
        description="Developers, students, writers, and model testers use Nexa AI to keep provider switching straightforward."
      />
      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.12 }}
      >
        {testimonials.map((item) => (
          <GlowCard key={item.name} innerClassName="p-7">
            <div className="mb-6 flex gap-1 text-white">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} size={18} fill="currentColor" />
              ))}
            </div>
            <p className="text-lg font-semibold leading-7 tracking-[-0.025em] text-mist-100">"{item.quote}"</p>
            <div className="mt-7 flex items-center gap-4">
              <img className="h-12 w-12 rounded-full object-cover" src={item.avatar} alt={item.name} />
              <div>
                <p className="font-semibold text-white">{item.name}</p>
                <p className="text-xs font-medium text-mist-300">{item.role}</p>
              </div>
            </div>
          </GlowCard>
        ))}
      </motion.div>
    </section>
  );
}
