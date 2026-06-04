import React from "react";
import { motion } from "framer-motion";
import { Bot, BrainCircuit, Network, Orbit } from "lucide-react";
import { trustedLogos } from "../../data/landingData";
import { staggerContainer, revealVariants } from "../../utils/motion";
import { PlatformTicker, providerTickerItems } from "../ui/PlatformTicker";

const providerIcons = [Bot, BrainCircuit, Orbit, Network];

export function TrustedBy() {
  return (
    <motion.div
      className="mx-auto mt-28 grid max-w-4xl justify-items-center gap-7"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={revealVariants} className="grid max-w-2xl justify-items-center gap-3 text-center">
        <p className="text-lg font-semibold tracking-[-0.025em] text-white md:text-xl">
          Connect and switch between leading AI models
        </p>
        <p className="max-w-xl text-sm leading-6 text-mist-300">
          Connect your API key, detect supported models, and chat from one simple interface.
        </p>
      </motion.div>
      <motion.div variants={staggerContainer} className="grid w-full grid-cols-2 gap-5 md:grid-cols-4">
        {trustedLogos.map((logo, index) => {
          const Icon = providerIcons[index];

          return (
            <motion.div
              key={`${logo}-${index}`}
              variants={revealVariants}
              className="flex items-center justify-center gap-2 text-sm font-bold text-white/80"
            >
              <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-white/10 bg-white/[0.04] text-violetx-300">
                <Icon aria-hidden="true" size={15} />
              </span>
              <span>{logo}</span>
            </motion.div>
          );
        })}
      </motion.div>
      <motion.div variants={revealVariants} className="grid w-full max-w-4xl gap-3">
        <PlatformTicker label="Supported AI models" />
        <PlatformTicker items={providerTickerItems} label="Providers and platforms" reverse />
      </motion.div>
    </motion.div>
  );
}
