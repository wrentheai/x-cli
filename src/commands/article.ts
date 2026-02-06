import chalk from 'chalk';
import { readFileSync } from 'fs';
import { createArticle, isLoggedIn } from '../api.js';
import { closeBrowser } from '../browser.js';
import { parseMarkdown } from '../markdown.js';

interface ArticleOptions {
  file?: string;
  body?: string;
}

export async function articleCommand(title: string, options: ArticleOptions): Promise<void> {
  try {
    let content: string;

    if (options.file) {
      try {
        content = readFileSync(options.file, 'utf-8');
      } catch (err) {
        console.error(chalk.red(`Failed to read file: ${options.file}`));
        process.exit(1);
      }
    } else if (options.body) {
      content = options.body;
    } else {
      console.error(chalk.red('Please provide content using --file or --body'));
      process.exit(1);
    }

    console.log(chalk.blue('Checking login status...'));

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      console.log(chalk.red('Not logged in. Please run: x-cli login'));
      await closeBrowser();
      process.exit(1);
    }

    // Parse markdown - if title is in the content and not provided, extract it
    const parsed = parseMarkdown(content);
    const finalTitle = title || parsed.title || 'Untitled';
    const finalContent = parsed.content || content;

    console.log(chalk.blue(`Creating article: "${finalTitle}"...`));
    const result = await createArticle(finalTitle, finalContent);
    console.log(chalk.green('✓ Draft created with title!'));
    console.log(chalk.yellow('Note: X Articles require manual editing. Open the link, add body content, then click Publish.'));
    console.log(chalk.cyan(result));
  } catch (error) {
    console.error(chalk.red('Failed to create article:'), error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
