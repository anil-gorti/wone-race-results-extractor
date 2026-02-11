import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { extractRaceResults, hashUrl, normalizeUrl, retryWithBackoff } from "./parser";
import {
  getCachedResult,
  insertRaceResult,
  createProcessingJob,
  getProcessingJob,
  updateProcessingJob,
  getResultsByJobId,
  getUserResults,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  raceResults: router({
    /**
     * Extract race results from one or more URLs
     */
    extractResults: protectedProcedure
      .input(
        z.object({
          urls: z.array(z.string().url()).min(1).max(100),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { urls } = input;
        const userId = ctx.user.id;
        const jobId = nanoid();

        // Create processing job
        await createProcessingJob({
          jobId,
          totalUrls: urls.length,
          processedUrls: 0,
          successCount: 0,
          errorCount: 0,
          status: "queued",
          userId,
        });

        // Start processing in background (non-blocking)
        processUrls(urls, jobId, userId).catch((error) => {
          console.error("Error processing URLs:", error);
        });

        return {
          jobId,
          status: "queued" as const,
          totalUrls: urls.length,
        };
      }),

    /**
     * Get job status and progress
     */
    getJobStatus: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(async ({ input, ctx }) => {
        const job = await getProcessingJob(input.jobId);

        if (!job) {
          throw new Error("Job not found");
        }

        if (job.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        return {
          jobId: job.jobId,
          status: job.status,
          totalUrls: job.totalUrls,
          processedUrls: job.processedUrls,
          successCount: job.successCount,
          errorCount: job.errorCount,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        };
      }),

    /**
     * Get results for a completed job
     */
    getResults: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(async ({ input, ctx }) => {
        const job = await getProcessingJob(input.jobId);

        if (!job) {
          throw new Error("Job not found");
        }

        if (job.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        const results = await getResultsByJobId(input.jobId);

        return results.map((r) => ({
          id: r.id,
          url: r.url,
          name: r.name,
          category: r.category,
          finishTime: r.finishTime,
          bibNumber: r.bibNumber,
          rankOverall: r.rankOverall,
          rankCategory: r.rankCategory,
          pace: r.pace,
          platform: r.platform,
          status: r.status,
          errorMessage: r.errorMessage,
          extractedAt: r.extractedAt,
        }));
      }),

    /**
     * Get all results for current user
     */
    getUserResults: protectedProcedure.query(async ({ ctx }) => {
      const results = await getUserResults(ctx.user.id, 100);

      return results.map((r) => ({
        id: r.id,
        url: r.url,
        name: r.name,
        category: r.category,
        finishTime: r.finishTime,
        bibNumber: r.bibNumber,
        rankOverall: r.rankOverall,
        rankCategory: r.rankCategory,
        pace: r.pace,
        platform: r.platform,
        status: r.status,
        errorMessage: r.errorMessage,
        extractedAt: r.extractedAt,
      }));
    }),

    /**
     * Refresh a single result (force re-fetch)
     */
    refreshResult: protectedProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input, ctx }) => {
        const normalizedUrl = normalizeUrl(input.url);
        const urlHash = hashUrl(normalizedUrl);

        try {
          const data = await retryWithBackoff(() => extractRaceResults(normalizedUrl));

          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          await insertRaceResult({
            url: normalizedUrl,
            urlHash,
            name: data.name,
            category: data.category,
            finishTime: data.finishTime,
            bibNumber: data.bibNumber,
            rankOverall: data.rankOverall,
            rankCategory: data.rankCategory,
            pace: data.pace,
            platform: data.platform,
            status: "completed",
            errorMessage: null,
            extractedAt: new Date(),
            cachedAt: new Date(),
            expiresAt,
            userId: ctx.user.id,
          });

          return {
            success: true,
            result: data,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          await insertRaceResult({
            url: normalizedUrl,
            urlHash,
            name: null,
            category: null,
            finishTime: null,
            bibNumber: null,
            rankOverall: null,
            rankCategory: null,
            pace: null,
            platform: "unknown",
            status: "error",
            errorMessage,
            extractedAt: new Date(),
            cachedAt: new Date(),
            expiresAt,
            userId: ctx.user.id,
          });

          throw new Error(errorMessage);
        }
      }),

    /**
     * Export results in various formats
     */
    exportResults: protectedProcedure
      .input(
        z.object({
          jobId: z.string(),
          format: z.enum(["csv", "json", "excel"]),
        })
      )
      .query(async ({ input, ctx }) => {
        const job = await getProcessingJob(input.jobId);

        if (!job) {
          throw new Error("Job not found");
        }

        if (job.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        const results = await getResultsByJobId(input.jobId);

        const data = results.map((r) => ({
          Name: r.name || "",
          Category: r.category || "",
          "Finish Time": r.finishTime || "",
          "BIB Number": r.bibNumber || "",
          "Rank (Overall)": r.rankOverall || "",
          "Rank (Category)": r.rankCategory || "",
          Pace: r.pace || "",
          Platform: r.platform || "",
          Status: r.status,
          URL: r.url,
        }));

        if (input.format === "json") {
          return {
            data: JSON.stringify(data, null, 2),
            filename: `race_results_${input.jobId}.json`,
            mimeType: "application/json",
          };
        }

        if (input.format === "csv") {
          const csv = Papa.unparse(data);
          return {
            data: csv,
            filename: `race_results_${input.jobId}.csv`,
            mimeType: "text/csv",
          };
        }

        if (input.format === "excel") {
          const worksheet = XLSX.utils.json_to_sheet(data);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "Race Results");
          const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
          return {
            data: excelBuffer.toString("base64"),
            filename: `race_results_${input.jobId}.xlsx`,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          };
        }

        throw new Error("Unsupported format");
      }),
  }),
});

