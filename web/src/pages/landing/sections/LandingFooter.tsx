import styles from "../LandingPage.module.css";

// Product entries point at sections of this page. Company and Legal have no
// pages behind them yet, so they render as text rather than dead links.
const COLUMNS = [
  {
    title: "Product",
    items: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Features", href: "#features" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Company",
    items: [{ label: "About" }, { label: "Contact" }, { label: "Careers" }],
  },
  {
    title: "Legal",
    items: [{ label: "Privacy" }, { label: "Terms" }, { label: "Security" }],
  },
];

export function LandingFooter() {
  return (
    <footer className={[styles.section, styles.footer].join(" ")}>
      <div className={styles.footerTop}>
        <div className={styles.footerBrand}>
          <span className={styles.footerWordmark}>BuryMe</span>
          <p className={styles.footerBlurb}>
            Money between people who know each other — agreed, tracked, settled.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} className={styles.footerCol} aria-label={column.title}>
            <h2 className={styles.footerColTitle}>{column.title}</h2>
            {column.items.map((item) =>
              "href" in item && item.href ? (
                <a key={item.label} className={styles.footerItem} href={item.href}>
                  {item.label}
                </a>
              ) : (
                <span key={item.label} className={styles.footerItem}>
                  {item.label}
                </span>
              ),
            )}
          </nav>
        ))}
      </div>
      <span className={styles.footerCopy}>© 2026 BuryMe. All rights reserved.</span>
    </footer>
  );
}
