import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export const listObligations = (params?: { role?: "borrower" | "lender" }) =>
  apiClient.get<Schemas["ObligationPage"]>(
    `/obligations${params?.role ? `?role=${params.role}` : ""}`,
  );

export const getObligation = (obligationId: string) =>
  apiClient.get<Schemas["Obligation"]>(`/obligations/${encodeURIComponent(obligationId)}`);

export const requestRepayment = (obligationId: string, body?: Schemas["RepaymentRequestBody"]) =>
  apiClient.post<Schemas["Request"]>(
    `/obligations/${encodeURIComponent(obligationId)}/repayment-requests`,
    body ?? {},
  );
