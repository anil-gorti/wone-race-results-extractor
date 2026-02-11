import { chromium, Browser, Page } from 'playwright';

let browser: Browser | null = null;

/**
 * Initialize Playwright browser instance (singleton pattern)
 */
export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

/**
 * Fetch page content using Playwright for dynamic content
 */
export async function fetchPageContent(url: string): Promise<{ html: string; text: string }> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait a bit for any dynamic content to load
    await page.waitForTimeout(2000);

    const html = await page.content();
    const text = await page.textContent('body') || '';

    return { html, text };
  } finally {
    await page.close();
  }
}

/**
 * Extract race results from a page using CSS selectors
 */
export async function extractWithSelectors(
  url: string,
  selectors: {
    name?: string;
    category?: string;
    finishTime?: string;
    bibNumber?: string;
    rankOverall?: string;
    rankCategory?: string;
    pace?: string;
  }
): Promise<Record<string, string | null>> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const result: Record<string, string | null> = {};

    for (const [key, selector] of Object.entries(selectors)) {
      if (selector) {
        try {
          const element = await page.$(selector);
          if (element) {
            result[key] = await element.textContent();
          } else {
            result[key] = null;
          }
        } catch (error) {
          console.error(`Error extracting ${key} with selector ${selector}:`, error);
          result[key] = null;
        }
      }
    }

    return result;
  } finally {
    await page.close();
  }
}

/**
 * Close browser instance (cleanup)
 */
export async function closeBrowser(): Promise<void> {
  if (browser && browser.isConnected()) {
    await browser.close();
    browser = null;
  }
}
