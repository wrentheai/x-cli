import chalk from 'chalk';
import { searchPosts, isLoggedIn, TimelinePost } from '../api.js';
import { closeBrowser } from '../browser.js';
import { resolveAccount } from '../config.js';

export async function searchCommand(query: string, options: { count?: string; top?: boolean }, globalOpts?: { account?: string }): Promise<void> {
  try {
    const accountName = resolveAccount(globalOpts?.account);
    const count = parseInt(options.count || '10', 10);
    const useTop = options.top || false;

    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn(accountName);
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    const tab = useTop ? 'Top' : 'Latest';
    console.log(chalk.blue(`Searching "${query}" (${tab})...`));
    const posts = await searchPosts(accountName, query, count, useTop);

    if (posts.length === 0) {
      console.log(chalk.yellow('No posts found.'));
      return;
    }

    console.log('');
    console.log(chalk.bold(`=== Search: "${query}" (${posts.length} results) ===`));
    console.log('');

    for (const post of posts) {
      printPost(post);
    }
  } catch (error) {
    console.error(chalk.red('Search failed:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

function printPost(post: TimelinePost): void {
  console.log(`${chalk.bold(post.author)} ${chalk.gray(post.handle)} ${chalk.gray('·')} ${chalk.gray(formatTimestamp(post.timestamp))}`);
  console.log(post.text.slice(0, 200) + (post.text.length > 200 ? '...' : ''));
  console.log(chalk.gray(`Views: ${post.views}  Likes: ${post.likes}  Reposts: ${post.retweets}  Replies: ${post.replies}`));
  if (post.url) console.log(chalk.cyan(post.url));
  console.log('');
}

function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString();
  } catch {
    return timestamp;
  }
}
