import { marked } from 'marked';
import { Page } from 'playwright';

interface MarkdownToken {
  type: string;
  text?: string;
  tokens?: MarkdownToken[];
  items?: MarkdownToken[];
  href?: string;
  depth?: number;
}

/**
 * Convert markdown to keyboard actions for X's article editor
 * This types the content with appropriate formatting
 */
export async function typeMarkdownContent(page: Page, markdown: string): Promise<void> {
  const tokens = marked.lexer(markdown);

  for (const token of tokens) {
    await processToken(page, token as MarkdownToken);
  }
}

async function processToken(page: Page, token: MarkdownToken): Promise<void> {
  switch (token.type) {
    case 'heading':
      await typeHeading(page, token);
      break;

    case 'paragraph':
      await typeParagraph(page, token);
      break;

    case 'text':
      await page.keyboard.type(token.text || '', { delay: 5 });
      break;

    case 'strong':
      // Bold text - use Cmd+B on Mac, Ctrl+B on others
      await page.keyboard.press('Meta+b');
      await page.keyboard.type(token.text || getTextFromTokens(token.tokens), { delay: 5 });
      await page.keyboard.press('Meta+b');
      break;

    case 'em':
      // Italic text - use Cmd+I on Mac, Ctrl+I on others
      await page.keyboard.press('Meta+i');
      await page.keyboard.type(token.text || getTextFromTokens(token.tokens), { delay: 5 });
      await page.keyboard.press('Meta+i');
      break;

    case 'link':
      // Type link text, select it, and apply link
      const linkText = token.text || getTextFromTokens(token.tokens);
      await page.keyboard.type(linkText, { delay: 5 });
      // Select the text we just typed
      for (let i = 0; i < linkText.length; i++) {
        await page.keyboard.press('Shift+ArrowLeft');
      }
      // Try to apply link - this varies by editor
      await page.keyboard.press('Meta+k');
      await page.waitForTimeout(300);
      await page.keyboard.type(token.href || '', { delay: 5 });
      await page.keyboard.press('Enter');
      break;

    case 'space':
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      break;

    case 'list':
      for (const item of token.items || []) {
        await page.keyboard.type('• ', { delay: 5 });
        await processToken(page, item);
        await page.keyboard.press('Enter');
      }
      break;

    case 'list_item':
      if (token.tokens) {
        for (const subToken of token.tokens) {
          await processToken(page, subToken);
        }
      }
      break;

    case 'code':
      // Inline code
      await page.keyboard.type('`' + (token.text || '') + '`', { delay: 5 });
      break;

    case 'codespan':
      await page.keyboard.type('`' + (token.text || '') + '`', { delay: 5 });
      break;

    case 'blockquote':
      await page.keyboard.type('> ', { delay: 5 });
      if (token.tokens) {
        for (const subToken of token.tokens) {
          await processToken(page, subToken);
        }
      }
      break;

    default:
      // For unknown tokens, just try to type any text content
      if (token.text) {
        await page.keyboard.type(token.text, { delay: 5 });
      }
  }
}

async function typeHeading(page: Page, token: MarkdownToken): Promise<void> {
  const text = token.text || getTextFromTokens(token.tokens);
  const depth = token.depth || 1;

  // X's article editor might use different methods for headings
  // Try using markdown syntax which some editors auto-convert
  const prefix = '#'.repeat(depth) + ' ';
  await page.keyboard.type(prefix + text, { delay: 5 });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
}

async function typeParagraph(page: Page, token: MarkdownToken): Promise<void> {
  if (token.tokens) {
    for (const subToken of token.tokens) {
      await processToken(page, subToken);
    }
  } else if (token.text) {
    await page.keyboard.type(token.text, { delay: 5 });
  }
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
}

function getTextFromTokens(tokens?: MarkdownToken[]): string {
  if (!tokens) return '';
  return tokens.map(t => t.text || getTextFromTokens(t.tokens)).join('');
}

/**
 * Convert markdown to plain text (fallback for basic editors)
 */
export function markdownToPlainText(markdown: string): string {
  // Simple conversion - strip markdown syntax
  return markdown
    .replace(/#{1,6}\s+/g, '') // Remove headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/>\s+/g, '') // Remove blockquotes
    .replace(/[-*]\s+/g, '• ') // Convert lists
    .trim();
}

/**
 * Parse markdown and return structured content
 */
export function parseMarkdown(markdown: string): { title?: string; content: string } {
  const lines = markdown.split('\n');
  let title: string | undefined;
  let contentStart = 0;

  // Check if first non-empty line is an H1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      if (line.startsWith('# ')) {
        title = line.slice(2);
        contentStart = i + 1;
      }
      break;
    }
  }

  const content = lines.slice(contentStart).join('\n').trim();
  return { title, content };
}
