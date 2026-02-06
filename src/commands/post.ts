import chalk from 'chalk';
import { post, isLoggedIn } from '../api.js';
import { closeBrowser } from '../browser.js';
import { resolveAccount } from '../config.js';

export async function postCommand(text: string, globalOpts?: { account?: string }): Promise<void> {
  try {
    const accountName = resolveAccount(globalOpts?.account);
    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn(accountName);
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    console.log(chalk.blue('Creating post...'));
    const result = await post(accountName, text);
    console.log(chalk.green('✓ Post created successfully!'));
    console.log(chalk.gray(result));
  } catch (error) {
    console.error(chalk.red('Failed to create post:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
