import type { Schemas } from "@buryme/shared";

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
