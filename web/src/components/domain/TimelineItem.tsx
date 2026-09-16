import styles from "./TimelineItem.module.css";

export type TimelineColor = "teal" | "amber" | "indigo" | "gray";

interface TimelineItemProps {
  title: string;
  subtitle: string;
  color?: TimelineColor;
  /** Figma: Show Rail — off for the last item in the list. */
  rail?: boolean;
}

// Figma: component set "Timeline Item" (46:2059) — a 14px dot with a 2px
// rail below it, text column beside it with 18px of bottom padding that
// spaces items apart.
export function TimelineItem({ title, subtitle, color = "teal", rail = true }: TimelineItemProps) {
  return (
    <li className={styles.item}>
      <span className={styles.spine}>
        <span className={[styles.dot, styles[color]].join(" ")} />
        {rail && <span className={styles.rail} />}
      </span>
      <span className={[styles.text, rail ? "" : styles.last].filter(Boolean).join(" ")}>
        <span className={styles.title}>{title}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </span>
    </li>
  );
}
