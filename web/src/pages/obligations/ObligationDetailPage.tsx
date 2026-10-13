import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { ErrorState } from "../components/domain/ErrorState.js";
import { InstallmentRow } from "../components/domain/InstallmentRow.js";
import { TimelineItem, type TimelineColor } from "../components/domain/TimelineItem.js";
import { Avatar } from "../components/ui/Avatar.js";
import { Button } from "../components/ui/Button.js";
import { Note } from "../components/ui/Note.js";
import { Spinner } from "../components/ui/Spinner.js";
import { StatusPill, type PillStatus } from "../components/ui/StatusPill.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import { useGroupExpenseQuery } from "../hooks/useGroupExpenses.js";
import { useObligationQuery, useRequestRepayment } from "../hooks/useObligations.js";
import {
  useAcknowledgePayment,
  useDisputePayment,
  usePaymentsQuery,
} from "../hooks/usePayments.js";
import { nextPayable, useScheduleQuery } from "../hooks/useSchedule.js";
import { formatDate } from "../lib/dates.js";
import { formatMoney } from "../lib/money.js";
import { isOverdue, obligationDirection, PILL_BY_STATUS } from "../lib/obligations.js";
import styles from "./ObligationDetailPage.module.css";

// Figma: Obligation Detail — lender — Active / Pending Disbursement /
// Partially Paid / Settled (14:2, 14:97, 14:198, 14:300). One layout,
// driven by the obligation's status and which side the viewer is on.
//
// Actions by role and state: lender → Request Repayment (overdue Lump
// Sum), Record External Payment, Send disbursement (Pending Disbursement);
// borrower → Make Payment (Chapa), Record External Payment — per
// installment on Installments obligations. The Payments card lists
// GET /obligations/{id}/payments with Acknowledge / Dispute on pending
// external rows; the Activity timeline is derived from the obligation's
// fields plus confirmed payments — there is no events endpoint.

type Obligation = Schemas["Obligation"];

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

const PAYMENT_PILL: Record<string, PillStatus> = {
  "Pending Acknowledgement": "indigo",
  Confirmed: "teal",
  Disputed: "red",
  Failed: "gray",
};

const STATUS_COLOR: Record<string, TimelineColor> = {
  Active: "teal",
  "Pending Disbursement": "indigo",
  "Partially Paid": "amber",
  Settled: "gray",
  Disputed: "amber",
};

