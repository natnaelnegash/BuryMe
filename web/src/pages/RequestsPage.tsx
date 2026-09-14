import { useState } from "react";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { RequestRow } from "../components/domain/RequestRow.js";
import { PageHeader } from "../components/layout/PageHeader.js";
import { Button } from "../components/ui/Button.js";
import { FilterChip } from "../components/ui/FilterChip.js";
import { useAuth } from "../hooks/useAuth.js";
import {
  useAcceptRequest,
  useCancelRequest,
  useCounterRequest,
  useDeclineRequest,
  useRequestsQuery,
} from "../hooks/useRequests.js";
import { formatMoney, formatSignedMoney } from "../lib/money.js";
import { canCancel, canRespond, requestStatusLabel } from "../lib/requests.js";
import styles from "./RequestsPage.module.css";

function mutationErrorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

// The accept/counter mutations take `{ requestId, ... }`, decline/cancel take
// a bare `requestId` — these read a mutation's in-flight variables per row.
function matchesRowById(variables: string | undefined, requestId: string): boolean {
  return variables === requestId;
}
function matchesRowByField(
  variables: { requestId: string } | undefined,
  requestId: string,
): boolean {
  return variables?.requestId === requestId;
}

// Figma's filter tabs: Received / Sent, which map onto the API's `role`.
type Tab = "recipient" | "initiator";

export function RequestsPage() {
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const [tab, setTab] = useState<Tab>("recipient");
  const { data, isLoading, error: queryError } = useRequestsQuery({ role: tab });
  const acceptMutation = useAcceptRequest();
  const declineMutation = useDeclineRequest();
  const counterMutation = useCounterRequest();
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
          {mutationErrorMessage(queryError)}
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
            const respondable = canRespond(r, uid);
            const cancellable = canCancel(r, uid);
            const incoming = r.receiving_user.user_id === uid && r.request_type !== "Repayment";
            const counterparty =
              r.initiating_user.user_id === uid ? r.receiving_user : r.initiating_user;

            const isBusy =
              (acceptMutation.isPending && matchesRowByField(acceptMutation.variables, id)) ||
              (declineMutation.isPending && matchesRowById(declineMutation.variables, id)) ||
              (counterMutation.isPending && matchesRowByField(counterMutation.variables, id)) ||
              (cancelMutation.isPending && matchesRowById(cancelMutation.variables, id));
            const rowError =
              (acceptMutation.isError &&
                matchesRowByField(acceptMutation.variables, id) &&
                mutationErrorMessage(acceptMutation.error)) ||
              (declineMutation.isError &&
                matchesRowById(declineMutation.variables, id) &&
                mutationErrorMessage(declineMutation.error)) ||
              (counterMutation.isError &&
                matchesRowByField(counterMutation.variables, id) &&
                mutationErrorMessage(counterMutation.error)) ||
              (cancelMutation.isError &&
                matchesRowById(cancelMutation.variables, id) &&
                mutationErrorMessage(cancelMutation.error));

            function handleAccept() {
              if (r.request_type !== "Borrow") {
                acceptMutation.mutate({ requestId: id });
                return;
              }
              // Borrow acceptance needs a disbursement method. The design puts
              // this on the dedicated Request Response screen (16:66); until
              // that route exists, prompt for it inline.
              const answer = window.prompt(
                'How was this disbursed? Type "given" (already given) or "app" (through the app).',
                "given",
              );
              if (!answer) return;
              const method = answer.trim().toLowerCase().startsWith("a")
                ? "Already Given"
                : "Through App";
              acceptMutation.mutate({ requestId: id, body: { disbursement_method: method } });
            }

            function handleCounter() {
              const amount = window.prompt("Counter amount (ETB)?");
              if (!amount) return;
              counterMutation.mutate({
                requestId: id,
                body: { amount: { amount: Number(amount), currency: "ETB" } },
              });
            }

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
                      {respondable && (
                        <>
                          <Button size="small" disabled={isBusy} onClick={handleAccept}>
                            Accept
                          </Button>
                          <Button
                            kind="secondary"
                            size="small"
                            disabled={isBusy}
                            onClick={() => declineMutation.mutate(id)}
                          >
                            Decline
                          </Button>
                          {r.status === "Pending" && (
                            <Button
                              kind="ghost"
                              size="small"
                              disabled={isBusy}
                              onClick={handleCounter}
                            >
                              Counter
                            </Button>
                          )}
                        </>
                      )}
                      {cancellable && (
                        <Button
                          kind="ghost"
                          size="small"
                          disabled={isBusy}
                          onClick={() => cancelMutation.mutate(id)}
                        >
                          Cancel
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
