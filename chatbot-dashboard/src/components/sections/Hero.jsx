import React from "react";
import { motion } from "framer-motion";
import { Button } from "../ui/Button";
import { WorkspaceButton } from "../auth/WorkspaceButton";
import { OrbitalGlow } from "../ui/OrbitalGlow";
import { SectionLabel } from "../ui/SectionLabel";
import { StarField } from "../ui/StarField";
import RotatingText from "../ui/RotatingText";
import { TrustedBy } from "./TrustedBy";
import { heroContainer, heroItem, premiumEase } from "../../utils/motion";

function HeroMockup() {
  return (
    <motion.div
      className="pointer-events-none relative z-0 mx-auto mt-12 w-full max-w-[430px]"
      initial={{ opacity: 0, y: 28, scale: 0.985, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: [0, -12, 0], rotate: [0, 0.8, 0], scale: 1, filter: "blur(0px)" }}
      transition={{
        opacity: { duration: 0.9, ease: premiumEase, delay: 0.7 },
        filter: { duration: 0.9, ease: premiumEase, delay: 0.7 },
        scale: { duration: 0.9, ease: premiumEase, delay: 0.7 },
        y: { duration: 8, repeat: Infinity, ease: "easeInOut" },
        rotate: { duration: 8, repeat: Infinity, ease: "easeInOut" },
      }}
      aria-hidden="true"
    >
      <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-2 shadow-glow">
        <div className="rounded-[16px] border border-white/10 bg-black/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="h-2 w-28 rounded-full bg-white/[0.12]" />
            <span className="h-2 w-12 rounded-full bg-violetx-500/[0.55]" />
          </div>
          <div className="grid gap-2">
            {["Secure AI response", "Server managed", "PDF analyzed", "Research saved"].map((item, index) => (
              <div key={item} className="flex items-center justify-between rounded-[8px] border border-white/[0.08] bg-white/[0.035] px-3 py-2">
                <span className="text-xs font-semibold text-mist-200">{item}</span>
                <span className={`h-2 w-2 rounded-full ${index < 2 ? "bg-violetx-400" : "bg-white/[0.18]"}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function Hero() {
  return (
    <section id="home" className="relative -mt-[74px] min-h-[860px] w-full overflow-hidden px-6 pb-16 pt-32 sm:min-h-[900px] md:px-12 md:pt-36 lg:px-16">
      <StarField />
      <OrbitalGlow className="left-1/2 top-[330px] h-[360px] w-[360px] -translate-x-1/2" />

      <motion.div
        className="relative z-10 mx-auto grid max-w-4xl justify-items-center pt-20 text-center sm:pt-24 md:pt-28"
        variants={heroContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={heroItem}>
          <SectionLabel className="border-violetx-300/[0.35] bg-violetx-500/75 px-3 py-1 text-white shadow-purple">
            New
          </SectionLabel>
        </motion.div>
        <motion.h1
          variants={heroItem}
          className="mt-8 flex max-w-4xl flex-col items-center text-balance text-[3.25rem] font-semibold leading-[0.98] tracking-[-0.07em] text-white md:text-[4.9rem] lg:text-[5.35rem]"
        >
          <span>One AI Workspace to</span>
          <RotatingText
            texts={["Chat", "Switch", "Explore"]}
            mainClassName="rotating-hero-word"
            staggerFrom="last"
            initial={{ y: "100%", opacity: 0, filter: "blur(8px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: "-120%", opacity: 0, filter: "blur(8px)" }}
            staggerDuration={0.025}
            splitLevelClassName="rotating-hero-word-inner"
            elementLevelClassName="rotating-hero-letter"
            transition={{ type: "spring", damping: 30, stiffness: 420 }}
            rotationInterval={2000}
            splitBy="characters"
          />
        </motion.h1>
        <motion.p variants={heroItem} className="mt-6 max-w-2xl text-base leading-7 text-mist-200 md:text-lg">
          Chat securely, upload documents, refine responses, and keep every useful conversation organized in one place.
        </motion.p>
        <motion.div variants={heroItem} className="relative z-20 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <WorkspaceButton>Open Workspace</WorkspaceButton>
          <Button href="#services" variant="secondary" icon={false}>
            Explore features
          </Button>
        </motion.div>
        <HeroMockup />
      </motion.div>

      <TrustedBy />
    </section>
  );
}
