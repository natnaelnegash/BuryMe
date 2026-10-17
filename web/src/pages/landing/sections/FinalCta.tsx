import { Link } from "react-router-dom";

import styles from "../LandingPage.module.css";

export function FinalCta() {
  return (
    <section className={[styles.section, styles.cta].join(" ")}>
      <h2 className={[styles.h2, styles.ctaHeading].join(" ")}>Start tracking what’s owed.</h2>
      <p className={styles.ctaSub}>Free to use. Agree it, track it, settle it.</p>
      <Link className={[styles.btn, styles.btnInverse].join(" ")} to="/">
        Open BuryMe
      </Link>
    </section>
  );
}
