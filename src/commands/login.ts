import chalk from 'chalk';
import { openLoginPage, isLoggedIn, detectHandle } from '../api.js';
import { closeBrowser, hasSessionData } from '../browser.js';
import { registerAccount, resolveAccount, updateAccountHandle } from '../config.js';

export async function loginCommand(name?: string, globalOpts?: { account?: string }): Promise<void> {
  try {
    // Use explicit name argument, or fall back to --account flag, or 'default'
    const accountName = name || globalOpts?.account || 'default';

    if (hasSessionData(accountName)) {
      console.log(chalk.blue(`Existing session found for "${accountName}". Checking if still valid...`));
      const loggedIn = await isLoggedIn(accountName);
      if (loggedIn) {
        console.log(chalk.green(`✓ Already logged in as "${accountName}"!`));
        // Try to detect and save handle if not yet known
        const handle = await detectHandle(accountName);
        if (handle) {
          registerAccount(accountName, handle);
          console.log(chalk.gray(`Handle: ${handle}`));
        }
        await closeBrowser();
        return;
      }
      console.log(chalk.yellow('Session expired. Opening browser for login...'));
    }

    // Register the account (will set as default if first account)
    registerAccount(accountName);

    console.log(chalk.blue(`Opening browser for login as "${accountName}"...`));
    console.log(chalk.gray('Please log in to X in the browser window.'));
    console.log(chalk.gray('The CLI will detect when you\'re logged in.'));
    console.log('');

    const page = await openLoginPage(accountName);

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
          console.log(chalk.green(`✓ Login successful for "${accountName}"!`));

          // Detect handle from sidebar
          const handle = await page.evaluate(() => {
            const accountBtn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
            if (accountBtn) {
              const spans = accountBtn.querySelectorAll('span');
              for (const span of Array.from(spans)) {
                const text = span.textContent?.trim() || '';
                if (text.startsWith('@')) return text;
              }
            }
            return null;
          });

          if (handle) {
            updateAccountHandle(accountName, handle);
            console.log(chalk.gray(`Handle: ${handle}`));
          }

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
