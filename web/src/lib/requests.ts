import type { Schemas } from "@buryme/shared";

// Who may act on a request, mirroring the backend's own gating in
// backend/src/routes/requests.ts: while Pending the recipient responds;
// once Countered the ball is back with the original initiator.
export function canRespond(request: Schemas["Request"], uid: string | undefined): boolean {
  if (!uid) return false;
  return (
    (request.status === "Pending" && request.receiving_user.user_id === uid) ||
    (request.status === "Countered" && request.initiating_user.user_id === uid)
  );
}

export function canCancel(request: Schemas["Request"], uid: string | undefined): boolean {
  if (!uid) return false;
  return request.status === "Pending" && request.initiating_user.user_id === uid;
}

// The label the design puts on a request's status pill.
export function requestStatusLabel(
  request: Schemas["Request"],
  uid: string | undefined,
): string {
  if (request.status === "Pending") {
    return request.receiving_user.user_id === uid ? "Pending your response" : "Awaiting their response";
  }
  if (request.status === "Countered") {
    return request.initiating_user.user_id === uid ? "Counter-proposal received" : "Counter sent";
  }
  return request.status;
}
