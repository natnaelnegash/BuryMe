import { Link } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ObligationCard, type ObligationDirection } from "../components/domain/ObligationCard.js";
import { RequestRow } from "../components/domain/RequestRow.js";
import { Button } from "../components/ui/Button.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { useAuth } from "../hooks/useAuth.js";
import { useObligationsQuery } from "../hooks/useObligations.js";
import { useRequestsQuery } from "../hooks/useRequests.js";
import { formatMoney, formatSignedMoney } from "../lib/money.js";
import { canRespond, requestStatusLabel } from "../lib/requests.js";
import styles from "./DashboardPage.module.css";

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const { data: obligationPage } = useObligationsQuery();
  const { data: requestPage } = useRequestsQuery();

  const obligations = obligationPage?.data ?? [];
  const requests = requestPage?.data ?? [];

  // Outstanding balances split by which side of the obligation you're on.
  const owedToYou = obligations
    .filter((o) => o.lender.user_id === uid && o.status !== "Settled")
    .reduce((sum, o) => sum + o.outstanding_balance.amount, 0);
  const youOwe = obligations
    .filter((o) => o.borrower.user_id === uid && o.status !== "Settled")
    .reduce((sum, o) => sum + o.outstanding_balance.amount, 0);
  const net = owedToYou - youOwe;
  const total = owedToYou + youOwe;
  const owedShare = total > 0 ? (owedToYou / total) * 100 : 0;

  const needsAction = requests.filter((r) => canRespond(r, uid));
  const recent = obligations.slice(0, 6);

  const etb = (amount: number): Schemas["Money"] => ({ amount, currency: "ETB" });

  return (
    <div className={styles.page}>
      <header className={styles.greeting}>
        <h1 className={styles.greetingTitle}>
          {greetingFor(new Date())}
          {buryMeUser ? `, ${buryMeUser.display_name}` : ""}
        </h1>
        <p className={styles.greetingSubtitle}>Here's where your obligations stand today.</p>
      </header>

      <section className={styles.balanceCard}>
        <div className={styles.balanceRow}>
          <div className={styles.balanceCol}>
            <span className={styles.balanceLabel}>Owed to you</span>
            <span className={[styles.balanceFigure, styles.owedFigure].join(" ")}>
              {formatMoney(etb(owedToYou))}
            </span>
          </div>
          <div className={[styles.balanceCol, styles.center].join(" ")}>
            <span className={styles.balanceLabel}>Net position</span>
            <span className={styles.netFigure}>
              {net >= 0 ? "+" : "−"}
              {formatMoney(etb(Math.abs(net)))}
            </span>
          </div>
          <div className={[styles.balanceCol, styles.end].join(" ")}>
            <span className={styles.balanceLabel}>You owe</span>
            <span className={[styles.balanceFigure, styles.oweFigure].join(" ")}>
              {formatMoney(etb(youOwe))}
            </span>
          </div>
        </div>

        <div className={styles.barTrack}>
          <div className={styles.barOwed} style={{ width: `${owedShare}%` }} />
          <div className={styles.barOwe} style={{ width: `${100 - owedShare}%` }} />
        </div>
      </section>

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Needs your action</h2>
        {needsAction.length > 0 && (
          <StatusPill status="amber">{needsAction.length} waiting</StatusPill>
        )}
      </div>

      {needsAction.length === 0 ? (
        <p className={styles.empty}>Nothing needs your attention right now.</p>
      ) : (
        <div className={styles.actionList}>
          {needsAction.map((r) => {
            const incoming = r.receiving_user.user_id === uid && r.request_type !== "Repayment";
            const counterparty =
              r.initiating_user.user_id === uid ? r.receiving_user : r.initiating_user;
            return (
              <RequestRow
                key={r.request_id}
                name={counterparty.display_name}
                detail={`${r.request_type} request  •  ${r.proposed_repayment_type ?? "Lump Sum"} • ${formatMoney(r.amount)}`}
                amount={formatSignedMoney(r.amount, incoming ? "incoming" : "outgoing")}
                amountDirection={incoming ? "incoming" : "outgoing"}
                status={requestStatusLabel(r, uid)}
                actions={
                  <Link to={`/requests/${r.request_id}`}>
                    <Button size="small">Respond</Button>
                  </Link>
                }
              />
            );
          })}
        </div>
      )}

      <div className={[styles.sectionHeader, styles.spread].join(" ")}>
        <h2 className={styles.sectionTitle}>Recent Obligations</h2>
        <Link className={styles.seeAll} to="/obligations">
          See all
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className={styles.empty}>No obligations yet. Start by sending a request.</p>
      ) : (
        <div className={styles.obligationGrid}>
          {recent.map((o) => {
            const direction: ObligationDirection =
              o.lender.user_id === uid ? "owed" : o.borrower.user_id === uid ? "owe" : "self";
            const counterparty = o.lender.user_id === uid ? o.borrower : o.lender;
            return (
              <ObligationCard
                key={o.obligation_id}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
