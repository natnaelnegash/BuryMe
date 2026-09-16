import type { ReactNode } from "react";

import { Avatar } from "../ui/Avatar.js";
import { Radio } from "../ui/Radio.js";
import styles from "./PersonRow.module.css";

interface PersonRowProps {
  name: string;
  detail?: string;
  /** Figma: Selected=True — the chosen recipient in a picker. */
  selected?: boolean;
  action?: ReactNode;
  /** Makes the row a radio-style choice: clickable, with the trailing
   *  Radio from the Person Row component set (46:2008). */
  onSelect?: () => void;
}

export function PersonRow({ name, detail, selected = false, action, onSelect }: PersonRowProps) {
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

  if (onSelect) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onSelect}
        role="radio"
        aria-checked={selected}
      >
        {content}
        <Radio selected={selected} />
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
