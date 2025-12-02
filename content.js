// content.js

console.log('🚀 Viva Auto-Comment content script loaded')

// Default settings
const DEFAULT_MESSAGE = 'm'
const DEFAULT_ENABLED = true

// Auto-comment only if post contains these keywords
const KEYWORDS = ['rush', 'rush below', 'job no', 'time', 'due date']

let settings = {
  message: DEFAULT_MESSAGE,
  enabled: DEFAULT_ENABLED,
  processedAttribute: 'data-auto-comment-processed',
}

// Track processed posts by unique identifier
const processedPosts = new Set()

// Debounce to prevent rapid-fire processing
let processingQueue = new Map()

// Load settings from storage
function loadSettings() {
  return new new Promise((resolve) => {
    chrome.storage?.sync?.get(['message', 'enabled'], (items) => {
      if (items) {
        settings.message = items.message || DEFAULT_MESSAGE
        settings.enabled = typeof items.enabled === 'boolean' ? items.enabled : DEFAULT_ENABLED
      }
      resolve()
    })
  })
}

// Generate unique identifier for a post
function getPostIdentifier(postEl) {
  // Try to find unique attributes
  const id =
    postEl.getAttribute('data-post-id') ||
    postEl.getAttribute('id') ||
    postEl.getAttribute('data-thread-id') ||
    postEl.getAttribute('data-testid')

  if (id) return id

  // Fallback: use combination of text + author + timestamp
  const authorEl = postEl.querySelector(
    '[class*="author"], [class*="name"], [data-test-id*="name"]'
  )
  const timeEl = postEl.querySelector('time, [class*="time"], [class*="timestamp"]')

  const author = authorEl ? authorEl.innerText.substring(0, 20) : ''
  const time = timeEl ? timeEl.innerText : ''
  const text = postEl.innerText.substring(0, 50).replace(/\s+/g, ' ')

  return `${author}-${time}-${text.length}-${text.substring(0, 15)}`
}

// Detect if post contains keywords (Improved and Debugged)
function postContainsKeyword(postEl) {
    const KEYWORDS_TO_CHECK = KEYWORDS; // Use the global KEYWORDS array
    
    // Attempt to find the main body text container, excluding comments and sidebars.
    // This makes the check more reliable by ignoring surrounding page elements.
    const mainBodyEl = postEl.querySelector(
        'div[class*="content-text"], p[class*="content-text"], [data-test-id*="post-body"], [data-testid*="post-body"]'
    );
    
    // If we can't find a specific body, fall back to the whole post innerText
    const textToSearch = (mainBodyEl || postEl).innerText.toLowerCase();

    // 🚨 DEBUG LOGGING: Use console to verify why a post is (or isn't) triggered
    console.log(`--- Checking Post ID: ${getPostIdentifier(postEl)} ---`);
    console.log(`Text analyzed (first 300 chars): ${textToSearch.substring(0, 300)}...`);
    
    let foundKeyword = false;

    // Iterate through keywords
    for (const kw of KEYWORDS_TO_CHECK) {
        if (textToSearch.includes(kw)) {
            console.log(`✅ KEYWORD FOUND: "${kw}"`);
            foundKeyword = true;
            // DO NOT return true immediately, let the loop finish for full logging
        }
    }

    if (!foundKeyword) {
        console.log(`❌ NO JOB KEYWORDS found. Post will be skipped.`);
    }
    console.log('---------------------------------------------');

    return foundKeyword;
}


// Check if post already has a comment from us (Improved using .includes)
function hasExistingComment(postEl) {
    const ourMessage = settings.message.toLowerCase().trim();
    
    // Find elements that are likely individual comment containers
    const allComments = postEl.querySelectorAll(
        'li[role="listitem"], div[data-test-id*="comment"], div[class*="comment-item"]'
    );
    
    if (allComments.length === 0) {
        return false;
    }

    for (const commentEl of allComments) {
        // Use .includes() for flexibility, as the comment might contain formatting or extra spaces.
        if (commentEl.innerText.toLowerCase().includes(ourMessage)) {
            console.log('⏭ Found existing comment by content:', ourMessage);
            return true;
        }
    }

    return false;
}

