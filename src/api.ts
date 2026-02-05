import { Page } from 'playwright';
import { getPage, getPersistentContext } from './browser.js';

const X_URL = 'https://x.com';

export interface Notification {
  action: string;
  username: string;
  text: string;
  timestamp: string;
  url: string;
  views: string;
  likes: string;
  reposts: string;
  replies: string;
}

export interface TimelinePost {
  author: string;
  handle: string;
  text: string;
  url: string;
  timestamp: string;
  views: string;
  likes: string;
  retweets: string;
  replies: string;
  images: string[];
}

export async function isLoggedIn(): Promise<boolean> {
  const page = await getPage();
  await page.goto(X_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for page to stabilize
  try {
    await page.waitForSelector('[data-testid="SideNav_NewTweet_Button"], [data-testid="loginButton"], [data-testid="primaryColumn"]', { timeout: 15000 });
  } catch {
    // Timeout - check what we have
  }

  // Check for logged-in indicators
  const loggedIn = await page.evaluate(() => {
    // If we see the compose tweet button or home timeline, we're logged in
    const composeBtn = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    const homeTimeline = document.querySelector('[data-testid="primaryColumn"]');
    const loginBtn = document.querySelector('[data-testid="loginButton"]');

    return (composeBtn !== null || homeTimeline !== null) && loginBtn === null;
  });

  return loggedIn;
}

export async function post(text: string): Promise<string> {
  const page = await getPage();
  await page.goto(X_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for and click the compose tweet button
  await page.waitForSelector('[data-testid="SideNav_NewTweet_Button"]', { timeout: 15000 });
  await page.click('[data-testid="SideNav_NewTweet_Button"]');
  await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });

  // Type the tweet text
  await page.click('[data-testid="tweetTextarea_0"]');
  await page.keyboard.type(text, { delay: 10 });

  // Wait a moment for the text to register
  await page.waitForTimeout(500);

  // Click the post button
  await page.click('[data-testid="tweetButton"]');

  // Wait for the tweet to be posted
  await page.waitForTimeout(2000);

  // Try to get the URL of the posted tweet from the notification or redirect
  const postUrl = await page.evaluate(() => {
    // Look for success notification or the latest tweet by the user
    const notification = document.querySelector('[data-testid="toast"]');
    if (notification) {
      const link = notification.querySelector('a');
      if (link) return link.href;
    }
    return null;
  });

  return postUrl || 'Post created successfully (URL not captured)';
}

export async function getTimeline(count = 10, following = false): Promise<TimelinePost[]> {
  const page = await getPage();
  await page.goto(X_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for tabs to load and select the right one
  await page.waitForSelector('[role="tab"]', { timeout: 15000 });

  if (following) {
    // Click the "Following" tab
    const followingTab = await page.$('[role="tab"]:has-text("Following")');
    if (followingTab) {
      await followingTab.click();
      await page.waitForTimeout(1000);
    }
  }

  // Wait for timeline to load
  await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });

  // Scroll a bit to load more tweets
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
  }

  const posts = await page.evaluate((maxCount) => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const results: TimelinePost[] = [];

    for (const tweet of Array.from(tweets).slice(0, maxCount)) {
      try {
        // Get author info
        const userLink = tweet.querySelector('a[href^="/"][role="link"]');
        const handle = userLink?.getAttribute('href')?.slice(1) || 'unknown';

        // Get display name
        const displayName = tweet.querySelector('[data-testid="User-Name"]')?.textContent?.split('@')[0]?.trim() || handle;

        // Get tweet text
        const textEl = tweet.querySelector('[data-testid="tweetText"]');
        const text = textEl?.textContent || '';

        // Get timestamp and URL
        const timeEl = tweet.querySelector('time');
        const timestamp = timeEl?.getAttribute('datetime') || '';
        const tweetLink = timeEl?.closest('a')?.getAttribute('href') || '';
        const url = tweetLink ? `https://x.com${tweetLink}` : '';

        // Get images
        const imageEls = tweet.querySelectorAll('[data-testid="tweetPhoto"] img, [data-testid="card.layoutLarge.media"] img');
        const images: string[] = [];
        for (const img of Array.from(imageEls)) {
          const src = img.getAttribute('src');
          if (src && !src.includes('profile_images') && !src.includes('emoji')) {
            images.push(src);
          }
        }

        // Get engagement metrics
        const viewsEl = tweet.querySelector('a[href*="/analytics"] span span');
        const likesEl = tweet.querySelector('[data-testid="like"] span');
        const retweetsEl = tweet.querySelector('[data-testid="retweet"] span');
        const repliesEl = tweet.querySelector('[data-testid="reply"] span');

        results.push({
          author: displayName,
          handle: `@${handle}`,
          text,
          url,
          timestamp,
          views: viewsEl?.textContent || '0',
          likes: likesEl?.textContent || '0',
          retweets: retweetsEl?.textContent || '0',
          replies: repliesEl?.textContent || '0',
          images,
        });
      } catch (e) {
        // Skip malformed tweets
      }
    }

    return results;
  }, count);

  return posts;
}

