import {
  BrainCircuit,
  Check,
  Crown,
  FolderKanban,
  GitCompare,
  History,
  MessageSquare,
  Rocket,
  Sparkles,
  Upload,
} from "lucide-react";

export const navItems = [
  { label: "Home", href: "#home" },
  { label: "Workspace", href: "#services" },
  { label: "Models", href: "#models" },
  { label: "Memory", href: "#memory" },
  { label: "Docs", href: "#documents" },
];

export const trustedLogos = ["Gemini", "Claude", "OpenAI", "OpenRouter"];

export const services = [
  {
    eyebrow: "Bring your own API key",
    title: "Connect the providers you already use",
    description:
      "Add OpenAI, Gemini, Claude, OpenRouter, DeepSeek, Groq, Kimi, Mistral, or another supported API. Your saved keys are encrypted server-side and are not returned to the browser.",
    tags: ["Your API keys", "Many providers", "Encrypted storage"],
    visual: "tasks",
  },
  {
    eyebrow: "Model detection",
    title: "Detect available models when the provider supports it",
    description:
      "Let Nexa AI request the provider's model list, then choose the model you want. If detection is unavailable, enter the model ID manually and keep moving.",
    tags: ["Detect models", "Manual model entry", "Connection test"],
    visual: "assistant",
    reverse: true,
  },
  {
    eyebrow: "Model switching",
    title: "Switch providers without leaving the chat",
    description:
      "Move between models for writing, coding, reasoning, research, fast replies, or lower-cost usage. The top bar always shows which model is active.",
    tags: ["Using active model", "Fast switching", "Task-based choice"],
    visual: "email",
  },
  {
    eyebrow: "Clean chat history",
    title: "Keep conversations organized across providers",
    description:
      "Use one focused sidebar for new chats, search, uploads, provider settings, and history instead of managing a separate conversation list in every provider dashboard.",
    tags: ["Saved chats", "Search history", "One interface"],
    visual: "project",
    reverse: true,
  },
];

export const processSteps = [
  {
    step: "Step 1",
    title: "Paste your API key",
    description: "Open Provider Settings, paste your credential, and add a Base URL only when the API needs one.",
    visual: "radar",
  },
  {
    step: "Step 2",
    title: "Detect available models",
    description: "Request the model list when the provider supports detection, or enter a model ID manually.",
    visual: "code",
  },
  {
    step: "Step 3",
    title: "Choose the active model",
    description: "Select the provider and model you want to use. The top bar makes the current choice clear.",
    visual: "integration",
  },
  {
    step: "Step 4",
    title: "Start chatting",
    description: "Send a message, attach context when needed, and switch models later without learning a new interface.",
    visual: "optimize",
  },
];

export const benefits = [
  {
    icon: MessageSquare,
    title: "One clean chatbot",
    description: "Use the same focused chat interface across multiple providers instead of jumping between dashboards.",
  },
  {
    icon: Upload,
    title: "Your active model stays visible",
    description: "The top bar shows exactly which saved provider and model will answer your next message.",
  },
  {
    icon: GitCompare,
    title: "Use the right model for the task",
    description: "Choose a model for writing, coding, reasoning, research, speed, or cost without leaving the chat.",
  },
  {
    icon: FolderKanban,
    title: "Manual fallback when needed",
    description: "If a provider cannot return its model list, enter the model ID manually and test the connection.",
  },
  {
    icon: History,
    title: "Keys stay under your control",
    description: "Saved credentials are encrypted server-side, masked in settings, and never returned to the browser.",
  },
  {
    icon: BrainCircuit,
    title: "Conversations stay organized",
    description: "Search and return to useful chats while keeping provider settings separate from the conversation flow.",
  },
];

export const pricingPlans = [
  {
    icon: Rocket,
    name: "Starter",
    price: "$37",
    period: "/month",
    description: "For individuals who want a simple chatbot for the AI APIs they already use.",
    cta: "Start chatting",
    features: [
      "Bring your own API keys",
      "Provider and model selection",
      "Model detection when available",
      "Manual model entry",
      "Conversation history",
    ],
  },
  {
    icon: Sparkles,
    name: "Professional",
    price: "$75",
    period: "/month",
    description: "For people who regularly switch between providers, models, and different kinds of tasks.",
    cta: "Start chatting",
    popular: true,
    features: [
      "Everything in Starter",
      "Multiple saved providers",
      "Connection testing",
      "Active model switcher",
      "File and image attachments",
      "Encrypted server-side credentials",
    ],
  },
  {
    icon: Crown,
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For teams evaluating a controlled multi-provider chatbot deployment.",
    cta: "Start chatting",
    features: [
      "Everything in Professional",
      "Custom provider endpoints",
      "OpenAI-compatible APIs",
      "Local Ollama and LM Studio support",
      "Provider configuration controls",
    ],
  },
];

export const testimonials = [
  {
    name: "Maya Chen",
    role: "Product developer",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&fm=webp&w=96&q=76",
    quote:
      "I can use a fast model for drafts, then switch to a stronger reasoning model without opening another provider dashboard.",
  },
  {
    name: "Sophia Martinez",
    role: "Graduate student",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&fm=webp&w=96&q=76",
    quote:
      "I already had Gemini and OpenRouter keys. Connecting both and seeing the active model in the top bar makes the setup easy to understand.",
  },
  {
    name: "David Reynolds",
    role: "API power user",
    avatar: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&fm=webp&w=96&q=76",
    quote:
      "Model detection saves time, and manual model entry means custom endpoints are still usable when a provider does not expose a model list.",
  },
  {
    name: "Emily Wong",
    role: "Content writer",
    avatar: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&fm=webp&w=96&q=76",
    quote:
      "I switch between providers based on tone, speed, and cost while keeping all of my chats in one familiar interface.",
  },
];

export const faqs = [
  {
    question: "What is Nexa AI?",
    answer:
      "Nexa AI is a private multi-provider AI workspace for models, memory, documents, and personal workflows.",
  },
  {
    question: "Which providers are supported?",
    answer:
      "Nexa supports Gemini, Claude, OpenAI, DeepSeek, Groq, OpenRouter, Ollama, and OpenAI-compatible endpoints.",
  },
  {
    question: "How does memory work?",
    answer:
      "Nexa combines recent conversation context with long-term memory so responses can reflect your preferences and important details.",
  },
  {
    question: "Can I chat with documents?",
    answer:
      "Yes. Upload PDF, DOCX, TXT, or Markdown files, then retrieve grounded answers with citations.",
  },
  {
    question: "Are API keys secure?",
    answer:
      "Saved API keys are encrypted server-side, masked in settings, and not returned to the browser after saving.",
  },
  {
    question: "Can I self-host Nexa AI?",
    answer:
      "Yes. Nexa is designed for local deployment and self-hosted environments where you control the infrastructure.",
  },
];

export const footerLinks = {
  Links: ["Workspace", "Models", "Memory", "Documents", "Privacy"],
  Pages: ["Home", "Chat", "FAQ", "Launch"],
  Socials: ["LinkedIn", "Twitter", "GitHub", "Docs"],
};

export const checkIcon = Check;
