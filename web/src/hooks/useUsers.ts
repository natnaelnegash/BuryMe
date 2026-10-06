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

/** How long typing has to pause before the search term is sent. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search-as-you-type. Callers pass the live input value on every keystroke;
 * the debounce here is what keeps that from being one request per character,
 * so the three search screens can't drift apart on the policy.
 *
 * `enabled` still gates on the contract's 2-character minimum for
 * `GET /users/search`, and `keepPreviousData` holds the last results on
 * screen while the next term loads — otherwise the list empties between
 * every keystroke and flickers.
 */
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
    /**
     * Held back below the 2-character minimum: `keepPreviousData` would
     * otherwise keep the last term's results on screen after the box is
     * cleared, since the disabled query has no data of its own.
     */
    data: enabled ? result.data : undefined,
    /** The term the current `data` belongs to — not necessarily what's typed. */
    term,
    /** Adopt what's typed immediately, skipping the debounce. */
    searchNow,
    /**
     * True from the first keystroke until results for the typed term are in,
     * including the debounce wait — so the spinner appears while typing
     * rather than only once the request leaves.
     */
    isSearching: (query.length >= 2 && query !== term) || (enabled && result.isFetching),
  };
}

// Resolves a user id to its summary — used when a flow is entered with a
// recipient already chosen (e.g. `/requests/new?to=<id>` from Search).
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
