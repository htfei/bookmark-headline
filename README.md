# 🔖 书签头条

> 你收藏的网站，有更新时提醒你

## 项目简介

书签头条是一个浏览器扩展，自动监控你收藏的网站，当有新内容更新时通过徽章提醒你。点击插件图标即可查看所有更新内容。

## 技术栈

- **扩展框架**: WXT
- **前端框架**: Vue 3
- **样式**: Tailwind CSS
- **图标**: lucide-vue-next

## 核心功能

- ✅ 自动监控所有书签
- ✅ 智能提取网站文章列表（无需 RSS）
- ✅ 红点徽章提醒未读更新
- ✅ 首篇文章大图展示，其余列表模式
- ✅ 有图显示，无图不显示
- ✅ 网络预检测，断网跳过
- ✅ 失败一次标记不可用，不再请求
- ✅ 同 Host 请求限流（5秒间隔）
- ✅ 毛玻璃暗色主题 UI

## 使用方法

### 开发

```bash
npm install
npm run dev
```

### 构建

```bash
npm run build
```

构建产物在 `.output/chrome-mv3/` 目录。

### 安装到 Chrome

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `.output/chrome-mv3/` 文件夹

## 项目结构

```
├── entrypoints/
│   ├── background.ts              # 后台脚本
│   └── bookmark-headline/         # 内置页面
│       ├── index.html
│       ├── main.ts
│       └── App.vue
├── components/
│   └── SiteCard.vue               # 站点卡片组件
├── assets/styles/
│   └── glass.css                  # 毛玻璃样式
├── wxt.config.ts                  # WXT 配置
├── tailwind.config.js             # Tailwind 配置
└── package.json
```

## 设计理念

- **零配置**: 收藏即监控，无需手动添加订阅源
- **轻量**: 不替换新标签页，不打扰用户
- **精美**: 毛玻璃暗色主题，卡片式布局
