import React from "react";
import { motion } from "framer-motion";
import { Boxes, Check, MessageSquare, Radar, Upload } from "lucide-react";
import { processSteps } from "../../data/landingData";
import { staggerContainer } from "../../utils/motion";
import { GlowCard } from "../ui/GlowCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionLabel } from "../ui/SectionLabel";

function ProcessVisual({ type }) {
  if (type === "radar") {
    return (
      <div className="grid grid-cols-[0.8fr_1.2fr] items-center gap-4 border border-white/10 bg-black/30 p-4">
        <div className="relative aspect-square rounded-full border border-white/10">
          <Radar className="absolute left-5 top-7 text-violetx-400" size={38} />
          <span className="absolute inset-6 rounded-full border border-white/[0.08]" />
          <span className="absolute inset-12 rounded-full border border-white/[0.08]" />
        </div>
        <div className="grid gap-1.5">
          {["API key", "Optional Base URL", "Auto-detect models", "Detected model", "Manual fallback"].map((row) => (
            <span key={row} className="rounded-[3px] border border-white/10 px-2 py-1 text-[10px] font-semibold text-white">
              {row}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (type === "code") {
    return (
      <div className="border border-white/10 bg-black/30 p-4 font-mono text-[10px] leading-5 text-mist-200">
        <div className="mb-3 h-2 w-24 rounded-full bg-white/10" />
        <p>
          <span className="text-violetx-400">connect</span> provider.api():
        </p>
        <p className="pl-4">paste encrypted API key</p>
        <p className="pl-4">request available models</p>
        <p className="pl-4">or enter model manually</p>
        <p className="pl-4">test and save connection</p>
      </div>
    );
  }

  if (type === "integration") {
    return (
      <div className="grid min-h-[126px] place-items-center border border-white/10 bg-black/30 p-4">
        <div className="flex w-full items-center justify-center gap-8">
          <span className="grid h-14 w-14 place-items-center rounded-[8px] border border-white/10 bg-violetx-500/20">
            <Boxes size={26} />
          </span>
          <span className="h-px w-28 bg-gradient-to-r from-violetx-500 to-white/20" />
          <span className="grid h-14 w-14 place-items-center rounded-[8px] border border-white/10 bg-white/[0.04]">
            <Upload size={28} className="text-violetx-400" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 border border-white/10 bg-black/30 p-4">
      {[
        ["Active model", "Using Claude Sonnet", MessageSquare],
        ["Provider settings", "Connection saved", Upload],
        ["New message", "Ready to send", Check],
      ].map(([title, meta, Icon]) => (
        <div key={title} className="flex items-center gap-3 rounded-[5px] border border-white/10 px-3 py-2">
          <Icon size={15} className="text-violetx-400" />
          <div>
            <p className="text-[11px] font-semibold text-white">{title}</p>
            <p className="text-[9px] text-mist-400">{meta}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Process() {
  return (
    <section id="process" className="px-6 py-24 md:px-16 md:py-32">
      <SectionHeader
        label="Workflow"
        title="Connect once, then start chatting"
        description="Paste an API key, detect or enter a model, choose what to use, and send your first message."
      />
      <motion.div
        className="grid gap-4 md:grid-cols-2"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.12 }}
      >
        {processSteps.map((item) => (
          <GlowCard key={item.title} innerClassName="p-6">
            <SectionLabel>{item.step}</SectionLabel>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white">{item.title}</h3>
            <p className="mt-3 min-h-[54px] text-sm leading-6 text-mist-200">{item.description}</p>
            <div className="mt-7">
              <ProcessVisual type={item.visual} />
            </div>
          </GlowCard>
        ))}
      </motion.div>
    </section>
  );
}
