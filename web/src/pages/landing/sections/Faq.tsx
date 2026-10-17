import styles from "../LandingPage.module.css";

const QUESTIONS = [
  {
    question: "Does BuryMe move real money?",
    answer:
      "Yes. Repayments and disbursements can run through Telebirr via Chapa. You can also just record cash payments.",
  },
  {
    question: "What if we disagree on the terms?",
    answer:
      "Negotiate before agreeing: one counter-proposal, then accept or decline. Once agreed, the terms are fixed.",
  },
  {
    question: "Do both people need an account?",
    answer:
      "Yes. Every obligation is a shared record between two BuryMe users who can each confirm and settle it.",
  },
  {
    question: "Is my information safe?",
    answer:
      "Secure sign-in, encrypted connections, and an append-only history you can audit anytime.",
  },
];

export function Faq() {
  return (
    <section id="faq" className={[styles.section, styles.faq].join(" ")}>
      <h2 className={styles.h2}>Questions, answered.</h2>
      <div className={styles.faqList}>
        {QUESTIONS.map((item) => (
          <div key={item.question} className={styles.faqItem}>
            <h3 className={styles.faqQuestion}>{item.question}</h3>
            <p className={styles.faqAnswer}>{item.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
