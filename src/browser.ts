import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';

const USER_DATA_DIR = join(homedir(), '.x-cli-data');

let browser: Browser | null = null;
let context: BrowserContext | null = null;

// Use real Chrome to avoid bot detection
const BROWSER_OPTIONS = {
  channel: 'chrome' as const,  // Use system Chrome instead of Playwright's Chromium
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
  ],
};

const CONTEXT_OPTIONS = {
  viewport: { width: 1280, height: 800 },
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
};

export async function getBrowserContext(headless = true): Promise<BrowserContext> {
  if (context) return context;

  browser = await chromium.launch({ ...BROWSER_OPTIONS, headless });
  context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    storageState: getStorageStatePath(),
  });

  return context;
}

export async function getPersistentContext(headless = true): Promise<BrowserContext> {
  if (context) return context;

  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    ...BROWSER_OPTIONS,
    ...CONTEXT_OPTIONS,
    headless,
  });

  return context;
}

export async function getPage(): Promise<Page> {
  const ctx = await getPersistentContext();
  const pages = ctx.pages();
  return pages.length > 0 ? pages[0] : await ctx.newPage();
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

function getStorageStatePath(): string | undefined {
  const path = join(USER_DATA_DIR, 'storage-state.json');
  return existsSync(path) ? path : undefined;
}

export async function saveStorageState(): Promise<void> {
  if (context) {
    const path = join(USER_DATA_DIR, 'storage-state.json');
    await context.storageState({ path });
  }
}

export function clearSessionData(): void {
  if (existsSync(USER_DATA_DIR)) {
    rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }
}

export function hasSessionData(): boolean {
  return existsSync(USER_DATA_DIR);
}

export { USER_DATA_DIR };
