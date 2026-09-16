import { useMutation, useQuery } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import {
  confirmTelebirrOtp,
  getUser,
  searchUsers,
  sendTelebirrOtp,
  updateProfile,
  verifyTelebirr,
} from "../api/users.js";

// `enabled` gates the query on having a real (already-validated,
// submitted) search term — callers pass the *submitted* value, not every
// keystroke, so this doesn't search on every render.
export function useSearchUsersQuery(query: string) {
  return useQuery({
    queryKey: ["users", "search", query],
    queryFn: () => searchUsers(query),
    enabled: query.length >= 2,
  });
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
