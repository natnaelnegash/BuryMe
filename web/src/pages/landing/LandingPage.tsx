import { BalanceBand } from "./sections/BalanceBand.js";
import { Faq } from "./sections/Faq.js";
import { Features } from "./sections/Features.js";
import { FinalCta } from "./sections/FinalCta.js";
import { Hero } from "./sections/Hero.js";
import { HowItWorks } from "./sections/HowItWorks.js";
import { LandingFooter } from "./sections/LandingFooter.js";
import { LandingHeader } from "./sections/LandingHeader.js";
import { Platforms } from "./sections/Platforms.js";
import { TrustSafety } from "./sections/TrustSafety.js";
import { ValueStrip } from "./sections/ValueStrip.js";
import styles from "./LandingPage.module.css";

export function LandingPage() {
  return (
    <div className={styles.page}>
      <LandingHeader />
      <main>
        <Hero />
        <ValueStrip />
        <HowItWorks />
        <Features />
        <BalanceBand />
        <TrustSafety />
        <Platforms />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
