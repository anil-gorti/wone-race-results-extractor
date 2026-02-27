import SHA256 from 'crypto-js/sha256';
import { getBrowser } from './scraper';

/**
 * Platform-specific parser configurations
 */
export interface ParserConfig {
  name: string;
  urlPattern: RegExp;
  selectors: {
    name?: string;
    category?: string;
    finishTime?: string;
    bibNumber?: string;
    rankOverall?: string;
    rankCategory?: string;
    pace?: string;
  };
  extractionLogic?: (page: any) => Promise<Partial<RaceResultData>>;
}

export interface RaceResultData {
  raceName: string | null;
  name: string | null;
  category: string | null;
  finishTime: string | null;
  bibNumber: string | null;
  rankOverall: number | null;
  rankCategory: number | null;
  pace: string | null;
  platform: string;
}

/**
 * Try multiple regex patterns and return the first match's capture group
 */
function matchFirst(text: string, patterns: RegExp[], group: number = 1): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[group]) {
      return match[group].trim();
    }
  }
  return null;
}

/**
 * Try multiple regex patterns and return the first match's capture group as a number
 */
function matchFirstInt(text: string, patterns: RegExp[], group: number = 1): number | null {
  const value = matchFirst(text, patterns, group);
  if (value) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Supported race timing platforms
 */
const PARSERS: ParserConfig[] = [
  {
    name: 'Sports Timing Solutions',
    urlPattern: /sportstimingsolutions\.in/i,
    selectors: {},
    extractionLogic: async (page) => {
      await page.waitForTimeout(3000);
      const bodyText = await page.evaluate(() => document.body.innerText);

      const raceName = matchFirst(bodyText, [
        /^([^\n]+(?:Marathon|Run|Race|Half Marathon|10K|5K|Ultra)[^\n]*)/im,
        /^([^\n]{5,80})\n/m, // Fallback: first substantial line
      ]);

      const name = matchFirst(bodyText, [
        /Share[\s\n]+(?:RS[\s\n]+)?([A-Z][a-z]+(?:\s+[A-Z](?:[a-z]+)?)*)\s+BIB\s+No/i,
        /Share[\s\n]+([A-Za-z][A-Za-z\s]+?)\s*\n.*BIB/i,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+BIB/i,
      ]);

      const bibNumber = matchFirst(bodyText, [
        /BIB\s+No[:\s]+(\d+)/i,
        /BIB[:\s#]+(\d+)/i,
      ]);

      const finishTime = matchFirst(bodyText, [
        /Finish\s+Time[:\s]+(\d{1,2}:\d{2}:\d{2})/i,
        /Chip\s+Time[:\s]+(\d{1,2}:\d{2}:\d{2})/i,
        /Gun\s+Time[:\s]+(\d{1,2}:\d{2}:\d{2})/i,
        /Net\s+Time[:\s]+(\d{1,2}:\d{2}:\d{2})/i,
      ]);

      const category = matchFirst(bodyText, [
        /Rank[\s\S]{0,300}\n(\d{1,2}\s+yrs\s+&\s+Above\s+(?:Male|Female))/,
        /(\d{1,2}\s*-\s*\d{1,2}\s+(?:Male|Female))/i,
        /Category[:\s]+([^\n]+)/i,
      ]);

      const rankOverall = matchFirstInt(bodyText, [
        /Overall[:\s]+(\d+)[\s]+OF/i,
        /Overall[:\s]+(\d+)\s*\/\s*\d+/i,
      ]);

      const rankCategory = matchFirstInt(bodyText, [
        /\d+\s+yrs\s+&\s+Above\s+(?:Male|Female)[\s\n]+(\d+)[\s]+OF\s+(\d+)/i,
        /Category[\s\S]{0,100}(\d+)[\s]+OF\s+\d+/i,
      ]);

      const pace = matchFirst(bodyText, [
        /Chip\s+Pace\s*\(min\/km\)[:\s]+(\d{1,2}:\d{2}(?::\d{2})?)/i,
        /Pace\s*\(min\/km\)[:\s]+(\d{1,2}:\d{2}(?::\d{2})?)/i,
        /Avg\.?\s+Pace[:\s]+(\d{1,2}:\d{2}(?::\d{2})?)/i,
      ]);

      console.log('STS extracted:', { raceName, name, bibNumber, finishTime, category, rankOverall, rankCategory, pace });

      return { raceName, name, category, finishTime, bibNumber, rankOverall, rankCategory, pace };
    },
  },
  {
    name: 'MyRaceIndia',
    urlPattern: /myraceindia\.com/i,
    selectors: {},
    extractionLogic: async (page) => {
      await page.waitForTimeout(3000);
      const bodyText = await page.evaluate(() => document.body.innerText);

      // Extract race name from URL path or page content
      let raceName: string | null = null;
      try {
        const url = page.url();
        const pathMatch = url.match(/\/individuals\/([^\/]+)\//);
        if (pathMatch) {
          raceName = decodeURIComponent(pathMatch[1].replace(/%20/g, ' ').replace(/-/g, ' '));
        }
      } catch (error) {
        console.error('Error extracting race name:', error);
      }
      if (!raceName) {
        raceName = matchFirst(bodyText, [
          /^([^\n]+(?:Marathon|Run|Race|Half Marathon|10K|5K|Ultra)[^\n]*)/im,
        ]);
      }

      const name = matchFirst(bodyText, [
        /Overall Results[\s\S]{0,200}\n([A-Z][A-Z\s]+)\n(?:MALE|FEMALE)/i,
        /([A-Z][A-Z\s]{2,})\n(?:MALE|FEMALE)/i,
        /Name[:\s]+([A-Za-z][A-Za-z\s]+)/i,
      ]);

      const bibNumber = matchFirst(bodyText, [
        /(?:10|5|21(?:\.1)?|42(?:\.2)?)\s*KM\s+(\d+)/i,
        /BIB[:\s#]*(\d+)/i,
        /Bib\s+No\.?[:\s]+(\d+)/i,
      ]);

      const category = matchFirst(bodyText, [
        /AG\s*:\s*([^\n]+)/i,
        /Age\s+Group[:\s]+([^\n]+)/i,
        /Category[:\s]+([^\n]+)/i,
      ]);

      const finishTime = matchFirst(bodyText, [
        /NET\s+TIME\s+(\d{1,2}:\d{2}:\d{2})/i,
        /CHIP\s+TIME\s+(\d{1,2}:\d{2}:\d{2})/i,
        /GUN\s+TIME\s+(\d{1,2}:\d{2}:\d{2})/i,
        /Finish\s+Time[:\s]+(\d{1,2}:\d{2}:\d{2})/i,
      ]);

      const rankOverall = matchFirstInt(bodyText, [
        /(\d+)\s*\/\s*\d+\s*Overall/i,
        /Overall\s+Rank[:\s]+(\d+)/i,
        /Overall[:\s]+(\d+)\s*\/\s*\d+/i,
      ]);

      const rankCategory = matchFirstInt(bodyText, [
        /(\d+)\s*\/\s*\d+\s*AG\s+RANK/i,
        /AG\s+RANK[:\s]+(\d+)/i,
        /Category\s+Rank[:\s]+(\d+)/i,
      ]);

      const pace = matchFirst(bodyText, [
        /PACE\s*\(?MIN\/KM\)?\s+(\d{1,2}:\d{2})/i,
        /Avg\.?\s+Pace[:\s]+(\d{1,2}:\d{2})/i,
        /Pace[:\s]+(\d{1,2}:\d{2})/i,
      ]);

      console.log('MyRaceIndia extracted:', { raceName, name, bibNumber, category, finishTime, rankOverall, rankCategory, pace });

      return { raceName, name, category, finishTime, bibNumber, rankOverall, rankCategory, pace };
    },
  },
  {
    name: 'iFinish',
    urlPattern: /ifinish\.in/i,
    selectors: {},
    extractionLogic: async (page) => {
      await page.waitForTimeout(3000);
      const bodyText = await page.evaluate(() => document.body.innerText);

      const raceName = matchFirst(bodyText, [
        /^([^~\n]+(?:Marathon|Run|Race|Half Marathon|10K|5K|Ultra)[^~\n]*)/im,
        /^([^~\n]{5,80})\n/m,
      ]);

      const name = matchFirst(bodyText, [
        /~\s+([A-Z][A-Z\s]+)\s+BIB#/i,
        /([A-Z][A-Z\s]{2,})\s+BIB/i,
        /Name[:\s]+([A-Za-z][A-Za-z\s]+)/i,
      ]);

      const bibNumber = matchFirst(bodyText, [
        /BIB#\s*(\d+)/i,
        /BIB[:\s#]+(\d+)/i,
      ]);

      const category = matchFirst(bodyText, [
        /(?:Open|Elite)\s+[-–]?\s*Category\s+[-–]\s+([^\n]+)/i,
        /Category[:\s]+([^\n]+)/i,
      ]);

      const finishTime = matchFirst(bodyText, [
        /Net\s+Time\s+(\d{1,2}:\d{2}:\d{2})/i,
        /Chip\s+Time\s+(\d{1,2}:\d{2}:\d{2})/i,
        /Finish\s+Time\s+(\d{1,2}:\d{2}:\d{2})/i,
        /Gun\s+Time\s+(\d{1,2}:\d{2}:\d{2})/i,
      ]);

      const rankOverall = matchFirstInt(bodyText, [
        /Overall\s+Rank\s+(\d+)\s*\/\s*\d+/i,
        /Overall[:\s]+(\d+)\s*\/\s*\d+/i,
      ]);

      const rankCategory = matchFirstInt(bodyText, [
        /Category\s+Rank\s+(\d+)\s*\/\s*\d+/i,
        /Cat\.?\s+Rank[:\s]+(\d+)/i,
      ]);

      const pace = matchFirst(bodyText, [
        /Net\s+Pace\s+\(min\/km\)\s+(\d{1,2}:\d{2})/i,
        /Pace\s*\(min\/km\)\s+(\d{1,2}:\d{2})/i,
        /Avg\.?\s+Pace[:\s]+(\d{1,2}:\d{2})/i,
      ]);

      console.log('iFinish extracted:', { raceName, name, bibNumber, category, finishTime, rankOverall, rankCategory, pace });

      return { raceName, name, category, finishTime, bibNumber, rankOverall, rankCategory, pace };
    },
  },
];

/**
 * Detect which platform a URL belongs to
 */
export function detectPlatform(url: string): ParserConfig | null {
  for (const parser of PARSERS) {
    if (parser.urlPattern.test(url)) {
      return parser;
    }
  }
  return null;
}

/**
 * Extract race results from a URL using adaptive parsing
 */
export async function extractRaceResults(url: string): Promise<RaceResultData> {
  const parser = detectPlatform(url);

  if (!parser) {
    throw new Error(`Unsupported race timing platform: ${url}`);
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Wait for dynamic content to render
    await page.waitForTimeout(2000);

    let result: Partial<RaceResultData> = {};

    // Use custom extraction logic if available
    if (parser.extractionLogic) {
      result = await parser.extractionLogic(page);
    } else {
      // Fallback to selector-based extraction
      for (const [key, selector] of Object.entries(parser.selectors)) {
        if (selector) {
          try {
            const element = await page.$(selector);
            if (element) {
              const text = await element.textContent();
              (result as any)[key] = text?.trim() || null;
            }
          } catch (error) {
            console.error(`Error extracting ${key}:`, error);
          }
        }
      }
    }

    return {
      raceName: result.raceName || null,
      name: result.name || null,
      category: result.category || null,
      finishTime: result.finishTime || null,
      bibNumber: result.bibNumber || null,
      rankOverall: result.rankOverall || null,
      rankCategory: result.rankCategory || null,
      pace: result.pace || null,
      platform: parser.name,
    };
  } finally {
    await page.close();
  }
}

/**
 * Generate SHA-256 hash for URL
 */
export function hashUrl(url: string): string {
  return SHA256(url).toString();
}

/**
 * Validate and normalize URL
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
