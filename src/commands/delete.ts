import chalk from 'chalk';
import { deletePost, isLoggedIn } from '../api.js';
import { closeBrowser } from '../browser.js';

export async function deleteCommand(postUrl: string): Promise<void> {
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

    console.log(chalk.blue('Deleting post...'));
    const result = await deletePost(postUrl);
    console.log(chalk.green('✓ Post deleted successfully!'));
    console.log(chalk.gray(result));
  } catch (error) {
    console.error(chalk.red('Failed to delete post:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
