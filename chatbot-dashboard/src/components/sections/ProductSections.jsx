import React from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  BrainCircuit,
  Braces,
  Code2,
  Database,
  FileCode2,
  FileText,
  GraduationCap,
  KeyRound,
  Layers3,
  LockKeyhole,
  Network,
  Route,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserCog,
  Users,
} from "lucide-react";
import { staggerContainer } from "../../utils/motion";
import { GlowCard } from "../ui/GlowCard";
import { Reveal } from "../ui/Reveal";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionLabel } from "../ui/SectionLabel";

const whyCards = [
  {
    icon: Network,
    title: "Multi-LLM Workspace",
    description: "Use multiple AI providers from one interface.",
  },
  {
    icon: BrainCircuit,
    title: "Intelligent Memory",
    description: "Nexa remembers preferences and important context.",
  },
  {
    icon: FileText,
    title: "Document Intelligence",
    description: "Upload files and retrieve answers with citations.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy First",
    description: "Bring your own API keys and keep control of your data.",
  },
];

const providers = ["Gemini", "Claude", "OpenAI", "DeepSeek", "Groq", "OpenRouter", "Ollama"];

const memoryItems = [
  ["Conversation Context", "Recent history stays available for follow-up questions."],
  ["Long-Term Memory", "Useful facts persist across sessions."],
  ["Automatic Preference Detection", "Tone, language, and workflow signals become reusable context."],
  ["Personalized Responses", "Answers adapt to how you work."],
];

const documentItems = [
  ["Document Chunking", "Files become searchable knowledge units."],
  ["Semantic Search", "Relevant passages surface before generation."],
  ["Citations", "Answers point back to source material."],
  ["Context Retrieval", "Only useful document context reaches the model."],
];

const fileTypes = [
  ["PDF", FileText],
  ["DOCX", FileText],
  ["TXT", FileCode2],
  ["Markdown", Braces],
];

const privacyCards = [
  ["BYOK", "Use your own provider keys.", KeyRound],
  ["Encrypted API Key Storage", "Credentials stay protected server-side.", LockKeyhole],
  ["Local Deployment", "Run Nexa inside your own environment.", Server],
  ["Self Hosting", "Keep the workspace under your control.", ShieldCheck],
];

const builtForCards = [
  ["AI Engineers", "Prototype provider routing and RAG flows.", Route],
  ["Developers", "Code, debug, compare, and document.", Code2],
  ["Researchers", "Search documents and preserve source context.", Search],
  ["Students", "Learn with memory and cited file answers.", GraduationCap],
  ["Power Users", "Switch models without switching workflows.", UserCog],
];

const stackGroups = [
  ["Frontend", ["React", "Tailwind CSS", "Framer Motion", "Three.js"]],
  ["Backend", ["Flask", "SQLAlchemy", "PostgreSQL", "SQLite"]],
  ["AI Infrastructure", ["Multi-Provider Routing", "Memory Engine", "RAG System", "Streaming Responses"]],
];

function IconCardGrid({ items, columns = "lg:grid-cols-4" }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.14 }}
      className={`grid gap-4 sm:grid-cols-2 ${columns}`}
    >
      {items.map(({ icon: Icon, title, description }) => (
        <GlowCard key={title} innerClassName="min-h-[190px] p-6">
          <Icon size={24} className="mb-6 text-violetx-200" />
          <h3 className="text-xl font-semibold tracking-[-0.035em] text-white">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-mist-300">{description}</p>
        </GlowCard>
      ))}
    </motion.div>
  );
}

function CompactList({ items }) {
  return (
    <div className="grid gap-3">
      {items.map(([title, description]) => (
        <div key={title} className="rounded-[8px] border border-white/10 bg-white/[0.035] p-4">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-sm leading-6 text-mist-300">{description}</p>
        </div>
      ))}
    </div>
  );
}

function WhyNexa() {
  return (
    <section id="services" className="landing-section px-6 md:px-16">
      <SectionHeader
        label="Why Nexa AI"
        title="A serious workspace for model-native work"
        description="One place for providers, memory, documents, and private AI workflows."
        typewriter
      />
      <IconCardGrid items={whyCards} />
    </section>
  );
}

