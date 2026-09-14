import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export type CreateRequestBody =
  Schemas["BorrowRequestInput"] | Schemas["LendRequestInput"] | Schemas["RepaymentRequestInput"];

export const listRequests = (params?: { role?: "initiator" | "recipient" }) =>
  apiClient.get<Schemas["RequestPage"]>(`/requests${params?.role ? `?role=${params.role}` : ""}`);

export const getRequest = (requestId: string) =>
  apiClient.get<Schemas["Request"]>(`/requests/${encodeURIComponent(requestId)}`);

export const createRequest = (body: CreateRequestBody) =>
  apiClient.post<Schemas["Request"]>("/requests", body);

export const counterRequest = (requestId: string, body: Schemas["CounterProposalInput"]) =>
  apiClient.post<Schemas["Request"]>(`/requests/${encodeURIComponent(requestId)}/counter`, body);

export const acceptRequest = (requestId: string, body?: Schemas["AcceptRequestInput"]) =>
  apiClient.post<Schemas["Request"]>(
    `/requests/${encodeURIComponent(requestId)}/accept`,
    body ?? {},
  );

export const declineRequest = (requestId: string) =>
  apiClient.post<Schemas["Request"]>(`/requests/${encodeURIComponent(requestId)}/decline`);

export const cancelRequest = (requestId: string) =>
  apiClient.post<Schemas["Request"]>(`/requests/${encodeURIComponent(requestId)}/cancel`);
