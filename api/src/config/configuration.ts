import { registerAs } from "@nestjs/config";

export const appConfig = registerAs("app", () => ({
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT || "0"),
  corsOrigins: process.env.CORS_ORIGINS, // comma-separated list of allowed origins
}));

export const databaseConfig = registerAs("database", () => ({
  url: process.env.DATABASE_URL,
}));

export const jwtConfig = registerAs("jwt", () => ({
  secret: process.env.JWT_SECRET || "super-secret-key",
  expiresIn: process.env.JWT_EXPIRES_IN || "7d",
}));

export const resendConfig = registerAs("resend", () => ({
  apiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.RESEND_FROM_EMAIL || "Tarione <noreply@tarione.com>",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
}));

export const googleConfig = registerAs("google", () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackUrl:
    process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:3000/api/v1/auth/google/callback",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
}));

export const paystackConfig = registerAs("paystack", () => ({
  secretKey: process.env.PAYSTACK_SECRET_KEY,
  publicKey: process.env.PAYSTACK_PUBLIC_KEY,
  baseUrl: "https://api.paystack.co",
  callbackUrl:
    process.env.PAYSTACK_CALLBACK_URL ||
    "http://localhost:5173/payment/callback",
  // Production: https://app.tarione.com/payment/callback
}));
