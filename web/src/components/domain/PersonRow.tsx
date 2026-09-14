import type { ReactNode } from "react";

import { Avatar } from "../ui/Avatar.js";
import styles from "./PersonRow.module.css";

interface PersonRowProps {
  name: string;
  detail?: string;
  /** Figma: Selected=True — the chosen recipient in a picker. */
  selected?: boolean;
  action?: ReactNode;
  onClick?: () => void;
}

export function PersonRow({ name, detail, selected = false, action, onClick }: PersonRowProps) {
  const classes = [styles.row, selected ? styles.selected : ""].filter(Boolean).join(" ");
  const content = (
    <>
      <Avatar name={name} size={40} />
      <span className={styles.col}>
        <span className={styles.name}>{name}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </span>
      {action}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-pressed={selected}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
