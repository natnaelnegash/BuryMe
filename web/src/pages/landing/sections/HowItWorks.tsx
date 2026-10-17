import makePaymentShot from "../../../assets/landing/make-payment.png";
import obligationDetailShot from "../../../assets/landing/obligation-detail.png";
import requestResponseShot from "../../../assets/landing/request-response.png";
import styles from "../LandingPage.module.css";

const STEPS = [
  {
    title: "Agree",
    body: "Send a borrow request, log a loan you gave, or split a bill. The other person reviews, counters once if needed, and agrees.",
    shot: requestResponseShot,
    alt: "A borrow request awaiting a response, with Decline, Counter and Accept.",
  },
  {
    title: "Track",
    body: "Every active obligation shows the amount, the direction, and what’s left to pay.",
    shot: obligationDetailShot,
    alt: "An obligation showing its outstanding balance, terms and activity log.",
  },
  {
    title: "Settle",
    body: "Pay with Telebirr or record a cash payment. Both sides confirm, and it’s closed.",
    shot: makePaymentShot,
    alt: "The payment screen, paying an obligation through Telebirr.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className={[styles.section, styles.how].join(" ")}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>HOW IT WORKS</p>
        <h2 className={styles.h2}>Three steps, start to settled.</h2>
      </div>
      <div className={styles.steps}>
        {STEPS.map((step, i) => (
          <article key={step.title} className={styles.stepCard}>
            <div className={styles.stepText}>
              <span className={styles.stepBadge} aria-hidden="true">
                {i + 1}
              </span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </div>
            <img className={styles.stepShot} src={step.shot} alt={step.alt} loading="lazy" />
          </article>
        ))}
      </div>
    </section>
  );
}
