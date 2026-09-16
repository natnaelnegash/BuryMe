import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import {
  acceptRequest,
  cancelRequest,
  counterRequest,
  createRequest,
  declineRequest,
  getRequest,
  listRequests,
  type CreateRequestBody,
} from "../api/requests.js";

// Single query key namespace for the whole Requests resource — any mutation
// below invalidates all of it rather than tracking narrower keys, since the
// list is small enough that a full refetch is cheap and this keeps the
// invalidation logic trivially correct.
const REQUESTS_KEY = ["requests"] as const;

export function useRequestsQuery(params?: { role?: "initiator" | "recipient" }) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, params?.role ?? "all"],
    queryFn: () => listRequests(params),
  });
}

export function useRequestQuery(requestId: string | undefined) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, "detail", requestId],
    queryFn: () => getRequest(requestId as string),
    enabled: requestId !== undefined,
  });
}

function useInvalidateRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
}

export function useCreateRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (body: CreateRequestBody) => createRequest(body),
    onSuccess: invalidate,
  });
}

export function useAcceptRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({
      requestId,
      body,
    }: {
      requestId: string;
      body?: Schemas["AcceptRequestInput"];
    }) => acceptRequest(requestId, body),
    onSuccess: invalidate,
  });
}

export function useDeclineRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (requestId: string) => declineRequest(requestId),
    onSuccess: invalidate,
  });
}

export function useCounterRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({
      requestId,
      body,
    }: {
      requestId: string;
      body: Schemas["CounterProposalInput"];
    }) => counterRequest(requestId, body),
    onSuccess: invalidate,
  });
}

export function useCancelRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (requestId: string) => cancelRequest(requestId),
    onSuccess: invalidate,
  });
}
