import styles from "./TimelineItem.module.css";

export type TimelineColor = "teal" | "amber" | "indigo" | "gray";

interface TimelineItemProps {
  title: string;
  subtitle: string;
  color?: TimelineColor;
  rail?: boolean;
}

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
