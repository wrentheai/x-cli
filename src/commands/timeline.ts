import chalk from 'chalk';
import { getTimeline, isLoggedIn, TimelinePost } from '../api.js';
import { closeBrowser } from '../browser.js';

export async function timelineCommand(options: { count?: string; following?: boolean }): Promise<void> {
  try {
    const count = parseInt(options.count || '10', 10);
    const useFollowing = options.following || false;

    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    const feedType = useFollowing ? 'Following' : 'For You';
    console.log(chalk.blue(`Fetching ${feedType} timeline...`));
    const posts = await getTimeline(count, useFollowing);

    if (posts.length === 0) {
      console.log(chalk.yellow('No posts found in timeline.'));
      return;
    }

    console.log('');
    for (const post of posts) {
      printPost(post);
    }
  } catch (error) {
    console.error(chalk.red('Failed to fetch timeline:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

function printPost(post: TimelinePost): void {
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
