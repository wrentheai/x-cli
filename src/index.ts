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
import { analyticsCommand } from './commands/analytics.js';
import { meCommand } from './commands/me.js';
import { searchCommand } from './commands/search.js';
import { defaultCommand } from './commands/default.js';
import { accountsCommand } from './commands/accounts.js';
import { migrateIfNeeded } from './config.js';

// Auto-migrate legacy data on startup
migrateIfNeeded();

program
  .name('x-cli')
  .description('CLI tool for posting to X (Twitter) using browser automation')
  .version('1.0.0')
  .option('-a, --account <name>', 'Account to use');

program
  .command('login [name]')
  .description('Open browser for manual login to X')
  .action((name: string | undefined) => loginCommand(name, program.opts()));

program
  .command('logout [name]')
  .description('Clear saved session data')
  .action((name: string | undefined) => logoutCommand(name, program.opts()));

program
  .command('accounts')
  .description('List all configured accounts')
  .action(() => accountsCommand());

program
  .command('default [name]')
  .description('Show or set the default account')
  .action((name: string | undefined) => defaultCommand(name));

program
  .command('post <text>')
  .description('Create a new post')
  .action((text: string) => postCommand(text, program.opts()));

program
  .command('article <title>')
  .description('Create a long-form article')
  .option('-f, --file <path>', 'Path to markdown file')
  .option('-b, --body <content>', 'Inline markdown content')
  .option('-p, --publish', 'Attempt to publish immediately after creation')
  .action((title: string, options: { file?: string; body?: string; publish?: boolean }) => articleCommand(title, options, program.opts()));

program
  .command('timeline')
  .description('View your home timeline')
  .option('-c, --count <number>', 'Number of posts to show', '10')
  .option('-f, --following', 'Show Following tab instead of For You')
  .action((options: { count?: string; following?: boolean }) => timelineCommand(options, program.opts()));

program
  .command('notifications')
  .description('View your notifications')
  .option('-c, --count <number>', 'Number of notifications to show', '20')
  .action((options: { count?: string }) => notificationsCommand(options, program.opts()));

program
  .command('replies <post-url>')
  .description('View replies on a post')
  .option('-c, --count <number>', 'Number of replies to show', '10')
  .action((postUrl: string, options: { count?: string }) => repliesCommand(postUrl, options, program.opts()));

program
  .command('reply <post-url> <text>')
  .description('Reply to a post')
  .action((postUrl: string, text: string) => replyCommand(postUrl, text, program.opts()));

program
  .command('delete <post-url>')
  .description('Delete a post')
  .action((postUrl: string) => deleteCommand(postUrl, program.opts()));

program
  .command('analytics')
  .description('View your account analytics')
  .option('-d, --days <number>', 'Number of days to show (7, 28, 90)', '28')
  .action((options: { days?: string }) => analyticsCommand(options, program.opts()));

program
  .command('me')
  .description('View your recent posts with engagement metrics')
  .option('-c, --count <number>', 'Number of posts to show', '10')
  .action((options: { count?: string }) => meCommand(options, program.opts()));

program
  .command('search <query>')
  .description('Search for posts')
  .option('-c, --count <number>', 'Number of results to show', '10')
  .option('-t, --top', 'Show top results instead of latest')
  .action((query: string, options: { count?: string; top?: boolean }) => searchCommand(query, options, program.opts()));

program.parse();
