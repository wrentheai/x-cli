import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, rmSync } from 'fs';
import { getAccountDataDir } from './config.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let activeAccount: string | null = null;

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

export async function getBrowserContext(accountName: string, headless = true): Promise<BrowserContext> {
  if (context && activeAccount === accountName) return context;

  // Close existing context if switching accounts
  await closeBrowser();

  const dataDir = getAccountDataDir(accountName);
  browser = await chromium.launch({ ...BROWSER_OPTIONS, headless });
  context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    storageState: getStorageStatePath(accountName),
  });
  activeAccount = accountName;

  return context;
}

export async function getPersistentContext(accountName: string, headless = true): Promise<BrowserContext> {
  if (context && activeAccount === accountName) return context;

  // Close existing context if switching accounts
  await closeBrowser();

  const dataDir = getAccountDataDir(accountName);
  context = await chromium.launchPersistentContext(dataDir, {
    ...BROWSER_OPTIONS,
    ...CONTEXT_OPTIONS,
    headless,
  });
  activeAccount = accountName;

  return context;
}

export async function getPage(accountName: string): Promise<Page> {
  const ctx = await getPersistentContext(accountName);
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
  activeAccount = null;
}

function getStorageStatePath(accountName: string): string | undefined {
  const dataDir = getAccountDataDir(accountName);
  const path = `${dataDir}/storage-state.json`;
  return existsSync(path) ? path : undefined;
}

export async function saveStorageState(accountName: string): Promise<void> {
  if (context) {
    const dataDir = getAccountDataDir(accountName);
    const path = `${dataDir}/storage-state.json`;
    await context.storageState({ path });
  }
}

export function clearSessionData(accountName: string): void {
  const dataDir = getAccountDataDir(accountName);
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

export function hasSessionData(accountName: string): boolean {
  return existsSync(getAccountDataDir(accountName));
}
