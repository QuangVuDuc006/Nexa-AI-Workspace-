import React, { useState } from "react";
import { motion } from "framer-motion";
import { pricingPlans } from "../../data/landingData";
import { staggerContainer } from "../../utils/motion";
import { WorkspaceButton } from "../auth/WorkspaceButton";
import { GlowCard } from "../ui/GlowCard";
import { PricingToggle } from "../ui/PricingToggle";
import { SectionHeader } from "../ui/SectionHeader";
import { Check } from "lucide-react";

const priceByBilling = {
  Starter: { monthly: "$37", annual: "$29" },
  Professional: { monthly: "$75", annual: "$59" },
  Enterprise: { monthly: "Custom", annual: "Custom" },
};

export function Pricing() {
  const [billing, setBilling] = useState("annual");
  const billingNote = billing === "annual" ? "per month, billed annually" : "per month";

  return (
    <section id="pricing" className="px-6 py-24 md:px-12 md:py-32">
      <SectionHeader
        label="Pricing"
        title="Choose the setup that fits how you use AI APIs"
        description="Start with your own provider keys, then add more connections and controls as you need them."
      />
      <PricingToggle value={billing} onChange={setBilling} />
      <motion.div
        className="grid gap-4 lg:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.12 }}
      >
        {pricingPlans.map(({ icon: Icon, name, description, cta, popular, features }) => {
          const price = priceByBilling[name]?.[billing] ?? "Custom";
          const isCustom = price === "Custom";

          return (
            <GlowCard
              key={name}
              className={popular ? "border-violetx-400/40 bg-violetx-500/25 shadow-purple" : ""}
              innerClassName={`flex min-h-[430px] flex-col p-7 ${popular ? "bg-[radial-gradient(circle_at_50%_0%,rgba(141,77,232,0.34),rgba(255,255,255,0.025)_42%,rgba(0,0,0,0.4)_100%)]" : ""}`}
            >
              <div className="flex items-center gap-3">
                <Icon size={24} fill="currentColor" className="text-white" />
                <h3 className="text-2xl font-semibold tracking-[-0.045em] text-mist-200">{name}</h3>
                {popular && (
                  <span className="ml-auto rounded-[6px] border border-white/[0.12] bg-black/[0.35] px-3 py-1.5 text-xs font-semibold text-white">
                    Popular
                  </span>
                )}
              </div>
              <div className="mt-7 min-h-[70px]">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-semibold tracking-[-0.06em] text-white">{price}</span>
                  {!isCustom && <span className="pb-1 text-sm font-medium text-mist-200">/month</span>}
                </div>
                <p className="mt-2 text-xs font-medium text-mist-300">{isCustom ? "Custom setup for larger deployments" : billingNote}</p>
              </div>
              <p className="mt-4 min-h-[50px] text-sm leading-6 text-mist-200">{description}</p>
              <WorkspaceButton variant={popular ? "primary" : "secondary"} icon={false} className="mt-7 w-full">
                {cta}
              </WorkspaceButton>
              <div className="mt-8">
                <p className="mb-4 text-sm font-semibold text-mist-200">What's included:</p>
                <ul className="grid gap-3">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm font-semibold leading-5 text-white">
                      <Check className="mt-0.5 shrink-0" size={17} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </GlowCard>
          );
        })}
      </motion.div>
    </section>
  );
}
