import React from "react";
import { Bot, Boxes, BrainCircuit, Cable, Cloud, Cpu, KeyRound, Network, Orbit, Server } from "lucide-react";

const defaultItems = [
  { label: "GPT-5.5", icon: Bot },
  { label: "Claude Sonnet", icon: BrainCircuit },
  { label: "Gemini 2.5 Pro", icon: Orbit },
  { label: "DeepSeek R1", icon: Cpu },
  { label: "Grok", icon: Network },
  { label: "Kimi", icon: Cloud },
  { label: "Mistral", icon: Boxes },
];

export const providerTickerItems = [
  { label: "OpenAI", icon: Bot },
  { label: "OpenRouter", icon: Network },
  { label: "Anthropic", icon: BrainCircuit },
  { label: "Google AI", icon: Orbit },
  { label: "Groq", icon: Cpu },
  { label: "Together AI", icon: Cloud },
  { label: "Ollama", icon: Server },
  { label: "LM Studio", icon: Boxes },
  { label: "OpenAI Compatible APIs", icon: Cable },
  { label: "Bring Your Own API Key", icon: KeyRound },
];

export function PlatformTicker({ items = defaultItems, className = "", reverse = false, label = "AI models" }) {
  const tickerItems = [...items, ...items];

  return (
    <div className={`platform-ticker relative w-full overflow-hidden ${className}`} aria-label={label}>
      <div className={`platform-ticker-track flex w-max items-center gap-3 ${reverse ? "is-reverse" : ""}`}>
        {tickerItems.map((item, index) => {
          const Icon = item.icon;
          const isDuplicate = index >= items.length;

          return (
            <span
              key={`${item.label}-${index}`}
              className="platform-ticker-item rounded-[7px] border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-semibold text-mist-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              aria-hidden={isDuplicate ? "true" : undefined}
            >
              <Icon aria-hidden="true" size={15} />
              <span>{item.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
