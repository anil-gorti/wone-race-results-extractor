import { eq, and, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, raceResults, processingJobs, InsertRaceResult, InsertProcessingJob, RaceResult, ProcessingJob } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Race Results helpers

export async function getCachedResult(urlHash: string, userId: number): Promise<RaceResult | null> {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const results = await db
    .select()
    .from(raceResults)
    .where(
      and(
        eq(raceResults.urlHash, urlHash),
        eq(raceResults.userId, userId),
        gt(raceResults.expiresAt, now),
        eq(raceResults.status, 'completed') // Only return successful results, not errors
      )
    )
    .limit(1);

  return results.length > 0 ? results[0] : null;
}

export async function insertRaceResult(result: InsertRaceResult): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert race result: database not available");
    return;
  }

  await db.insert(raceResults).values(result);
}

export async function getResultsByJobId(jobId: string): Promise<RaceResult[]> {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .select()
    .from(raceResults)
    .where(eq(raceResults.jobId, jobId));

  return results;
}

// Processing Jobs helpers

export async function createProcessingJob(job: InsertProcessingJob): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create processing job: database not available");
    return;
  }

  await db.insert(processingJobs).values(job);
}

export async function getProcessingJob(jobId: string): Promise<ProcessingJob | null> {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.jobId, jobId))
    .limit(1);

  return results.length > 0 ? results[0] : null;
}

export async function updateProcessingJob(
  jobId: string,
  updates: {
    processedUrls?: number;
    successCount?: number;
    errorCount?: number;
    status?: 'queued' | 'processing' | 'completed' | 'failed';
    completedAt?: Date;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update processing job: database not available");
    return;
  }

  await db
    .update(processingJobs)
    .set(updates)
    .where(eq(processingJobs.jobId, jobId));
}

export async function getUserResults(userId: number, limit: number = 100): Promise<RaceResult[]> {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .select()
    .from(raceResults)
    .where(eq(raceResults.userId, userId))
    .limit(limit);

  return results;
}
