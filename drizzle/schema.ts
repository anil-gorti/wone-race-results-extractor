import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Race results extracted from timing platform URLs.
 * Stores normalized participant data with caching support.
 */
export const raceResults = mysqlTable("race_results", {
  id: int("id").autoincrement().primaryKey(),
  /** Original URL from race timing platform */
  url: text("url").notNull(),
  /** SHA-256 hash of URL for efficient lookups */
  urlHash: varchar("urlHash", { length: 64 }).notNull(),
  /** Job ID this result belongs to */
  jobId: varchar("jobId", { length: 21 }),
  /** Race/event name (e.g., "Tata Mumbai Marathon") */
  raceName: text("raceName"),
  /** Participant name */
  name: text("name"),
  /** Category/distance/age group */
  category: text("category"),
  /** Finish time in HH:MM:SS format */
  finishTime: varchar("finishTime", { length: 20 }),
  /** Bib number */
  bibNumber: varchar("bibNumber", { length: 50 }),
  /** Overall rank */
  rankOverall: int("rankOverall"),
  /** Category rank */
  rankCategory: int("rankCategory"),
  /** Pace in MM:SS format per km/mile */
  pace: varchar("pace", { length: 20 }),
  /** Race timing platform identifier */
  platform: varchar("platform", { length: 100 }),
  /** Processing status */
  status: mysqlEnum("status", ["completed", "pending", "error"]).notNull().default("pending"),
  /** Error message if extraction failed */
  errorMessage: text("errorMessage"),
  /** When data was extracted */
  extractedAt: timestamp("extractedAt").defaultNow().notNull(),
  /** When cache entry was created */
  cachedAt: timestamp("cachedAt").defaultNow().notNull(),
  /** When cache expires (24 hours from cachedAt) */
  expiresAt: timestamp("expiresAt").notNull(),
  /** User who requested this extraction */
  userId: int("userId").notNull(),
});

export type RaceResult = typeof raceResults.$inferSelect;
export type InsertRaceResult = typeof raceResults.$inferInsert;

/**
 * Processing jobs for tracking bulk URL extraction operations.
 * Provides real-time status updates for frontend.
 */
export const processingJobs = mysqlTable("processing_jobs", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique job identifier (nanoid) */
  jobId: varchar("jobId", { length: 21 }).notNull().unique(),
  /** Total number of URLs to process */
  totalUrls: int("totalUrls").notNull(),
  /** Number of URLs processed so far */
  processedUrls: int("processedUrls").notNull().default(0),
  /** Number of successful extractions */
  successCount: int("successCount").notNull().default(0),
  /** Number of failed extractions */
  errorCount: int("errorCount").notNull().default(0),
  /** Job status */
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed"]).notNull().default("queued"),
  /** User who created this job */
  userId: int("userId").notNull(),
  /** When job was created */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** When job completed */
  completedAt: timestamp("completedAt"),
});

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = typeof processingJobs.$inferInsert;
