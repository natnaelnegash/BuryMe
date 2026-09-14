import type { ReactNode } from "react";

import { Avatar, type AvatarAccent } from "../ui/Avatar.js";
import { StatusPill, type PillStatus } from "../ui/StatusPill.js";
import styles from "./RequestRow.module.css";

interface RequestRowProps {
  name: string;
  detail: string;
  amount: string;
  /** Teal when the money moves toward you, amber when it moves away. */
  amountDirection?: "incoming" | "outgoing";
  status: string;
  statusColor?: PillStatus;
  accent?: AvatarAccent;
  /** Buttons for this row — the Figma `Action` axis, supplied by the caller. */
  actions?: ReactNode;
}

export function RequestRow({
  name,
  detail,
  amount,
  amountDirection = "incoming",
  status,
  statusColor = "indigo",
  accent = "teal",
  actions,
}: RequestRowProps) {
  return (
    <article className={styles.row}>
      <Avatar name={name} size={44} accent={accent} />
      <div className={styles.textCol}>
        <span className={styles.name}>{name}</span>
        <span className={styles.detail}>{detail}</span>
      </div>
      <div className={styles.rightCol}>
        <span className={[styles.amount, styles[amountDirection]].join(" ")}>{amount}</span>
        <StatusPill size="small" status={statusColor}>
          {status}
        </StatusPill>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  );
}
