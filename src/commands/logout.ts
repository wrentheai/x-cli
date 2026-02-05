import chalk from 'chalk';
import { clearSessionData, hasSessionData, USER_DATA_DIR } from '../browser.js';

export async function logoutCommand(): Promise<void> {
  try {
    if (!hasSessionData()) {
      console.log(chalk.yellow('No active session found.'));
      return;
    }

    clearSessionData();
    console.log(chalk.green('✓ Logged out successfully!'));
    console.log(chalk.gray(`Session data cleared from ${USER_DATA_DIR}`));
  } catch (error) {
    console.error(chalk.red('Logout failed:'), error);
    process.exit(1);
  }
}
