import { Navigate, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../../api/client.js";
import { ErrorState } from "../../components/domain/ErrorState.js";
import { CenteredLayout } from "../../components/layout/CenteredLayout.js";
import { Button } from "../../components/ui/Button.js";
import { Field } from "../../components/ui/Field.js";
import { Note } from "../../components/ui/Note.js";
import { OptionCard } from "../../components/ui/OptionCard.js";
import { Spinner } from "../../components/ui/Spinner.js";
import { SummaryRow } from "../../components/ui/SummaryRow.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useDisburseObligation, useObligationQuery } from "../../hooks/useObligations.js";
import { formatDate } from "../../lib/dates.js";
import { formatMoney } from "../../lib/money.js";
import styles from "./DisbursementPage.module.css";

export function DisbursementPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const { data: o, isLoading, error } = useObligationQuery(id);
  const disburse = useDisburseObligation();

  if (isLoading) {
    return (
      <CenteredLayout
        title="Send Disbursement"
        subtitle="Fetching this obligation."
        width={680}
        back
      >
        <Spinner block label="Loading obligation" />
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
        <ErrorState error={error} inset />
      </CenteredLayout>
    );
  }
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
