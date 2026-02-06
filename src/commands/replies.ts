import chalk from 'chalk';
import { getReplies, isLoggedIn, TimelinePost } from '../api.js';
import { closeBrowser } from '../browser.js';
import { resolveAccount } from '../config.js';

export async function repliesCommand(postUrl: string, options: { count?: string }, globalOpts?: { account?: string }): Promise<void> {
  try {
    // Validate URL
    if (!postUrl.includes('x.com/') && !postUrl.includes('twitter.com/')) {
      console.error(chalk.red('Invalid post URL. Please provide a valid X/Twitter post URL.'));
      process.exit(1);
    }

    const accountName = resolveAccount(globalOpts?.account);
    const count = parseInt(options.count || '10', 10);

    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn(accountName);
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    console.log(chalk.blue('Fetching replies...'));
    const posts = await getReplies(accountName, postUrl, count);

    if (posts.length === 0) {
      console.log(chalk.yellow('No replies found on this post.'));
      return;
    }

    console.log('');
    for (const post of posts) {
      printReply(post);
    }
  } catch (error) {
    console.error(chalk.red('Failed to fetch replies:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

function printReply(post: TimelinePost): void {
  // Author line
  console.log(`${chalk.bold(post.author)} ${chalk.gray(post.handle)} ${chalk.gray('·')} ${chalk.gray(formatTimestamp(post.timestamp))}`);

  // Text
  console.log(post.text);

  // Images
  if (post.images && post.images.length > 0) {
    for (const img of post.images) {
      console.log(chalk.yellow(`Image: ${img}`));
    }
  }

  // URL
  if (post.url) {
    console.log(chalk.cyan(post.url));
  }

  // Engagement metrics
  console.log(chalk.gray(`Views: ${post.views}  Likes: ${post.likes}  Reposts: ${post.retweets}  Replies: ${post.replies}`));
  console.log('');
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxWidth) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [''];
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
