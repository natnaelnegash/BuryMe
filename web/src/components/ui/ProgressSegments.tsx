import styles from "./ProgressSegments.module.css";

// Figma: the "Progress" row in every flow head (15:37) — one Progress
// Segment (29:964) per step, 6px tall, gap 8, filled up to the current step.
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
