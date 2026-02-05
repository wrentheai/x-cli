import chalk from 'chalk';
import { openLoginPage, isLoggedIn } from '../api.js';
import { closeBrowser, hasSessionData } from '../browser.js';

export async function loginCommand(): Promise<void> {
  try {
    if (hasSessionData()) {
      console.log(chalk.blue('Existing session found. Checking if still valid...'));
      const loggedIn = await isLoggedIn();
      if (loggedIn) {
        console.log(chalk.green('✓ Already logged in!'));
        await closeBrowser();
        return;
      }
      console.log(chalk.yellow('Session expired. Opening browser for login...'));
    }

    console.log(chalk.blue('Opening browser for login...'));
    console.log(chalk.gray('Please log in to X in the browser window.'));
    console.log(chalk.gray('The CLI will detect when you\'re logged in.'));
    console.log('');

    const page = await openLoginPage();

    // Wait for user to log in
    console.log(chalk.yellow('Waiting for login... (press Ctrl+C to cancel)'));

    // Poll for login status
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes timeout

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const currentUrl = page.url();
      if (currentUrl === 'https://x.com/home' || currentUrl === 'https://x.com/') {
        // Check if we're actually logged in
        const loggedIn = await page.evaluate(() => {
          const composeBtn = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
          return composeBtn !== null;
        });

        if (loggedIn) {
          console.log('');
          console.log(chalk.green('✓ Login successful!'));
          console.log(chalk.gray('Your session has been saved. You can now use other x-cli commands.'));
          break;
        }
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.log(chalk.red('Login timed out. Please try again.'));
    }
  } catch (error) {
    console.error(chalk.red('Login failed:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