// Find the actual post container (Optimized with closest)
function findPostElement(element) {
    // Viva Engage / Yammer specific selectors
    const POST_SELECTOR = [
        '[role="feed"] > div[role="article"]',
        '[data-test-id="thread-card"]',
        '[data-test-id="feed-item"]',
        '[class*="threadCard"]',
        '[data-thread-id]',
        'article',
        'div[role="article"]',
    ].join(', '); // Join them into a single selector string

    // 1. Check if the element itself is a match (for added nodes)
    if (element.matches && element.matches(POST_SELECTOR)) {
        return element;
    }

    // 2. Use closest() to find the nearest parent that matches a known post selector (Most reliable)
    const closestPost = element.closest(POST_SELECTOR);

    if (closestPost) {
        return closestPost;
    }

    // 3. Fallback check (for elements that don't fit the selectors)
    let current = element;
    for (let i = 0; i < 8; i++) {
        if (!current.parentElement) break;
        current = current.parentElement;

        const hasComment = current.querySelector('[aria-label*="omment"], button[title*="omment"]');
        const hasText = current.innerText && current.innerText.length > 50;

        if (hasComment && hasText && !current.matches('body, html, main')) {
            return current;
        }
    }

    return null;
}

// Feed container detection
function findFeedContainer() {
  const candidates = [
    '[data-test-id="feed"]',
    '[class*="feed-container"]',
    '[class*="threadFeed"]',
    'div[class*="feed"]',
    '[role="feed"]',
    'main[role="main"]',
    'main',
  ]

  for (const sel of candidates) {
    const el = document.querySelector(sel)
    if (el) {
      console.log('✓ Feed container found:', sel)
      return el
    }
  }

  // Find a scrollable container with lots of content
  const scrollable = Array.from(document.querySelectorAll('div')).find(
    (d) =>
      d.scrollHeight > 1000 && d.offsetHeight > 300 && getComputedStyle(d).overflow !== 'hidden'
  )

  if (scrollable) {
    console.log('✓ Feed container found: scrollable div')
    return scrollable
  }

  
  return document.body
}

// Find comment controls
function findCommentControls(postEl) {
  const commentButtonSelectors = [
    'button[aria-label*="omment"]',
    'button[title*="omment"]',
    'button[class*="comment"]',
    'a[role="button"][aria-label*="omment"]',
    '[data-test-id*="comment-button"]',
  ]

  const textareaSelectors = [
    'textarea',
    'div[role="textbox"]',
    'div[contenteditable="true"]',
    '[data-test-id*="comment-input"]',
    'input[placeholder*="comment"]',
  ]

  const submitSelectors = [
    'button[type="submit"]',
    'button[aria-label*="Post"]',
    'button[title*="Post"]',
    'button[aria-label*="Send"]',
    'button[class*="submit"]',
    '[data-test-id*="post-button"]',
  ]

  let commentButton = null
  for (const s of commentButtonSelectors) {
    commentButton = postEl.querySelector(s)
    if (commentButton) break
  }

  let textarea = null
  for (const s of textareaSelectors) {
    textarea = postEl.querySelector(s)
    if (textarea) break
  }

  let submit = null
  for (const s of submitSelectors) {
    submit = postEl.querySelector(s)
    if (submit) break
  }

  return { commentButton, textarea, submit }
}

// Input helper
function setInputValueAndTrigger(el, text) {
  if (!el) return

  el.focus()

  // Wait a bit for focus
  setTimeout(() => {
    if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
      // ContentEditable div
      el.textContent = text
      el.innerText = text
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    } else if ('value' in el) {
      // Regular input/textarea
      const nativeInputValueSetter =
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, text)
      } else {
        el.value = text
      }

      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, 100)
}

