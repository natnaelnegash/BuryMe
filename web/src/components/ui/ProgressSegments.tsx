import styles from "./ProgressSegments.module.css";

export function ProgressSegments({ current, total }: { current: number; total: number }) {
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={[styles.seg, i < current ? styles.filled : ""].filter(Boolean).join(" ")}
        />
      ))}
    </div>
  );
}
