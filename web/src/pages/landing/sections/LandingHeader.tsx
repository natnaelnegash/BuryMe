import { Link } from "react-router-dom";

import styles from "../LandingPage.module.css";

const NAV = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

export function LandingHeader() {
  return (
    <header className={[styles.section, styles.header].join(" ")}>
      <Link className={styles.brand} to="/welcome">
        <span className={styles.brandDot} aria-hidden="true" />
        BuryMe
      </Link>
      <nav className={styles.nav} aria-label="Primary">
        {NAV.map((item) => (
          <a key={item.href} className={styles.navLink} href={item.href}>
            {item.label}
          </a>
        ))}
        {/* "/" sends a signed-in visitor to their dashboard and everyone else
            on to sign-in, so one link serves both. */}
        <Link className={[styles.btn, styles.btnPrimary, styles.navCta].join(" ")} to="/">
          Open BuryMe
        </Link>
      </nav>
    </header>
  );
}
