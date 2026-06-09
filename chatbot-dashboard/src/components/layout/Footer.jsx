import React from "react";
import { footerLinks } from "../../data/landingData";
import { Logo } from "./Header";

const footerHref = {
  Home: "#home",
  Chat: "/chat",
  FAQ: "#faq",
  Contact: "#contact",
  Workspace: "#services",
  Models: "#models",
  Memory: "#memory",
  Documents: "#documents",
  Privacy: "#privacy",
  Launch: "#contact",
};

export function Footer() {
  return (
    <footer className="landing-footer px-5 md:px-16">
      <div className="overflow-hidden rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] shadow-card">
        <div className="grid gap-8 p-6 sm:p-7 lg:grid-cols-[1.05fr_1.4fr] lg:p-9">
          <div className="max-w-md">
            <Logo />
            <p className="mt-5 text-sm leading-6 text-mist-200 sm:text-base sm:leading-7">
              Nexa AI brings models, memory, documents, and private provider access into one focused workspace.
            </p>
            <form className="mt-6 grid max-w-md grid-cols-1 overflow-hidden rounded-[8px] border border-white/10 bg-black/35 min-[420px]:grid-cols-[1fr_auto]">
              <input
                className="min-h-12 min-w-0 bg-transparent px-4 text-sm text-white outline-none placeholder:text-mist-400"
                placeholder="name@email.com"
                type="email"
              />
              <button className="min-h-12 bg-violetx-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-violetx-400" type="button">
                Subscribe
              </button>
            </form>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title} className="rounded-[10px] border border-white/[0.08] bg-black/20 p-4">
                <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
                <ul className="grid gap-2.5 text-sm text-mist-200">
                  {links.map((link) => (
                    <li key={link}>
                      <a className="inline-flex min-h-7 items-center transition-colors hover:text-violetx-300" href={footerHref[link] ?? "#home"}>
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 text-xs font-semibold text-mist-300 sm:flex-row sm:items-center sm:justify-between lg:px-9">
          <p>© {new Date().getFullYear()} Nexa AI. AI Workspace.</p>
          <div className="flex flex-wrap gap-3">
            <a className="transition-colors hover:text-white" href="#home">Home</a>
            <a className="transition-colors hover:text-white" href="/chat">Workspace</a>
            <a className="transition-colors hover:text-white" href="#faq">FAQ</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
