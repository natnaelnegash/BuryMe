import counterProposalShot from "../../../assets/landing/counter-proposal.png";
import groupExpenseShot from "../../../assets/landing/group-expense.png";
import makePaymentShot from "../../../assets/landing/make-payment.png";
import obligationDetailShot from "../../../assets/landing/obligation-detail.png";
import settlementShot from "../../../assets/landing/settlement.png";
import { BrowserFrame } from "../BrowserFrame.js";
import styles from "../LandingPage.module.css";

const FEATURES = [
  {
    title: "Mutual records",
    body: "Both people acknowledge every obligation, so your records always match.",
    shot: obligationDetailShot,
    alt: "An obligation showing its outstanding balance, agreed terms and activity log.",
    height: 368,
  },
  {
    title: "Negotiate before you commit",
    body: "Propose terms, send one counter, then agree. No endless back-and-forth.",
    shot: counterProposalShot,
    alt: "The counter-proposal screen, comparing their proposal against your counter.",
    height: 386,
  },
  {
    title: "Pay with Telebirr",
    body: "Settle directly through Chapa, or record external payments when you pay in cash.",
    shot: makePaymentShot,
    alt: "The payment screen, paying an obligation through Telebirr.",
    height: 335,
  },
  {
    title: "Split group expenses",
    body: "One bill becomes fair individual records — up to 50 people.",
    shot: groupExpenseShot,
    alt: "A group expense being split equally between three people.",
    height: 411,
  },
  {
    title: "Smart settle-up",
    body: "When two people owe each other, BuryMe suggests a single net payment.",
    shot: settlementShot,
    alt: "A suggested settlement netting two obligations into one payment.",
    height: 276,
  },
];

export function Features() {
  return (
    <section id="features" className={[styles.section, styles.features].join(" ")}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>FEATURES</p>
        <h2 className={styles.h2}>Built for money between people who know each other.</h2>
      </div>
      {FEATURES.map((feature, i) => (
        <div
          key={feature.title}
          className={[styles.featureRow, i % 2 === 1 ? styles.featureRowReversed : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={styles.featureText}>
            <h3 className={styles.featureTitle}>{feature.title}</h3>
            <p className={styles.featureBody}>{feature.body}</p>
          </div>
          <div className={styles.featureVisual}>
            <BrowserFrame
              src={feature.shot}
              alt={feature.alt}
              shot={{ width: 598, height: feature.height }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
