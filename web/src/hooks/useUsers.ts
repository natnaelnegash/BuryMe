import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import { useDebouncedValue } from "./useDebouncedValue.js";
import {
  confirmTelebirrOtp,
  getUser,
  searchUsers,
  sendTelebirrOtp,
  updateProfile,
  verifyTelebirr,
} from "../api/users.js";

const SEARCH_DEBOUNCE_MS = 300;

export function useSearchUsersQuery(rawQuery: string) {
  const query = rawQuery.trim();
  const [term, searchNow] = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const enabled = term.length >= 2;

  const result = useQuery({
    queryKey: ["users", "search", term],
    queryFn: () => searchUsers(term),
    enabled,
    placeholderData: keepPreviousData,
  });

  return {
    ...result,
    // Held back below the 2-character minimum: keepPreviousData would otherwise
    // leave the last term's results on screen after the box is cleared.
    data: enabled ? result.data : undefined,
    term,
    searchNow,
    isSearching: (query.length >= 2 && query !== term) || (enabled && result.isFetching),
  };
}

export function useUserQuery(userId: string | null) {
  return useQuery({
    queryKey: ["users", userId],
    queryFn: () => getUser(userId as string),
    enabled: userId !== null,
  });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: Schemas["UpdateProfileRequest"]) => updateProfile(body),
  });
}

export function useVerifyTelebirr() {
  return useMutation({
    mutationFn: (body: Schemas["VerifyTelebirrRequest"]) => verifyTelebirr(body),
  });
}

export function useSendTelebirrOtp() {
  return useMutation({ mutationFn: () => sendTelebirrOtp() });
}

export function useConfirmTelebirrOtp() {
  return useMutation({
    mutationFn: (body: Schemas["ConfirmTelebirrOtpRequest"]) => confirmTelebirrOtp(body),
  });
}
