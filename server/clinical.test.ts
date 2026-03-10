import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    clinicianId: 1,
    ...overrides,
  };
}

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  createClient: vi.fn().mockResolvedValue({ id: 1, firstName: "Alice", lastName: "Smith", clinicianId: 1, dateOfBirth: null, primaryConcern: null, diagnosisCodes: null, consentSigned: false, hipaaAcknowledged: false, createdAt: new Date(), updatedAt: new Date() }),
  getClientsByClinicianId: vi.fn().mockResolvedValue([]),
  getClientById: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue({ id: 1, clientId: 1, clinicianId: 1, sessionDate: new Date(), durationSeconds: null, audioUrl: null, audioKey: null, status: "pending", notes: null, createdAt: new Date(), updatedAt: new Date() }),
  getSessionsByClientId: vi.fn().mockResolvedValue([]),
  getSessionById: vi.fn().mockResolvedValue(null),
  updateSession: vi.fn().mockResolvedValue(undefined),
  getEmotionDataBySessionId: vi.fn().mockResolvedValue([]),
  getEmotionReadingsBySessionId: vi.fn().mockResolvedValue([]),
  getAlertsByClinicianId: vi.fn().mockResolvedValue([]),
  acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
  getSessionSummary: vi.fn().mockResolvedValue(null),
}));

// ─── Client router tests ─────────────────────────────────────────────────────

describe("clients.list", () => {
  it("returns empty array when no clients exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.clients.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe("clients.create", () => {
  it("creates a client for the default clinician", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.clients.create({
      firstName: "Alice",
      lastName: "Smith",
      consentSigned: true,
      hipaaAcknowledged: true,
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("id");
  });

  it("rejects invalid input — missing required fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      // @ts-expect-error intentionally missing fields
      caller.clients.create({ firstName: "Alice" })
    ).rejects.toThrow();
  });
});

// ─── Sessions router tests ───────────────────────────────────────────────────

describe("sessions.listByClient", () => {
  it("returns empty array when no sessions exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sessions.listByClient({ clientId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("sessions.create", () => {
  it("creates a session for the default clinician", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sessions.create({
      clientId: 1,
      sessionDate: new Date().toISOString(),
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("id");
  });
});

// ─── Emotion data tests ──────────────────────────────────────────────────────

describe("emotions.getBySession", () => {
  it("throws NOT_FOUND when session does not exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // getSessionById returns null → should throw NOT_FOUND
    await expect(caller.emotions.getBySession({ sessionId: 999 })).rejects.toThrow();
  });
});

// ─── Alerts tests ────────────────────────────────────────────────────────────

describe("alerts.list", () => {
  it("returns empty array when no alerts exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.alerts.list({ acknowledged: false });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe("alerts.acknowledge", () => {
  it("acknowledges an alert", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.alerts.acknowledge({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

// ─── Sessions longitudinal (via sessions.listByClient) ───────────────────────

describe("sessions.listByClient (longitudinal base)", () => {
  it("returns empty array when no sessions exist for client", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sessions.listByClient({ clientId: 99 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});
