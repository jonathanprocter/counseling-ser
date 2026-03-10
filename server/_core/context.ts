import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  clinicianId: number;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    clinicianId: ENV.defaultClinicianId,
  };
}
