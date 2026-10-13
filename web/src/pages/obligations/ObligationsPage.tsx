import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client.js";
import { ErrorState } from "../../components/domain/ErrorState.js";
import {
  ObligationCard,
  type ObligationDirection,
} from "../../components/domain/ObligationCard.js";
import { PageHeader } from "../../components/layout/PageHeader.js";
import { Button } from "../../components/ui/Button.js";
import { FilterChip } from "../../components/ui/FilterChip.js";
import { Spinner } from "../../components/ui/Spinner.js";
import { StateCard } from "../../components/ui/StateCard.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useGroupExpensesQuery } from "../../hooks/useGroupExpenses.js";
import { useObligationsQuery, useRequestRepayment } from "../../hooks/useObligations.js";
import { formatSignedMoney } from "../../lib/money.js";
import { isOverdue } from "../../lib/obligations.js";
import styles from "./ObligationsPage.module.css";

function mutationErrorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

type Tab = "all" | "active" | "overdue" | "settled" | "group";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "overdue", label: "Overdue" },
  { id: "settled", label: "Settled" },
  { id: "group", label: "Group expenses" },
];

export function ObligationsPage() {
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const [tab, setTab] = useState<Tab>("all");
  const isGroupTab = tab === "group";

  const {
    data,
    isLoading: obligationsLoading,
    error: obligationsError,
    refetch: refetchObligations,
  } = useObligationsQuery({ origin: "personal" });
  const {
    data: expensePage,
    isLoading: expensesLoading,
    error: expensesError,
    refetch: refetchExpenses,
  } = useGroupExpensesQuery();
  const repaymentMutation = useRequestRepayment();

  const isLoading = isGroupTab ? expensesLoading : obligationsLoading;
  const queryError = isGroupTab ? expensesError : obligationsError;
  const refetch = isGroupTab ? refetchExpenses : refetchObligations;

  const all = data?.data ?? [];
  const obligations = all.filter((o) => {
    if (tab === "active") return o.status === "Active" || o.status === "Partially Paid";
    if (tab === "overdue") return isOverdue(o);
    if (tab === "settled") return o.status === "Settled";
    return true;
  });

  const expenses = expensePage?.data ?? [];
  const isEmpty = isGroupTab ? expenses.length === 0 : obligations.length === 0;
  // The full empty block only when there are no obligations at all; a tab that
  // merely filters to nothing keeps the plain line.
  const neverHadAny = !isGroupTab && all.length === 0;

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

      {isLoading && <Spinner block label="Loading obligations" />}
      {queryError && <ErrorState error={queryError} onRetry={() => void refetch()} />}

      {!isLoading && !queryError && isEmpty ? (
        neverHadAny ? (
          <StateCard
            glyph="+"
            title="No obligations yet"
            body="When you lend or borrow, it shows up here."
            action={
              <Button size="small" onClick={() => navigate("/requests/new/lend")}>
                Record a loan
              </Button>
            }
          />
        ) : (
          <p className={styles.empty}>Nothing here yet.</p>
        )
      ) : (
        <div className={styles.grid}>
          {isGroupTab &&
            expenses.map((e) => {
              const payer = e.payer.user_id === uid;
              const people = e.participants.length + (e.payer_share_included ? 1 : 0);

              return (
                <ObligationCard
                  key={e.expense_id}
                  type="group"
                  name={e.description}
                  subtitle={`Group expense · ${people} ${people === 1 ? "person" : "people"}`}
                  amount={formatSignedMoney(e.outstanding_total, payer ? "incoming" : "outgoing")}
                  direction={payer ? "owed" : "owe"}
                  avatarNames={e.participants.map((p) => p.participant.display_name)}
                  to={`/expenses/${e.expense_id}`}
                />
              );
            })}

          {!isGroupTab &&
            obligations.map((o) => {
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
