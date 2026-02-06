import chalk from 'chalk';
import { getMyPosts, isLoggedIn, TimelinePost } from '../api.js';
import { closeBrowser } from '../browser.js';

export async function meCommand(options: { count?: string }): Promise<void> {
  try {
    const count = parseInt(options.count || '10', 10);

    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    console.log(chalk.blue('Fetching your recent posts...'));
    const posts = await getMyPosts(count);

    if (posts.length === 0) {
      console.log(chalk.yellow('No posts found.'));
      return;
    }

    console.log('');
    console.log(chalk.bold(`=== Your Recent Posts (${posts.length}) ===`));
    console.log('');

    for (const post of posts) {
      printPost(post);
    }

    // Summary stats
    const totalViews = posts.reduce((sum, p) => sum + parseMetric(p.views), 0);
    const totalLikes = posts.reduce((sum, p) => sum + parseMetric(p.likes), 0);
    const totalRetweets = posts.reduce((sum, p) => sum + parseMetric(p.retweets), 0);

    console.log(chalk.cyan('--- Summary ---'));
    console.log(`Total Views: ${formatNumber(totalViews)}  Likes: ${formatNumber(totalLikes)}  Reposts: ${formatNumber(totalRetweets)}`);
  } catch (error) {
    console.error(chalk.red('Failed to fetch your posts:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

function printPost(post: TimelinePost): void {
  console.log(chalk.gray(formatTimestamp(post.timestamp)));
  console.log(post.text.slice(0, 140) + (post.text.length > 140 ? '...' : ''));
  console.log(chalk.gray(`Views: ${post.views}  Likes: ${post.likes}  Reposts: ${post.retweets}  Replies: ${post.replies}`));
  if (post.url) console.log(chalk.cyan(post.url));
  console.log('');
}

function parseMetric(value: string): number {
  if (!value || value === '0') return 0;
  const cleaned = value.replace(/,/g, '');
  if (cleaned.endsWith('K')) return parseFloat(cleaned) * 1000;
  if (cleaned.endsWith('M')) return parseFloat(cleaned) * 1000000;
  return parseInt(cleaned, 10) || 0;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timestamp;
  }
}
