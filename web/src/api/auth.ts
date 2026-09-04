import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export const getMe = () => apiClient.get<Schemas["User"]>("/auth/me");

export const register = (body: Schemas["RegisterRequest"]) =>
  apiClient.post<Schemas["User"]>("/auth/register", body);

export const registerFcmToken = (body: Schemas["FcmTokenRequest"]) =>
  apiClient.post<void>("/auth/fcm-token", body);
