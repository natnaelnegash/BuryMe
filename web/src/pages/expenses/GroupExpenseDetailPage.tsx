import { Link, useParams } from "react-router-dom";

import { ErrorState } from "../components/domain/ErrorState.js";
import { ObligationCard, type ObligationDirection } from "../components/domain/ObligationCard.js";
import { PageHeader } from "../components/layout/PageHeader.js";
import { Spinner } from "../components/ui/Spinner.js";
import { useAuth } from "../hooks/useAuth.js";
import { useGroupExpenseQuery } from "../hooks/useGroupExpenses.js";
import { useObligationsQuery } from "../hooks/useObligations.js";
import { formatDate } from "../lib/dates.js";
import { formatMoney, formatSignedMoney } from "../lib/money.js";
import styles from "./GroupExpenseDetailPage.module.css";

// Figma: Screen — Group Expense · Consolidated (49:2889). Back control, a
// title/subtitle head, then one Obligation Card per participant in a
// wrapping two-up grid. When the payer took a share of the bill, a trailing
// "Self" card records it — it is money they already spent on themselves, so
// it carries a gray "No obligation" pill and no obligation exists behind it
// (§8.12).
//
// The frame is drawn from the payer's side ("you paid", "+700 ETB"). A
// participant can open the same screen, so the payer line names whoever
// paid and the viewer's own row reads as money they owe.

export function GroupExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const { data: expense, isLoading, error } = useGroupExpenseQuery(id);

  // GroupExpenseParticipant carries only `obligation_id`, so the status the
  // design puts on each card has to be looked up from the obligations the
  // viewer can see. A participant only ever sees their own, and the list is
  // paged — a card with no match renders without a pill rather than a
  // guessed one.
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

  // "Group expense • 2,100 ETB • 28 Aug 2026 • you paid" (49:2922).
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

      {/* "Head" (49:2920). */}
      <PageHeader title={expense.description} subtitle={subtitle} />

      {/* "Obligation Grid" (49:2930). */}
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

        {/* The payer's own share — recorded, but never an obligation
         * (156:15585, Direction=Self). */}
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