export async function getNotifications(count = 20): Promise<Notification[]> {
  const page = await getPage();
  await page.goto('https://x.com/notifications', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for notifications to load
  await page.waitForSelector('[data-testid="cellInnerDiv"]', { timeout: 15000 });

  // Scroll to load more
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
  }

  const notifications = await page.evaluate((maxCount) => {
    const items = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    const results: Notification[] = [];

    for (const item of Array.from(items).slice(0, maxCount)) {
      try {
        // Get the notification action (e.g., "X liked your reply", "X followed you")
        // This is usually in a span or div before the tweet content
        let action = '';
        const allText = item.textContent || '';

        // Look for common notification patterns
        const actionPatterns = [
          /(.+liked your.+?)(?=\d|$)/i,
          /(.+retweeted your.+?)(?=\d|$)/i,
          /(.+replied to.+?)(?=\d|$)/i,
          /(.+mentioned you.+?)(?=\d|$)/i,
          /(.+followed you)/i,
          /(.+posted.+?)(?=\d|$)/i,
        ];

        for (const pattern of actionPatterns) {
          const match = allText.match(pattern);
          if (match) {
            action = match[1].trim();
            break;
          }
        }

        // If no pattern matched, try to get text before the tweet
        if (!action) {
          const userNameEl = item.querySelector('[data-testid="User-Name"]');
          if (userNameEl) {
            // Get text content before the username element
            const spans = item.querySelectorAll('span');
            for (const span of Array.from(spans)) {
              const spanText = span.textContent?.trim() || '';
              if (spanText.includes('liked') || spanText.includes('retweeted') ||
                  spanText.includes('replied') || spanText.includes('followed') ||
                  spanText.includes('mentioned') || spanText.includes('posted')) {
                action = spanText;
                break;
              }
            }
          }
        }

        // Get tweet text specifically
        const tweetTextEl = item.querySelector('[data-testid="tweetText"]');
        let text = tweetTextEl?.textContent?.trim() || '';

        // If no tweet text, try to get general notification text
        if (!text) {
          // Get text from article or main content area, excluding metrics
          const articleEl = item.querySelector('article');
          if (articleEl) {
            const clone = articleEl.cloneNode(true) as HTMLElement;
            // Remove metric elements from clone
            clone.querySelectorAll('[data-testid="like"], [data-testid="retweet"], [data-testid="reply"], [role="group"]').forEach(el => el.remove());
            text = clone.textContent?.trim() || '';
          }
        }

        if (!action && (!text || text.length < 5)) continue;

        // Get timestamp if available
        const timeEl = item.querySelector('time');
        const timestamp = timeEl?.getAttribute('datetime') || '';

        // Get link if available
        const linkEl = item.querySelector('a[href*="/status/"]');
        const href = linkEl?.getAttribute('href') || '';
        const url = href ? `https://x.com${href}` : '';

        // Get username/handle
        let username = '';
        const userLinkEl = item.querySelector('a[href^="/"][role="link"]');
        if (userLinkEl) {
          const href = userLinkEl.getAttribute('href');
          if (href && !href.includes('/status/')) {
            username = '@' + href.slice(1);
          }
        }

        // Get engagement metrics
        const viewsEl = item.querySelector('[data-testid="app-text-transition-container"]');
        const likesEl = item.querySelector('[data-testid="like"] span');
        const repostsEl = item.querySelector('[data-testid="retweet"] span');
        const repliesEl = item.querySelector('[data-testid="reply"] span');

        results.push({
          action,
          username,
          text,
          timestamp,
          url,
          views: viewsEl?.textContent || '0',
          likes: likesEl?.textContent || '0',
          reposts: repostsEl?.textContent || '0',
          replies: repliesEl?.textContent || '0',
        });
      } catch (e) {
        // Skip malformed notifications
      }
    }

    return results;
  }, count);

  return notifications;
}

export async function getReplies(postUrl: string, count = 10): Promise<TimelinePost[]> {
  const page = await getPage();
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the main tweet and replies to load
  await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });

  // Scroll to load more replies
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
  }

  const posts = await page.evaluate((maxCount) => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const results: TimelinePost[] = [];

    // Skip the first tweet (the main post) and get replies
    for (const tweet of Array.from(tweets).slice(1, maxCount + 1)) {
      try {
        const userLink = tweet.querySelector('a[href^="/"][role="link"]');
        const handle = userLink?.getAttribute('href')?.slice(1) || 'unknown';
        const displayName = tweet.querySelector('[data-testid="User-Name"]')?.textContent?.split('@')[0]?.trim() || handle;
        const textEl = tweet.querySelector('[data-testid="tweetText"]');
        const text = textEl?.textContent || '';
        const timeEl = tweet.querySelector('time');
        const timestamp = timeEl?.getAttribute('datetime') || '';
        const tweetLink = timeEl?.closest('a')?.getAttribute('href') || '';
        const url = tweetLink ? `https://x.com${tweetLink}` : '';

        // Get images
        const imageEls = tweet.querySelectorAll('[data-testid="tweetPhoto"] img, [data-testid="card.layoutLarge.media"] img');
        const images: string[] = [];
        for (const img of Array.from(imageEls)) {
          const src = img.getAttribute('src');
          if (src && !src.includes('profile_images') && !src.includes('emoji')) {
            images.push(src);
          }
        }

        const viewsEl = tweet.querySelector('a[href*="/analytics"] span span');
        const likesEl = tweet.querySelector('[data-testid="like"] span');
        const retweetsEl = tweet.querySelector('[data-testid="retweet"] span');
        const repliesEl = tweet.querySelector('[data-testid="reply"] span');

        results.push({
          author: displayName,
          handle: `@${handle}`,
          text,
          url,
          timestamp,
          views: viewsEl?.textContent || '0',
          likes: likesEl?.textContent || '0',
          retweets: retweetsEl?.textContent || '0',
          replies: repliesEl?.textContent || '0',
          images,
        });
      } catch (e) {
        // Skip malformed tweets
      }
    }

    return results;
  }, count);

  return posts;
}

