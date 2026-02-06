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

/** Decode HTML entities that marked's lexer produces (e.g. &quot; &#39; &amp;). */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Convert markdown to keyboard actions for X's article editor.
 * Parses markdown tokens and applies formatting via toolbar and shortcuts.
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
      await page.keyboard.type(decodeEntities(token.text || ''), { delay: 1 });
      break;

    case 'strong':
      await page.keyboard.press('Meta+b');
      await page.keyboard.type(decodeEntities(token.text || getTextFromTokens(token.tokens)), { delay: 1 });
      await page.keyboard.press('Meta+b');
      break;

    case 'em':
      await page.keyboard.press('Meta+i');
      await page.keyboard.type(decodeEntities(token.text || getTextFromTokens(token.tokens)), { delay: 1 });
      await page.keyboard.press('Meta+i');
      break;

    case 'link': {
      const linkText = decodeEntities(token.text || getTextFromTokens(token.tokens));
      await page.keyboard.type(linkText, { delay: 1 });
      for (let i = 0; i < linkText.length; i++) {
        await page.keyboard.press('Shift+ArrowLeft');
      }
      await page.keyboard.press('Meta+k');
      await page.waitForTimeout(300);
      await page.keyboard.type(token.href || '', { delay: 1 });
      await page.keyboard.press('Enter');
      break;
    }

    case 'space':
      break;

    case 'list':
      for (const item of token.items || []) {
        await page.keyboard.type('• ', { delay: 1 });
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
    case 'codespan':
      await page.keyboard.type('`' + decodeEntities(token.text || '') + '`', { delay: 1 });
      break;

    case 'blockquote':
      await page.keyboard.type('> ', { delay: 1 });
      if (token.tokens) {
        for (const subToken of token.tokens) {
          await processToken(page, subToken);
        }
      }
      break;

    default:
      if (token.text) {
        await page.keyboard.type(decodeEntities(token.text), { delay: 1 });
      }
  }
}

/** Select a style from the editor's Body/Heading/Subheading dropdown. */
async function selectBlockStyle(page: Page, style: string): Promise<void> {
  const dropdown = await page.$('button:has-text("Body"), button:has-text("Heading"), button:has-text("Subheading")');
  if (!dropdown) return;

  const box = await dropdown.boundingBox();
  if (!box) return;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  const options = await page.$$('[role="option"], [role="menuitem"], [role="listbox"] div');
  for (const opt of options) {
    if ((await opt.textContent())?.trim() === style) {
      await opt.click();
      await page.waitForTimeout(200);
      return;
    }
  }
}

async function typeHeading(page: Page, token: MarkdownToken): Promise<void> {
  const text = decodeEntities(token.text || getTextFromTokens(token.tokens));
  const style = (token.depth || 1) <= 2 ? 'Heading' : 'Subheading';

  await selectBlockStyle(page, style);
  await page.keyboard.type(text, { delay: 1 });
  await page.keyboard.press('Enter');
  await selectBlockStyle(page, 'Body');
}

async function typeParagraph(page: Page, token: MarkdownToken): Promise<void> {
  if (token.tokens) {
    for (const subToken of token.tokens) {
      await processToken(page, subToken);
    }
  } else if (token.text) {
    await page.keyboard.type(decodeEntities(token.text), { delay: 1 });
  }
  await page.keyboard.press('Enter');
}

function getTextFromTokens(tokens?: MarkdownToken[]): string {
  if (!tokens) return '';
  return tokens.map(t => t.text || getTextFromTokens(t.tokens)).join('');
}

/**
 * Parse markdown and return structured content.
 * Extracts H1 as title if present.
 */
export function parseMarkdown(markdown: string): { title?: string; content: string } {
  const lines = markdown.split('\n');
  let title: string | undefined;
  let contentStart = 0;

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
