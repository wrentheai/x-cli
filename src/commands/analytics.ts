import chalk from 'chalk';
import { getAnalytics, isLoggedIn, AnalyticsData } from '../api.js';
import { closeBrowser } from '../browser.js';
import { resolveAccount } from '../config.js';

export async function analyticsCommand(options: { days?: string }, globalOpts?: { account?: string }): Promise<void> {
  try {
    const accountName = resolveAccount(globalOpts?.account);
    const days = parseInt(options.days || '28', 10);

    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn(accountName);
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    console.log(chalk.blue(`Fetching analytics (last ${days} days)...`));
    const analytics = await getAnalytics(accountName, days);

    console.log('');
    console.log(chalk.bold('=== Account Analytics ==='));
    console.log('');

    if (analytics.summary) {
      console.log(chalk.cyan('Summary:'));
      console.log(`  Posts:        ${analytics.summary.posts}`);
      console.log(`  Impressions:  ${analytics.summary.impressions}`);
      console.log(`  Profile visits: ${analytics.summary.profileVisits}`);
      console.log(`  Followers:    ${analytics.summary.followers}`);
      console.log(`  New followers: ${analytics.summary.newFollowers || 'N/A'}`);
      console.log('');
    }

    if (analytics.topPosts && analytics.topPosts.length > 0) {
      console.log(chalk.cyan('Top Posts:'));
      for (const post of analytics.topPosts) {
        console.log('');
        console.log(`  ${chalk.gray(post.date)}`);
        console.log(`  ${post.text.slice(0, 80)}${post.text.length > 80 ? '...' : ''}`);
        console.log(`  ${chalk.green('Impressions:')} ${post.impressions}  ${chalk.blue('Engagements:')} ${post.engagements}  ${chalk.yellow('Rate:')} ${post.engagementRate}`);
        if (post.url) console.log(`  ${chalk.gray(post.url)}`);
      }
    }
  } catch (error) {
    console.error(chalk.red('Failed to fetch analytics:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
