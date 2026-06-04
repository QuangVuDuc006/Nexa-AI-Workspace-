import React from "react";
import { motion } from "framer-motion";
import { CalendarDays, Check, CircleDollarSign, Clock3, FileText, Send, Users } from "lucide-react";
import { services } from "../../data/landingData";
import { leftRevealVariants, rightRevealVariants, staggerContainer } from "../../utils/motion";
import { GlowCard } from "../ui/GlowCard";
import { Reveal } from "../ui/Reveal";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionLabel } from "../ui/SectionLabel";

function TagGroup({ tags }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-[7px] border border-white/10 bg-white/[0.045] px-3 py-2 text-sm font-semibold text-white">
          {tag}
        </span>
      ))}
    </div>
  );
}

function TaskMockup() {
  const rows = [
    ["OpenAI", "Using GPT model", CircleDollarSign],
    ["Google Gemini", "Models detected", Users],
    ["Anthropic Claude", "Connection saved", CalendarDays],
    ["OpenRouter", "Ready to configure", FileText],
  ];

  return (
    <div className="mx-auto max-w-[380px] rounded-[17px] border border-white/10 bg-[#050505] p-4">
      <div className="mb-4 flex rounded-[5px] border border-white/10 bg-white/[0.035] p-1 text-[11px] font-semibold">
        <span className="rounded-[4px] bg-white/10 px-2 py-1 text-white">Providers</span>
        <span className="px-2 py-1 text-mist-200">Saved connections</span>
      </div>
      <div className="grid gap-2">
        {rows.map(([title, meta, Icon], index) => (
          <div key={title} className={`flex items-center gap-3 rounded-[6px] border border-white/[0.08] bg-white/[0.025] p-2 ${index > 2 ? "opacity-35" : ""}`}>
            <span className="grid h-8 w-8 place-items-center rounded-[6px] border border-white/[0.08]">
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{title}</p>
              <p className="text-[10px] text-mist-400">{meta}</p>
            </div>
            <span className="grid h-5 w-5 place-items-center rounded-[5px] border border-violetx-400/30 text-violetx-400">
              <Check size={12} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantMockup() {
  return (
    <div className="mx-auto max-w-[380px] rounded-[17px] border border-white/10 bg-[#050505] p-4 text-center">
      <div className="relative mx-auto mb-6 h-14 w-14">
        <div className="absolute inset-0 rounded-full bg-violetx-500/[0.45] blur-xl" />
        <div className="absolute inset-2 rounded-full bg-[conic-gradient(from_40deg,transparent,rgba(184,135,255,0.9),transparent,rgba(111,52,197,0.8),transparent)]" />
      </div>
      <p className="text-sm font-semibold text-white">Models detected</p>
      <p className="mx-auto mt-2 max-w-[260px] text-[10px] leading-4 text-mist-400">
        Choose a detected model or enter a model ID manually.
      </p>
      <div className="mt-6 flex items-center rounded-[6px] border border-white/10 bg-white/[0.025] p-2 text-left text-[11px] text-mist-400">
        Select a model
        <Send className="ml-auto text-violetx-400" size={14} />
      </div>
    </div>
  );
}

function EmailMockup() {
  return (
    <div className="mx-auto max-w-[380px] rounded-[17px] border border-white/10 bg-[#050505] p-4">
      <div className="mb-3 flex items-center justify-between rounded-[6px] border border-white/10 bg-white/[0.025] px-3 py-2">
        <span className="text-xs font-semibold text-white">Switch active model</span>
        <Clock3 size={15} className="text-violetx-400" />
      </div>
      <div className="mb-3 flex gap-2">
        {["Writing", "Coding", "Reasoning"].map((tag) => (
          <span key={tag} className="rounded-full border border-white/[0.14] px-2 py-1 text-[10px] text-white">
            {tag}
          </span>
        ))}
      </div>
      {[["Claude Sonnet", "Anthropic Claude", "Using"], ["Gemini Flash", "Google Gemini", "Saved"]].map(([name, role, status], index) => (
        <div key={name} className={`mb-2 rounded-[7px] border border-white/[0.08] bg-white/[0.035] p-3 ${index ? "opacity-35" : ""}`}>
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-white/[0.16]" />
            <div>
              <p className="text-xs font-semibold text-white">{name}</p>
              <p className="text-[10px] text-mist-400">{role}</p>
            </div>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-1 text-[10px] text-white">{status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectMockup() {
  return (
    <div className="mx-auto max-w-[390px] rounded-[17px] border border-white/10 bg-[#050505] p-4">
      <p className="text-xs font-bold text-white">Saved chats</p>
      <p className="mb-4 text-[11px] text-mist-300">Continue any conversation from one sidebar</p>
      <div className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
      <p className="mb-3 text-xs font-semibold text-white">Recent chat:</p>
        <div className="flex items-center gap-3 rounded-[6px] border border-white/[0.08] bg-white/[0.04] p-3">
          <span className="grid h-8 w-8 place-items-center rounded-[6px] bg-white/[0.08]">
            <FileText size={15} />
          </span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-white">API integration help</p>
            <p className="text-[10px] text-mist-400">Using DeepSeek</p>
          </div>
          <span className="h-4 w-4 rounded-full border border-white/60 border-r-violetx-500" />
        </div>
      </div>
      <div className="mt-3 rounded-[8px] border border-white/[0.08] bg-white/[0.025] p-3">
        <p className="mb-3 text-xs font-semibold text-mist-200">History</p>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-mist-400">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
            <span key={day} className={day === "Su" ? "rounded-[4px] bg-violetx-500/70 py-1 text-white" : "py-1"}>
              {day}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ServiceVisual({ type }) {
  const visual = {
    tasks: <TaskMockup />,
    assistant: <AssistantMockup />,
    email: <EmailMockup />,
    project: <ProjectMockup />,
  }[type];

  return (
    <GlowCard className="min-h-[310px]" innerClassName="grid place-items-center p-8">
      {visual}
    </GlowCard>
  );
}

export function Services() {
  return (
    <section id="services" className="px-6 py-24 md:px-16 md:py-32">
      <SectionHeader
        label="Features"
        title="Why this chatbot is different"
        description="Connect the AI APIs you already use, switch models clearly, and keep one simple chat interface."
      />
      <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.12 }} className="grid gap-24">
        {services.map((service, index) => (
          <div
            key={service.title}
            className={`grid items-center gap-10 lg:grid-cols-2 ${service.reverse ? "lg:[&>*:first-child]:order-2" : ""}`}
          >
            <Reveal variants={index % 2 === 0 ? leftRevealVariants : rightRevealVariants}>
              <ServiceVisual type={service.visual} />
            </Reveal>
            <Reveal variants={index % 2 === 0 ? rightRevealVariants : leftRevealVariants}>
              <div className="max-w-xl">
                <SectionLabel>{service.eyebrow}</SectionLabel>
                <h3 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.045em] text-white md:text-4xl">
                  {service.title}
                </h3>
                <p className="mt-4 text-base leading-7 text-mist-200">{service.description}</p>
                <TagGroup tags={service.tags} />
              </div>
            </Reveal>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
