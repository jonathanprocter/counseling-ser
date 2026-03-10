export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  defaultClinicianId: Number.parseInt(process.env.DEFAULT_CLINICIAN_ID ?? "1", 10) || 1,
};
