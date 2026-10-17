import { KeyIcon, LockIcon, LogIcon, ShieldCheckIcon } from "../icons.js";
import styles from "../LandingPage.module.css";

const ITEMS = [
  {
    Icon: ShieldCheckIcon,
    title: "Both must agree",
    body: "Nothing is recorded against someone unilaterally.",
  },
  {
    Icon: LogIcon,
    title: "Immutable history",
    body: "Every change is logged, append-only, and auditable.",
  },
  {
    Icon: LockIcon,
    title: "Secure payments",
    body: "Settlement runs on Chapa and Telebirr.",
  },
  {
    Icon: KeyIcon,
    title: "Protected sign-in",
    body: "Backed by Firebase authentication.",
  },
];

export function TrustSafety() {
  return (
    <section className={[styles.section, styles.trust].join(" ")}>
      <div className={styles.head}>
        <p className={[styles.eyebrow, styles.trustEyebrow].join(" ")}>TRUST &amp; SAFETY</p>
        <h2 className={[styles.h2, styles.trustHeading].join(" ")}>
          Money is sensitive. We treat it that way.
        </h2>
      </div>
      <div className={styles.trustRow}>
        {ITEMS.map(({ Icon, title, body }) => (
          <div key={title} className={styles.trustItem}>
            <span className={[styles.chip, styles.trustChip].join(" ")}>
              <Icon />
            </span>
            <h3 className={styles.trustTitle}>{title}</h3>
            <p className={styles.trustBody}>{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
