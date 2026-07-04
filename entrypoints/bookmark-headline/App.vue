<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RefreshCw, CheckCheck, X, Trash2, FolderOpen } from 'lucide-vue-next';
import SiteCard from '../../components/SiteCard.vue';

interface Article {
  title: string;
  url: string;
  image?: string;
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

const states = ref<Record<string, BookmarkState>>({});
const loading = ref(false);
const filter = ref<'all' | 'unread'>('all');
const selectedFolderId = ref<string | null>(null); // null 表示全部文件夹
// 刷新进度
const refreshProgress = ref({ current: 0, total: 0 });
// 新数据提示（不直接追加卡片，只显示提示）
const newItemsCount = ref(0);
// 已加载的书签ID集合（用于判断是否是新数据）
const loadedBookmarkIds = new Set<string>();

// 获取所有文件夹列表（去重），并计算每个文件夹的未读数量，只显示有数据的文件夹
const folders = computed(() => {
  const folderMap = new Map<string, { id: string; title: string; unread: number }>();
  for (const state of Object.values(states.value)) {
    // 只统计有文章数据的文件夹
    if (state.folderId && state.folderTitle && state.articles.length > 0) {
      const existing = folderMap.get(state.folderId);
      const folderUnread = getUnreadCount(state);
      if (existing) {
        existing.unread += folderUnread;
      } else {
        folderMap.set(state.folderId, { 
          id: state.folderId, 
          title: state.folderTitle,
          unread: folderUnread
        });
      }
    }
  }
  return Array.from(folderMap.values()).sort((a, b) => a.title.localeCompare(b.title));
});

const activeStates = computed(() => {
  // 只保留有图片文章的站点
  return Object.values(states.value).filter(s => 
    s.status === 'active' && s.articles.some(a => a.image)
  );
});

// 计算有图片的文章数
function getImageArticleCount(state: BookmarkState): number {
  return state.articles.filter(a => a.image).length;
}

// 计算未读数（只计算有图片的）
function getUnreadCount(state: BookmarkState): number {
  return state.articles
    .filter(a => a.image)
    .filter(a => !state.readArticleUrls.includes(a.url)).length;
}

// 默认按时间倒序排序
const sortedStates = computed(() => {
  const list = [...activeStates.value];
  list.sort((a, b) => b.lastCheckAt - a.lastCheckAt);
  return list;
});

// 只显示已加载的书签（新数据不直接显示），并且按文件夹过滤
const displayedStates = computed(() => {
  let list = sortedStates.value.filter(s => loadedBookmarkIds.has(s.bookmarkId));
  // 按文件夹过滤
  if (selectedFolderId.value !== null) {
    list = list.filter(s => s.folderId === selectedFolderId.value);
  }
  return list;
});

const filteredStates = computed(() => {
  if (filter.value === 'all') return displayedStates.value;
  return displayedStates.value.filter(s => getUnreadCount(s) > 0);
});

const totalUnread = computed(() => {
  return displayedStates.value.reduce((sum, s) => sum + getUnreadCount(s), 0);
});

function isRead(bookmarkId: string, articleUrl: string): boolean {
  const state = states.value[bookmarkId];
  return state ? state.readArticleUrls.includes(articleUrl) : false;
}

async function loadStates() {
  const result = await chrome.runtime.sendMessage({ type: 'get-states' });
  states.value = result || {};
  // 标记所有已加载的书签ID
  Object.keys(states.value).forEach(id => loadedBookmarkIds.add(id));
  // 清空新数据提示
  newItemsCount.value = 0;
}

async function refresh() {
  loading.value = true;
  refreshProgress.value = { current: 0, total: 0 };
  newItemsCount.value = 0;
  await chrome.runtime.sendMessage({ type: 'refresh' });
}

function markRead(bookmarkId: string, articleUrl: string) {
  const state = states.value[bookmarkId];
  if (state && !state.readArticleUrls.includes(articleUrl)) {
    state.readArticleUrls.push(articleUrl);
  }
  chrome.runtime.sendMessage({ type: 'mark-read', bookmarkId, articleUrl });
}

// 已读（当前过滤的文件夹）
function markAllReadCurrentFolder() {
  const folderId = selectedFolderId.value;
  // 只处理当前显示的站点
  for (const state of displayedStates.value) {
    for (const article of state.articles) {
      if (article.image && !state.readArticleUrls.includes(article.url)) {
        state.readArticleUrls.push(article.url);
      }
    }
  }
  chrome.runtime.sendMessage({ type: 'mark-all-read-global', folderId });
}

// 清空所有项目（但保留统计信息）
function clearAll() {
  chrome.runtime.sendMessage({ type: 'clear-all-states' });
  // 清空本地已加载状态
  loadedBookmarkIds.clear();
  newItemsCount.value = 0;
}

// 切换文件夹过滤
function selectFolder(folderId: string | null) {
  selectedFolderId.value = folderId;
}

// 显示新数据（用户点击提示后）
function showNewItems() {
  // 将所有新书签加入已加载集合
  Object.keys(states.value).forEach(id => loadedBookmarkIds.add(id));
  newItemsCount.value = 0;
}

// 清除新数据提示
function clearNewItemTip() {
  newItemsCount.value = 0;
}

async function openLink(url: string) {
  // 先查找是否已打开该链接
  const tabs = await chrome.tabs.query({ url: `${url}*` });
  if (tabs.length > 0) {
    // 切换到已打开的标签页
    await chrome.tabs.update(tabs[0].id!, { active: true });
    // 聚焦到该窗口
    if (tabs[0].windowId) {
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  } else {
    // 新建标签页
    chrome.tabs.create({ url });
  }
}

// 监听后台消息
function handleMessage(message: any) {
  if (message.type === 'state-updated') {
    // 更新状态，但不立即显示
    const stateId = message.stateId;
    const isNew = !loadedBookmarkIds.has(stateId);
    states.value[stateId] = message.state;
    
    // 如果是新书签，增加新数据计数（不直接追加卡片）
    if (isNew && message.state?.articles?.some(a => a.image)) {
      newItemsCount.value++;
    }
  } else if (message.type === 'refresh-start') {
    refreshProgress.value = { current: 0, total: message.total };
  } else if (message.type === 'refresh-progress') {
    refreshProgress.value = { current: message.current, total: message.total };
  } else if (message.type === 'refresh-complete') {
    loading.value = false;
    refreshProgress.value = { current: 0, total: 0 };
  }
}

onMounted(() => {
  loadStates();
  chrome.runtime.onMessage.addListener(handleMessage);
});

onUnmounted(() => {
  chrome.runtime.onMessage.removeListener(handleMessage);
});
</script>

<template>
  <div class="min-h-screen bg-gray-950">
    <!-- Header -->
    <header class="sticky top-0 z-50 backdrop-blur-xl bg-gray-950/80 border-b border-white/10">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🔖</span>
          <h1 class="text-xl font-bold text-white">书签头条</h1>
          <span v-if="totalUnread > 0" class="bg-red-500 text-white text-xs rounded-full px-2.5 py-0.5 font-medium">
            {{ totalUnread }}条未读
          </span>
          <!-- 显示刷新进度 -->
          <span v-if="loading && refreshProgress.total > 0" class="bg-blue-500 text-white text-xs rounded-full px-2.5 py-0.5 font-medium">
            {{ refreshProgress.current }}/{{ refreshProgress.total }}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <!-- 清空按钮 -->
          <button
            v-if="activeStates.length > 0"
            @click="clearAll"
            class="px-3 py-1.5 bg-red-500/20 text-red-400 text-sm rounded-lg hover:bg-red-500/30 transition flex items-center gap-1.5"
            title="清空所有项目（保留统计信息）"
          >
            <Trash2 class="w-4 h-4" />
            清空
          </button>
          <!-- 已读按钮（当前文件夹） -->
          <button
            v-if="totalUnread > 0"
            @click="markAllReadCurrentFolder"
            class="px-3 py-1.5 bg-green-500/20 text-green-400 text-sm rounded-lg hover:bg-green-500/30 transition flex items-center gap-1.5"
          >
            <CheckCheck class="w-4 h-4" />
            {{ selectedFolderId ? '文件夹已读' : '全部已读' }}
          </button>
          <!-- 筛选 -->
          <div class="flex bg-white/5 rounded-lg p-0.5">
            <button
              @click="filter = 'all'"
              :class="['px-3 py-1.5 text-sm rounded-md transition', filter === 'all' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white']"
            >
              全部
            </button>
            <button
              @click="filter = 'unread'"
              :class="['px-3 py-1.5 text-sm rounded-md transition', filter === 'unread' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white']"
            >
              未读
            </button>
          </div>
          <!-- 刷新按钮 -->
          <button
            @click="refresh"
            :disabled="loading"
            class="p-2 bg-white/5 rounded-lg hover:bg-white/10 disabled:opacity-50 transition"
          >
            <RefreshCw :class="['w-4 h-4 text-gray-300', loading && 'animate-spin']" />
          </button>
        </div>
      </div>

      <!-- 文件夹过滤栏 -->
      <div v-if="folders.length > 0" class="max-w-7xl mx-auto px-6 pb-4 flex items-center gap-2">
        <div class="flex items-center gap-1.5 text-gray-500 text-xs">
          <FolderOpen class="w-3.5 h-3.5" />
          <span>文件夹：</span>
        </div>
        <div class="flex flex-wrap bg-white/5 rounded-lg p-0.5 gap-1">
          <button
            @click="selectFolder(null)"
            :class="[
              'px-3 py-1 text-xs rounded-md transition',
              selectedFolderId === null ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
            ]"
          >
            全部
          </button>
          <button
            v-for="folder in folders"
            :key="folder.id"
            @click="selectFolder(folder.id)"
            :class="[
              'px-3 py-1 text-xs rounded-md transition max-w-[150px] truncate',
              selectedFolderId === folder.id ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
            ]"
            :title="folder.title"
          >
            {{ folder.title }}
            <span v-if="folder.unread > 0" class="bg-red-500 text-white text-[10px] rounded-full px-1.5 ml-1">
              {{ folder.unread }}
            </span>
          </button>
        </div>
      </div>
    </header>

    <!-- 新数据提示栏（不直接追加卡片） -->
    <div
      v-if="newItemsCount > 0"
      class="max-w-7xl mx-auto px-6 py-3"
    >
      <div
        class="bg-blue-500/20 border border-blue-500/30 rounded-xl px-4 py-3 flex items-center justify-between"
      >
        <div class="flex items-center gap-2 text-blue-400">
          <span class="text-sm font-medium">🎉 有 {{ newItemsCount }} 个站点更新了内容</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="showNewItems"
            class="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition"
          >
            查看新内容
          </button>
          <button
            @click="clearNewItemTip"
            class="p-1 text-blue-400 hover:text-white transition"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Content - 瀑布流布局（响应式） -->
    <main class="max-w-7xl mx-auto px-6 py-8">
      <div v-if="filteredStates.length === 0" class="text-center py-20">
        <div class="text-6xl mb-4">📭</div>
        <h2 class="text-xl text-gray-400">暂无更新</h2>
        <p class="text-gray-600 mt-2">你收藏的网站还没有新内容</p>
      </div>
      <!-- 响应式瀑布流：1/2/3/4列自适应 -->
      <div v-else class="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 [column-fill:_balance]">
        <div
          v-for="state in filteredStates"
          :key="state.bookmarkId"
          class="break-inside-avoid mb-6"
        >
          <SiteCard
            :state="state"
            :is-read="(url: string) => isRead(state.bookmarkId, url)"
            @mark-read="markRead"
            @open-link="openLink"
          />
        </div>
      </div>
    </main>
  </div>
</template>
