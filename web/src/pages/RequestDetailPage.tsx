import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Avatar } from "../components/ui/Avatar.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { OptionCard } from "../components/ui/OptionCard.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import {
  useAcceptRequest,
  useCancelRequest,
  useCounterRequest,
  useDeclineRequest,
  useRequestQuery,
} from "../hooks/useRequests.js";
import { formatDate, todayIso } from "../lib/dates.js";
import { formatMoney } from "../lib/money.js";
import { canCancel, canRespond, requestStatusLabel } from "../lib/requests.js";
import styles from "./RequestDetailPage.module.css";

// Figma: Screen — Request Response (16:66), Screen — Counter-Proposal
// Received (49:2500) and Screen — Negotiate Terms (16:132). One route,
// `/requests/:id`, picks the view from the request's status and who's
// looking: the recipient of a Pending request gets Response; the initiator
// of a Countered one gets Counter-Proposal Received; "Counter" on the
// Response view switches to Negotiate Terms in place.
//
// Contract-driven addition: accepting a *Borrow* request needs the lender's
// disbursement_method (AcceptRequestInput), which the Response frame doesn't
// show — it appears here as a radio group above the buttons.

type Request = Schemas["Request"];
type RepaymentType = Schemas["RepaymentType"];
type DisbursementMethod = Schemas["DisbursementMethod"];

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

function repaymentLabel(type: RepaymentType | null, schedule: Request["proposed_schedule"]) {
  if (type === "Installments") return `Installments (${schedule?.installments.length ?? 0})`;
  return type ?? "—";
}

export function RequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const { data: request, isLoading, error } = useRequestQuery(id);
  const [mode, setMode] = useState<"view" | "counter">("view");

  if (isLoading) {
    return (
      <CenteredLayout title="Request" subtitle="Loading…" width={680} back>
        <p className={styles.muted}>Loading…</p>
      </CenteredLayout>
    );
  }
  if (error || !request) {
    return (
      <CenteredLayout title="Request" subtitle="This request couldn’t be loaded." width={680} back>
        <p role="alert" className={styles.error}>
          {errorMessage(error) ?? "Not found."}
        </p>
      </CenteredLayout>
    );
  }

  if (mode === "counter") {
    return (
      <CounterView
        request={request}
        onCancel={() => setMode("view")}
        onSent={() => navigate("/requests")}
      />
    );
  }

  const isInitiator = request.initiating_user.user_id === uid;
  if (request.status === "Countered" && isInitiator && request.counter_proposal) {
    return <CounterReceivedView request={request} uid={uid} />;
  }
  return <ResponseView request={request} uid={uid} onCounter={() => setMode("counter")} />;
}

// ── Screen — Request Response (16:66) ──────────────────────────────────

