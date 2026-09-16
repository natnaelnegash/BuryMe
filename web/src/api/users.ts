import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export const searchUsers = (q: string, limit?: number) =>
  apiClient.get<Schemas["UserSummary"][]>(
    `/users/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ""}`,
  );

export const getUser = (userId: string) =>
  apiClient.get<Schemas["UserSummary"]>(`/users/${encodeURIComponent(userId)}`);

export const updateProfile = (body: Schemas["UpdateProfileRequest"]) =>
  apiClient.patch<Schemas["User"]>("/users/me", body);

export const getTelebirr = () => apiClient.get<Schemas["TelebirrAccount"]>("/users/me/telebirr");

export const verifyTelebirr = (body: Schemas["VerifyTelebirrRequest"]) =>
  apiClient.post<Schemas["TelebirrAccount"]>("/users/me/telebirr", body);

export const sendTelebirrOtp = () =>
  apiClient.post<Schemas["TelebirrOtpChallenge"]>("/users/me/telebirr/otp");

export const confirmTelebirrOtp = (body: Schemas["ConfirmTelebirrOtpRequest"]) =>
  apiClient.post<Schemas["TelebirrAccount"]>("/users/me/telebirr/verify", body);
