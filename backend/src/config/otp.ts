// Pepper mixed into stored OTP hashes so a leaked DB row alone can't be
// brute-forced offline. Read lazily (not at import time like config/env.ts)
// because lib/telebirrOtp.ts is loaded by route tests that mock the DB and
// Firebase and never set the full env.
export function otpPepper(): string {
  const value = process.env.OTP_PEPPER;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing required environment variable: OTP_PEPPER");
  }
  return "dev-only-pepper";
}