function ResponseView({
  request,
  uid,
  onCounter,
}: {
  request: Request;
  uid: string | undefined;
  onCounter: () => void;
}) {
  const navigate = useNavigate();
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const cancel = useCancelRequest();
  const [disbursement, setDisbursement] = useState<DisbursementMethod>("Already Given");

  const isInitiator = request.initiating_user.user_id === uid;
  const other = isInitiator ? request.receiving_user : request.initiating_user;
  const respondable = canRespond(request, uid);
  const cancellable = canCancel(request, uid);
  // The recipient of a Borrow request is the prospective lender — they
  // choose how the money moves when they accept.
  const needsDisbursement = respondable && request.request_type === "Borrow";
  const busy = accept.isPending || decline.isPending || cancel.isPending;
  const err =
    errorMessage(accept.error) ?? errorMessage(decline.error) ?? errorMessage(cancel.error);

  const verb =
    request.request_type === "Borrow"
      ? isInitiator
        ? "you asked to borrow"
        : "wants to borrow from you"
      : request.request_type === "Lend"
        ? isInitiator
          ? "you offered to lend"
          : "wants to lend to you"
        : "requests a repayment";

  function handleAccept() {
    accept.mutate(
      {
        requestId: request.request_id,
        ...(needsDisbursement ? { body: { disbursement_method: disbursement } } : {}),
      },
      { onSuccess: () => navigate("/requests") },
    );
  }

  return (
    <CenteredLayout
      title={`${request.request_type} Request`}
      subtitle={`${isInitiator ? "To" : "From"} ${other.display_name}`}
      width={680}
      back
    >
      <div className={styles.rHead}>
        <Avatar name={other.display_name} size={52} />
        <span className={styles.rCol}>
          <span className={styles.rName}>{other.display_name}</span>
          <span className={styles.rSub}>{verb}</span>
        </span>
        <StatusPill
          status={
            request.status === "Pending" || request.status === "Countered" ? "indigo" : "gray"
          }
        >
          {requestStatusLabel(request, uid)}
        </StatusPill>
      </div>

      <div className={styles.summary}>
        <SummaryRow label="Amount" value={formatMoney(request.amount)} tone="teal" />
        <SummaryRow
          label="Repayment type"
          value={repaymentLabel(request.proposed_repayment_type, request.proposed_schedule)}
        />
        <SummaryRow
          label="Due date"
          value={request.proposed_due_date ? formatDate(request.proposed_due_date) : "—"}
          divider={Boolean(request.purpose) || Boolean(request.disbursement_method)}
        />
        {request.disbursement_method && (
          <SummaryRow
            label="Disbursement"
            value={request.disbursement_method}
            divider={Boolean(request.purpose)}
          />
        )}
        {request.purpose && <SummaryRow label="Reason" value={request.purpose} divider={false} />}
      </div>

      {needsDisbursement && (
        <>
          <p className={styles.groupLabel}>Disbursement method</p>
          <div className={styles.options} role="radiogroup" aria-label="Disbursement method">
            <OptionCard
              title="Already Given"
              description="I’ve handed over the money — the obligation becomes Active right away"
              selected={disbursement === "Already Given"}
              onClick={() => setDisbursement("Already Given")}
            />
            <OptionCard
              title="Through App"
              description="Send via Chapa to their Telebirr — they must verify Telebirr first"
              selected={disbursement === "Through App"}
              onClick={() => setDisbursement("Through App")}
            />
          </div>
        </>
      )}

      {respondable ? (
        <Note color="indigo">You can accept, decline, or send one counter-proposal.</Note>
      ) : cancellable ? (
        <Note color="gray">
          Waiting for {other.display_name.split(" ")[0]} to respond. You can cancel until they do.
        </Note>
      ) : (
        <Note color="gray">This request is {request.status.toLowerCase()}.</Note>
      )}

      {err && (
        <p role="alert" className={styles.error}>
          {err}
        </p>
      )}

      {respondable && (
        <div className={styles.btnRow}>
          <Button
            kind="danger"
            block
            disabled={busy}
            onClick={() =>
              decline.mutate(request.request_id, { onSuccess: () => navigate("/requests") })
            }
          >
            Decline
          </Button>
          {request.status === "Pending" && (
            <Button kind="secondary" block disabled={busy} onClick={onCounter}>
              Counter
            </Button>
          )}
          <Button block disabled={busy} onClick={handleAccept}>
            {accept.isPending ? "Accepting…" : "Accept"}
          </Button>
        </div>
      )}
      {cancellable && (
        <div className={styles.btnRow}>
          <Button
            kind="ghost"
            block
            disabled={busy}
            onClick={() =>
              cancel.mutate(request.request_id, { onSuccess: () => navigate("/requests") })
            }
          >
            {cancel.isPending ? "Cancelling…" : "Cancel request"}
          </Button>
        </div>
      )}
    </CenteredLayout>
  );
}

// ── Screen — Counter-Proposal Received (49:2500) ───────────────────────

