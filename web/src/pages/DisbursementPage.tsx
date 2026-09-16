import { Navigate, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { OptionCard } from "../components/ui/OptionCard.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import { useDisburseObligation, useObligationQuery } from "../hooks/useObligations.js";
import { formatDate } from "../lib/dates.js";
import { formatMoney } from "../lib/money.js";
import styles from "./DisbursementPage.module.css";

// Figma: Screen — Send Disbursement (49:2596). Lender-side confirmation for
// a Through-App obligation. The amount is fixed by the agreed terms; the
// primary action creates the disbursement Payment and sends the lender to
// Chapa's checkout to pay the principal in (collection hop). The backend
// then transfers it to the borrower's verified Telebirr and the obligation
// becomes Active once Chapa confirms — BuryMe never fronts the money.
//
// The Obligation schema doesn't carry the borrower's Telebirr status, so
// the backend's RECIPIENT_UNVERIFIED (409) is surfaced as the error rather
// than pre-disabling the button.
export function DisbursementPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const { data: o, isLoading, error } = useObligationQuery(id);
  const disburse = useDisburseObligation();

  if (isLoading) {
    return (
      <CenteredLayout title="Send Disbursement" subtitle="Loading…" width={680} back>
        <p className={styles.muted}>Loading…</p>
      </CenteredLayout>
    );
  }
  if (error || !o) {
    return (
      <CenteredLayout
        title="Send Disbursement"
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
  // Only the lender of a Through-App obligation still awaiting funds.
  if (o.lender.user_id !== buryMeUser?.user_id || o.status !== "Pending Disbursement") {
    return <Navigate to={`/obligations/${o.obligation_id}`} replace />;
  }

  const amount = formatMoney(o.principal_amount);
  const firstName = o.borrower.display_name.split(" ")[0];
  const err = disburse.error
    ? disburse.error instanceof ApiError
      ? disburse.error.message
      : "Something went wrong."
    : null;

  function handlePay() {
    if (!o) return;
    disburse.mutate(o.obligation_id, {
      onSuccess: (payment) => {
        if (payment.checkout_url) {
          // Hand off to Chapa's hosted checkout; it returns the lender to
          // the obligation page afterwards.
          window.location.assign(payment.checkout_url);
        } else {
          navigate(`/obligations/${o.obligation_id}`, { state: { disbursementSent: true } });
        }
      },
    });
  }

  return (
    <CenteredLayout
      title="Send Disbursement"
      subtitle={`${o.borrower.display_name} • Through App`}
      width={680}
      back
    >
      <div className={styles.stack}>
        <div className={styles.fixedField}>
          <Field label="Amount" value={amount} readOnlyLook />
          <span className={styles.fixedTag}>Fixed</span>
        </div>

        <p className={styles.groupLabel}>Recipient</p>
        <OptionCard
          title={o.borrower.display_name}
          description="Telebirr • verified number on file"
          selected
        />

        <div className={styles.summary}>
          <SummaryRow label="You pay" value={amount} tone="amber" />
          <SummaryRow label="Via" value="Telebirr (Chapa checkout)" />
          <SummaryRow label={`${firstName} receives`} value={amount} tone="teal" />
          <SummaryRow label="Due back" value={formatDate(o.due_date)} divider={false} />
        </div>

        <Note color="gray">
          The amount is fixed by the agreed terms and can’t be changed. You’ll pay {amount} on
          Chapa’s secure checkout; once it clears, BuryMe forwards it to {firstName}’s Telebirr and
          this obligation becomes Active.
        </Note>

        {err && (
          <p role="alert" className={styles.error}>
            {err}
          </p>
        )}

        <div className={styles.actions}>
          <Button block disabled={disburse.isPending} onClick={handlePay}>
            {disburse.isPending ? "Opening checkout…" : `Pay ${amount} via Telebirr`}
          </Button>
          <Button
            kind="ghost"
            block
            disabled={disburse.isPending}
            onClick={() => navigate(`/obligations/${o.obligation_id}`)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </CenteredLayout>
  );
}
