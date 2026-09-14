import { useMutation, useQuery } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import { searchUsers, updateProfile, verifyTelebirr } from "../api/users.js";

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
