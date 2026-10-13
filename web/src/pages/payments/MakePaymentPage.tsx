import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { ErrorState, hasErrorBlock } from "../components/domain/ErrorState.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { OptionCard } from "../components/ui/OptionCard.js";
import { Spinner } from "../components/ui/Spinner.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import { useObligationQuery } from "../hooks/useObligations.js";
import { useInitiateChapaPayment } from "../hooks/usePayments.js";
import { nextPayable, useScheduleQuery } from "../hooks/useSchedule.js";
import { formatDate } from "../lib/dates.js";
import { formatMoney } from "../lib/money.js";
import styles from "./MakePaymentPage.module.css";

// Figma: Screen — Make Payment (16:31, host 16:32). Borrower repays via
// Chapa: the amount is fixed to the outstanding balance (§12.2.4), the only
// method is Telebirr, and the primary action opens Chapa's checkout. The
// lender receives the money once both hops confirm; the obligation settles
// then, not now.
export function MakePaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const { data: o, isLoading, error } = useObligationQuery(id);
  const pay = useInitiateChapaPayment();
  const { data: schedule } = useScheduleQuery(o);
  // Installments: which row this payment settles. Defaults to the next
  // payable one once the schedule arrives; the borrower can pick another.
  const [installmentId, setInstallmentId] = useState<string | null>(null);
  useEffect(() => {
    if (schedule && !installmentId) setInstallmentId(nextPayable(schedule)?.installment_id ?? null);
  }, [schedule, installmentId]);

  if (isLoading) {
    return (
      <CenteredLayout title="Make Payment" subtitle="Fetching this obligation." width={680} back>
        <Spinner block label="Loading obligation" />
      </CenteredLayout>
    );
  }
  if (error || !o) {
    return (
      <CenteredLayout
        title="Make Payment"
        subtitle="This obligation couldn’t be loaded."
        width={680}
        back
      >
        <ErrorState error={error} inset />
      </CenteredLayout>
    );
  }
  // Borrower only, and only while there's something to repay.
  const repayable = o.status === "Active" || o.status === "Partially Paid";
  if (o.borrower.user_id !== buryMeUser?.user_id || !repayable) {
    return <Navigate to={`/obligations/${o.obligation_id}`} replace />;
  }

  const payable = (schedule?.installments ?? []).filter((i) => i.status !== "Paid");
  const selected = payable.find((i) => i.installment_id === installmentId);
  const amount = formatMoney(selected ? selected.amount : o.outstanding_balance);
  const myTelebirr = buryMeUser.telebirr;
  const err = pay.error
    ? pay.error instanceof ApiError
      ? pay.error.message
      : "Something went wrong."
    : null;

  function handlePay() {
    if (!o) return;
    pay.mutate(
      { obligationId: o.obligation_id, ...(installmentId ? { installmentId } : {}) },
      {
        onSuccess: (payment) => {
          if (payment.checkout_url) window.location.assign(payment.checkout_url);
          else navigate(`/obligations/${o.obligation_id}`, { state: { paymentStarted: true } });
        },
      },
    );
  }

  return (
    <CenteredLayout
      title="Make Payment"
      subtitle={`Repay ${o.lender.display_name} • ${o.repayment_type}`}
      width={680}
      back
    >
      <div className={styles.stack}>
        <div className={styles.fixedField}>
          <Field label="Amount due" value={amount} readOnlyLook />
          <span className={styles.fixedTag}>Fixed</span>
        </div>

        {schedule && (
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

        <p className={styles.groupLabel}>Payment method</p>
        <OptionCard
          title="Telebirr"
          description={
            myTelebirr?.telebirr_number
              ? `${myTelebirr.telebirr_number} • ${myTelebirr.verification_status === "Verified" ? "linked & verified" : "linked"}`
              : "You’ll enter your Telebirr number on Chapa’s checkout"
          }
          selected
        />

        <div className={styles.summary}>
          <SummaryRow label="Paying" value={o.lender.display_name} />
          <SummaryRow label="Amount" value={amount} tone="amber" />
          <SummaryRow label="Via" value="Telebirr (Chapa)" divider={false} />
        </div>

        <Note color="gray">The amount is fixed by the agreed terms and can’t be changed.</Note>

        {/* A gateway failure is the design's Payment Failed block (39:1859);
            anything else stays an inline line beside the button. */}
        {pay.error && hasErrorBlock(pay.error) ? (
          <ErrorState error={pay.error} onRetry={handlePay} inset />
        ) : (
          err && (
            <p role="alert" className={styles.error}>
              {err}
            </p>
          )
        )}

        <div className={styles.actions}>
          <Button
            block
            disabled={pay.isPending || (schedule !== undefined && !selected)}
            onClick={handlePay}
          >
            {pay.isPending ? "Opening checkout…" : `Pay ${amount} via Telebirr`}
          </Button>
          <Button
            kind="ghost"
            block
            disabled={pay.isPending}
            onClick={() => navigate(`/obligations/${o.obligation_id}/record`)}
          >
            Record External Payment Instead
          </Button>
        </div>
      </div>
    </CenteredLayout>
  );
}
