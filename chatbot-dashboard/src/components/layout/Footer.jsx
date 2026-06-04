import React from "react";
import { footerLinks } from "../../data/landingData";
import { Logo } from "./Header";

const footerHref = {
  Home: "#home",
  Chat: "/chat",
  FAQ: "#faq",
  Contact: "#contact",
  Features: "#services",
  Workflow: "#process",
  "Use cases": "#case-studies",
  Benefits: "#benefits",
  Pricing: "#pricing",
};

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-violetx-800/[0.35] px-6 py-12 md:px-16">
      <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,0.55fr)]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-5 text-sm leading-6 text-mist-200">
            Nexa AI is a multi-provider chatbot for connecting your own AI APIs, switching models, and keeping chats organized.
          </p>
          <form className="mt-6 grid max-w-xs grid-cols-[1fr_auto] overflow-hidden rounded-[7px] border border-white/10 bg-black/40">
            <input
              className="min-h-10 min-w-0 bg-transparent px-3 text-sm text-white outline-none placeholder:text-mist-400"
              placeholder="name@email.com"
              type="email"
            />
            <button className="bg-violetx-500 px-4 text-sm font-semibold text-white transition hover:bg-violetx-400" type="button">
              Subscribe
            </button>
          </form>
        </div>
        {Object.entries(footerLinks).map(([title, links]) => (
          <div key={title}>
            <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
            <ul className="grid gap-2 text-sm text-mist-200">
              {links.map((link) => (
                <li key={link}>
                  <a className="transition hover:text-violetx-300" href={footerHref[link] ?? "#home"}>
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
