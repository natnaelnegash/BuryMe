import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import {
  acknowledgePayment,
  disputePayment,
  initiateChapaPayment,
  listPayments,
  recordExternalPayment,
} from "../api/payments.js";

// Every payment mutation touches the obligation's balance/status too, so
// they invalidate both the payments list and the obligations namespace.
const PAYMENTS_KEY = ["payments"] as const;

export function usePaymentsQuery(obligationId: string | undefined) {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, obligationId],
    queryFn: () => listPayments(obligationId as string),
    enabled: obligationId !== undefined,
  });
}

function useInvalidatePayments() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY }),
      queryClient.invalidateQueries({ queryKey: ["obligations"] }),
      queryClient.invalidateQueries({ queryKey: ["schedule"] }),
    ]);
}

export function useInitiateChapaPayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: ({
      obligationId,
      installmentId,
    }: {
      obligationId: string;
      installmentId?: string;
    }) => initiateChapaPayment(obligationId, installmentId ? { installment_id: installmentId } : {}),
    onSuccess: invalidate,
  });
}

export function useRecordExternalPayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: ({
      obligationId,
      body,
    }: {
      obligationId: string;
      body: Schemas["RecordExternalPaymentInput"];
    }) => recordExternalPayment(obligationId, body),
    onSuccess: invalidate,
  });
}

export function useAcknowledgePayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({ mutationFn: acknowledgePayment, onSuccess: invalidate });
}

export function useDisputePayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({ mutationFn: disputePayment, onSuccess: invalidate });
}