function ProviderWorkspace() {
  return (
    <section id="models" className="landing-section px-6 md:px-16">
      <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal className="max-w-xl">
          <SectionLabel>One Workspace. Every Model.</SectionLabel>
          <h2 className="mt-5 text-balance text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.055em] text-white md:text-5xl">
            Switch providers without rebuilding your workflow.
          </h2>
          <p className="mt-5 text-base leading-7 text-mist-200">
            Keep one conversation history, one familiar interface, and instant access to the models you trust.
          </p>
        </Reveal>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.16 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {providers.map((provider, index) => (
            <GlowCard key={provider} innerClassName="grid min-h-[108px] place-items-center p-4 text-center" hover={index < 6}>
              <span className="grid h-9 w-9 place-items-center rounded-[8px] border border-white/10 bg-white/[0.045] text-violetx-200">
                <Sparkles size={17} />
              </span>
              <p className="mt-3 text-sm font-bold text-white">{provider}</p>
            </GlowCard>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function IntelligentMemory() {
  return (
    <section id="memory" className="landing-section px-6 md:px-16">
      <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <Reveal>
          <GlowCard innerClassName="p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-[10px] border border-white/10 bg-white/[0.05] text-violetx-200">
                <BrainCircuit size={22} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Memory Engine</p>
                <p className="text-xs text-mist-400">Context that compounds</p>
              </div>
            </div>
            <CompactList items={memoryItems} />
          </GlowCard>
        </Reveal>
        <Reveal className="max-w-xl lg:justify-self-end">
          <SectionLabel>Intelligent Memory</SectionLabel>
          <h2 className="mt-5 text-balance text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.055em] text-white md:text-5xl">
            Responses get sharper as Nexa learns your workflow.
          </h2>
          <p className="mt-5 text-base leading-7 text-mist-200">
            Nexa keeps short-term conversation context and long-term user memory separate, visible, and useful.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Documents() {
  return (
    <section id="documents" className="landing-section px-6 md:px-16">
      <SectionHeader
        label="Chat With Your Documents"
        title="RAG built into the workspace"
        description="Upload source files, retrieve the right context, and answer with citations."
        typewriter
      />
      <div className="mx-auto grid max-w-[1180px] gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <GlowCard innerClassName="p-6">
          <p className="mb-5 text-sm font-semibold text-white">Supported files</p>
          <div className="grid grid-cols-2 gap-3">
            {fileTypes.map(([label, Icon]) => (
              <div key={label} className="rounded-[8px] border border-white/10 bg-white/[0.035] p-4">
                <Icon size={18} className="mb-3 text-violetx-200" />
                <p className="text-sm font-semibold text-white">{label}</p>
              </div>
            ))}
          </div>
        </GlowCard>
        <GlowCard innerClassName="p-6">
          <CompactList items={documentItems} />
        </GlowCard>
      </div>
    </section>
  );
}

function Privacy() {
  const items = privacyCards.map(([title, description, icon]) => ({ title, description, icon }));

  return (
    <section id="privacy" className="landing-section px-6 md:px-16">
      <SectionHeader
        label="Privacy First"
        title="Your keys, your deployment, your data"
        description="Nexa is built for users who want control without losing product polish."
        typewriter
      />
      <IconCardGrid items={items} />
    </section>
  );
}

function BuiltFor() {
  const items = builtForCards.map(([title, description, icon]) => ({ title, description, icon }));

  return (
    <section id="built-for" className="landing-section px-6 md:px-16">
      <SectionHeader
        label="Built For"
        title="Technical users who move between models"
        description="Nexa keeps advanced AI workflows focused, private, and fast to operate."
        typewriter
      />
      <IconCardGrid items={items} columns="lg:grid-cols-5" />
    </section>
  );
}

function TechnologyStack() {
  return (
    <section id="stack" className="landing-section px-6 md:px-16">
      <SectionHeader
        label="Technology Stack"
        title="Built on a practical full-stack foundation"
        description="A production-minded architecture for multi-provider AI workflows."
        typewriter
      />
      <div className="mx-auto grid max-w-[1180px] gap-4 lg:grid-cols-3">
        {stackGroups.map(([group, items]) => (
          <GlowCard key={group} innerClassName="p-6">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[9px] border border-white/10 bg-white/[0.045] text-violetx-200">
                {group === "Frontend" && <Layers3 size={19} />}
                {group === "Backend" && <Database size={19} />}
                {group === "AI Infrastructure" && <TerminalSquare size={19} />}
              </span>
              <h3 className="text-xl font-semibold tracking-[-0.035em] text-white">{group}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <span key={item} className="rounded-[7px] border border-white/10 bg-white/[0.045] px-3 py-2 text-sm font-semibold text-mist-100">
                  {item}
                </span>
              ))}
            </div>
          </GlowCard>
        ))}
      </div>
    </section>
  );
}

export function ProductSections() {
  return (
    <>
      <WhyNexa />
      <ProviderWorkspace />
      <IntelligentMemory />
      <Documents />
      <Privacy />
      <BuiltFor />
      <TechnologyStack />
    </>
  );
}
