import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as parser from "./parser";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("raceResults.extractResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a processing job and return job ID", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock database functions
    vi.spyOn(db, "createProcessingJob").mockResolvedValue(undefined);

    const result = await caller.raceResults.extractResults({
      urls: ["https://sportstimingsolutions.in/results?q=test"],
    });

    expect(result).toHaveProperty("jobId");
    expect(result.status).toBe("queued");
    expect(result.totalUrls).toBe(1);
    expect(db.createProcessingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: expect.any(String),
        totalUrls: 1,
        userId: 1,
        status: "queued",
      })
    );
  });

  it("should reject empty URL array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.raceResults.extractResults({ urls: [] })
    ).rejects.toThrow();
  });

  it("should reject invalid URLs", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.raceResults.extractResults({ urls: ["not-a-valid-url"] })
    ).rejects.toThrow();
  });
});

describe("raceResults.getJobStatus", () => {
  it("should return job status for authorized user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockJob = {
      id: 1,
      jobId: "test-job-123",
      totalUrls: 5,
      processedUrls: 3,
      successCount: 2,
      errorCount: 1,
      status: "processing" as const,
      userId: 1,
      createdAt: new Date(),
      completedAt: null,
    };

    vi.spyOn(db, "getProcessingJob").mockResolvedValue(mockJob);

    const result = await caller.raceResults.getJobStatus({
      jobId: "test-job-123",
    });

    expect(result).toMatchObject({
      jobId: "test-job-123",
      status: "processing",
      totalUrls: 5,
      processedUrls: 3,
      successCount: 2,
      errorCount: 1,
    });
  });

  it("should reject unauthorized access to job", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockJob = {
      id: 1,
      jobId: "test-job-123",
      totalUrls: 5,
      processedUrls: 3,
      successCount: 2,
      errorCount: 1,
      status: "processing" as const,
      userId: 999, // Different user
      createdAt: new Date(),
      completedAt: null,
    };

    vi.spyOn(db, "getProcessingJob").mockResolvedValue(mockJob);

    await expect(
      caller.raceResults.getJobStatus({ jobId: "test-job-123" })
    ).rejects.toThrow("Unauthorized");
  });

  it("should throw error for non-existent job", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(db, "getProcessingJob").mockResolvedValue(null);

    await expect(
      caller.raceResults.getJobStatus({ jobId: "non-existent" })
    ).rejects.toThrow("Job not found");
  });
});

describe("parser.detectPlatform", () => {
  it("should detect Sports Timing Solutions platform", () => {
    const url = "https://sportstimingsolutions.in/results?q=test";
    const platform = parser.detectPlatform(url);

    expect(platform).not.toBeNull();
    expect(platform?.name).toBe("Sports Timing Solutions");
  });

  it("should detect Timing India platform", () => {
    const url = "https://www.timingindia.com/my-result-details/abc123";
    const platform = parser.detectPlatform(url);

    expect(platform).not.toBeNull();
    expect(platform?.name).toBe("Timing India");
  });

  it("should detect MySamay platform", () => {
    const url = "https://mysamay.in/race/results/4fbe9261-c999-4868-9a1e-acd64b0b79f8";
    const platform = parser.detectPlatform(url);

    expect(platform).not.toBeNull();
    expect(platform?.name).toBe("MySamay");
  });

  it("should detect NovaRace platform", () => {
    const url = "https://www.novarace.in/results/skinathon-2025";
    const platform = parser.detectPlatform(url);

    expect(platform).not.toBeNull();
    expect(platform?.name).toBe("NovaRace");
  });

  it("should return null for unsupported platform", () => {
    const url = "https://example.com/results";
    const platform = parser.detectPlatform(url);

    expect(platform).toBeNull();
  });
});

describe("parser.normalizeUrl", () => {
  it("should normalize valid URL", () => {
    const url = "https://example.com/path?query=value";
    const normalized = parser.normalizeUrl(url);

    expect(normalized).toBe("https://example.com/path?query=value");
  });

  it("should throw error for invalid URL", () => {
    expect(() => parser.normalizeUrl("not-a-url")).toThrow("Invalid URL");
  });
});

describe("parser.hashUrl", () => {
  it("should generate consistent hash for same URL", () => {
    const url = "https://example.com/test";
    const hash1 = parser.hashUrl(url);
    const hash2 = parser.hashUrl(url);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
  });

  it("should generate different hashes for different URLs", () => {
    const url1 = "https://example.com/test1";
    const url2 = "https://example.com/test2";
    const hash1 = parser.hashUrl(url1);
    const hash2 = parser.hashUrl(url2);

    expect(hash1).not.toBe(hash2);
  });
});
