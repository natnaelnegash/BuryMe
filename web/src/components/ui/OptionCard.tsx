import type { ReactNode } from "react";

import { Radio } from "./Radio.js";
import styles from "./OptionCard.module.css";

interface OptionCardProps {
  title: string;
  description: string;
  /** Radio on the left (a choice within a step) or a chevron on the right
   *  (a navigation row, as in the New chooser). */
  trailing?: "radio" | "chevron";
  selected?: boolean;
  disabled?: boolean;
  /** Shown under the description when the option can't be picked yet. */
  reason?: string;
  onClick?: () => void;
  /** Extra content under the description (e.g. a hint), rendered in the column. */
  children?: ReactNode;
}

// Figma: the "Option" frames in Borrow Step 2 (15:124), Lending Step 2
// (15:327) and the "Option / *" rows in Screen — New (78:1313). Same frame
// either way: 15/16 padding, radius/row, 1px border that becomes 2px teal
// when selected.
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
