export function otpPepper(): string {
  const value = process.env.OTP_PEPPER;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing required environment variable: OTP_PEPPER");
  }
  return "dev-only-pepper";
}
