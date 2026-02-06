import chalk from 'chalk';
import { getNotifications, isLoggedIn, Notification } from '../api.js';
import { closeBrowser } from '../browser.js';
import { resolveAccount } from '../config.js';

export async function notificationsCommand(options: { count?: string }, globalOpts?: { account?: string }): Promise<void> {
  try {
    const accountName = resolveAccount(globalOpts?.account);
    const count = parseInt(options.count || '20', 10);

    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn(accountName);
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    console.log(chalk.blue('Fetching notifications...'));
    const notifications = await getNotifications(accountName, count);

    if (notifications.length === 0) {
      console.log(chalk.yellow('No notifications found.'));
      return;
    }

    console.log('');
    for (const notification of notifications) {
      printNotification(notification);
    }
  } catch (error) {
    console.error(chalk.red('Failed to fetch notifications:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

function printNotification(notification: Notification): void {
  // Timestamp and username
  const timePart = notification.timestamp ? formatTimestamp(notification.timestamp) : '';
  const userPart = notification.username ? notification.username : '';
  if (timePart || userPart) {
    console.log(chalk.gray([timePart, userPart].filter(Boolean).join(' ')));
  }

  // Action (e.g., "liked your reply")
  if (notification.action) {
    console.log(chalk.bold(notification.action));
  }

  // Text
  if (notification.text) {
    console.log(notification.text);
  }

  // URL if available
  if (notification.url) {
    console.log(chalk.cyan(notification.url));
  }

  // Engagement metrics (only show if there's associated content)
  if (notification.text) {
    console.log(chalk.gray(`Views: ${notification.views}  Likes: ${notification.likes}  Reposts: ${notification.reposts}  Replies: ${notification.replies}`));
  }
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
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  } catch {
    return timestamp;
  }
}
