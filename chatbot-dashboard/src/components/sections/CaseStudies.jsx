import React, { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { SectionHeader } from "../ui/SectionHeader";
import { Reveal } from "../ui/Reveal";
import { leftRevealVariants, rightRevealVariants } from "../../utils/motion";

const caseStudies = [
  {
    logo: "CODE",
    image: "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=900&q=85",
    alt: "Developer notes and laptop on a desk",
    quote: "A developer switches models based on the problem",
    body:
      "Use a fast model for quick implementation questions, then switch to a stronger reasoning model for architecture decisions. The active model remains visible before every message.",
    impact: ["OpenAI + DeepSeek", "Coding and reasoning", "Active model visible", "One saved history"],
  },
  {
    logo: "STUDY",
    image: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=85",
    alt: "Student reviewing notes and documents",
    quote: "A student uses existing API keys in one chatbot",
    body:
      "Connect Gemini and OpenRouter, detect available models, and choose a different model for explanations, summaries, or deeper reasoning without changing chat apps.",
    impact: ["Bring your own keys", "Detected model list", "Manual model fallback", "Organized chats"],
  },
  {
    logo: "TEST",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=85",
    alt: "Developer testing APIs on a computer",
    quote: "An AI power user compares providers without dashboard hopping",
    body:
      "Save several provider connections, test them from one settings panel, and switch the active model from the top bar while keeping the conversation interface familiar.",
    impact: ["Multiple providers", "Connection testing", "Fast model switching", "Custom endpoints"],
  },
];

export function CaseStudies() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const activeCase = caseStudies[activeIndex];

  const showCase = (nextIndex) => {
    const normalizedIndex = (nextIndex + caseStudies.length) % caseStudies.length;
    setDirection(normalizedIndex > activeIndex || (activeIndex === caseStudies.length - 1 && normalizedIndex === 0) ? 1 : -1);
    setActiveIndex(normalizedIndex);
  };

  const handleDragEnd = (_, info) => {
    if (info.offset.x < -70) {
      showCase(activeIndex + 1);
    }

    if (info.offset.x > 70) {
      showCase(activeIndex - 1);
    }
  };

  return (
    <section id="case-studies" className="px-6 py-24 md:px-16 md:py-32">
      <SectionHeader
        label="Use cases"
        title="Choose a model based on the task"
        description="Use one provider for speed, another for reasoning, or a custom endpoint for testing without changing the way you chat."
      />
      <motion.div
        className="cursor-grab overflow-hidden active:cursor-grabbing"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.16}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.article
            key={activeCase.quote}
            custom={direction}
            initial={{ opacity: 0, x: direction * 60, filter: "blur(8px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: direction * -60, filter: "blur(8px)" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="grid select-none items-center gap-12 lg:grid-cols-[0.92fr_1fr]"
          >
            <Reveal variants={leftRevealVariants}>
              <div className="overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.035] p-[1px] shadow-card">
                <img
                  className="h-[330px] w-full rounded-[13px] object-cover brightness-[0.72] saturate-[0.9] md:h-[430px]"
                  src={activeCase.image}
                  alt={activeCase.alt}
                  draggable="false"
                />
              </div>
            </Reveal>
            <Reveal variants={rightRevealVariants}>
              <div className="max-w-lg">
                <div className="mb-7 flex items-center gap-2 text-4xl font-black tracking-[-0.08em] text-white/80">
                  <span>{activeCase.logo.slice(0, 2)}</span>
                  <span className="h-5 w-16 rounded-full border-[6px] border-white/70" />
                  <span>{activeCase.logo.slice(2)}</span>
                </div>
                <h3 className="text-3xl font-semibold leading-tight tracking-[-0.045em] text-white">
                  "{activeCase.quote}"
                </h3>
                <p className="mt-5 text-base leading-7 text-mist-200">{activeCase.body}</p>
                <div className="mt-8">
                  <p className="mb-3 text-base font-semibold text-white">What stays simple:</p>
                  <ul className="grid gap-2 text-base font-semibold text-mist-100">
                    {activeCase.impact.map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </motion.article>
        </AnimatePresence>
      </motion.div>
      <div className="mt-10 flex items-center justify-center gap-4 text-sm font-semibold uppercase tracking-[0.04em] text-mist-200">
        <button
          className="grid h-11 w-11 place-items-center rounded-[8px] border border-white/[0.12] bg-white/[0.035] text-white transition duration-300 hover:border-violetx-400/50 hover:bg-violetx-800/40"
          type="button"
          aria-label="Previous case study"
          onClick={() => showCase(activeIndex - 1)}
        >
          <ArrowLeft size={17} />
        </button>
        <motion.span
          className="min-w-[132px] text-center"
          animate={{ x: [0, 5, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
          Drag to explore
        </motion.span>
        <button
          className="grid h-11 w-11 place-items-center rounded-[8px] border border-white/[0.12] bg-white/[0.035] text-white transition duration-300 hover:border-violetx-400/50 hover:bg-violetx-800/40"
          type="button"
          aria-label="Next case study"
          onClick={() => showCase(activeIndex + 1)}
        >
          <ArrowRight size={17} />
        </button>
      </div>
      <div className="mt-5 flex items-center justify-center gap-2" aria-label="Case study pagination">
        {caseStudies.map((item, index) => (
          <button
            key={item.quote}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === activeIndex ? "w-8 bg-violetx-400" : "w-3 bg-white/20 hover:bg-white/40"
            }`}
            type="button"
            aria-label={`Show case study ${index + 1}`}
            aria-current={index === activeIndex}
            onClick={() => showCase(index)}
          />
        ))}
      </div>
    </section>
  );
}
