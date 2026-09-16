import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { RequestRow } from "../components/domain/RequestRow.js";
import { PageHeader } from "../components/layout/PageHeader.js";
import { Button } from "../components/ui/Button.js";
import { FilterChip } from "../components/ui/FilterChip.js";
import { useAuth } from "../hooks/useAuth.js";
import { useCancelRequest, useRequestsQuery } from "../hooks/useRequests.js";
import { formatMoney, formatSignedMoney } from "../lib/money.js";
import { canCancel, canRespond, requestStatusLabel } from "../lib/requests.js";
import styles from "./RequestsPage.module.css";

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

// Figma's filter tabs: Received / Sent, which map onto the API's `role`.
type Tab = "recipient" | "initiator";

// Figma: List — Requests (27:142). Rows are the Request Row component; the
// only inline action is Cancel — responding (accept / decline / counter)
// happens on the dedicated Request Response screen at /requests/:id.
export function RequestsPage() {
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const [tab, setTab] = useState<Tab>("recipient");
  const { data, isLoading, error: queryError } = useRequestsQuery({ role: tab });
  const cancelMutation = useCancelRequest();

  const requests = data?.data ?? [];

  function detailFor(r: Schemas["Request"]): string {
    const parts = [`${r.request_type} request`];
    if (r.proposed_repayment_type) parts.push(r.proposed_repayment_type);
    parts.push(formatMoney(r.amount));
    return parts.join("  •  ");
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Requests"
        subtitle="Borrow requests, lending records, and repayment requests — sent and received."
      />

      <div className={styles.filters}>
        <FilterChip active={tab === "recipient"} onClick={() => setTab("recipient")}>
          Received
        </FilterChip>
        <FilterChip active={tab === "initiator"} onClick={() => setTab("initiator")}>
          Sent
        </FilterChip>
      </div>

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {queryError && (
        <p role="alert" className={styles.error}>
          {errorMessage(queryError)}
        </p>
      )}

      {!isLoading && requests.length === 0 ? (
        <p className={styles.empty}>
          {tab === "recipient"
            ? "No requests have come your way yet."
            : "You have not sent any requests yet."}
        </p>
      ) : (
        <div className={styles.list}>
          {requests.map((r) => {
            const id = r.request_id;
            const incoming = r.receiving_user.user_id === uid && r.request_type !== "Repayment";
            const counterparty =
              r.initiating_user.user_id === uid ? r.receiving_user : r.initiating_user;
            const cancelling = cancelMutation.isPending && cancelMutation.variables === id;
            const rowError =
              cancelMutation.isError && cancelMutation.variables === id
                ? errorMessage(cancelMutation.error)
                : null;

            return (
              <div key={id}>
                <RequestRow
                  name={counterparty.display_name}
                  detail={detailFor(r)}
                  amount={formatSignedMoney(r.amount, incoming ? "incoming" : "outgoing")}
                  amountDirection={incoming ? "incoming" : "outgoing"}
                  status={requestStatusLabel(r, uid)}
                  actions={
                    <>
                      {canRespond(r, uid) ? (
                        <Button size="small" onClick={() => navigate(`/requests/${id}`)}>
                          Respond
                        </Button>
                      ) : (
                        <Button
                          kind="ghost"
                          size="small"
                          onClick={() => navigate(`/requests/${id}`)}
                        >
                          View
                        </Button>
                      )}
                      {canCancel(r, uid) && (
                        <Button
                          kind="ghost"
                          size="small"
                          disabled={cancelling}
                          onClick={() => cancelMutation.mutate(id)}
                        >
                          {cancelling ? "Cancelling…" : "Cancel"}
                        </Button>
                      )}
                    </>
                  }
                />
                {rowError && (
                  <p role="alert" className={styles.error}>
                    {rowError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
