import type { ReactNode } from "react";

import { Radio } from "./Radio.js";
import styles from "./OptionCard.module.css";

interface OptionCardProps {
  title: string;
  description: string;
  trailing?: "radio" | "chevron";
  selected?: boolean;
  disabled?: boolean;
  reason?: string;
  onClick?: () => void;
  children?: ReactNode;
}

export function OptionCard({
  title,
  description,
  trailing = "radio",
  selected = false,
  disabled = false,
  reason,
  onClick,
  children,
}: OptionCardProps) {
  const classes = [styles.card, selected ? styles.selected : "", disabled ? styles.disabled : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      role={trailing === "radio" ? "radio" : undefined}
      aria-checked={trailing === "radio" ? selected : undefined}
    >
      {trailing === "radio" && <Radio selected={selected} />}
      <span className={styles.col}>
        <span className={styles.title}>{title}</span>
        <span className={styles.description}>{description}</span>
        {reason && <span className={styles.reason}>{reason}</span>}
        {children}
      </span>
      {trailing === "chevron" && <span className={styles.chevron}>›</span>}
    </button>
  );
}
