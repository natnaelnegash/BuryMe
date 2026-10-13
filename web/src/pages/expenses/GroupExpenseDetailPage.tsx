import { Link, useParams } from "react-router-dom";

import { ErrorState } from "../../components/domain/ErrorState.js";
import {
  ObligationCard,
  type ObligationDirection,
} from "../../components/domain/ObligationCard.js";
import { PageHeader } from "../../components/layout/PageHeader.js";
import { Spinner } from "../../components/ui/Spinner.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useGroupExpenseQuery } from "../../hooks/useGroupExpenses.js";
import { useObligationsQuery } from "../../hooks/useObligations.js";
import { formatDate } from "../../lib/dates.js";
import { formatMoney, formatSignedMoney } from "../../lib/money.js";
import styles from "./GroupExpenseDetailPage.module.css";

export function GroupExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const { data: expense, isLoading, error } = useGroupExpenseQuery(id);

  const { data: obligations } = useObligationsQuery({ limit: 100 });
  const statusById = new Map(
    (obligations?.data ?? []).map((o) => [o.obligation_id, o.status] as const),
  );

  if (isLoading) return <Spinner block label="Loading expense" />;
  if (error || !expense) {
    return (
      <div className={styles.page}>
        <Link to="/obligations" className={styles.back}>
          ← &nbsp;Back to Obligations
        </Link>
        <ErrorState error={error} />
      </div>
    );
  }

  const viewerIsPayer = expense.payer.user_id === uid;

  const subtitle = [
    "Group expense",
    formatMoney(expense.total_amount),
    formatDate(expense.expense_date),
    viewerIsPayer ? "you paid" : `${expense.payer.display_name} paid`,
  ].join(" • ");

  return (
    <div className={styles.page}>
      <Link to="/obligations" className={styles.back}>
        ← &nbsp;Back to Obligations
      </Link>

      <PageHeader title={expense.description} subtitle={subtitle} />

      <div className={styles.grid}>
        {expense.participants.map((p) => {
          const isViewer = p.participant.user_id === uid;
          const direction: ObligationDirection = viewerIsPayer ? "owed" : isViewer ? "owe" : "self";
          const status = statusById.get(p.obligation_id);

          return (
            <ObligationCard
              key={p.participant_entry_id}
              name={isViewer ? "You" : p.participant.display_name}
              subtitle={isViewer ? "Your share of the bill" : "Their share of the bill"}
              amount={
                direction === "self"
                  ? formatMoney(p.assigned_amount)
                  : formatSignedMoney(
                      p.assigned_amount,
                      direction === "owed" ? "incoming" : "outgoing",
                    )
              }
              {...(status ? { status } : {})}
              direction={direction}
              to={`/obligations/${p.obligation_id}`}
            />
          );
        })}

        {expense.payer_share_included && expense.payer_share_amount && (
          <ObligationCard
            name={viewerIsPayer ? "You" : expense.payer.display_name}
            subtitle={
              viewerIsPayer
                ? "Your own share — no obligation created"
                : "Their own share — no obligation created"
            }
            amount={formatMoney(expense.payer_share_amount)}
            status="No obligation"
            direction="self"
          />
        )}
      </div>
    </div>
  );
}
