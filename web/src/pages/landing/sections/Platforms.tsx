import styles from "../LandingPage.module.css";

const BADGES = ["iOS", "Android", "Web"];

export function Platforms() {
  return (
    <section className={[styles.section, styles.platforms].join(" ")}>
      <h2 className={styles.h2}>On the devices you already use.</h2>
      <p className={styles.platformsSub}>iOS, Android, and the web.</p>
      <div className={styles.badges}>
        {BADGES.map((badge) => (
          <span key={badge} className={styles.badge}>
            {badge}
          </span>
        ))}
      </div>
    </section>
  );
}
