import { Link } from "react-router-dom";

import { PILL_BY_STATUS, type ObligationDirection } from "../../lib/obligations.js";
import { Avatar, type AvatarAccent } from "../ui/Avatar.js";
import { StatusPill } from "../ui/StatusPill.js";
import styles from "./ObligationCard.module.css";

export type { ObligationDirection };

interface ObligationCardProps {
  name: string;
  subtitle: string;
  amount: string;
  status: string;
  direction: ObligationDirection;
  /** Route to the obligation's detail screen; makes the card a link. */
  to?: string;
}

const ACCENT_BY_DIRECTION: Record<ObligationDirection, AvatarAccent> = {
  owed: "teal",
  owe: "amber",
  self: "gray",
};

export function ObligationCard({
  name,
  subtitle,
  amount,
  status,
  direction,
  to,
}: ObligationCardProps) {
  const body = (
    <>
      <Avatar name={name} size={44} accent={ACCENT_BY_DIRECTION[direction]} />
      <div className={styles.textCol}>
        <span className={styles.name}>{name}</span>
        <span className={styles.subtitle}>{subtitle}</span>
        <StatusPill size="small" status={PILL_BY_STATUS[status] ?? "gray"}>
          {status}
        </StatusPill>
      </div>
      <span className={[styles.amount, styles[direction]].join(" ")}>{amount}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={[styles.card, styles.link].join(" ")}>
        {body}
      </Link>
    );
  }
  return <article className={styles.card}>{body}</article>;
}
