import { chromium } from 'playwright';
import SHA256 from 'crypto-js/sha256';

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
 * Supported race timing platforms
 */
const PARSERS: ParserConfig[] = [
  {
    name: 'Sports Timing Solutions',
    urlPattern: /sportstimingsolutions\.in/i,
    selectors: {},
    extractionLogic: async (page) => {
      // Wait for content to load
      await page.waitForTimeout(3000);

      // Get the full page HTML for debugging
      const html = await page.content();
      
      // Extract all text content
      const bodyText = await page.evaluate(() => document.body.innerText);
      
      // Extract race name (appears at the top of the page)
      let raceName: string | null = null;
      try {
        // Try to get the race name from the page title or heading
        const raceNameMatch = bodyText.match(/^([^\n]+(?:Marathon|Run|Race|Half Marathon|10K|5K)[^\n]*)/im);
        if (raceNameMatch) {
          raceName = raceNameMatch[1].trim();
        }
      } catch (error) {
        console.error('Error extracting race name:', error);
      }
      
      // Extract participant name (appears after "Share" and before "BIB No")
      let name: string | null = null;
      try {
        // Look for name between Share and BIB No, clean up newlines and extra text
        const nameMatch = bodyText.match(/Share[\s\n]+(?:RS[\s\n]+)?([A-Z][a-z]+(?:\s+[A-Z](?:[a-z]+)?)*)\s+BIB\s+No/i);
        if (nameMatch) {
          name = nameMatch[1].trim();
        }
      } catch (error) {
        console.error('Error extracting name:', error);
      }

      // Extract BIB number
      let bibNumber: string | null = null;
      try {
        const bibMatch = bodyText.match(/BIB\s+No[:\s]+(\d+)/i);
        if (bibMatch) {
          bibNumber = bibMatch[1];
        }
      } catch (error) {
        console.error('Error extracting BIB:', error);
      }

      // Extract finish time
      let finishTime: string | null = null;
      try {
        const timeMatch = bodyText.match(/Finish\s+Time[:\s]+(\d{1,2}:\d{2}:\d{2})/i);
        if (timeMatch) {
          finishTime = timeMatch[1];
        }
      } catch (error) {
        console.error('Error extracting finish time:', error);
      }

      // Extract category (look for age group pattern in the Rank section, not the dropdown)
      let category: string | null = null;
      try {
        // Look for category in the Rank section (after "Rank" heading)
        // Match the pattern with newline before age to avoid matching rank numbers
        const categoryMatch = bodyText.match(/Rank[\s\S]{0,300}\n(\d{1,2}\s+yrs\s+&\s+Above\s+(?:Male|Female))/);
        if (categoryMatch) {
          category = categoryMatch[1].trim();
        }
      } catch (error) {
        console.error('Error extracting category:', error);
      }

      // Extract overall rank
      let rankOverall: number | null = null;
      try {
        const rankMatch = bodyText.match(/Overall[:\s]+(\d+)[\s]+OF/i);
        if (rankMatch) {
          rankOverall = parseInt(rankMatch[1], 10);
        }
      } catch (error) {
        console.error('Error extracting overall rank:', error);
      }

      // Extract category rank
      let rankCategory: number | null = null;
      try {
        // Look for the category line followed by rank and "OF" pattern
        const categoryRankMatch = bodyText.match(/\d+\s+yrs\s+&\s+Above\s+(?:Male|Female)[\s\n]+(\d+)[\s]+OF\s+(\d+)/i);
        if (categoryRankMatch) {
          rankCategory = parseInt(categoryRankMatch[1], 10);
        }
      } catch (error) {
        console.error('Error extracting category rank:', error);
      }

      // Extract pace
      let pace: string | null = null;
      try {
        const paceMatch = bodyText.match(/Chip\s+Pace\s*\(min\/km\)[:\s]+(\d{1,2}:\d{2}:\d{2})/i);
        if (paceMatch) {
          pace = paceMatch[1];
        }
      } catch (error) {
        console.error('Error extracting pace:', error);
      }

      console.log('Extracted data:', { raceName, name, bibNumber, finishTime, category, rankOverall, rankCategory, pace });

      return {
        raceName,
        name,
        category,
        finishTime,
        bibNumber,
        rankOverall,
        rankCategory,
        pace,
      };
    },
  },
  {
    name: 'MyRaceIndia',
    urlPattern: /myraceindia\.com/i,
    selectors: {},
    extractionLogic: async (page) => {
      await page.waitForTimeout(3000);
      const bodyText = await page.evaluate(() => document.body.innerText);

      // Extract race name from URL path (e.g., "Steel City Run 2023")
      let raceName: string | null = null;
      try {
        const url = page.url();
        const pathMatch = url.match(/\/individuals\/([^\/]+)\//);
        if (pathMatch) {
          raceName = decodeURIComponent(pathMatch[1].replace(/%20/g, ' '));
        }
      } catch (error) {
        console.error('Error extracting race name:', error);
      }

      // Extract name (appears as "RAMESH S" in caps)
      let name: string | null = null;
      const nameMatch = bodyText.match(/Overall Results[\s\S]{0,200}\n([A-Z\s]+)\n(?:MALE|FEMALE)/i);
      if (nameMatch) {
        name = nameMatch[1].trim();
      }

      // Extract BIB number
      let bibNumber: string | null = null;
      const bibMatch = bodyText.match(/10\s+KM\s+(\d+)/i) || bodyText.match(/5\s+KM\s+(\d+)/i) || bodyText.match(/21\s+KM\s+(\d+)/i) || bodyText.match(/42\s+KM\s+(\d+)/i);
      if (bibMatch) {
        bibNumber = bibMatch[1];
      }

      // Extract category (e.g., "AG : 40YRS TO 54YRS - MEN")
      let category: string | null = null;
      const categoryMatch = bodyText.match(/AG\s*:\s*([^\n]+)/i);
      if (categoryMatch) {
        category = categoryMatch[1].trim();
      }

      // Extract finish time (NET TIME)
      let finishTime: string | null = null;
      const timeMatch = bodyText.match(/NET\s+TIME\s+(\d{1,2}:\d{2}:\d{2})/i);
      if (timeMatch) {
        finishTime = timeMatch[1];
      }

      // Extract overall rank (e.g., "28 / 354")
      let rankOverall: number | null = null;
      const overallMatch = bodyText.match(/(\d+)\s*\/\s*\d+\s*Overall/i);
      if (overallMatch) {
        rankOverall = parseInt(overallMatch[1], 10);
      }

      // Extract category rank
      let rankCategory: number | null = null;
      const categoryRankMatch = bodyText.match(/(\d+)\/\d+\s*AG\s+RANK/i);
      if (categoryRankMatch) {
        rankCategory = parseInt(categoryRankMatch[1], 10);
      }

      // Extract pace
      let pace: string | null = null;
      const paceMatch = bodyText.match(/PACE\(MIN\/KM\)\s+(\d{1,2}:\d{2})/i);
      if (paceMatch) {
        pace = paceMatch[1];
      }

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

      // Extract race name (appears near the top, before participant name)
      let raceName: string | null = null;
      try {
        const raceNameMatch = bodyText.match(/^([^~\n]+(?:Marathon|Run|Race|Half Marathon|10K|5K)[^~\n]*)/im);
        if (raceNameMatch) {
          raceName = raceNameMatch[1].trim();
        }
      } catch (error) {
        console.error('Error extracting race name:', error);
      }

      // Extract name (appears in caps like "RAMESHA SHAMANNA")
      let name: string | null = null;
      const nameMatch = bodyText.match(/~\s+([A-Z\s]+)\s+BIB#/i);
      if (nameMatch) {
        name = nameMatch[1].trim();
      }

      // Extract BIB number
      let bibNumber: string | null = null;
      const bibMatch = bodyText.match(/BIB#\s+(\d+)/i);
      if (bibMatch) {
        bibNumber = bibMatch[1];
      }

      // Extract category (e.g., "Open - Category - Under 40")
      let category: string | null = null;
      const categoryMatch = bodyText.match(/(?:Open|Elite)\s+Category\s+-\s+([^\n]+)/i);
      if (categoryMatch) {
        category = categoryMatch[1].trim();
      }

      // Extract finish time (Net Time)
      let finishTime: string | null = null;
      const timeMatch = bodyText.match(/Net\s+Time\s+(\d{1,2}:\d{2}:\d{2})/i);
      if (timeMatch) {
        finishTime = timeMatch[1];
      }

      // Extract overall rank (e.g., "3773 / 8132")
      let rankOverall: number | null = null;
      const overallMatch = bodyText.match(/Overall\s+Rank\s+(\d+)\s*\/\s*\d+/i);
      if (overallMatch) {
        rankOverall = parseInt(overallMatch[1], 10);
      }

      // Extract category rank
      let rankCategory: number | null = null;
      const categoryRankMatch = bodyText.match(/Category\s+Rank\s+(\d+)\s*\/\s*\d+/i);
      if (categoryRankMatch) {
        rankCategory = parseInt(categoryRankMatch[1], 10);
      }

      // Extract pace (Net Pace)
      let pace: string | null = null;
      const paceMatch = bodyText.match(/Net\s+Pace\s+\(min\/km\)\s+(\d{1,2}:\d{2})/i);
      if (paceMatch) {
        pace = paceMatch[1];
      }

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

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

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
      raceName: null, // Will be extracted by platform-specific logic
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
    await browser.close();
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
