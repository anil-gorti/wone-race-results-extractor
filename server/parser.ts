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
      await page.waitForTimeout(2000);

      // Extract participant name
      let name: string | null = null;
      try {
        const nameElement = await page.textContent('body');
        const nameMatch = nameElement?.match(/([A-Z][a-z]+\s+[A-Z])/);
        if (nameMatch) {
          name = nameMatch[1];
        }
      } catch (error) {
        console.error('Error extracting name:', error);
      }

      // Extract BIB number
      let bibNumber: string | null = null;
      try {
        const bibText = await page.textContent('body');
        const bibMatch = bibText?.match(/BIB No\s+(\d+)/i);
        if (bibMatch) {
          bibNumber = bibMatch[1];
        }
      } catch (error) {
        console.error('Error extracting BIB:', error);
      }

      // Extract finish time
      let finishTime: string | null = null;
      try {
        const timeText = await page.textContent('body');
        const timeMatch = timeText?.match(/Finish Time\s+([\d:]+)/i);
        if (timeMatch) {
          finishTime = timeMatch[1];
        }
      } catch (error) {
        console.error('Error extracting finish time:', error);
      }

      // Extract category
      let category: string | null = null;
      try {
        const categoryText = await page.textContent('body');
        const categoryMatch = categoryText?.match(/(\d+\s+yrs\s+&\s+Above\s+\w+)/i);
        if (categoryMatch) {
          category = categoryMatch[1];
        }
      } catch (error) {
        console.error('Error extracting category:', error);
      }

      // Extract overall rank
      let rankOverall: number | null = null;
      try {
        const rankText = await page.textContent('body');
        const rankMatch = rankText?.match(/Overall\s+(\d+)\s+OF/i);
        if (rankMatch) {
          rankOverall = parseInt(rankMatch[1], 10);
        }
      } catch (error) {
        console.error('Error extracting overall rank:', error);
      }

      // Extract category rank
      let rankCategory: number | null = null;
      try {
        const categoryRankText = await page.textContent('body');
        const lines = categoryRankText?.split('\n') || [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]?.includes('yrs & Above')) {
            const nextLine = lines[i + 1];
            const match = nextLine?.match(/^(\d+)$/);
            if (match) {
              rankCategory = parseInt(match[1], 10);
              break;
            }
          }
        }
      } catch (error) {
        console.error('Error extracting category rank:', error);
      }

      // Extract pace
      let pace: string | null = null;
      try {
        const paceText = await page.textContent('body');
        const paceMatch = paceText?.match(/Chip Pace \(min\/km\)\s+([\d:]+)/i);
        if (paceMatch) {
          pace = paceMatch[1];
        }
      } catch (error) {
        console.error('Error extracting pace:', error);
      }

      return {
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
  // Add more parsers for other platforms here
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
