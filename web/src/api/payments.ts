import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

const obligationPath = (obligationId: string) => `/obligations/${encodeURIComponent(obligationId)}`;

export const listPayments = (obligationId: string) =>
  apiClient.get<Schemas["Payment"][]>(`${obligationPath(obligationId)}/payments`);

// Opens the payer's Chapa checkout; the returned Payment carries `checkout_url`.
export const initiateChapaPayment = (
  obligationId: string,
  body: Schemas["InitiateChapaPaymentInput"] = {},
) => apiClient.post<Schemas["Payment"]>(`${obligationPath(obligationId)}/payments/chapa`, body);

export const recordExternalPayment = (
  obligationId: string,
  body: Schemas["RecordExternalPaymentInput"],
) => apiClient.post<Schemas["Payment"]>(`${obligationPath(obligationId)}/payments/external`, body);

export const acknowledgePayment = (paymentId: string) =>
  apiClient.post<Schemas["Payment"]>(`/payments/${encodeURIComponent(paymentId)}/acknowledge`);

export const disputePayment = (paymentId: string) =>
  apiClient.post<Schemas["Payment"]>(`/payments/${encodeURIComponent(paymentId)}/dispute`);
