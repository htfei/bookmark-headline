<script setup lang="ts">
import { ref, computed } from 'vue';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-vue-next';

interface Article {
  title: string;
  url: string;
  image?: string;
}

interface BookmarkState {
  bookmarkId: string;
  url: string;
  title: string;
  articles: Article[];
}

const props = defineProps<{
  state: BookmarkState;
  isRead: (url: string) => boolean;
}>();

const emit = defineEmits<{
  (e: 'mark-read', bookmarkId: string, articleUrl: string): void;
  (e: 'open-link', url: string): void;
}>();

const MAX_DISPLAY = 5;
const expanded = ref(false);

const articlesWithImage = computed(() => {
  return props.state.articles.filter(a => a.image);
});

const firstArticle = computed(() => articlesWithImage.value[0]);

const restArticles = computed(() => {
  const rest = articlesWithImage.value.slice(1);
  if (expanded.value) return rest;
  return rest.slice(0, MAX_DISPLAY - 1);
});

const hasMore = computed(() => articlesWithImage.value.length > MAX_DISPLAY);

const hiddenCount = computed(() => Math.max(0, articlesWithImage.value.length - MAX_DISPLAY));

function toggleExpand() {
  expanded.value = !expanded.value;
}

function formatUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
</script>

<template>
  <div class="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden hover:bg-white/[0.07] hover:border-white/[0.15] transition-all duration-300">
    <div class="flex items-center gap-3 px-5 py-4 border-b border-white/5">
      <img
        :src="`https://www.google.com/s2/favicons?domain=${formatUrl(state.url)}&sz=32`"
        class="w-5 h-5 rounded"
        @error="$event.target.style.display='none'"
      />
      <div>
        <h3 class="text-white font-medium text-sm">{{ state.title }}</h3>
        <p class="text-gray-500 text-xs">{{ formatUrl(state.url) }}</p>
      </div>
    </div>

    <div class="divide-y divide-white/5">
      <div
        v-if="firstArticle"
        class="p-4 cursor-pointer group"
        @click="emit('open-link', firstArticle.url); emit('mark-read', state.bookmarkId, firstArticle.url)"
      >
        <div class="mb-3 rounded-xl overflow-hidden">
          <img
            :src="firstArticle.image"
            class="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-500"
            @error="$event.target.style.display='none'"
          />
        </div>
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <h4
              :class="['font-medium text-sm leading-snug mb-1 transition',
                isRead(firstArticle.url) ? 'text-gray-500' : 'text-white group-hover:text-blue-300']"
            >
              {{ firstArticle.title }}
            </h4>
          </div>
          <ExternalLink class="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition" />
        </div>
      </div>

      <div
        v-for="article in restArticles"
        :key="article.url"
        class="flex items-center gap-3 px-4 py-3 cursor-pointer group hover:bg-white/[0.03] transition"
        @click="emit('open-link', article.url); emit('mark-read', state.bookmarkId, article.url)"
      >
        <img
          :src="article.image"
          class="w-16 h-12 rounded-lg object-cover flex-shrink-0"
          @error="$event.target.style.display='none'"
        />
        <div class="flex-1 min-w-0">
          <h4
            :class="['text-sm leading-snug truncate transition',
              isRead(article.url) ? 'text-gray-500' : 'text-gray-200 group-hover:text-white']"
          >
            {{ article.title }}
          </h4>
        </div>
        <ExternalLink class="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 flex-shrink-0 transition" />
      </div>

      <div v-if="hasMore" class="px-4 py-3 border-t border-white/5">
        <button
          @click="toggleExpand"
          class="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-white transition py-1"
        >
          <template v-if="expanded">
            <ChevronUp class="w-3.5 h-3.5" />
            收起
          </template>
          <template v-else>
            <ChevronDown class="w-3.5 h-3.5" />
            展开更多（还有{{ hiddenCount }}条）
          </template>
        </button>
      </div>
    </div>
  </div>
</template>
