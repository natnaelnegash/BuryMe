import styles from "../LandingPage.module.css";

export function BalanceBand() {
  return (
    <section className={[styles.section, styles.balance].join(" ")}>
      <h2 className={styles.h2}>One balance. The whole picture.</h2>
      <p className={styles.balanceSub}>
        The balance bar shows everything owed to you and everything you owe, side by side.
      </p>
      <div className={styles.balanceCard}>
        <div className={styles.figures}>
          <div className={styles.figure}>
            <span className={styles.figureLabel}>Owed to you</span>
            <span className={[styles.figureValue, styles.figureTeal].join(" ")}>2,450 ETB</span>
          </div>
          <div className={[styles.figure, styles.figureCentre].join(" ")}>
            <span className={styles.figureLabel}>Net position</span>
            <span className={styles.figureValue}>+1,470 ETB</span>
          </div>
          <div className={[styles.figure, styles.figureEnd].join(" ")}>
            <span className={styles.figureLabel}>You owe</span>
            <span className={[styles.figureValue, styles.figureAmber].join(" ")}>980 ETB</span>
          </div>
        </div>
        <div className={styles.bar} aria-hidden="true">
          <span className={styles.barOwed} style={{ flexBasis: "69.4%" }} />
          <span className={styles.barOwe} style={{ flexBasis: "30.6%" }} />
        </div>
      </div>
    </section>
  );
}