function CounterReceivedView({ request, uid }: { request: Request; uid: string | undefined }) {
  const navigate = useNavigate();
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const counter = request.counter_proposal as NonNullable<Request["counter_proposal"]>;
  const other = request.receiving_user;
  const busy = accept.isPending || decline.isPending;
  const err = errorMessage(accept.error) ?? errorMessage(decline.error);

  // "before → after" for anything the counter changed; "— unchanged" otherwise.
  const amountText =
    counter.amount && counter.amount.amount !== request.amount.amount
      ? `${formatMoney(request.amount)} → ${formatMoney(counter.amount)}`
      : `${formatMoney(request.amount)} — unchanged`;
  const typeBefore = repaymentLabel(request.proposed_repayment_type, request.proposed_schedule);
  const typeAfter = counter.proposed_repayment_type
    ? repaymentLabel(counter.proposed_repayment_type, counter.proposed_schedule ?? null)
    : null;
  const typeText =
    typeAfter && typeAfter !== typeBefore
      ? `${typeBefore} → ${typeAfter}`
      : `${typeBefore} — unchanged`;
  const dueBefore = request.proposed_due_date ? formatDate(request.proposed_due_date) : "—";
  const dueText =
    counter.proposed_due_date && counter.proposed_due_date !== request.proposed_due_date
      ? `${dueBefore} → ${formatDate(counter.proposed_due_date)}`
      : `${dueBefore} — unchanged`;

  return (
    <CenteredLayout
      title="Counter-Proposal"
      subtitle={`${other.display_name} revised your terms — this is the final proposal`}
      width={680}
      back
    >
      <div className={styles.rHead}>
        <Avatar name={other.display_name} size={52} />
        <span className={styles.rCol}>
          <span className={styles.rName}>{other.display_name}</span>
          <span className={styles.rSub}>sent a counter-proposal</span>
        </span>
        <StatusPill status="indigo">{requestStatusLabel(request, uid)}</StatusPill>
      </div>

      <div className={styles.summary}>
        <SummaryRow label="Amount" value={amountText} tone={counter.amount ? "teal" : "default"} />
        <SummaryRow label="Repayment type" value={typeText} />
        <SummaryRow
          label="Due date"
          value={dueText}
          tone={counter.proposed_due_date ? "teal" : "default"}
          divider={Boolean(request.purpose)}
        />
        {request.purpose && <SummaryRow label="Reason" value={request.purpose} divider={false} />}
      </div>

      <Note color="amber">
        This is the final proposal — you can accept or decline, but you can’t counter again.
      </Note>

      {err && (
        <p role="alert" className={styles.error}>
          {err}
        </p>
      )}

      <div className={styles.btnRow}>
        <Button
          kind="danger"
          block
          disabled={busy}
          onClick={() =>
            decline.mutate(request.request_id, { onSuccess: () => navigate("/requests") })
          }
        >
          Decline
        </Button>
        <Button
          block
          disabled={busy}
          onClick={() =>
            accept.mutate(
              { requestId: request.request_id },
              { onSuccess: () => navigate("/requests") },
            )
          }
        >
          {accept.isPending ? "Accepting…" : "Accept"}
        </Button>
      </div>
    </CenteredLayout>
  );
}

// ── Screen — Negotiate Terms (16:132) ──────────────────────────────────

interface InstallmentDraft {
  amount: string;
  due_date: string;
}

