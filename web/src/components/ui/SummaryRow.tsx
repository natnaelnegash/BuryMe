import type { ReactNode } from "react";

import styles from "./SummaryRow.module.css";

interface SummaryRowProps {
  label: string;
  value: ReactNode;
  /** Colour the value when it carries state (e.g. "Verified" in teal). */
  tone?: "default" | "teal" | "amber" | "gray";
  /** Figma: Divider=Off for the last row in a stack. */
  divider?: boolean;
  /** A trailing control, e.g. a small "Change number" button. */
  action?: ReactNode;
}

export function SummaryRow({
  label,
  value,
  tone = "default",
  divider = true,
  action,
}: SummaryRowProps) {
  return (
    <div className={[styles.row, divider ? styles.divider : ""].filter(Boolean).join(" ")}>
      <span className={styles.label}>{label}</span>
      <span className={styles.right}>
        <span className={[styles.value, tone !== "default" ? styles[tone] : ""].filter(Boolean).join(" ")}>
          {value}
        </span>
        {action}
      </span>
    </div>
  );
}
