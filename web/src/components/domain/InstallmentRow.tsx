import type { Schemas } from "@buryme/shared";

import { formatDate } from "../../lib/dates.js";
import { formatMoney } from "../../lib/money.js";
import { StatusPill, type PillStatus } from "../ui/StatusPill.js";
import styles from "./InstallmentRow.module.css";

const PILL: Record<Schemas["InstallmentStatus"], PillStatus> = {
  Pending: "gray",
  Paid: "teal",
  Overdue: "red",
};

interface InstallmentRowProps {
  index: number;
  installment: Schemas["Installment"];
  highlighted?: boolean;
}

export function InstallmentRow({ index, installment, highlighted = false }: InstallmentRowProps) {
  const paid = installment.status === "Paid";
  return (
    <li className={[styles.row, highlighted ? styles.highlighted : ""].filter(Boolean).join(" ")}>
      <span className={styles.col}>
        <span className={styles.title}>Installment {index}</span>
        <span className={styles.sub}>
          {paid && installment.paid_at
            ? `Paid ${formatDate(installment.paid_at)}`
            : `Due ${formatDate(installment.due_date)}`}
        </span>
      </span>
      <span className={[styles.amount, paid ? styles.amountPaid : ""].filter(Boolean).join(" ")}>
        {formatMoney(installment.amount)}
      </span>
      <StatusPill size="small" status={PILL[installment.status]}>
        {installment.status}
      </StatusPill>
    </li>
  );
}
