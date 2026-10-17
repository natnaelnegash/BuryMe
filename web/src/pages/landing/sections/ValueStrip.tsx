import { BalanceIcon, CardIcon, ShieldCheckIcon } from "../icons.js";
import styles from "../LandingPage.module.css";

const VALUES = [
  {
    Icon: ShieldCheckIcon,
    title: "Both sides agree",
    body: "Every record is mutual. No one-sided ledgers, no “I thought you paid.”",
  },
  {
    Icon: CardIcon,
    title: "Real settlement",
    body: "Pay back through Telebirr in the app, or log a cash payment.",
  },
  {
    Icon: BalanceIcon,
    title: "Always clear",
    body: "One balance shows who owes who, at a glance.",
  },
];

export function ValueStrip() {
  return (
    <section className={[styles.section, styles.values].join(" ")}>
      {VALUES.map(({ Icon, title, body }) => (
        <div key={title} className={styles.valueCard}>
          <span className={styles.chip}>
            <Icon />
          </span>
          <h2 className={styles.valueTitle}>{title}</h2>
          <p className={styles.valueBody}>{body}</p>
        </div>
      ))}
    </section>
  );
}
