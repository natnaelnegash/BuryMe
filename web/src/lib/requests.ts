import type { Schemas } from "@buryme/shared";

export function canRespond(request: Schemas["Request"], uid: string | undefined): boolean {
  if (!uid) return false;
  return (
    (request.status === "Pending" && request.receiving_user.user_id === uid) ||
    (request.status === "Countered" && request.initiating_user.user_id === uid)
  );
}

// A repayment request carries no negotiable terms — its proposal is the
// obligation, an optional installment and a note — so it can only be accepted
// or declined. The backend refuses a counter on one with 409.
export function canCounter(request: Schemas["Request"], uid: string | undefined): boolean {
  return (
    request.request_type !== "Repayment" && request.status === "Pending" && canRespond(request, uid)
  );
}

export function canCancel(request: Schemas["Request"], uid: string | undefined): boolean {
  if (!uid) return false;
  return request.status === "Pending" && request.initiating_user.user_id === uid;
}

export function requestStatusLabel(request: Schemas["Request"], uid: string | undefined): string {
  if (request.status === "Pending") {
    return request.receiving_user.user_id === uid
      ? "Pending your response"
      : "Awaiting their response";
  }
  if (request.status === "Countered") {
    return request.initiating_user.user_id === uid ? "Counter-proposal received" : "Counter sent";
  }
  return request.status;
}
