import { Link } from "react-router-dom";

import dashboardShot from "../../../assets/landing/dashboard.png";
import { BrowserFrame } from "../BrowserFrame.js";
import styles from "../LandingPage.module.css";

export function Hero() {
  return (
    <section className={[styles.section, styles.hero].join(" ")}>
      <div className={styles.heroText}>
        <p className={styles.eyebrow}>FOR FRIENDS, FAMILY &amp; GROUPS</p>
        <h1 className={styles.h1}>Every IOU, agreed and accounted for.</h1>
        <p className={styles.heroBody}>
          BuryMe turns the loans, borrowings, and shared bills between you and the people you know
          into clear records you both agree to — then settle with Telebirr.
        </p>
        <div className={styles.heroButtons}>
          <Link className={[styles.btn, styles.btnPrimary].join(" ")} to="/">
            Open BuryMe
          </Link>
          <a className={[styles.btn, styles.btnSecondary].join(" ")} href="#how-it-works">
            See how it works
          </a>
        </div>
      </div>
      <div className={styles.heroVisual}>
        <BrowserFrame
          src={dashboardShot}
          alt="The BuryMe dashboard: a balance bar showing what you are owed and what you owe, a list of requests needing your response, and recent obligations."
          shot={{ width: 598, height: 415 }}
          eager
        />
      </div>
    </section>
  );
}
