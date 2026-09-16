import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { TimelineItem, type TimelineColor } from "../components/domain/TimelineItem.js";
import { Avatar } from "../components/ui/Avatar.js";
import { Button } from "../components/ui/Button.js";
import { Note } from "../components/ui/Note.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import { useObligationQuery, useRequestRepayment } from "../hooks/useObligations.js";
import { formatDate } from "../lib/dates.js";
import { formatMoney } from "../lib/money.js";
import { isOverdue, obligationDirection, PILL_BY_STATUS } from "../lib/obligations.js";
import styles from "./ObligationDetailPage.module.css";

// Figma: Obligation Detail — lender — Active / Pending Disbursement /
// Partially Paid / Settled (14:2, 14:97, 14:198, 14:300). One layout,
// driven by the obligation's status and which side the viewer is on.
//
// Scope, per the slice order: the only live action is "Request Repayment"
// (Slice 3). "Record External Payment" / "Make Payment" (Slice 5) and the
// disbursement confirmation (Slice 4) are present but disabled with a
// reason, so the layout matches the frames without promising endpoints
// that don't exist yet. The Activity timeline is derived from the fields
// the Obligation schema carries (created_at, status, settled_at) — there
// is no events endpoint in the contract.

type Obligation = Schemas["Obligation"];

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

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

  if (isLoading) return <p className={styles.muted}>Loading…</p>;
  if (error || !o) {
    return (
      <div className={styles.page}>
        <Link to="/obligations" className={styles.back}>
          ← &nbsp;Back to Obligations
        </Link>
        <p role="alert" className={styles.error}>
          {errorMessage(error) ?? "This obligation couldn’t be loaded."}
        </p>
      </div>
    );
  }

  const direction = obligationDirection(o, uid);
  const lender = direction === "owed";
  const counterparty = lender ? o.borrower : o.lender;
  const overdue = isOverdue(o);
  const canChase = lender && o.repayment_type === "Lump Sum" && overdue;
  const timeline = buildTimeline(o);

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
            <SummaryRow label="Created" value={formatDate(o.created_at)} />
            <SummaryRow
              label="Due date"
              value={formatDate(o.due_date)}
              tone={overdue ? "amber" : "default"}
              divider={false}
            />
          </section>

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
                  onClick={() => repayment.mutate({ obligationId: o.obligation_id })}
                  {...(!canChase
                    ? {
                        reason:
                          o.repayment_type === "Installments"
                            ? "Installment repayment requests are coming in a later release"
                            : "Repayment can only be requested on overdue items.",
                      }
                    : {})}
                >
                  {repayment.isPending ? "Sending…" : "Request Repayment"}
                </Button>
                <Button
                  kind="secondary"
                  block
                  disabled
                  reason="Recording external payments is coming in a later release"
                >
                  Record External Payment
                </Button>
              </>
            ) : (
              <Button block disabled reason="Payments are coming in a later release">
                Make Payment
              </Button>
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

function buildTimeline(o: Obligation): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { title: "Obligation created", subtitle: formatDate(o.created_at), color: "teal" },
  ];
  if (o.originating_request_id) {
    entries.push({ title: "Terms agreed", subtitle: formatDate(o.created_at), color: "teal" });
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