// Main auto-comment logic
async function autoCommentOnPost(postEl) {
  if (!settings.enabled) return false

  // Get unique identifier
  const postId = getPostIdentifier(postEl)

  // Check if already processed (This covers 'done' and 'queued' status)
  if (processedPosts.has(postId)) {
    return false
  }

  if (postEl.hasAttribute(settings.processedAttribute)) {
    processedPosts.add(postId)
    return false
  }

  // Check keyword condition first (before any UI interaction)
  if (!postContainsKeyword(postEl)) {
    console.log('⏭ Skipped post (No keyword found):', postId) 
    postEl.setAttribute(settings.processedAttribute, 'skipped-no-keyword')
    processedPosts.add(postId)
    return false 
  }

  const { commentButton } = findCommentControls(postEl)
  if (!commentButton) {
    postEl.setAttribute(settings.processedAttribute, 'no-comment-button')
    processedPosts.add(postId)
    return false
  }

  // Check if we already commented (Must be done after finding the post element correctly)
  if (hasExistingComment(postEl)) {
    console.log('⏭ Already has our comment:', postId)
    postEl.setAttribute(settings.processedAttribute, 'has-comment')
    processedPosts.add(postId)
    return false
  }

  console.log('🎯 Auto-comment triggered for post:', postId)

  // Mark as processing immediately (This is the critical flag to prevent re-processing)
  postEl.setAttribute(settings.processedAttribute, 'processing')
  processedPosts.add(postId)

  try {
    // Click comment button
    commentButton.click()
    await new Promise((r) => setTimeout(r, 1000))

    // Find comment input
    const { textarea, submit } = findCommentControls(postEl)
    if (!textarea) {
      console.log('❌ No textarea found')
      postEl.setAttribute(settings.processedAttribute, 'no-textarea')
      return false
    }

    console.log('✍ Writing comment:', settings.message)
    setInputValueAndTrigger(textarea, settings.message)

    await new Promise((r) => setTimeout(r, 800))

    // Submit comment
    if (submit && !submit.disabled) {
      console.log('📤 Clicking submit button')
      submit.click()
    } else {
      console.log('⌨ Pressing Enter')
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        })
      )
    }

    // 🛑 CRITICAL FIX: Add a longer wait after submission
    // Give the server/page time to save the comment, update the DOM, and close the input.
    await new Promise((r) => setTimeout(r, 4000)) 

    postEl.setAttribute(settings.processedAttribute, 'done')
    console.log('✅ Comment posted successfully')
    return true
  } catch (e) {
    console.error('❌ Error auto-commenting:', e)
    postEl.setAttribute(settings.processedAttribute, 'error')
    return false
  }
}

// Process with debouncing (Now sets 'queued' status immediately)
async function processWithDebounce(postEl) {
  const postId = getPostIdentifier(postEl)

  // 🛑 FIX: Mark the post element as 'queued' right away before the timeout
  if (!processedPosts.has(postId)) {
      postEl.setAttribute(settings.processedAttribute, 'queued');
      processedPosts.add(postId);
  }

  // Clear existing timeout for this post
  if (processingQueue.has(postId)) {
    clearTimeout(processingQueue.get(postId))
  }

  // Set new timeout
  const timeoutId = setTimeout(async () => {
    await autoCommentOnPost(postEl)
    processingQueue.delete(postId)
  }, 1500) // Wait 1.5 seconds before processing

  processingQueue.set(postId, timeoutId)
}

// Find all posts in container
function findAllPosts(container) {
  const posts = []

  // Try specific selectors first
  const specificSelectors = [
    '[data-test-id="thread-card"]',
    '[data-test-id="feed-item"]',
    '[class*="threadCard"]',
    '[data-thread-id]',
    'article',
  ]

  for (const selector of specificSelectors) {
    const found = container.querySelectorAll(selector)
    if (found.length > 0) {
      console.log(`📋 Found ${found.length} posts with selector: ${selector}`)
      return Array.from(found)
    }
  }

  // Fallback: find elements with comment buttons
  console.log('📋 Using fallback: finding elements with comment buttons')
  const allElements = container.querySelectorAll('div')
    
  // Keywords for robust check
  const CRITICAL_KEYWORDS = ['rush', 'rush below', 'job no', 'time', 'due date']; 

  for (const el of allElements) {
    const hasCommentButton = el.querySelector(
      'button[aria-label*="omment"], button[title*="omment"]'
    )
    const hasText = el.innerText && el.innerText.length > 50
    const notProcessed = !el.hasAttribute(settings.processedAttribute)

    // NEW CHECK: Look for at least one critical keyword
    const hasCriticalKeyword = CRITICAL_KEYWORDS.some(kw => el.innerText.toLowerCase().includes(kw));

    // Only proceed if it has a comment button, substantial text, is not processed, AND has a critical keyword
    if (hasCommentButton && hasText && notProcessed && hasCriticalKeyword) { 
      // Make sure we're getting the post container, not nested elements
      const post = findPostElement(el)
      if (post && !posts.includes(post)) {
        posts.push(post)
      }
    }
  }

  console.log(`📋 Found ${posts.length} posts total`)
  return posts
}

