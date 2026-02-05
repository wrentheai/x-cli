import chalk from 'chalk';
import { reply, isLoggedIn } from '../api.js';
import { closeBrowser } from '../browser.js';

export async function replyCommand(postUrl: string, text: string): Promise<void> {
  try {
    // Validate URL
    if (!postUrl.includes('x.com/') && !postUrl.includes('twitter.com/')) {
      console.error(chalk.red('Invalid post URL. Please provide a valid X/Twitter post URL.'));
      process.exit(1);
    }

    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    console.log(chalk.blue('Posting reply...'));
    const result = await reply(postUrl, text);
    console.log(chalk.green('✓ Reply posted successfully!'));
    console.log(chalk.gray(result));
  } catch (error) {
    console.error(chalk.red('Failed to post reply:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
