import chalk from 'chalk';
import { clearSessionData, hasSessionData } from '../browser.js';
import { resolveAccount, removeAccount, getAccountDataDir } from '../config.js';

export async function logoutCommand(name?: string, globalOpts?: { account?: string }): Promise<void> {
  try {
    const accountName = name || globalOpts?.account;

    // If no name given and no --account flag, resolve default
    let resolved: string;
    try {
      resolved = accountName || resolveAccount();
    } catch {
      console.log(chalk.yellow('No active session found.'));
      return;
    }

    if (!hasSessionData(resolved)) {
      console.log(chalk.yellow(`No active session found for "${resolved}".`));
      return;
    }

    clearSessionData(resolved);
    removeAccount(resolved);
    console.log(chalk.green(`✓ Logged out "${resolved}" successfully!`));
    console.log(chalk.gray(`Session data cleared from ${getAccountDataDir(resolved)}`));
  } catch (error) {
    console.error(chalk.red('Logout failed:'), error);
    process.exit(1);
  }
}