// Process new nodes
async function processAddedNode(node) {
  if (!(node instanceof HTMLElement)) return

  // Find actual post element
  const postEl = findPostElement(node)

  // 🛑 FIX: Check the attribute here to prevent re-queuing by the MutationObserver
  if (postEl && !postEl.hasAttribute(settings.processedAttribute)) {
    console.log('🆕 New post detected (Queuing)')
    await processWithDebounce(postEl)
  }
}

// ========== NEW CODE: Auto-click "Show new messages" buttons ==========

// Auto-click "Show new messages" buttons
function clickNewMessageButtons() {
  // Find all buttons on the page
  const allButtons = document.querySelectorAll('button')

  for (const btn of allButtons) {
    const text = btn.innerText.toLowerCase().trim()
    // Only match "Show X new message(s)" pattern - must start with "show"
    if (
      text.startsWith('show') &&
      (text.includes('message') || text.includes('post') || text.includes('conversation'))
    ) {
      console.log('🔄 Clicking "Show new messages" button:', btn.innerText)
      btn.click()
      return true
    }
  }

  return false
}

// Periodically check for "Show new messages" button
function startNewMessageWatcher() {
  setInterval(() => {
    clickNewMessageButtons()
  }, 5000) // Check every 5 seconds
}

// ========== END NEW CODE ==========

// Start mutation observer
async function startObserver() {
  await loadSettings()

  const feed = findFeedContainer()
  if (!feed) {
    console.error('❌ Feed container not found.')
    return
  }

  console.log(
    '👀 Observer started on:',
    feed.tagName + (feed.className ? '.' + feed.className.split(' ')[0] : '')
  )

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        processAddedNode(node)

        // ========== NEW CODE: Check if added node is "Show new messages" button ==========
        if (node instanceof HTMLElement && node.tagName === 'BUTTON') {
          const text = node.innerText?.toLowerCase().trim() || ''
          if (
            text.startsWith('show') &&
            (text.includes('message') || text.includes('post') || text.includes('conversation'))
          ) {
            setTimeout(() => clickNewMessageButtons(), 500)
          }
        }
        // ========== END NEW CODE ==========
      }
    }
  })

  observer.observe(feed, { childList: true, subtree: true })

  // ========== NEW CODE: Start periodic watcher ==========
  startNewMessageWatcher()
  // ========== END NEW CODE ==========

  // Initial scan for existing posts
  setTimeout(() => {
    console.log('🔍 Scanning for existing posts...')
    const posts = findAllPosts(feed)

    if (posts.length === 0) {
      console.warn('⚠ No posts found. The script may need adjustment for this platform.')
    }

    posts.forEach((post) => processWithDebounce(post))
  }, 3000)
}

// Listen for settings changes
chrome.storage?.onChanged?.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.message) {
      settings.message = changes.message.newValue
      console.log('💬 Message updated:', settings.message)
    }
    if (changes.enabled !== undefined) {
      settings.enabled = changes.enabled.newValue
      console.log('🔄 Enabled status:', settings.enabled)
    }
  }
})

// Bootstrap
;(function init() {
  console.log('🚀 Initializing Viva Auto-Comment...')
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver)
  } else {
    startObserver()
  }
})()