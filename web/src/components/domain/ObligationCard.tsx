import { Avatar, type AvatarAccent } from "../ui/Avatar.js";
import { StatusPill, type PillStatus } from "../ui/StatusPill.js";
import styles from "./ObligationCard.module.css";

export type ObligationDirection = "owed" | "owe" | "self";

interface ObligationCardProps {
  name: string;
  subtitle: string;
  amount: string;
  status: string;
  direction: ObligationDirection;
}

const ACCENT_BY_DIRECTION: Record<ObligationDirection, AvatarAccent> = {
  owed: "teal",
  owe: "amber",
  self: "gray",
};

// Obligation status → the pill colour the design uses for it.
const PILL_BY_STATUS: Record<string, PillStatus> = {
  Active: "teal",
  "Pending Disbursement": "indigo",
  "Partially Paid": "amber",
  Settled: "gray",
  Disputed: "red",
};

export function ObligationCard({
  name,
  subtitle,
  amount,
  status,
  direction,
}: ObligationCardProps) {
  return (
    <article className={styles.card}>
      <Avatar name={name} size={44} accent={ACCENT_BY_DIRECTION[direction]} />
      <div className={styles.textCol}>
        <span className={styles.name}>{name}</span>
        <span className={styles.subtitle}>{subtitle}</span>
        <StatusPill size="small" status={PILL_BY_STATUS[status] ?? "gray"}>
          {status}
        </StatusPill>
      </div>
      <span className={[styles.amount, styles[direction]].join(" ")}>{amount}</span>
    </article>
  );
}