function CounterView({
  request,
  onCancel,
  onSent,
}: {
  request: Request;
  onCancel: () => void;
  onSent: () => void;
}) {
  const counter = useCounterRequest();
  const other = request.initiating_user;
  const [amount, setAmount] = useState(String(request.amount.amount));
  const [repaymentType, setRepaymentType] = useState<RepaymentType>(
    request.proposed_repayment_type ?? "Lump Sum",
  );
  const [dueDate, setDueDate] = useState(request.proposed_due_date ?? "");
  const [installments, setInstallments] = useState<InstallmentDraft[]>(
    request.proposed_schedule?.installments.map((i) => ({
      amount: String(i.amount.amount),
      due_date: i.due_date,
    })) ?? [
      { amount: "", due_date: "" },
      { amount: "", due_date: "" },
    ],
  );
  const [formError, setFormError] = useState<string | null>(null);

  const amountNumber = Number(amount);
  const scheduledTotal = installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  function evenSplit() {
    const n = installments.length;
    if (!(amountNumber > 0) || n === 0) return;
    const base = Math.floor((amountNumber / n) * 100) / 100;
    const remainder = Math.round((amountNumber - base * n) * 100) / 100;
    setInstallments((rows) =>
      rows.map((row, i) => ({
        ...row,
        amount: String(i === n - 1 ? Math.round((base + remainder) * 100) / 100 : base),
      })),
    );
  }

  function updateInstallment(index: number, patch: Partial<InstallmentDraft>) {
    setInstallments((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!(amountNumber > 0)) return setFormError("Enter an amount greater than zero.");
    if (!dueDate) return setFormError("Choose a due date.");
    if (repaymentType === "Installments") {
      if (installments.some((i) => !(Number(i.amount) > 0) || !i.due_date)) {
        return setFormError("Every installment needs an amount and a date.");
      }
      if (Math.abs(scheduledTotal - amountNumber) > 0.01) {
        return setFormError("Installments must add up to the amount.");
      }
    }
    const body: Schemas["CounterProposalInput"] = {
      amount: { amount: amountNumber, currency: "ETB" },
      proposed_repayment_type: repaymentType,
      proposed_due_date: dueDate,
      ...(repaymentType === "Installments"
        ? {
            proposed_schedule: {
              installments: installments.map((i) => ({
                amount: { amount: Number(i.amount), currency: "ETB" as const },
                due_date: i.due_date,
              })),
            },
          }
        : {}),
    };
    counter.mutate({ requestId: request.request_id, body }, { onSuccess: onSent });
  }

  const err = formError ?? errorMessage(counter.error);

  return (
    <CenteredLayout
      title="Counter-Proposal"
      subtitle="Suggest different terms — this is your one counter"
      width={760}
      back={onCancel}
      plain
    >
      <form className={styles.counterForm} onSubmit={handleSubmit}>
        <div className={styles.compare}>
          <section className={styles.theirs}>
            <span className={styles.overline}>Their proposal</span>
            <SummaryRow label="Amount" value={formatMoney(request.amount)} />
            <SummaryRow
              label="Type"
              value={repaymentLabel(request.proposed_repayment_type, request.proposed_schedule)}
            />
            <SummaryRow
              label="Due"
              value={request.proposed_due_date ? formatDate(request.proposed_due_date) : "—"}
              divider={false}
            />
          </section>

          <section className={styles.yours}>
            <span className={[styles.overline, styles.overlineTeal].join(" ")}>Your counter</span>
            <Field
              label="Amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <label className={styles.selectField}>
              <span className={styles.groupLabel}>Repayment type</span>
              <select
                className={styles.select}
                value={repaymentType}
                onChange={(e) => setRepaymentType(e.target.value as RepaymentType)}
              >
                <option value="Lump Sum">Lump Sum</option>
                <option value="Installments">Installments</option>
              </select>
            </label>
            <Field
              label="Due date"
              type="date"
              min={todayIso()}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </section>
        </div>

        {repaymentType === "Installments" && (
          <section className={styles.schedule}>
            <div className={styles.scheduleHeader}>
              <span className={styles.groupLabel}>Your counter schedule</span>
              <span className={styles.scheduleActions}>
                <Button
                  type="button"
                  kind="ghost"
                  size="small"
                  onClick={() => setInstallments((rows) => [...rows, { amount: "", due_date: "" }])}
                  disabled={installments.length >= 60}
                >
                  Add installment
                </Button>
                <Button type="button" kind="ghost" size="small" onClick={evenSplit}>
                  Even split
                </Button>
              </span>
            </div>
            {installments.map((row, i) => (
              <div key={i} className={styles.instRow}>
                <span className={styles.instLabel}>Installment {i + 1}</span>
                <input
                  className={styles.instInput}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  aria-label={`Installment ${i + 1} amount`}
                  value={row.amount}
                  onChange={(e) => updateInstallment(i, { amount: e.target.value })}
                />
                <input
                  className={styles.instInput}
                  type="date"
                  min={todayIso()}
                  aria-label={`Installment ${i + 1} due date`}
                  value={row.due_date}
                  onChange={(e) => updateInstallment(i, { due_date: e.target.value })}
                />
                {installments.length > 2 && (
                  <button
                    type="button"
                    className={styles.instRemove}
                    aria-label={`Remove installment ${i + 1}`}
                    onClick={() => setInstallments((rows) => rows.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <SummaryRow
              label="Scheduled total"
              value={`${formatMoney({ amount: scheduledTotal, currency: "ETB" })} of ${formatMoney({ amount: amountNumber || 0, currency: "ETB" })}`}
              divider={false}
            />
          </section>
        )}

        <Note color="amber">
          After this counter, {other.display_name.split(" ")[0]} can only accept or decline — no
          further changes.
        </Note>

        {err && (
          <p role="alert" className={styles.error}>
            {err}
          </p>
        )}

        <div className={styles.btnRow}>
          <Button type="button" kind="ghost" block onClick={onCancel} disabled={counter.isPending}>
            Cancel
          </Button>
          <Button type="submit" block disabled={counter.isPending}>
            {counter.isPending ? "Sending…" : "Send Counter"}
          </Button>
        </div>
      </form>
    </CenteredLayout>
  );
}
