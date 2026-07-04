import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  vite: () => ({
    plugins: [vue()],
  }),
  entrypoints: {
    'bookmark-headline': {
      type: 'page',
    },
  },
  manifest: {
    name: '书签头条',
    description: '你收藏的网站，有更新时提醒你',
    version: '1.0.0',
    permissions: ['bookmarks', 'storage', 'alarms', 'activeTab', 'tabs', 'webRequest', 'webRequestAuthProvider'],
    host_permissions: ['<all_urls>'],
    action: { default_title: '书签头条' }
  },
  webExt: {
    startUrls: ["https://bing.com/"],
    binaries: {
      edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    }
  },
});
