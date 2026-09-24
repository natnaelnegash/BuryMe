import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { OptionCard } from "../components/ui/OptionCard.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import { useObligationQuery } from "../hooks/useObligations.js";
import { useRecordExternalPayment } from "../hooks/usePayments.js";
import { nextPayable, useScheduleQuery } from "../hooks/useSchedule.js";
import { formatDate, todayIso } from "../lib/dates.js";
import { formatMoney } from "../lib/money.js";
import styles from "./RecordPaymentPage.module.css";

// Record a payment that happened outside the platform (§6.4.2). Either party
// may record it; the direction follows from the obligation's state (a
// Pending Disbursement obligation gets a Disbursement, an Active one a
// Repayment) and the amount is system-set. It sits Pending Acknowledgement
// until the other party confirms or disputes it on the obligation page.
//
// Built without a grounded Figma frame (the plugin was offline) — same
// card shape as Make Payment (16:32); visual pass pending.

type MethodNote = Schemas["ExternalPaymentMethodNote"];

const METHODS: { value: MethodNote; description: string }[] = [
  { value: "Cash", description: "Handed over in person" },
  { value: "Bank Transfer", description: "Sent between bank accounts" },
  { value: "Mobile Money", description: "Telebirr, M-Pesa or similar, outside the app" },
  { value: "Other", description: "Some other arrangement" },
];

export function RecordPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const { data: o, isLoading, error } = useObligationQuery(id);
  const record = useRecordExternalPayment();
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<MethodNote>("Cash");
  const [note, setNote] = useState("");
  const { data: schedule } = useScheduleQuery(o);
  const [installmentId, setInstallmentId] = useState<string | null>(null);
  useEffect(() => {
    if (schedule && !installmentId) setInstallmentId(nextPayable(schedule)?.installment_id ?? null);
  }, [schedule, installmentId]);

  if (isLoading) {
    return (
      <CenteredLayout title="Record Payment" subtitle="Loading…" width={680} back>
        <p className={styles.muted}>Loading…</p>
      </CenteredLayout>
    );
  }
  if (error || !o) {
    return (
      <CenteredLayout
        title="Record Payment"
        subtitle="This obligation couldn’t be loaded."
        width={680}
        back
      >
        <p role="alert" className={styles.error}>
          {error instanceof ApiError ? error.message : "Not found."}
        </p>
      </CenteredLayout>
    );
  }

  const uid = buryMeUser?.user_id;
  const isLender = o.lender.user_id === uid;
  const direction: Schemas["PaymentDirection"] =
    o.status === "Pending Disbursement" ? "Disbursement" : "Repayment";
  const recordable =
    (uid === o.lender.user_id || uid === o.borrower.user_id) &&
    (o.status === "Active" ||
      o.status === "Partially Paid" ||
      o.status === "Pending Disbursement");
  if (!recordable) return <Navigate to={`/obligations/${o.obligation_id}`} replace />;

  const payable = (schedule?.installments ?? []).filter((i) => i.status !== "Paid");
  const selected =
    direction === "Repayment" ? payable.find((i) => i.installment_id === installmentId) : undefined;
  const amount = formatMoney(
    direction === "Disbursement"
      ? o.principal_amount
      : selected
        ? selected.amount
        : o.outstanding_balance,
  );
  const payer = direction === "Disbursement" ? o.lender : o.borrower;
  const recipient = direction === "Disbursement" ? o.borrower : o.lender;
  const other = isLender ? o.borrower : o.lender;
  const iAmPayer = payer.user_id === uid;

  const err = record.error
    ? record.error instanceof ApiError
      ? record.error.message
      : "Something went wrong."
    : null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!o) return;
    record.mutate(
      {
        obligationId: o.obligation_id,
        body: {
          payment_direction: direction,
          ...(selected ? { installment_id: selected.installment_id } : {}),
          payment_date: date,
          external_method_note: method,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      { onSuccess: () => navigate(`/obligations/${o.obligation_id}`) },
    );
  }

  return (
    <CenteredLayout
      title={direction === "Disbursement" ? "Record Disbursement" : "Record Payment"}
      subtitle={
        iAmPayer
          ? `You paid ${recipient.display_name} outside the app`
          : `${payer.display_name} paid you outside the app`
      }
      width={680}
      back
    >
      <form className={styles.stack} onSubmit={handleSubmit}>
        <div className={styles.fixedField}>
          <Field label="Amount" value={amount} readOnlyLook />
          <span className={styles.fixedTag}>Fixed</span>
        </div>

        {direction === "Repayment" && schedule && (
          <>
            <p className={styles.groupLabel}>Installment</p>
            <div className={styles.options} role="radiogroup" aria-label="Installment">
              {payable.map((inst) => {
                const index = schedule.installments.indexOf(inst) + 1;
                return (
                  <OptionCard
                    key={inst.installment_id}
                    title={`Installment ${index} · ${formatMoney(inst.amount)}`}
                    description={`${inst.status === "Overdue" ? "Overdue since" : "Due"} ${formatDate(inst.due_date)}`}
                    selected={inst.installment_id === installmentId}
                    onClick={() => setInstallmentId(inst.installment_id)}
                  />
                );
              })}
            </div>
          </>
        )}

        <Field
          label="Payment date"
          type="date"
          value={date}
          max={todayIso()}
          min={o.created_at.slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          required
        />

        <p className={styles.groupLabel}>How was it paid?</p>
        <div className={styles.options} role="radiogroup" aria-label="Payment method">
          {METHODS.map((m) => (
            <OptionCard
              key={m.value}
              title={m.value}
              description={m.description}
              selected={method === m.value}
              onClick={() => setMethod(m.value)}
            />
          ))}
        </div>

        <Field
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Handed over at the office"
          maxLength={300}
        />

        <div className={styles.summary}>
          <SummaryRow label="From" value={payer.display_name} />
          <SummaryRow label="To" value={recipient.display_name} />
          <SummaryRow
            label="Amount"
            value={amount}
            tone={iAmPayer ? "amber" : "teal"}
            divider={false}
          />
        </div>

        <Note color="indigo">
          {other.display_name.split(" ")[0]} will be asked to confirm this. The balance only changes
          once they acknowledge it; they can also dispute it.
        </Note>

        {err && (
          <p role="alert" className={styles.error}>
            {err}
          </p>
        )}

        <div className={styles.actions}>
          <Button
            type="submit"
            block
            disabled={record.isPending || (direction === "Repayment" && schedule !== undefined && !selected)}
          >
            {record.isPending ? "Recording…" : "Record payment"}
          </Button>
          <Button
            type="button"
            kind="ghost"
            block
            onClick={() => navigate(`/obligations/${o.obligation_id}`)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </CenteredLayout>
  );
}