export async function reply(postUrl: string, text: string): Promise<string> {
  const page = await getPage();
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the tweet to load
  await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

  // Click the reply button on the main tweet
  const replyButton = await page.$('[data-testid="reply"]');
  if (!replyButton) {
    throw new Error('Could not find reply button');
  }
  await replyButton.click();

  // Wait for reply modal
  await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });

  // Type the reply
  await page.click('[data-testid="tweetTextarea_0"]');
  await page.keyboard.type(text, { delay: 10 });

  await page.waitForTimeout(500);

  // Click reply/post button
  await page.click('[data-testid="tweetButton"]');

  // Wait for the reply to be posted
  await page.waitForTimeout(2000);

  return 'Reply posted successfully';
}

export async function deletePost(postUrl: string): Promise<string> {
  const page = await getPage();
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the tweet to load
  await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

  // Click the more options button (three dots)
  const moreButton = await page.$('[data-testid="caret"]');
  if (!moreButton) {
    throw new Error('Could not find more options button. Make sure this is your own post.');
  }
  await moreButton.click();

  // Wait for dropdown and click delete
  await page.waitForSelector('[data-testid="Dropdown"]', { timeout: 5000 });

  // Find and click delete option
  const deleteOption = await page.$('[role="menuitem"]:has-text("Delete")');
  if (!deleteOption) {
    throw new Error('Delete option not found. This may not be your post.');
  }
  await deleteOption.click();

  // Confirm deletion
  await page.waitForSelector('[data-testid="confirmationSheetConfirm"]', { timeout: 5000 });
  await page.click('[data-testid="confirmationSheetConfirm"]');

  await page.waitForTimeout(1000);

  return 'Post deleted successfully';
}

export async function createArticle(title: string, markdownContent: string): Promise<string> {
  const page = await getPage();

  // Navigate to article creation
  await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for compose modal
  await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });

  // Look for the article/long-form option (Notes on X)
  // First, let's click the compose area to activate it
  await page.click('[data-testid="tweetTextarea_0"]');

  // Look for "Add" or article button in the compose toolbar
  // X's article feature is called "Notes" - we need to access it
  const notesButton = await page.$('[aria-label="Write an article"]');

  if (!notesButton) {
    // Try alternative: go directly to notes URL
    await page.goto('https://x.com/i/notes/compose', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } else {
    await notesButton.click();
  }

  // Wait for article editor to load
  await page.waitForTimeout(2000);

  // Check if we're in the notes editor
  const inNotesEditor = await page.evaluate(() => {
    return window.location.href.includes('notes');
  });

  if (!inNotesEditor) {
    // Fallback: try direct navigation
    await page.goto('https://x.com/i/notes/compose', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  }

  // Find and fill the title
  const titleInput = await page.$('[data-testid="articleTitle"], [placeholder*="Title"], [contenteditable="true"]:first-of-type');
  if (titleInput) {
    await titleInput.click();
    await page.keyboard.type(title, { delay: 10 });
    await page.keyboard.press('Tab');
  }

  // Find the content area and type the content
  // For now, we'll type plain text - markdown conversion happens in the markdown.ts module
  const contentArea = await page.$('[data-testid="articleBody"], [contenteditable="true"]:not(:first-of-type), .public-DraftEditor-content');
  if (contentArea) {
    await contentArea.click();
    await page.keyboard.type(markdownContent, { delay: 5 });
  } else {
    // Try finding any editable area
    await page.keyboard.type(markdownContent, { delay: 5 });
  }

  await page.waitForTimeout(1000);

  // Look for publish/post button
  const publishButton = await page.$('[data-testid="publishButton"], button:has-text("Publish"), button:has-text("Post")');
  if (publishButton) {
    await publishButton.click();
    await page.waitForTimeout(3000);
  }

  return 'Article created successfully';
}

export async function openLoginPage(): Promise<Page> {
  const ctx = await getPersistentContext(false); // Non-headless for login
  const page = await ctx.newPage();
  await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for login form to appear
  await page.waitForSelector('input[autocomplete="username"], input[name="text"], [data-testid="loginButton"]', { timeout: 30000 }).catch(() => {});
  return page;
}