/**
 * Background processing function for URLs
 */
async function processUrls(urls: string[], jobId: string, userId: number): Promise<void> {
  await updateProcessingJob(jobId, { status: "processing" });

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const url of urls) {
    try {
      const normalizedUrl = normalizeUrl(url);
      const urlHash = hashUrl(normalizedUrl);

      // Check cache first
      const cached = await getCachedResult(urlHash, userId);
      if (cached) {
        console.log(`Using cached result for ${normalizedUrl}`);
        successCount++;
        processedCount++;
        await updateProcessingJob(jobId, {
          processedUrls: processedCount,
          successCount,
          errorCount,
        });
        continue;
      }

      // Extract with retry logic
      const data = await retryWithBackoff(() => extractRaceResults(normalizedUrl));

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await insertRaceResult({
        url: normalizedUrl,
        urlHash,
        name: data.name,
        category: data.category,
        finishTime: data.finishTime,
        bibNumber: data.bibNumber,
        rankOverall: data.rankOverall,
        rankCategory: data.rankCategory,
        pace: data.pace,
        platform: data.platform,
        status: "completed",
        errorMessage: null,
        extractedAt: new Date(),
        cachedAt: new Date(),
        expiresAt,
        userId,
      });

      successCount++;
    } catch (error) {
      console.error(`Error processing ${url}:`, error);
      
      const normalizedUrl = normalizeUrl(url);
      const urlHash = hashUrl(normalizedUrl);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await insertRaceResult({
        url: normalizedUrl,
        urlHash,
        name: null,
        category: null,
        finishTime: null,
        bibNumber: null,
        rankOverall: null,
        rankCategory: null,
        pace: null,
        platform: "unknown",
        status: "error",
        errorMessage,
        extractedAt: new Date(),
        cachedAt: new Date(),
        expiresAt,
        userId,
      });

      errorCount++;
    }

    processedCount++;
    await updateProcessingJob(jobId, {
      processedUrls: processedCount,
      successCount,
      errorCount,
    });
  }

  // Mark job as completed
  await updateProcessingJob(jobId, {
    status: "completed",
    completedAt: new Date(),
  });
}

export type AppRouter = typeof appRouter;
