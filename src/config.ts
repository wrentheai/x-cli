import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.x-cli');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const ACCOUNTS_DIR = join(CONFIG_DIR, 'accounts');
const LEGACY_DATA_DIR = join(homedir(), '.x-cli-data');

export interface AccountInfo {
  handle?: string;
  addedAt: string;
}

export interface Config {
  defaultAccount: string;
  accounts: Record<string, AccountInfo>;
}

function defaultConfig(): Config {
  return { defaultAccount: '', accounts: {} };
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return defaultConfig();
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

export function resolveAccount(explicitName?: string): string {
  const config = loadConfig();
  if (explicitName) {
    if (!config.accounts[explicitName]) {
      throw new Error(`Account "${explicitName}" not found. Run: x-cli accounts`);
    }
    return explicitName;
  }
  if (config.defaultAccount && config.accounts[config.defaultAccount]) {
    return config.defaultAccount;
  }
  const names = Object.keys(config.accounts);
  if (names.length === 1) return names[0];
  if (names.length === 0) {
    throw new Error('No accounts configured. Run: x-cli login <name>');
  }
  throw new Error('Multiple accounts configured but no default set. Use --account <name> or run: x-cli default <name>');
}

export function registerAccount(name: string, handle?: string): void {
  const config = loadConfig();
  const isFirst = Object.keys(config.accounts).length === 0;
  config.accounts[name] = { handle, addedAt: new Date().toISOString() };
  if (isFirst || !config.defaultAccount) {
    config.defaultAccount = name;
  }
  mkdirSync(getAccountDataDir(name), { recursive: true });
  saveConfig(config);
}

export function removeAccount(name: string): void {
  const config = loadConfig();
  if (!config.accounts[name]) {
    throw new Error(`Account "${name}" not found.`);
  }
  delete config.accounts[name];
  if (config.defaultAccount === name) {
    const remaining = Object.keys(config.accounts);
    config.defaultAccount = remaining.length > 0 ? remaining[0] : '';
  }
  saveConfig(config);
}

export function setDefaultAccount(name: string): void {
  const config = loadConfig();
  if (!config.accounts[name]) {
    throw new Error(`Account "${name}" not found. Run: x-cli accounts`);
  }
  config.defaultAccount = name;
  saveConfig(config);
}

export function listAccounts(): Array<{ name: string; handle?: string; isDefault: boolean; addedAt: string }> {
  const config = loadConfig();
  return Object.entries(config.accounts).map(([name, info]) => ({
    name,
    handle: info.handle,
    isDefault: name === config.defaultAccount,
    addedAt: info.addedAt,
  }));
}

export function getAccountDataDir(name: string): string {
  return join(ACCOUNTS_DIR, name);
}

export function updateAccountHandle(name: string, handle: string): void {
  const config = loadConfig();
  if (config.accounts[name]) {
    config.accounts[name].handle = handle;
    saveConfig(config);
  }
}

export function migrateIfNeeded(): void {
  if (!existsSync(LEGACY_DATA_DIR)) return;
  if (existsSync(CONFIG_PATH)) return; // already migrated

  mkdirSync(ACCOUNTS_DIR, { recursive: true });
  const destDir = join(ACCOUNTS_DIR, 'default');
  renameSync(LEGACY_DATA_DIR, destDir);

  const config: Config = {
    defaultAccount: 'default',
    accounts: {
      default: { addedAt: new Date().toISOString() },
    },
  };
  saveConfig(config);
}
