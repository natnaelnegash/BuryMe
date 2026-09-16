import { useState } from "react";

import { ApiError } from "../api/client.js";
import { ObligationCard, type ObligationDirection } from "../components/domain/ObligationCard.js";
import { PageHeader } from "../components/layout/PageHeader.js";
import { Button } from "../components/ui/Button.js";
import { FilterChip } from "../components/ui/FilterChip.js";
import { useAuth } from "../hooks/useAuth.js";
import { useObligationsQuery, useRequestRepayment } from "../hooks/useObligations.js";
import { formatSignedMoney } from "../lib/money.js";
import { isOverdue } from "../lib/obligations.js";
import styles from "./ObligationsPage.module.css";

function mutationErrorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

// Figma's filter tabs on this screen.
type Tab = "all" | "active" | "overdue" | "settled";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "overdue", label: "Overdue" },
  { id: "settled", label: "Settled" },
];

export function ObligationsPage() {
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const [tab, setTab] = useState<Tab>("all");
  const { data, isLoading, error: queryError } = useObligationsQuery();
  const repaymentMutation = useRequestRepayment();

  const all = data?.data ?? [];

  const obligations = all.filter((o) => {
    if (tab === "active") return o.status === "Active" || o.status === "Partially Paid";
    if (tab === "overdue") return isOverdue(o);
    if (tab === "settled") return o.status === "Settled";
    return true;
  });

  return (
    <div className={styles.page}>
      <PageHeader title="Obligations" subtitle="Everything you owe and are owed, in one place." />

      <div className={styles.filters}>
        {TABS.map((t) => (
          <FilterChip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </FilterChip>
        ))}
      </div>

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {queryError && (
        <p role="alert" className={styles.error}>
          {mutationErrorMessage(queryError)}
        </p>
      )}

      {!isLoading && obligations.length === 0 ? (
        <p className={styles.empty}>Nothing here yet.</p>
      ) : (
        <div className={styles.grid}>
          {obligations.map((o) => {
            const direction: ObligationDirection =
              o.lender.user_id === uid ? "owed" : o.borrower.user_id === uid ? "owe" : "self";
            const counterparty = o.lender.user_id === uid ? o.borrower : o.lender;
            const canChase =
              direction === "owed" && o.repayment_type === "Lump Sum" && isOverdue(o);
            const busy =
              repaymentMutation.isPending &&
              repaymentMutation.variables?.obligationId === o.obligation_id;
            const rowError =
              repaymentMutation.isError &&
              repaymentMutation.variables?.obligationId === o.obligation_id &&
              mutationErrorMessage(repaymentMutation.error);

            return (
              <div key={o.obligation_id} className={styles.cardWrap}>
                <ObligationCard
                  name={counterparty.display_name}
                  subtitle={`${direction === "owed" ? "Lending" : "Borrowing"} • ${o.repayment_type}`}
                  amount={formatSignedMoney(
                    o.outstanding_balance,
                    direction === "owed" ? "incoming" : "outgoing",
                  )}
                  status={o.status}
                  direction={direction}
                  to={`/obligations/${o.obligation_id}`}
                />
                {canChase && (
                  <div className={styles.rowActions}>
                    <Button
                      kind="secondary"
                      size="small"
                      disabled={busy}
                      onClick={() => repaymentMutation.mutate({ obligationId: o.obligation_id })}
                    >
                      {busy ? "Sending…" : "Request repayment"}
                    </Button>
                  </div>
                )}
                {rowError && (
                  <p role="alert" className={styles.error}>
                    {rowError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