export function ObligationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Set by DisbursementPage after a 202 so the lender sees confirmation.
  const disbursementSent = Boolean(
    (useLocation().state as { disbursementSent?: boolean } | null)?.disbursementSent,
  );
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const { data: o, isLoading, error } = useObligationQuery(id);
  const repayment = useRequestRepayment();
  const { data: payments = [] } = usePaymentsQuery(id);
  const { data: schedule } = useScheduleQuery(o);
  // Only set when this obligation was spawned by a group expense (§8.12);
  // the query stays disabled until then, and both parties to the
  // obligation are parties to the expense, so the read is always allowed.
  const { data: originatingExpense } = useGroupExpenseQuery(o?.originating_expense_id ?? undefined);
  const acknowledge = useAcknowledgePayment();
  const dispute = useDisputePayment();

  if (isLoading) return <Spinner block label="Loading obligation" />;
  if (error || !o) {
    return (
      <div className={styles.page}>
        <Link to="/obligations" className={styles.back}>
          ← &nbsp;Back to Obligations
        </Link>
        <ErrorState error={error} />
      </div>
    );
  }

  const direction = obligationDirection(o, uid);
  const lender = direction === "owed";
  const counterparty = lender ? o.borrower : o.lender;
  const overdue = isOverdue(o);
  const installments = schedule?.installments ?? [];
  const nextInstallment = nextPayable(schedule);
  const nextIndex = installments.findIndex((i) => i === nextInstallment) + 1;
  const overdueInstallment = installments.find((i) => i.status === "Overdue");
  const overdueIndex = installments.findIndex((i) => i === overdueInstallment) + 1;
  // Repayments flow while there's something outstanding; a repayment
  // request is an escalation limited to what's actually overdue.
  const repayable = o.status === "Active" || o.status === "Partially Paid";
  const canChase =
    lender && (o.repayment_type === "Lump Sum" ? overdue : Boolean(overdueInstallment));
  const timeline = buildTimeline(o, payments, uid);

  const relation =
    direction === "owed" ? "They owe you" : direction === "owe" ? "You owe them" : "Between others";

  return (
    <div className={styles.page}>
      <Link to="/obligations" className={styles.back}>
        ← &nbsp;Back to Obligations
      </Link>

      <div className={styles.cols}>
        <div className={styles.mainCol}>
          {/* Header Card (14:35) */}
          <section className={styles.headerCard}>
            <Avatar name={counterparty.display_name} size={56} accent={lender ? "teal" : "amber"} />
            <div className={styles.hCol}>
              <span className={styles.hName}>{counterparty.display_name}</span>
              <span className={styles.hRelation}>{relation}</span>
              <div className={styles.pillRow}>
                <StatusPill status={PILL_BY_STATUS[o.status] ?? "gray"}>{o.status}</StatusPill>
                <StatusPill status={lender ? "teal" : "amber"}>
                  {lender ? "Lending" : "Borrowing"}
                </StatusPill>
                {overdue && <StatusPill status="red">Overdue</StatusPill>}
              </div>
            </div>
            <div className={styles.amtCol}>
              <span className={styles.amtLabel}>Outstanding</span>
              <span className={[styles.amt, lender ? styles.amtTeal : styles.amtAmber].join(" ")}>
                {formatMoney(o.outstanding_balance)}
              </span>
            </div>
          </section>

          {/* Details Card (14:50) */}
          <section className={styles.detailsCard}>
            <SummaryRow label="Total amount" value={formatMoney(o.principal_amount)} />
            <SummaryRow label="Repayment type" value={o.repayment_type} />
            <SummaryRow label="Disbursement" value={o.disbursement_method} />
            <SummaryRow label="Reason" value={o.purpose} />
            {originatingExpense && (
              <SummaryRow
                label="From group expense"
                value={
                  <Link to={`/expenses/${originatingExpense.expense_id}`} className={styles.inline}>
                    {originatingExpense.description}
                  </Link>
                }
              />
            )}
            <SummaryRow label="Created" value={formatDate(o.created_at)} />
            <SummaryRow
              label="Due date"
              value={formatDate(o.due_date)}
              tone={overdue ? "amber" : "default"}
              divider={false}
            />
          </section>

          {/* Repayment schedule — GET /obligations/{id}/schedule (Installments
              only). Overdue rows are what Request Repayment can target. */}
          {schedule && (
            <section className={styles.historyCard}>
              <div className={styles.scheduleHead}>
                <h2 className={styles.cardTitle}>Repayment schedule</h2>
                <span className={styles.scheduleProgress}>
                  {schedule.installments.filter((i) => i.status === "Paid").length} of{" "}
                  {schedule.installment_count} paid
                  {schedule.status === "Completed" ? " · complete" : ""}
                </span>
              </div>
              <ul className={styles.timeline}>
                {schedule.installments.map((inst, i) => (
                  <InstallmentRow
                    key={inst.installment_id}
                    index={i + 1}
                    installment={inst}
                    highlighted={inst.installment_id === nextInstallment?.installment_id}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Payments card — GET /obligations/{id}/payments. Pending external
              rows carry Acknowledge / Dispute for the party who didn't record
              them (§6.4.3). */}
          {payments.length > 0 && (
            <section className={styles.historyCard}>
              <h2 className={styles.cardTitle}>Payments</h2>
              <ul className={styles.paymentList}>
                {payments.map((p) => {
                  const mine = p.payer.user_id === uid;
                  const canRespond =
                    p.payment_method === "External" &&
                    p.status === "Pending Acknowledgement" &&
                    p.recorded_by_user_id !== uid &&
                    (p.payer.user_id === uid || p.recipient.user_id === uid);
                  const busy =
                    (acknowledge.isPending && acknowledge.variables === p.payment_id) ||
                    (dispute.isPending && dispute.variables === p.payment_id);
                  return (
                    <li key={p.payment_id} className={styles.paymentRow}>
                      <div className={styles.paymentCol}>
                        <span className={styles.paymentTitle}>
                          {p.payment_direction === "Disbursement" ? "Disbursement" : "Repayment"} ·{" "}
                          {mine ? `to ${p.recipient.display_name}` : `from ${p.payer.display_name}`}
                        </span>
                        <span className={styles.paymentSub}>
                          {formatDate(p.recorded_at)} ·{" "}
                          {p.payment_method === "Chapa"
                            ? "Telebirr (Chapa)"
                            : (p.external_method_note ?? "External")}
                          {p.recorded_by_user_id &&
                            ` · recorded by ${p.recorded_by_user_id === uid ? "you" : p.recorded_by_user_id === p.payer.user_id ? p.payer.display_name : p.recipient.display_name}`}
                        </span>
                      </div>
                      <div className={styles.paymentRight}>
                        <span
                          className={[
                            styles.paymentAmount,
                            mine ? styles.amtAmber : styles.amtTeal,
                          ].join(" ")}
                        >
                          {mine ? "−" : "+"}
                          {formatMoney(p.amount)}
                        </span>
                        <StatusPill size="small" status={PAYMENT_PILL[p.status] ?? "gray"}>
                          {p.status}
                        </StatusPill>
                      </div>
                      {canRespond && (
                        <div className={styles.paymentActions}>
                          <Button
                            size="small"
                            disabled={busy}
                            onClick={() => acknowledge.mutate(p.payment_id)}
                          >
                            Acknowledge
                          </Button>
                          <Button
                            kind="danger"
                            size="small"
                            disabled={busy}
                            onClick={() => dispute.mutate(p.payment_id)}
                          >
                            Dispute
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(acknowledge.isError || dispute.isError) && (
                <p role="alert" className={styles.error}>
                  {errorMessage(acknowledge.error ?? dispute.error)}
                </p>
              )}
            </section>
          )}

          {/* History Card (14:66) */}
          <section className={styles.historyCard}>
            <h2 className={styles.cardTitle}>Activity</h2>
            <ul className={styles.timeline}>
              {timeline.map((item, i) => (
                <TimelineItem
                  key={i}
                  title={item.title}
                  subtitle={item.subtitle}
                  color={item.color}
                  rail={i < timeline.length - 1}
                />
              ))}
            </ul>
          </section>
        </div>

        {/* Actions Card (14:90) */}
        <aside className={styles.sideCol}>
          <section className={styles.actionsCard}>
            <h2 className={styles.cardTitle}>Actions</h2>
            {o.status === "Pending Disbursement" ? (
              lender ? (
                <>
                  {disbursementSent && (
                    <Note color="teal">
                      Payment started — once Chapa confirms it, the money goes to their Telebirr and
                      this obligation becomes Active.
                    </Note>
                  )}
                  <Button
                    block
                    onClick={() => navigate(`/obligations/${o.obligation_id}/disburse`)}
                  >
                    Send disbursement
                  </Button>
                </>
              ) : (
                <Button
                  block
                  disabled
                  reason={`Waiting for ${counterparty.display_name.split(" ")[0]} to send the money through the app`}
                >
                  Awaiting disbursement
                </Button>
              )
            ) : o.status === "Settled" ? (
              <Note color="gray">
                Settled{o.settled_at ? ` on ${formatDate(o.settled_at)}` : ""}. Nothing left to do.
              </Note>
            ) : lender ? (
              <>
                <Button
                  block
                  disabled={!canChase || repayment.isPending}
                  onClick={() =>
                    repayment.mutate({
                      obligationId: o.obligation_id,
                      // Installments: chase the earliest overdue row (§6.2.2).
                      ...(overdueInstallment
                        ? { body: { installment_id: overdueInstallment.installment_id } }
                        : {}),
                    })
                  }
                  {...(!canChase
                    ? { reason: "Repayment can only be requested on overdue items." }
                    : {})}
                >
                  {repayment.isPending
                    ? "Sending…"
                    : overdueInstallment
                      ? `Request installment ${overdueIndex}`
                      : "Request Repayment"}
                </Button>
                <Button
                  kind="secondary"
                  block
                  disabled={!repayable}
                  onClick={() => navigate(`/obligations/${o.obligation_id}/record`)}
                  {...(!repayable
                    ? { reason: "Only an active obligation can take a payment" }
                    : {})}
                >
                  Record External Payment
                </Button>
              </>
            ) : (
              <>
                <Button
                  block
                  disabled={!repayable}
                  onClick={() => navigate(`/obligations/${o.obligation_id}/pay`)}
                  {...(!repayable
                    ? { reason: "This obligation isn’t accepting repayments right now" }
                    : {})}
                >
                  {nextInstallment ? `Pay installment ${nextIndex}` : "Make Payment"}
                </Button>
                <Button
                  kind="secondary"
                  block
                  disabled={!repayable}
                  onClick={() => navigate(`/obligations/${o.obligation_id}/record`)}
                >
                  Record External Payment
                </Button>
              </>
            )}
            {repayment.isSuccess && (
              <Note color="teal">Repayment request sent to {counterparty.display_name}.</Note>
            )}
            {repayment.isError && (
              <p role="alert" className={styles.error}>
                {errorMessage(repayment.error)}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

interface TimelineEntry {
  title: string;
  subtitle: string;
  color: TimelineColor;
}

function buildTimeline(
  o: Obligation,
  payments: Schemas["Payment"][],
  uid: string | undefined,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { title: "Obligation created", subtitle: formatDate(o.created_at), color: "teal" },
  ];
  if (o.originating_request_id) {
    entries.push({ title: "Terms agreed", subtitle: formatDate(o.created_at), color: "teal" });
  }
  // Confirmed payments, oldest first (the list arrives newest first).
  for (const p of [...payments].reverse()) {
    if (p.status !== "Confirmed") continue;
    const mine = p.payer.user_id === uid;
    entries.push({
      title:
        p.payment_direction === "Disbursement"
          ? `Disbursed ${formatMoney(p.amount)}`
          : `Repaid ${formatMoney(p.amount)}`,
      subtitle: `${formatDate(p.confirmed_at ?? p.recorded_at)} · ${mine ? "by you" : `by ${p.payer.display_name}`}`,
      color: p.payment_direction === "Disbursement" ? "teal" : "amber",
    });
  }
  if (o.status === "Settled" && o.settled_at) {
    entries.push({ title: "Settled", subtitle: formatDate(o.settled_at), color: "gray" });
  } else {
    entries.push({
      title: o.status,
      subtitle: "Current status",
      color: STATUS_COLOR[o.status] ?? "gray",
    });
  }
  return entries;
}
