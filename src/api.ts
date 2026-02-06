import { Page } from 'playwright';
import { getPage, getPersistentContext } from './browser.js';
import { typeMarkdownContent } from './markdown.js';
import { loadConfig, updateAccountHandle } from './config.js';

const X_URL = 'https://x.com';

/** Navigate to a URL and dismiss any blocking modals. */
async function gotoAndDismiss(page: Page, url: string, options?: { waitUntil?: 'domcontentloaded' | 'load'; timeout?: number }): Promise<void> {
  await page.goto(url, { waitUntil: options?.waitUntil ?? 'domcontentloaded', timeout: options?.timeout ?? 30000 });
  await dismissModals(page);
}

/** Dismiss cookie consent / login modals that block interaction on X pages. */
async function dismissModals(page: Page): Promise<void> {
  // Wait a moment for modals to appear
  await page.waitForTimeout(1000);

  // Check if cookie consent mask is present
  const hasCookieMask = await page.$('[data-testid="twc-cc-mask"]');
  
  if (hasCookieMask) {
    // Try to find and click the actual consent buttons using JavaScript
    // Use dispatchEvent to ensure the click is processed
    const clicked = await page.evaluate(() => {
      // Look for buttons in the layers/bottom bar area
      const buttons = document.querySelectorAll('button, [role="button"]');
      for (const btn of Array.from(buttons)) {
        const text = btn.textContent?.toLowerCase() || '';
        // Accept cookies to dismiss the dialog permanently
        if (text.includes('accept all') || text.includes('accept cookies') || 
            text === 'accept' || text.includes('refuse non-essential') ||
            text.includes('refuse all') || text === 'refuse') {
          // Dispatch mouse events to simulate real click
          const el = btn as HTMLElement;
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      // Wait for the consent to be processed
      await page.waitForTimeout(2000);
    }
  }

  // Check again after JavaScript click attempt
  const stillHasMaskAfterClick = await page.$('[data-testid="twc-cc-mask"]');
  
  if (stillHasMaskAfterClick) {
    // Try clicking via Playwright with force
    const consentSelectors = [
      '[data-testid="BottomBar"] button:has-text("Refuse")',
      '[data-testid="BottomBar"] button:has-text("Accept")',
      'button:has-text("Refuse non-essential")',
      'button:has-text("Accept all")',
      'button:has-text("Accept cookies")',
      '#layers [role="button"]:has-text("Accept")',
      '#layers [role="button"]:has-text("Refuse")',
    ];

    for (const selector of consentSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click({ force: true });
          await page.waitForTimeout(1500);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }
  }

  // Final check - if mask still there, remove it via DOM manipulation
  await page.waitForTimeout(500);
  const stillHasMask = await page.$('[data-testid="twc-cc-mask"]');
  
  if (stillHasMask) {
    // Last resort: forcibly remove blocking elements AND set cookie
    await page.evaluate(() => {
      // Try to set the cookie consent preference directly
      document.cookie = 'twid=1; path=/; domain=.x.com';
      
      // Remove cookie consent mask
      const mask = document.querySelector('[data-testid="twc-cc-mask"]');
      if (mask) mask.remove();

      // Remove any element with cc-mask in class
      document.querySelectorAll('[class*="cc-mask"]').forEach(el => el.remove());

      // Remove the bottom bar cookie banner
      const bottomBar = document.querySelector('[data-testid="BottomBar"]');
      if (bottomBar) bottomBar.remove();

      // Remove any sheet dialogs that might be blocking
      document.querySelectorAll('[data-testid="sheetDialog"]').forEach(el => el.remove());
      
      // Remove entire #layers if it only contains cookie stuff
      const layers = document.querySelector('#layers');
      if (layers && layers.children.length > 0) {
        // Remove all children that look like overlays
        Array.from(layers.children).forEach(child => {
          const testId = child.getAttribute('data-testid') || '';
          if (testId.includes('cc') || testId.includes('mask') || testId.includes('consent')) {
            child.remove();
          }
        });
      }
    }).catch(() => {});
    
  }

  await page.waitForTimeout(300);
}

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

/** Detect the @handle of the currently logged-in account from the sidebar. */
export async function detectHandle(accountName: string): Promise<string | null> {
  const page = await getPage(accountName);
  await gotoAndDismiss(page, X_URL);
  await page.waitForTimeout(2000);

  const handle = await page.evaluate(() => {
    // The account switcher button in the sidebar contains the handle
    const accountBtn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (accountBtn) {
      const spans = accountBtn.querySelectorAll('span');
      for (const span of Array.from(spans)) {
        const text = span.textContent?.trim() || '';
        if (text.startsWith('@')) return text;
      }
    }
    return null;
  });

  return handle;
}

function getHandleForAccount(accountName: string): string | null {
  const config = loadConfig();
  return config.accounts[accountName]?.handle || null;
}

export async function isLoggedIn(accountName: string): Promise<boolean> {
  const page = await getPage(accountName);
  await gotoAndDismiss(page, X_URL);

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

export async function post(accountName: string, text: string): Promise<string> {
  const page = await getPage(accountName);
  await gotoAndDismiss(page, X_URL);

  // Dismiss modals again to ensure clean state
  await dismissModals(page);

  // Wait for and click the compose tweet button
  await page.waitForSelector('[data-testid="SideNav_NewTweet_Button"]', { timeout: 15000 });
  await page.click('[data-testid="SideNav_NewTweet_Button"]', { force: true });
  
  // Dismiss any modals that appeared after clicking compose
  await page.waitForTimeout(500);
  await dismissModals(page);
  
  await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });

  // Dismiss modals once more before typing
  await dismissModals(page);

  // Type the tweet text using force click
  await page.click('[data-testid="tweetTextarea_0"]', { force: true });
  await page.keyboard.type(text, { delay: 10 });

  // Wait a moment for the text to register
  await page.waitForTimeout(500);

  // Dismiss any modals before clicking post
  await dismissModals(page);

  // Click the post button - try multiple methods
  const postButton = await page.$('[data-testid="tweetButton"]');
  if (postButton) {
    // Try clicking via JavaScript first
    await page.evaluate((btn) => {
      const el = btn as HTMLElement;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, postButton);
  }
  
  // Also try Playwright click as backup
  await page.click('[data-testid="tweetButton"]', { force: true }).catch(() => {});

  // Wait for the tweet to be posted
  await page.waitForTimeout(3000);

  // Verify the post was actually sent by checking if compose modal closed
  const composeStillOpen = await page.$('[data-testid="tweetTextarea_0"]');
  if (composeStillOpen) {
    // Try clicking Post button again with different method
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="tweetButton"]') as HTMLElement;
      if (btn) {
        btn.click();
      }
    });
    await page.waitForTimeout(2000);
  }

  // Check again
  const stillOpen = await page.$('[data-testid="tweetTextarea_0"]');
  if (stillOpen) {
    // Take a screenshot for debugging
    await page.screenshot({ path: '/tmp/x-cli-post-failed.png' });
    console.log('Screenshot saved to /tmp/x-cli-post-failed.png');
    throw new Error('Post failed - compose modal still open. Cookie consent may be blocking.');
  }

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

export async function getTimeline(accountName: string, count = 10, following = false): Promise<TimelinePost[]> {
  const page = await getPage(accountName);
  await gotoAndDismiss(page, X_URL);

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

export async function getNotifications(accountName: string, count = 20): Promise<Notification[]> {
  const page = await getPage(accountName);
  await gotoAndDismiss(page, 'https://x.com/notifications');

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

export async function getReplies(accountName: string, postUrl: string, count = 10): Promise<TimelinePost[]> {
  const page = await getPage(accountName);
  await gotoAndDismiss(page, postUrl);

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

export async function reply(accountName: string, postUrl: string, text: string): Promise<string> {
  const page = await getPage(accountName);
  await gotoAndDismiss(page, postUrl);

  // Wait for the tweet to load
  await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

  // Dismiss modals again in case they appeared after navigation
  await dismissModals(page);

  // Extract the status ID from the URL to find the correct tweet
  const statusMatch = postUrl.match(/status\/(\d+)/);
  const targetStatusId = statusMatch ? statusMatch[1] : null;

  // Find the correct tweet by looking for the one with matching status ID in its time link
  // On a tweet detail page, the main tweet has a time element with a link to itself
  let clicked = false;
  
  if (targetStatusId) {
    // Get all tweets on the page
    const tweets = await page.$$('[data-testid="tweet"]');
    
    for (const tweet of tweets) {
      // Check if this tweet has a time link pointing to our target status ID
      const timeLink = await tweet.$(`a[href*="/status/${targetStatusId}"]`);
      if (timeLink) {
        // This is the correct tweet - click its reply button
        const replyBtn = await tweet.$('[data-testid="reply"]');
        if (replyBtn) {
          await replyBtn.click();
          clicked = true;
          break;
        }
      }
    }
  }
  
  if (!clicked) {
    // Fallback: click the first reply button (old behavior)
    const fallbackButton = await page.$('[data-testid="reply"]');
    if (!fallbackButton) {
      throw new Error('Could not find reply button');
    }
    await fallbackButton.click();
  }

  // Wait for reply modal and dismiss any blocking overlays
  await page.waitForTimeout(500);
  await dismissModals(page);

  await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });

  // Dismiss again after modal opens
  await dismissModals(page);

  // Type the reply using force click to bypass any remaining overlays
  const textarea = await page.$('[data-testid="tweetTextarea_0"]');
  if (textarea) {
    await textarea.click({ force: true });
  } else {
    await page.click('[data-testid="tweetTextarea_0"]', { force: true });
  }
  await page.keyboard.type(text, { delay: 10 });

  await page.waitForTimeout(500);

  // Click reply/post button with force
  await page.click('[data-testid="tweetButton"]', { force: true });

  // Wait for the reply to be posted
  await page.waitForTimeout(2000);

  return 'Reply posted successfully';
}

export async function deletePost(accountName: string, postUrl: string): Promise<string> {
  const page = await getPage(accountName);
  await gotoAndDismiss(page, postUrl);

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

/** Click the center of an element's bounding box. */
async function clickCenter(page: Page, el: import('playwright').ElementHandle): Promise<boolean> {
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

/** Open the publish confirmation dialog and confirm. Returns the published URL or null. */
async function publishArticle(page: Page): Promise<string | null> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const publishBtn = await page.$('button:has-text("Publish")');
  if (!publishBtn) return null;

  // First click shows tooltip, click away to dismiss, then click again to open dialog
  await clickCenter(page, publishBtn);
  await page.waitForTimeout(1000);
  const box = await publishBtn.boundingBox();
  if (box) await page.mouse.click(box.x - 100, box.y);
  await page.waitForTimeout(500);
  await clickCenter(page, publishBtn);
  await page.waitForTimeout(3000);

  // Confirm in the dialog
  const dialog = await page.$('[role="dialog"]');
  if (dialog) {
    const confirmBtn = await dialog.$('button:has-text("Publish")');
    if (confirmBtn) {
      await clickCenter(page, confirmBtn);
      await page.waitForTimeout(5000);
    }
  }

  // Check for published URL
  const postUrl = page.url();
  if (postUrl.includes('/status/')) return postUrl;

  // Check for success toast with View link
  const successEl = await page.$('text=Success');
  if (successEl) {
    const viewLink = await page.$('a:has-text("View")');
    if (viewLink) {
      const href = await viewLink.getAttribute('href');
      if (href) return href.startsWith('http') ? href : `https://x.com${href}`;
    }
    return 'Article published successfully!';
  }

  return null;
}

export async function createArticle(accountName: string, title: string, markdownContent: string, publish = false): Promise<string> {
  const page = await getPage(accountName);

  // Navigate and create new article
  await gotoAndDismiss(page, 'https://x.com/compose/articles');
  await page.waitForTimeout(2000);
  const createButton = await page.locator('button:has-text("create"), [aria-label="create"]').first();
  await createButton.click({ force: true });
  await page.waitForTimeout(2000);

  // Wait for editor to load and type title
  await page.waitForSelector('[placeholder="Add a title"]', { timeout: 15000 });
  await page.waitForTimeout(1000);
  const titleField = await page.$('[placeholder="Add a title"]');
  if (titleField) {
    await titleField.click();
    await page.keyboard.type(title, { delay: 15 });
  }

  // Click into the body editor and type formatted content
  await page.waitForSelector('.public-DraftEditor-content', { timeout: 10000 }).catch(() => {});
  const bodyEditor = await page.$('.public-DraftEditor-content, [contenteditable="true"]');
  if (bodyEditor) {
    await bodyEditor.click();
    await page.waitForTimeout(500);
  }
  await typeMarkdownContent(page, markdownContent);
  // Trigger save by clicking outside editor, then wait for autosave
  await page.mouse.click(100, 100);
  await page.waitForTimeout(5000);

  // Get draft URL
  const draftMatch = page.url().match(/\/compose\/articles\/edit\/(\d+)/);
  const draftUrl = draftMatch ? `https://x.com/compose/articles/edit/${draftMatch[1]}` : null;

  // Publish if requested
  if (publish) {
    try {
      const publishedUrl = await publishArticle(page);
      if (publishedUrl) return publishedUrl;
    } catch (e) {
      console.error('Publish attempt failed:', e);
    }
  }

  if (draftUrl) return draftUrl;

  // Fallback: find newest draft from articles list
  await gotoAndDismiss(page, 'https://x.com/compose/articles');
  await page.waitForTimeout(2000);
  const newestDraft = await page.evaluate(() => {
    const link = document.querySelector('a[href*="/compose/articles/edit/"]') as HTMLAnchorElement | null;
    return link?.href || null;
  });

  return newestDraft || 'Draft saved. Open https://x.com/compose/articles to find it.';
}

export async function openLoginPage(accountName: string): Promise<Page> {
  const ctx = await getPersistentContext(accountName, false); // Non-headless for login
  const page = await ctx.newPage();
  await gotoAndDismiss(page, 'https://x.com/login', { timeout: 60000 });
  // Wait for login form to appear
  await page.waitForSelector('input[autocomplete="username"], input[name="text"], [data-testid="loginButton"]', { timeout: 30000 }).catch(() => {});
  return page;
}

// Analytics interfaces and functions
export interface AnalyticsData {
  summary: {
    posts: string;
    impressions: string;
    profileVisits: string;
    followers: string;
    newFollowers?: string;
  };
  topPosts: Array<{
    text: string;
    impressions: string;
    engagements: string;
    engagementRate: string;
    date: string;
    url: string;
  }>;
}

export async function getAnalytics(accountName: string, days = 28): Promise<AnalyticsData> {
  const page = await getPage(accountName);

  // Get the handle for this account (from config or detect dynamically)
  let handle = getHandleForAccount(accountName);
  if (!handle) {
    handle = await detectHandle(accountName);
    if (handle) updateAccountHandle(accountName, handle);
  }

  // Navigate to profile — use handle if available, otherwise detect from sidebar
  const profileUrl = handle ? `https://x.com/${handle.replace('@', '')}` : X_URL;
  await gotoAndDismiss(page, profileUrl);

  if (!handle) {
    // If we didn't have a handle, we're on the home page — try to detect and navigate
    const detected = await page.evaluate(() => {
      const accountBtn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      if (accountBtn) {
        const spans = accountBtn.querySelectorAll('span');
        for (const span of Array.from(spans)) {
          const text = span.textContent?.trim() || '';
          if (text.startsWith('@')) return text;
        }
      }
      return null;
    });
    if (detected) {
      handle = detected;
      updateAccountHandle(accountName, handle);
      await gotoAndDismiss(page, `https://x.com/${handle.replace('@', '')}`);
    }
  }

  await page.waitForTimeout(2000);

  const profileStats = await page.evaluate(() => {
    const followersLink = document.querySelector('a[href*="/verified_followers"], a[href*="/followers"]');
    const followingLink = document.querySelector('a[href*="/following"]');
    return {
      followers: followersLink?.textContent?.match(/(\d+[,.]?\d*[KMB]?)/)?.[1] || '0',
      following: followingLink?.textContent?.match(/(\d+[,.]?\d*[KMB]?)/)?.[1] || '0',
    };
  });

  // Get recent posts with their metrics
  const posts = await getMyPosts(accountName, 20);

  // Calculate totals
  let totalViews = 0;
  let totalLikes = 0;
  let totalReposts = 0;
  let totalReplies = 0;

  const parseMetric = (val: string): number => {
    if (!val || val === '0') return 0;
    const cleaned = val.replace(/,/g, '');
    if (cleaned.endsWith('K')) return parseFloat(cleaned) * 1000;
    if (cleaned.endsWith('M')) return parseFloat(cleaned) * 1000000;
    return parseInt(cleaned, 10) || 0;
  };

  for (const post of posts) {
    totalViews += parseMetric(post.views);
    totalLikes += parseMetric(post.likes);
    totalReposts += parseMetric(post.retweets);
    totalReplies += parseMetric(post.replies);
  }

  const formatNum = (n: number): string => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  // Sort posts by views to get top performers
  const sortedPosts = [...posts].sort((a, b) => parseMetric(b.views) - parseMetric(a.views));

  const result: AnalyticsData = {
    summary: {
      posts: posts.length.toString(),
      impressions: formatNum(totalViews),
      profileVisits: 'N/A',
      followers: profileStats.followers,
    },
    topPosts: sortedPosts.slice(0, 5).map(p => ({
      text: p.text,
      impressions: p.views,
      engagements: (parseMetric(p.likes) + parseMetric(p.retweets) + parseMetric(p.replies)).toString(),
      engagementRate: totalViews > 0 ?
        ((parseMetric(p.likes) + parseMetric(p.retweets) + parseMetric(p.replies)) / parseMetric(p.views) * 100).toFixed(1) + '%' : '0%',
      date: p.timestamp,
      url: p.url,
    })),
  };

  return result;
}

export async function getMyPosts(accountName: string, count = 10): Promise<TimelinePost[]> {
  const page = await getPage(accountName);

  // Get the handle for this account (from config or detect dynamically)
  let handle = getHandleForAccount(accountName);
  if (!handle) {
    handle = await detectHandle(accountName);
    if (handle) updateAccountHandle(accountName, handle);
  }

  // Navigate to profile
  const profileUrl = handle ? `https://x.com/${handle.replace('@', '')}` : X_URL;
  await gotoAndDismiss(page, profileUrl);

  if (!handle) {
    // Detect from sidebar and navigate to profile
    const detected = await page.evaluate(() => {
      const accountBtn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      if (accountBtn) {
        const spans = accountBtn.querySelectorAll('span');
        for (const span of Array.from(spans)) {
          const text = span.textContent?.trim() || '';
          if (text.startsWith('@')) return text;
        }
      }
      return null;
    });
    if (detected) {
      handle = detected;
      updateAccountHandle(accountName, handle);
      await gotoAndDismiss(page, `https://x.com/${handle.replace('@', '')}`);
    }
  }

  // Wait for posts to load
  await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });

  // Scroll to load more posts
  for (let i = 0; i < Math.ceil(count / 5); i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(500);
  }

  const posts = await page.evaluate((maxCount) => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const results: TimelinePost[] = [];

    for (const tweet of Array.from(tweets).slice(0, maxCount)) {
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
        const imageEls = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
        const images: string[] = [];
        for (const img of Array.from(imageEls)) {
          const src = img.getAttribute('src');
          if (src && !src.includes('profile_images')) images.push(src);
        }

        // Get metrics
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

export async function searchPosts(accountName: string, query: string, count = 10, useTop = false): Promise<TimelinePost[]> {
  const page = await getPage(accountName);

  // Navigate to search
  const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query${useTop ? '&f=top' : '&f=live'}`;
  await gotoAndDismiss(page, searchUrl);

  // Wait for results to load
  await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });

  // Scroll to load more
  for (let i = 0; i < Math.ceil(count / 5); i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(500);
  }

  const posts = await page.evaluate((maxCount) => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const results: TimelinePost[] = [];

    for (const tweet of Array.from(tweets).slice(0, maxCount)) {
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
        const imageEls = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
        const images: string[] = [];
        for (const img of Array.from(imageEls)) {
          const src = img.getAttribute('src');
          if (src && !src.includes('profile_images')) images.push(src);
        }

        // Get metrics
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
