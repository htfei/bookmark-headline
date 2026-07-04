import { defineBackground } from 'wxt/sandbox';
import { parseHTML } from 'linkedom';

interface Article {
  title: string;
  url: string;
  image?: string;
  date?: string;
  tags?: string[];
}

interface BookmarkState {
  bookmarkId: string;
  folderId: string;
  folderTitle: string;
  url: string;
  title: string;
  status: 'active' | 'unavailable';
  totalChecks: number;
  successCount: number;
  failCount: number;
  lastCheckAt: number;
  lastSuccessAt: number;
  articles: Article[];
  readArticleUrls: string[];
}

const CHECK_INTERVAL_MINUTES = 30;
const HOST_MIN_INTERVAL = 5000;

const hostLastRequest = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isOnline(): Promise<boolean> {
  try {
    const resp = await fetch('https://www.baidu.com/favicon.ico', {
      method: 'HEAD',
      cache: 'no-cache',
      signal: AbortSignal.timeout(3000)
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function fetchWithThrottle(url: string): Promise<Response> {
  const host = new URL(url).host;
  const last = hostLastRequest.get(host) || 0;
  const wait = Math.max(0, last + HOST_MIN_INTERVAL - Date.now());
  if (wait > 0) {
    console.log(`[限流] ${host} 需等待 ${wait}ms`);
    await sleep(wait);
  }
  hostLastRequest.set(host, Date.now());
  
  console.log(`[请求开始] ${url}`);
  
  // 添加更完整的请求头，模拟浏览器行为
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
  };
  
  try {
    const response = await fetch(url, { 
      headers,
      signal: AbortSignal.timeout(10000) // 10秒超时
    });
    console.log(`[请求成功] ${url} - 状态: ${response.status} ${response.statusText}`);
    return response;
  } catch (error) {
    console.error(`[请求失败] ${url} - 错误:`, error);
    throw error;
  }
}

function isNavLink(link: Element): boolean {
  const text = link.textContent?.trim().toLowerCase() || '';
  const navWords = ['首页', 'home', '关于', 'about', '联系', 'contact', '下一页', 'previous', 'next', 'more', '更多'];
  return navWords.some(w => text.includes(w));
}

function resolveUrl(url: string, base: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  return new URL(url, base).href;
}

function findNearestImage(item: Element, baseUrl: string): string | undefined {
  const img = item.querySelector('img')
    || item.previousElementSibling?.querySelector('img')
    || item.parentElement?.querySelector('img');
  if (!img) return undefined;
  const src = img.getAttribute('src')
    || img.getAttribute('data-src')
    || img.getAttribute('data-original');
  if (!src) return undefined;
  const width = parseInt(img.getAttribute('width') || '0');
  const height = parseInt(img.getAttribute('height') || '0');
  if ((width > 0 && width < 100) || (height > 0 && height < 50)) return undefined;
  return resolveUrl(src, baseUrl);
}

function deduplicate(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}

function extractArticles(html: string, baseUrl: string): Article[] {
  console.log(`[文章提取] 开始解析 ${baseUrl}, HTML长度: ${html.length}`);
  const { document: doc } = parseHTML(html);

  // ========== 第一步：确定主内容区域 ==========
  const containerSelectors = [
    '#article-body',
    '.article-list',
    '.post-content',
    '.entry-list',
    'main',
    '[class*="article-list"]',
    '[class*="post-list"]',
    '[class*="entry-list"]',
    '[class*="article-body"]',
    '[class*="post-body"]',
    '[class*="feed"]',
    '[class*="content"]',
  ];
  let container: Element | null = null;
  for (const selector of containerSelectors) {
    const found = doc.querySelector(selector);
    if (found) {
      container = found;
      console.log(`[文章提取] 找到主容器: ${selector}`);
      break;
    }
  }
  // fallback 到 body
  if (!container) {
    container = doc.body;
    console.log(`[文章提取] 使用 body 作为容器`);
  }

  // ========== 第二步：在容器内查找文章项 ==========
  const articleSelectors = [
    'main article',
    '.article-list .item',
    '.post-list .post',
    '.entry-list .entry',
    '.posts .post',
    'div[class*="article"]',
    'div[class*="post"]',
    '.topic-item',
    'article',
    '.article-item',
    '.post-item',
    '.entry-item',
    '.item',
    '.post',
    '.article',
    '[class*="article-item"]',
    '[class*="post-item"]',
    '[class*="entry-item"]',
    '[class*="feed-item"]',
    '.article-list',
    '.post-list',
    '.entry-list',
    '.posts',
    '[class*="article-list"]',
    '[class*="post-list"]',
    '[class*="entry-list"]',
  ];

  let items: Element[] = [];
  for (const selector of articleSelectors) {
    const found = Array.from(container.querySelectorAll(selector));
    if (found.length >= 3) {
      items = found;
      console.log(`[文章提取] 选择器 "${selector}" 匹配到 ${items.length} 个元素`);
      break;
    }
  }

  // 项目数太少（<3）或太多（>50）直接排除
  if (items.length < 3 || items.length > 50) {
    console.log(`[文章提取] 项目数不符合条件: ${items.length} 个`);
    return [];
  }

  // ========== 第三步：提取每篇文章 ==========
  const articles: Article[] = [];
  const seenUrls = new Set<string>();

  for (const item of items) {
    // 1. 提取标题（优先从 h2, h3 获取）
    let title = '';
    const titleEl = item.querySelector('h1, h2, h3, h4, .title, .entry-title, .post-title, .article-title, [class*="title"]');
    if (titleEl) {
      title = titleEl.textContent?.trim() || '';
    }
    // 如果标题元素内没有链接，尝试从链接中获取
    const linkEl = item.querySelector('a');
    if (!title && linkEl) {
      title = linkEl.textContent?.trim() || '';
    }
    if (!title || title.length < 3) continue;

    // 2. 提取链接
    const link = item.querySelector('a[href]') || titleEl?.closest('a');
    if (!link) continue;
    let href = link.getAttribute('href') || '';
    if (!href) continue;
    // 过滤导航类链接
    if (isNavLink(link)) continue;
    const url = resolveUrl(href, baseUrl);
    // 去重
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    // 3. 提取图片（优先从 item 内的 img 获取，fallback 到 og:image）
    let image = '';
    const imgEl = item.querySelector('img');
    if (imgEl) {
      image = imgEl.getAttribute('src') ||
              imgEl.getAttribute('data-src') ||
              imgEl.getAttribute('data-original') ||
              imgEl.getAttribute('data-lazy-src') || '';
    }
    // fallback 到 og:image
    if (!image) {
      const ogImage = doc.querySelector('meta[property="og:image"]');
      if (ogImage) {
        image = ogImage.getAttribute('content') || '';
      }
    }
    // 如果没有图片，跳过（宁杀勿放）
    if (!image) continue;
    // 确保图片 URL 有效
    try {
      image = new URL(image, baseUrl).href;
    } catch {
      continue;
    }

    // 4. 提取日期（可选）
    const dateEl = item.querySelector('.date, .post-time, .entry-date, [class*="date"], time');
    const date = dateEl?.textContent?.trim() || '';

    // 5. 提取标签（可选）
    const tagEls = item.querySelectorAll('.tags a, .categories a, [class*="tag"] a');
    const tags = Array.from(tagEls).slice(0, 5).map(el => el.textContent?.trim()).filter(Boolean);

    articles.push({ title, url, image, date, tags });
  }

  console.log(`[文章提取] 提取完成, 文章数: ${articles.length}`);
  if (articles.length > 0) {
    console.log(`[文章提取] 前3篇文章:`, articles.slice(0, 3).map(a => a.title));
  }
  return articles;
}

function getStateKey(bookmarkId: string): string {
  return `bookmark_${bookmarkId}`;
}

async function getBookmarkState(bookmarkId: string): Promise<BookmarkState | null> {
  const result = await chrome.storage.local.get(getStateKey(bookmarkId));
  return result[getStateKey(bookmarkId)] || null;
}

async function saveBookmarkState(state: BookmarkState) {
  await chrome.storage.local.set({ [getStateKey(state.bookmarkId)]: state });
}

async function getAllBookmarkStates(): Promise<Record<string, BookmarkState>> {
  const result = await chrome.storage.local.get(null);
  const states: Record<string, BookmarkState> = {};
  for (const key of Object.keys(result)) {
    if (key.startsWith('bookmark_')) {
      const bookmarkId = key.replace('bookmark_', '');
      states[bookmarkId] = result[key];
    }
  }
  return states;
}

async function clearAllBookmarkStates() {
  const states = await getAllBookmarkStates();
  const keysToRemove = Object.keys(states).map(id => getStateKey(id));
  await chrome.storage.local.remove(keysToRemove);
}

async function updateBadge() {
  const states = await getAllBookmarkStates();
  const unreadCount = Object.values(states).reduce((sum, s) => {
    if (s.status === 'unavailable') return sum;
    return sum + s.articles.filter(a => !s.readArticleUrls.includes(a.url)).length;
  }, 0);
  chrome.action.setBadgeText({ text: unreadCount > 0 ? String(unreadCount) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
}

async function checkBookmark(item: BookmarkWithFolder, states: Record<string, BookmarkState>) {
  const bookmark = item.bookmark;
  if (!bookmark.url) {
    console.log(`[书签检查] ${bookmark.title} - 无URL, 跳过`);
    return false;
  }
  
  console.log(`[书签检查] 开始检查: ${bookmark.title} (${bookmark.url})`);
  
  let state = states[bookmark.id];
  if (!state) {
    state = {
      bookmarkId: bookmark.id,
      folderId: item.folderId,
      folderTitle: item.folderTitle,
      url: bookmark.url,
      title: bookmark.title,
      status: 'active',
      totalChecks: 0,
      successCount: 0,
      failCount: 0,
      lastCheckAt: 0,
      lastSuccessAt: 0,
      articles: [],
      readArticleUrls: []
    };
    console.log(`[书签检查] 创建新状态记录，文件夹: ${item.folderTitle}`);
  } else {
    // 更新文件夹信息（书签可能被移动）
    state.folderId = item.folderId;
    state.folderTitle = item.folderTitle;
  }
  
  if (state.status === 'unavailable') {
    console.log(`[书签检查] ${bookmark.title} - 已标记不可用, 跳过`);
    return false;
  }
  
  state.totalChecks++;
  try {
    const response = await fetchWithThrottle(bookmark.url);
    const html = await response.text();
    const articles = extractArticles(html, bookmark.url);
    if (articles.length > 0) {
      state.articles = articles;
      state.successCount++;
      state.lastSuccessAt = Date.now();
      console.log(`[书签检查] ${bookmark.title} - 成功! 文章数: ${articles.length}`);
    } else {
      state.failCount++;
      if (state.failCount >= 1) state.status = 'unavailable';
      console.log(`[书签检查] ${bookmark.title} - 失败! 未提取到文章, 标记不可用`);
    }
  } catch (error) {
    state.failCount++;
    if (state.failCount >= 1) state.status = 'unavailable';
    console.error(`[书签检查] ${bookmark.title} - 异常!`, error);
  }
  state.lastCheckAt = Date.now();
  states[bookmark.id] = state;
  
  await saveBookmarkState(state);
  await updateBadge();
  chrome.runtime.sendMessage({ type: 'state-updated', stateId: bookmark.id, state });
  
  return state.status === 'active' && state.articles.length > 0;
}

interface BookmarkWithFolder {
  bookmark: chrome.bookmarks.BookmarkTreeNode;
  folderId: string;
  folderTitle: string;
}

function extractBookmarks(node: chrome.bookmarks.BookmarkTreeNode, folderId: string = '', folderTitle: string = ''): BookmarkWithFolder[] {
  const result: BookmarkWithFolder[] = [];
  if (node.url && !node.url.startsWith('javascript:') && !node.url.startsWith('chrome:')) {
    result.push({ bookmark: node, folderId, folderTitle });
  }
  if (node.children) {
    for (const child of node.children) {
      result.push(...extractBookmarks(child, node.id, node.title));
    }
  }
  return result;
}

async function checkAllUpdates() {
  console.log(`[批量检查] ========== 开始新一轮检查 ==========`);
  
  if (!await isOnline()) {
    console.log('[批量检查] 网络不可用，跳过本轮检查');
    return;
  }
  console.log('[批量检查] 网络检测正常');
  
  const tree = await chrome.bookmarks.getTree();
  const bookmarks = extractBookmarks(tree[0]);
  console.log(`[批量检查] 共找到 ${bookmarks.length} 个书签`);
  
  const states = await getAllBookmarkStates();
  
  // 通知前端开始刷新
  chrome.runtime.sendMessage({ type: 'refresh-start', total: bookmarks.length });
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    const success = await checkBookmark(bm, states);
    if (success) successCount++;
    else failCount++;
    // 通知前端进度更新
    chrome.runtime.sendMessage({ type: 'refresh-progress', current: i + 1, total: bookmarks.length });
  }
  
  console.log(`[批量检查] 检查完成: 成功 ${successCount}, 失败 ${failCount}`);
  
  // 通知前端刷新完成
  chrome.runtime.sendMessage({ type: 'refresh-complete', successCount, failCount });
  
  console.log(`[批量检查] ========== 本轮检查结束 ==========`);
}

export default defineBackground(() => {
  console.log('书签头条后台脚本已启动');

  chrome.action.onClicked.addListener(async () => {
    const url = chrome.runtime.getURL('/bookmark-headline.html');
    console.log(`[图标点击] 目标URL: ${url}`);
    
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find(tab => 
      tab.url && (tab.url === url || tab.url.startsWith(url))
    );
    
    console.log(`[图标点击] 找到已打开标签页: ${existingTab ? existingTab.id : '无'}`);
    
    if (existingTab) {
      console.log(`[图标点击] 切换到已打开的标签页: ${existingTab.id}`);
      await chrome.tabs.update(existingTab.id!, { active: true });
      if (existingTab.windowId) {
        await chrome.windows.update(existingTab.windowId, { focused: true });
      }
    } else {
      console.log(`[图标点击] 新建标签页`);
      chrome.tabs.create({ url });
    }
  });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('check-updates', { periodInMinutes: CHECK_INTERVAL_MINUTES });
    checkAllUpdates();
  });

  chrome.runtime.onStartup.addListener(() => {
    // 无需额外操作，状态已持久化存储
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'check-updates') {
      checkAllUpdates();
    }
  });

  chrome.bookmarks.onCreated.addListener(() => {
    checkAllUpdates();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'mark-read') {
      getBookmarkState(message.bookmarkId).then(state => {
        if (state && !state.readArticleUrls.includes(message.articleUrl)) {
          state.readArticleUrls.push(message.articleUrl);
          saveBookmarkState(state);
          updateBadge();
        }
      });
      sendResponse({ ok: true });
    } else if (message.type === 'mark-all-read') {
      getBookmarkState(message.bookmarkId).then(state => {
        if (state) {
          for (const url of message.articleUrls) {
            if (!state.readArticleUrls.includes(url)) {
              state.readArticleUrls.push(url);
            }
          }
          saveBookmarkState(state);
          updateBadge();
        }
      });
      sendResponse({ ok: true });
    } else if (message.type === 'mark-all-read-global') {
      getAllBookmarkStates().then(states => {
        const folderId = message.folderId;
        const promises: Promise<void>[] = [];
        for (const state of Object.values(states)) {
          if (folderId !== undefined && folderId !== null && state.folderId !== folderId) continue;
          for (const article of state.articles) {
            if (!state.readArticleUrls.includes(article.url)) {
              state.readArticleUrls.push(article.url);
            }
          }
          promises.push(saveBookmarkState(state));
        }
        Promise.all(promises).then(() => updateBadge());
      });
      sendResponse({ ok: true });
    } else if (message.type === 'clear-all-states') {
      getAllBookmarkStates().then(states => {
        const promises: Promise<void>[] = [];
        for (const state of Object.values(states)) {
          state.articles = [];
          state.lastCheckAt = 0;
          state.lastSuccessAt = 0;
          promises.push(saveBookmarkState(state));
        }
        Promise.all(promises).then(() => updateBadge());
      });
      sendResponse({ ok: true });
    } else if (message.type === 'refresh') {
      checkAllUpdates().then(() => sendResponse({ ok: true }));
      return true;
    } else if (message.type === 'get-states') {
      getAllBookmarkStates().then(states => sendResponse(states));
      return true;
    }
  });
});
