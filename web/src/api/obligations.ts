import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export interface ListObligationsParams {
  role?: "borrower" | "lender";
  /** `personal` drops group-expense shares, which are listed by expense. */
  origin?: "personal" | "group";
  limit?: number;
}

export const listObligations = (params?: ListObligationsParams) => {
  const query = new URLSearchParams();
  if (params?.role) query.set("role", params.role);
  if (params?.origin) query.set("origin", params.origin);
  if (params?.limit) query.set("limit", String(params.limit));
  const suffix = query.size > 0 ? `?${query}` : "";
  return apiClient.get<Schemas["ObligationPage"]>(`/obligations${suffix}`);
};

export const getObligation = (obligationId: string) =>
  apiClient.get<Schemas["Obligation"]>(`/obligations/${encodeURIComponent(obligationId)}`);

export const requestRepayment = (obligationId: string, body?: Schemas["RepaymentRequestBody"]) =>
  apiClient.post<Schemas["Request"]>(
    `/obligations/${encodeURIComponent(obligationId)}/repayment-requests`,
    body ?? {},
  );

// Opens the lender's Chapa checkout for a Through-App disbursement; the
// returned Payment carries `checkout_url` to redirect to.
export const disburseObligation = (obligationId: string) =>
  apiClient.post<Schemas["Payment"]>(`/obligations/${encodeURIComponent(obligationId)}/disburse`);
