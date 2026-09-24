import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export const getSchedule = (obligationId: string) =>
  apiClient.get<Schemas["RepaymentSchedule"]>(
    `/obligations/${encodeURIComponent(obligationId)}/schedule`,
  );
