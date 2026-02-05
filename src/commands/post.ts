import chalk from 'chalk';
import { post, isLoggedIn } from '../api.js';
import { closeBrowser } from '../browser.js';

export async function postCommand(text: string): Promise<void> {
  try {
    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    console.log(chalk.blue('Creating post...'));
    const result = await post(text);
    console.log(chalk.green('✓ Post created successfully!'));
    console.log(chalk.gray(result));
  } catch (error) {
    console.error(chalk.red('Failed to create post:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
