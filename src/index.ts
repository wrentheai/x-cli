#!/usr/bin/env node

import { program } from 'commander';
import { postCommand } from './commands/post.js';
import { articleCommand } from './commands/article.js';
import { timelineCommand } from './commands/timeline.js';
import { notificationsCommand } from './commands/notifications.js';
import { repliesCommand } from './commands/replies.js';
import { replyCommand } from './commands/reply.js';
import { deleteCommand } from './commands/delete.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';

program
  .name('x-cli')
  .description('CLI tool for posting to X (Twitter) using browser automation')
  .version('1.0.0');

program
  .command('login')
  .description('Open browser for manual login to X')
  .action(loginCommand);

program
  .command('logout')
  .description('Clear saved session data')
  .action(logoutCommand);

program
  .command('post <text>')
  .description('Create a new post')
  .action(postCommand);

program
  .command('article <title>')
  .description('Create a long-form article')
  .option('-f, --file <path>', 'Path to markdown file')
  .option('-b, --body <content>', 'Inline markdown content')
  .action(articleCommand);

program
  .command('timeline')
  .description('View your home timeline')
  .option('-c, --count <number>', 'Number of posts to show', '10')
  .option('-f, --following', 'Show Following tab instead of For You')
  .action(timelineCommand);

program
  .command('notifications')
  .description('View your notifications')
  .option('-c, --count <number>', 'Number of notifications to show', '20')
  .action(notificationsCommand);

program
  .command('replies <post-url>')
  .description('View replies on a post')
  .option('-c, --count <number>', 'Number of replies to show', '10')
  .action(repliesCommand);

program
  .command('reply <post-url> <text>')
  .description('Reply to a post')
  .action(replyCommand);

program
  .command('delete <post-url>')
  .description('Delete a post')
  .action(deleteCommand);

program.parse();
