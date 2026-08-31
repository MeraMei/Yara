
/* ═══════════════════════════════════════════════════════════════
   settings-view.js — 系统设置为 index.html 的单页视图模块
   由体系结构脚本自动生成，避免与 app.js 的全局函数冲突。
   接入方式：index.html 引入本文件，并在 switchView('settings') 时
   调用 renderSettingsView()。
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var once = false;
  function injectCss() {
    var style = document.getElementById('settingsViewCss');
    if (style) return;
    style = document.createElement('style');
    style.id = 'settingsViewCss';
    style.textContent = "\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   \u4e25\u683c\u590d\u7528\u771f\u5b9e index.html \u7684 :root \u5b8c\u6574\u53d8\u91cf + \u7ec4\u4ef6\u6837\u5f0f\u8bed\u8a00\n   Colourful \u8bbe\u8ba1\u7cfb\u7edf (butter-yellow \u4e3b\u8272 + \u67d4\u548c\u9a6c\u5361\u9f99)\n   \u6bdb\u73bb\u7483\u5361\u7247 + \u6bcf\u4e2a\u7c7b\u578b\u5bf9\u5e94\u6d45\u8272\u6e10\u53d8\u53e0\u52a0 + \u591a\u8272\u914d\u5408\n   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n:root {\n  /* \u7b2c\u4e00\u5c42\uff1aColourful \u539f\u59cb\u8272\u677f */\n  --colourful-candy-pink-50: #fef5f8; --colourful-candy-pink-100: #fde8f0; --colourful-candy-pink-200: #fbd0de; --colourful-candy-pink-300: #f7a7c3; --colourful-candy-pink-400: #f178a3;\n  --colourful-candy-pink-500: #ea4d85; --colourful-candy-pink-600: #d63068; --colourful-candy-pink-700: #b32254; --colourful-candy-pink-800: #921e47; --colourful-candy-pink-900: #781c3f;\n  --colourful-mint-green-50: #f2fdf9; --colourful-mint-green-100: #e0faf0; --colourful-mint-green-200: #c4f4de; --colourful-mint-green-300: #96e8c5; --colourful-mint-green-400: #5ed4a6;\n  --colourful-mint-green-500: #36b98b; --colourful-mint-green-600: #289371; --colourful-mint-green-700: #21755b; --colourful-mint-green-800: #1e5d4a; --colourful-mint-green-900: #1a4d3f;\n  --colourful-sunny-coral-50: #fff7f2; --colourful-sunny-coral-100: #ffeadb; --colourful-sunny-coral-200: #ffd0b4; --colourful-sunny-coral-300: #ffab81; --colourful-sunny-coral-400: #ff7d4d;\n  --colourful-sunny-coral-500: #f96024; --colourful-sunny-coral-600: #e04a15; --colourful-sunny-coral-700: #b93a13; --colourful-sunny-coral-800: #953217; --colourful-sunny-coral-900: #7a2c17;\n  --colourful-lavender-50: #f8f5ff; --colourful-lavender-100: #efe9ff; --colourful-lavender-200: #dfd5ff; --colourful-lavender-300: #c8b4ff; --colourful-lavender-400: #ac87ff;\n  --colourful-lavender-500: #9255f5; --colourful-lavender-600: #7e34e0; --colourful-lavender-700: #6928ba; --colourful-lavender-800: #58249a; --colourful-lavender-900: #4a2380;\n  --colourful-sky-blue-50: #f3f9ff; --colourful-sky-blue-100: #e6f2ff; --colourful-sky-blue-200: #cce5ff; --colourful-sky-blue-300: #a3d1ff; --colourful-sky-blue-400: #6ab5ff;\n  --colourful-sky-blue-500: #3e94f5; --colourful-sky-blue-600: #2b75e0; --colourful-sky-blue-700: #245fba; --colourful-sky-blue-800: #234e99; --colourful-sky-blue-900: #21427e;\n  --colourful-butter-yellow-50: #fffef8; --colourful-butter-yellow-100: #fffde8; --colourful-butter-yellow-200: #fff9c4; --colourful-butter-yellow-300: #fff292; --colourful-butter-yellow-400: #ffe760;\n  --colourful-butter-yellow-500: #fdd832; --colourful-butter-yellow-600: #e0bc18; --colourful-butter-yellow-700: #b89812; --colourful-butter-yellow-800: #957a14; --colourful-butter-yellow-900: #7a6516;\n  --colourful-lime-pop-50: #f8fef2; --colourful-lime-pop-100: #eefdd9; --colourful-lime-pop-200: #dcfab6; --colourful-lime-pop-300: #c0f488; --colourful-lime-pop-400: #a0e756;\n  --colourful-lime-pop-500: #82d632; --colourful-lime-pop-600: #66b522; --colourful-lime-pop-700: #508e1c; --colourful-lime-pop-800: #41711c; --colourful-lime-pop-900: #385e1c;\n  --colourful-neutral-50: #faf9f7; --colourful-neutral-100: #f3f2ef; --colourful-neutral-200: #e7e5e1; --colourful-neutral-300: #d5d2cc; --colourful-neutral-400: #b0aba3;\n  --colourful-neutral-500: #8f8880; --colourful-neutral-600: #736c63; --colourful-neutral-700: #5c5650; --colourful-neutral-800: #3d3936; --colourful-neutral-900: #1e1c1a;\n  --colourful-success-100: #dcfce7; --colourful-success-500: #22c55e; --colourful-success-600: #16a34a;\n  --colourful-warning-100: #fef3c7; --colourful-warning-500: #f59e0b; --colourful-warning-600: #d97706;\n  --colourful-error-100: #fee2e2; --colourful-error-500: #ef4444; --colourful-error-600: #dc2626;\n\n  /* \u8865\u5145\u522b\u540d\uff08\u5bf9\u9f50 index.html\uff0c\u4f9b\u91cd\u7b97\u5206\u503c\u5f39\u7a97\u7b49\u4f7f\u7528\uff09 */\n  --neutral-50: var(--colourful-neutral-50); --neutral-100: var(--colourful-neutral-100);\n  --neutral-150: var(--colourful-neutral-100); --neutral-200: var(--colourful-neutral-200); --neutral-300: var(--colourful-neutral-300);\n  --neutral-400: var(--colourful-neutral-400); --neutral-500: var(--colourful-neutral-500);\n  --neutral-600: var(--colourful-neutral-600); --neutral-700: var(--colourful-neutral-700);\n  --neutral-800: var(--colourful-neutral-800); --neutral-900: var(--colourful-neutral-900);\n  --colourful-surface-50: #ffffff;\n  --colourful-warning-50: var(--colourful-warning-100); --colourful-warning-200: var(--colourful-warning-100);\n  --colourful-primary-50: var(--colourful-sky-blue-50); --colourful-primary-500: var(--colourful-sky-blue-500); --colourful-primary-600: var(--colourful-sky-blue-600);\n  --colourful-info-50: var(--colourful-sky-blue-50); --colourful-info-600: var(--colourful-sky-blue-600);\n  --colourful-success-50: var(--colourful-success-100); --colourful-success-700: var(--colourful-success-600);\n\n  /* \u7b2c\u4e8c\u5c42\uff1a\u8bed\u4e49\u522b\u540d */\n  --primary: var(--colourful-sky-blue-500);\n  --primary-light: var(--colourful-sky-blue-100);\n  --primary-lighter: var(--colourful-sky-blue-50);\n  --primary-dark: var(--colourful-sky-blue-700);\n  --primary-foreground: var(--colourful-neutral-900);\n  --accent: var(--colourful-candy-pink-400);\n  --accent-light: var(--colourful-candy-pink-100);\n  --accent-dark: var(--colourful-candy-pink-600);\n  --background: var(--colourful-neutral-50);\n  --foreground: var(--colourful-neutral-900);\n  --muted: var(--colourful-neutral-100);\n  --muted-foreground: var(--colourful-neutral-500);\n  --border: var(--colourful-neutral-200);\n  --ring: var(--colourful-butter-yellow-400);\n  --surface: #ffffff;\n  --surface-dim: var(--colourful-neutral-100);\n  --surface-glass: rgba(255,255,255,.72);\n\n  /* \u6392\u7248 */\n  --font-display: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;\n  --font-body: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;\n\n  /* \u5706\u89d2 */\n  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 24px; --radius-full: 9999px;\n\n  /* \u9634\u5f71 */\n  --shadow-1: 0 1px 3px rgba(30,28,26,.04), 0 1px 2px rgba(30,28,26,.03);\n  --shadow-2: 0 4px 12px -2px rgba(30,28,26,.06);\n  --shadow-3: 0 8px 24px -4px rgba(30,28,26,.08);\n  --shadow-4: 0 16px 40px -8px rgba(30,28,26,.12);\n  --shadow: var(--shadow-2);\n\n  /* \u52a8\u6548 */\n  --duration-fast: 150ms; --duration-normal: 250ms; --duration-slow: 400ms;\n  --easing-default: cubic-bezier(0.25, 0.1, 0.25, 1);\n  --easing-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);\n\n  /* \u5e03\u5c40 */\n  --sidebar: 260px;\n  --max-content: 1200px;\n  --gutter: 32px;\n  --nav-height: 64px;\n}\n\n* { box-sizing: border-box; margin: 0; padding: 0; }\nhtml { scroll-behavior: smooth; }\nbody {\n  min-height: 100vh;\n  color: var(--foreground);\n  font: 400 15px/1.6 var(--font-body);\n  -webkit-font-smoothing: antialiased;\n  /* \u591a\u8272\u6d45\u8272\u53e0\u52a0\u80cc\u666f\uff08\u5bf9\u9f50 index.html body\uff09 */\n  background:\n    radial-gradient(circle at 8% 12%, rgba(253,216,50,.16) 0%, transparent 32%),\n    radial-gradient(circle at 92% 8%, rgba(146,85,245,.14) 0%, transparent 34%),\n    radial-gradient(circle at 84% 90%, rgba(234,77,133,.13) 0%, transparent 30%),\n    radial-gradient(circle at 16% 86%, rgba(54,185,139,.13) 0%, transparent 30%),\n    radial-gradient(circle at 55% 45%, rgba(94,212,166,.10) 0%, transparent 34%),\n    radial-gradient(circle at 70% 60%, rgba(62,148,245,.10) 0%, transparent 30%),\n    var(--colourful-neutral-50);\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u4fa7\u8fb9\u680f\uff08\u4e0e\u771f\u5b9e\u7cfb\u7edf\u4e00\u81f4\uff1a\u6bdb\u73bb\u7483 + \u732b\u54aa\uff09 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n.sidebar {\n  position: fixed;\n  inset: 0 auto 0 0;\n  width: var(--sidebar);\n  padding: 24px 16px;\n  display: flex;\n  flex-direction: column;\n  background: rgba(255,255,255,.78);\n  border-right: 1px solid rgba(255,255,255,.6);\n  backdrop-filter: blur(18px);\n  -webkit-backdrop-filter: blur(18px);\n  z-index: 20;\n  overflow: hidden;\n}\n/* \u4fa7\u8fb9\u680f\u5c55\u5f00 (\u79fb\u52a8\u7aef) */\n.sidebar.show {\n  opacity: 1; visibility: visible; pointer-events: auto;\n}\n/* \u4fa7\u8fb9\u680f\u906e\u7f69\u5c42 (\u79fb\u52a8\u7aef) */\n.sidebar-overlay {\n  position: fixed;\n  inset: 0;\n  background: rgba(30,28,26,.4);\n  z-index: 14;\n  opacity: 0;\n  visibility: hidden;\n  transition: opacity .3s ease, visibility .3s ease;\n  pointer-events: none;\n}\n.sidebar-overlay.show {\n  opacity: 1;\n  visibility: visible;\n  pointer-events: auto;\n}\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u6c49\u5821\u83dc\u5355\u6309\u94ae (\u79fb\u52a8\u7aef) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n.hamburger-btn {\n  display: none;\n  position: fixed;\n  top: 16px;\n  left: 16px;\n  width: 44px;\n  height: 44px;\n  border-radius: 14px;\n  background: rgba(255,255,255,.9);\n  backdrop-filter: blur(12px);\n  -webkit-backdrop-filter: blur(12px);\n  border: 1px solid rgba(255,255,255,.6);\n  box-shadow: 0 4px 12px rgba(30,28,26,.08);\n  z-index: 30;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition: transform .18s ease;\n}\n.hamburger-btn:active { transform: scale(.95); }\n.hamburger-btn svg {\n  width: 22px;\n  height: 22px;\n  color: var(--colourful-neutral-800);\n}\n\n.sidebar::after {\n  content: \"\ud83d\udc3e\";\n  position: absolute;\n  bottom: 12px;\n  right: 16px;\n  font-size: 18px;\n  opacity: .25;\n  pointer-events: none;\n}\n/* \u4e2a\u4eba\u8d44\u6599\u5361\uff1a\u9ec4\u6cb9\u9ec4\u6e10\u53d8 + \u5706\u5f62\u732b\u54aa\u5934\u50cf */\n.profile {\n  display: flex;\n  gap: 12px;\n  align-items: center;\n  padding: 14px;\n  border-radius: 22px;\n  background: linear-gradient(135deg, var(--colourful-butter-yellow-100), var(--colourful-sunny-coral-50));\n  margin-bottom: 24px;\n  position: relative;\n}\n.cat {\n  width: 56px; height: 56px;\n  border-radius: 50%;\n  position: relative;\n  flex: 0 0 auto;\n  overflow: hidden;\n  background: var(--colourful-butter-yellow-300);\n  border: 2px solid rgba(255,255,255,.6);\n  box-shadow: 0 1px 8px -1px rgba(249,96,36,.2);\n}\n.cat .cat-img { width: 100%; height: 100%; object-fit: cover; display: block; }\n.profile strong { display: block; font: 700 17px var(--font-display); color: var(--colourful-neutral-900); }\n.profile small { display: block; color: var(--colourful-neutral-600); font-weight: 700; line-height: 1.35; }\n\n.nav-label {\n  padding: 14px 14px 7px;\n  font-size: 11px;\n  font-weight: 800;\n  letter-spacing: .08em;\n  color: var(--colourful-neutral-400);\n}\n/* \u4e3b\u83dc\u5355\u5360\u6ee1\u4e0a\u90e8\uff0c\u8bbe\u7f6e\u56fa\u5b9a\u5e95\u90e8 */\n.nav { display: grid; gap: 6px; flex: 1; align-content: start; }\n.nav a {\n  display: flex;\n  align-items: center;\n  gap: 11px;\n  padding: 12px 14px;\n  border-radius: 16px;\n  color: var(--colourful-neutral-600);\n  font-weight: 800;\n  transition: .18s ease;\n  cursor: pointer;\n  position: relative;\n  z-index: 1;\n  text-decoration: none;\n}\n.nav a i { width: 20px; text-align: center; font-style: normal; }\n.nav a:hover, .nav a.active { background: white; color: var(--colourful-neutral-900); box-shadow: 0 8px 22px -14px rgba(30,28,26,.3); transform: translateX(2px); }\n.nav a.active { background: linear-gradient(135deg, var(--colourful-butter-yellow-100), white); }\n.nav .spacer { flex: 1; }\n\n/* \u5e95\u90e8\u8bbe\u7f6e\u533a\uff1a\u5206\u9694\u7ebf + \u56fa\u5b9a\u5728\u5de6\u4e0b\u89d2 */\n.nav-foot { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(30,28,26,.08); display: grid; gap: 6px; }\n.nav-foot a {\n  display: flex;\n  align-items: center;\n  gap: 11px;\n  padding: 12px 14px;\n  border-radius: 16px;\n  color: var(--colourful-neutral-600);\n  font-weight: 800;\n  transition: .18s ease;\n  cursor: pointer;\n  position: relative;\n  z-index: 1;\n  text-decoration: none;\n}\n.nav-foot a i { width: 20px; text-align: center; font-style: normal; }\n.nav-foot a:hover, .nav-foot a.active { background: white; color: var(--colourful-neutral-900); box-shadow: 0 8px 22px -14px rgba(30,28,26,.3); transform: translateX(2px); }\n.nav-foot a.active { background: linear-gradient(135deg, var(--colourful-lavender-100), white); color: var(--colourful-lavender-700); }\n\n/* \u4e3b\u5185\u5bb9\u533a */\n.main { margin-left: var(--sidebar); padding: 34px; position: relative; min-height: 100vh; }\n.main::before {\n  content: \"\";\n  position: absolute;\n  top: 0; left: 0; right: 0;\n  height: 460px;\n  background:\n    radial-gradient(58% 55% at 16% 16%, rgba(253,216,50,.22) 0%, transparent 62%),\n    radial-gradient(52% 55% at 48% 10%, rgba(241,120,163,.16) 0%, transparent 62%),\n    radial-gradient(55% 55% at 82% 16%, rgba(172,135,255,.18) 0%, transparent 62%),\n    radial-gradient(70% 60% at 100% 45%, rgba(106,181,255,.16) 0%, transparent 66%);\n  filter: blur(34px);\n  pointer-events: none;\n  z-index: 0;\n}\n.main > * { position: relative; z-index: 1; }\n\n.page-head { margin-bottom: 20px; }\n.page-head h1 { font: 700 26px var(--font-display); color: var(--colourful-neutral-900); }\n.page-head .sub { font-size: 13px; color: var(--colourful-neutral-500); font-weight: 600; margin-top: 4px; }\n\n/* Tab \u680f */\n.tabs {\n  display: flex;\n  gap: 4px;\n  border-bottom: 1px solid var(--border);\n  margin-bottom: 22px;\n  flex-wrap: wrap;\n}\n.tabs button {\n  border: none;\n  background: transparent;\n  padding: 12px 16px;\n  font: 800 14px var(--font-body);\n  color: var(--colourful-neutral-500);\n  cursor: pointer;\n  border-bottom: 3px solid transparent;\n  transition: color var(--duration-fast) var(--easing-default);\n}\n.tabs button.on { color: var(--colourful-neutral-900); border-bottom-color: var(--colourful-butter-yellow-500); }\n\n.tabp { display: none; }\n.tabp.on { display: block; animation: fadein .25s var(--easing-default); }\n@keyframes fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u5361\u7247\uff1a\u6bdb\u73bb\u7483 + \u591a\u8272\u6d45\u6e10\u53d8\u53e0\u52a0\uff08\u5bf9\u9f50 index.html\uff09 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   \u6bcf\u4e2a\u7c7b\u578b\u5bf9\u5e94\u4e13\u5c5e\u8272\u7cfb\uff0c\u7528 \u827250\u2192\u767d \u7684\u6d45\u6e10\u53d8\u53e0\u52a0\uff0c\u4e0d\u7528\u5927\u5757\u6df1\u8272 */\n.card {\n  position: relative;\n  padding: 20px;\n  border-radius: 20px;\n  background: rgba(255,255,255,.6);\n  border: 1px solid rgba(255,255,255,.65);\n  box-shadow: var(--shadow-1);\n  backdrop-filter: blur(14px) saturate(160%);\n  -webkit-backdrop-filter: blur(14px) saturate(160%);\n  transition: box-shadow var(--duration-normal) var(--easing-default),\n              transform var(--duration-normal) var(--easing-bounce),\n              border-color var(--duration-fast) var(--easing-default);\n  margin-bottom: 16px;\n  overflow: hidden;\n}\n.card:hover {\n  box-shadow: 0 12px 30px -12px rgba(30,28,26,.18);\n  transform: translateY(-3px);\n  border-color: rgba(255,255,255,.9);\n}\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   \u5361\u7247\uff1a\u7edf\u4e00\u300c\u767d\u8272\u6bdb\u73bb\u7483\u300d\u3002\u65e0\u9876\u90e8\u8272\u6761\u3001\u65e0\u6574\u5361\u8272\u5757\u3001\u65e0\u6574\u5361\u6e10\u53d8\u3002\n   \u989c\u8272\u53ea\u843d\u5728\u5c0f\u5143\u7d20\uff1a\u2460 \u5f69\u8272\u6e10\u53d8\u56fe\u6807\u5757 \u2461 \u5706\u5f62\u5fbd\u7ae0 \u2462 \u6d45\u5e95\u6df1\u5b57\u6807\u7b7e\u3002\n   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n.card-title { font: 800 15px var(--font-display); color: var(--colourful-neutral-900); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }\n\n/* \u5f69\u8272\u8f85\u52a9\u7c7b */\n.mint { color: var(--colourful-mint-green-500); }\n.lav { color: var(--colourful-lavender-500); }\n.pink { color: var(--colourful-candy-pink-500); }\n.blue { color: var(--colourful-sky-blue-500); }\n.coral { color: var(--colourful-sunny-coral-500); }\n.lime { color: var(--colourful-lime-pop-500); }\n.yellow { color: var(--colourful-butter-yellow-600); }\n\n/* \u884c */\n.row {\n  display: grid;\n  grid-template-columns: auto 1fr auto;\n  gap: 12px;\n  align-items: center;\n  padding: 14px 0;\n  border-bottom: 1px solid rgba(30,28,26,.05);\n}\n.row:last-child { border-bottom: 0; }\n.icon-box {\n  width: 44px; height: 44px;\n  border-radius: 15px;\n  display: grid;\n  place-items: center;\n  color: #fff;\n  flex: 0 0 auto;\n  font-size: 18px;\n  box-shadow: inset 0 0 0 1px rgba(255,255,255,.55);\n}\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u56fe\u6807\u5757 \u2014\u2014 \u53c2\u8003\u56fe\u98ce\u683c\uff1a\u660e\u5feb\u67d4\u548c\u5f69\u8272\u5757 + \u767d\u8272\u7b26\u53f7 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   \u5bf9\u9f50\u53c2\u8003\u56fe\uff1a\u5f69\u8272\u5b9e\u5fc3\u5706\u89d2\u5757\u3001\u767d\u8272\u56fe\u6807/\u6570\u5b57\uff0c\u8f7b\u76c8\u4e0d\u6df1\u3002\n   \u8272\u503c\u53d6\u81ea\u53c2\u8003\u56fe\u91c7\u6837\u7684\u67d4\u548c\u5f69\u8272\uff08\u975e\u6df1\u8272\u3001\u975e\u6781\u6d45\uff09\u3002 */\n/* \u2500\u2500 \u5b66\u79d1\uff08\u53c2\u8003\u56fe \u00b7 \u79d1\u76ee\u5217\u8868\uff09 \u2500\u2500 */\n.ic-chinese { background: #F95D9F; }   /* \u8bed\u6587 \u00b7 \u7c89\uff08\u4e0e config.json \u4e00\u81f4\uff09 */\n.ic-math    { background: #4A9EFF; }   /* \u6570\u5b66 \u00b7 \u84dd\uff08\u4e0e config.json \u4e00\u81f4\uff09 */\n.ic-english { background: #9255F5; }   /* \u82f1\u8bed \u00b7 \u7d2b\uff08\u4e0e config.json \u4e00\u81f4\uff09 */\n.ic-science { background: #F5D547; color:#fff; }               /* \u79d1\u5b66 \u00b7 \u9ec4 */\n.ic-moral   { background: #9B7BF7; }                            /* \u9053\u5fb7\u4e0e\u6cd5\u6cbb \u00b7 \u7d2b */\n.ic-info    { background: #4A9EFF; }                            /* \u4fe1\u606f\u79d1\u6280 \u00b7 \u84dd */\n.ic-sport   { background: #FF8C3D; }                            /* \u4f53\u80b2 \u00b7 \u6a59 */\n.ic-music   { background: #F95D9F; }                            /* \u97f3\u4e50 \u00b7 \u54c1\u7ea2 */\n.ic-art     { background: #F55A5A; }                            /* \u7f8e\u672f \u00b7 \u73ca\u745a\u7ea2 */\n.ic-callig  { background: #A78BFA; }                            /* \u4e66\u6cd5 \u00b7 \u7d2b\u6c34\u6676 */\n.ic-mental  { background: #FFAB6B; }                            /* \u5fc3\u7406\u5065\u5eb7 \u00b7 \u6d45\u6a59 */\n.ic-activity{ background: #34D399; }                            /* \u7efc\u5408\u5b9e\u8df5 \u00b7 \u7fe0\u7eff */\n.ic-labor   { background: var(--colourful-neutral-400); }      /* \u52b3\u52a8 \u00b7 \u7070 */\n\n/* \u2500\u2500 \u6210\u957f\u5206\u7c7b / \u4efb\u52a1\u89c4\u5219\uff08\u590d\u7528 index.html WCPALETTE \u5206\u7c7b\u8272\uff09 \u2500\u2500\n   \u5b66\u4e60\u6210\u957f#82d632 \u00b7 \u5174\u8da3\u7231\u597d#f96024 \u00b7 \u8eab\u4f53\u6210\u957f#36b98b \u00b7 \u80fd\u529b\u6210\u957f#fdd832\n   \u5f69\u8272\u5b9e\u5fc3\u5757 + \u767d\u7b26\u53f7\uff0c\u8bed\u4e49\u4e0d\u53d8\uff0c\u8f7b\u76c8\u4e0d\u6df1 */\n.ic-learn   { background: #82d632; }        /* \u5b66\u4e60\u6210\u957f \u00b7 \u8349\u7eff */\n.ic-hobby   { background: #f96024; }        /* \u5174\u8da3\u7231\u597d \u00b7 \u671d\u6c14\u6a59 */\n.ic-body    { background: #36b98b; }        /* \u8eab\u4f53\u6210\u957f \u00b7 \u8584\u8377 */\n.ic-ability { background: #fdd832; }        /* \u80fd\u529b\u6210\u957f \u00b7 \u9ec4\u6cb9 */\n\n/* \u2500\u2500 \u8bb0\u5f55 / \u8d26\u6237\uff08\u53c2\u8003\u56fe \u00b7 \u8bb0\u5f55\u7ba1\u7406\u4e0e\u8d26\u6237\uff09 \u2500\u2500 */\n.ic-wealth  { background: #FF8C3D; }        /* \u8d22\u5bcc\u8bb0\u5f55 \u00b7 \u6a59 */\n.ic-freedom { background: #fdd832; }        /* \u81ea\u7531\u57fa\u91d1 \u00b7 \u9ec4 */\n.ic-energy  { background: #36b98b; }        /* \u80fd\u91cf\u8bb0\u5f55 \u00b7 \u7eff */\n.ic-homework{ background: #4A9EFF; }        /* \u4f5c\u4e1a\u8bb0\u5f55 \u00b7 \u84dd */\n.ic-grade   { background: #9B7BF7; }        /* \u6210\u7ee9\u8bb0\u5f55 \u00b7 \u7d2b */\n.ic-eval    { background: #fdd832; }        /* \u671f\u672b\u8bc4\u4ef7 \u00b7 \u9ec4 */\n\n/* \u2500\u2500 \u901a\u7528\u8272\uff08\u5f69\u8272\u5b9e\u5fc3\u5757 + \u767d\u7b26\u53f7\uff09 \u2500\u2500 */\n.ic-pink   { background: var(--colourful-candy-pink-300); }\n.ic-blue   { background: var(--colourful-sky-blue-400); }\n.ic-mint   { background: #36b98b; }\n.ic-lav    { background: #9B7BF7; }\n.ic-coral  { background: #FF8C3D; }\n.ic-yellow { background: #fdd832; }\n.ic-lime   { background: #34D399; }\n.ic-white  { background: var(--colourful-neutral-400); }\n.inf { flex: 1; min-width: 0; }\n.inf b { font: 700 14px var(--font-body); display: block; color: var(--colourful-neutral-900); }\n.inf > span { font-size: 12px; color: var(--colourful-neutral-500); font-weight: 600; }\n/* \u79d1\u76ee\u884c\uff1a\u6807\u9898\u884c\uff08\u79d1\u76ee\u540d + \u4e3b/\u526f\u79d1\u6807\u7b7e\uff09+ \u80fd\u529b\u6a21\u5757\u5b50\u884c\uff0c\u6536\u8fdb\u540c\u4e00\u884c */\n.inf-h { display: flex; align-items: center; gap: 8px; }\n.inf-h b { font: 700 14px var(--font-body); color: var(--colourful-neutral-900); }\n\n/* \u6309\u94ae */\n.btn {\n  border: none;\n  border-radius: var(--radius-full);\n  padding: 7px 16px;\n  font: 700 13px var(--font-body);\n  cursor: pointer;\n  transition: transform var(--duration-fast) var(--easing-default), box-shadow var(--duration-fast);\n}\n.btn:active { transform: scale(.96); }\n.btn.primary { background: linear-gradient(135deg, var(--colourful-butter-yellow-400), var(--colourful-butter-yellow-500)); color: var(--colourful-neutral-900); box-shadow: 0 4px 12px -4px rgba(253,216,50,.6); }\n.btn.ghost { background: rgba(255,255,255,.7); border: 1px solid var(--colourful-neutral-200); color: var(--colourful-neutral-600); box-shadow: none; }\n.btn.mini { padding: 5px 12px; font-size: 12px; }\n\n/* \u8868\u5355 */\n.field {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-md);\n  padding: 10px 14px;\n  background: rgba(255,255,255,.6);\n}\n.field input { border: none; outline: none; font: 500 14px var(--font-body); width: 100%; background: transparent; color: var(--foreground); }\n.field input::placeholder { color: var(--colourful-neutral-400); }\n.form-row { display: grid; grid-template-columns: 88px 1fr auto; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(30,28,26,.05); }\n.form-row:last-child { border-bottom: none; }\n.form-row label { font-size: 14px; color: var(--colourful-neutral-600); font-weight: 700; }\n\n/* \u6807\u7b7e */\n.tag { font-size: 11px; padding: 3px 10px; border-radius: var(--radius-full); font-weight: 800; }\n.tag-out { background: var(--colourful-sunny-coral-100); color: var(--colourful-sunny-coral-600); }\n.tag-in { background: var(--colourful-mint-green-100); color: var(--colourful-mint-green-600); }\n.cal-chip { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, var(--colourful-butter-yellow-100), var(--colourful-butter-yellow-50)); color: var(--colourful-butter-yellow-800); border-radius: var(--radius-full); padding: 6px 14px; font-size: 13px; font-weight: 800; margin-bottom: 8px; box-shadow: inset 0 0 0 1px rgba(253,216,50,.16); }\n\n/* \u8fde\u63a5\u72b6\u6001 */\n.conn { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(30,28,26,.05); }\n.conn:last-child { border-bottom: none; }\n.conn .st { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }\n.conn .st.ok { background: var(--colourful-mint-green-500); box-shadow: 0 0 0 3px var(--colourful-mint-green-100); }\n.conn .st.no { background: var(--colourful-sunny-coral-500); box-shadow: 0 0 0 3px var(--colourful-sunny-coral-100); }\n.conn .ci b { font: 700 14px var(--font-body); display: block; color: var(--colourful-neutral-900); }\n.conn .ci span { font-size: 12px; color: var(--colourful-neutral-500); font-weight: 600; }\n\n/* GitHub Token \u914d\u7f6e */\n.token-row { grid-template-columns: 88px 1fr auto; }\n.token-hint { font-size: 12px; color: var(--colourful-neutral-500); font-weight: 600; margin-top: 10px; line-height: 1.5; background: var(--colourful-neutral-50); border-radius: 10px; padding: 8px 12px; }\n\n/* \u8f7b\u91cf toast \u63d0\u793a */\n.toast {\n  position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%) translateY(20px);\n  background: var(--colourful-neutral-900); color: #fff; font: 600 13px var(--font-body);\n  padding: 10px 18px; border-radius: 999px; box-shadow: var(--shadow-3);\n  opacity: 0; visibility: hidden; transition: opacity .25s ease, transform .25s ease, visibility .25s; z-index: 9999; max-width: 90vw; text-align: center;\n}\n.toast.show { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }\n.toast.ok { background: var(--colourful-mint-green-600); }\n.toast.err { background: var(--colourful-error-600); }\n\n/* \u591a\u8272\u4e66\u7b7e\u5361\u7247\uff08\u5bf9\u9f50 index mini-card \u98ce\u683c\uff09 */\n.bookmarks { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px,1fr)); gap: 12px; margin-top: 16px; }\n.bk {\n  background: rgba(255,255,255,.78);\n  border: 1px solid rgba(255,255,255,.6);\n  border-radius: var(--radius-lg);\n  padding: 14px;\n  backdrop-filter: blur(8px);\n  -webkit-backdrop-filter: blur(8px);\n  box-shadow: var(--shadow-1);\n  transition: transform var(--duration-normal) var(--easing-bounce), box-shadow var(--duration-normal);\n}\n.bk:hover { transform: translateY(-3px); box-shadow: 0 12px 30px -12px rgba(30,28,26,.18); }\n.bk b { font: 700 14px var(--font-body); display: flex; align-items: center; gap: 8px; color: var(--colourful-neutral-900); margin-bottom: 4px; }\n.bk span { font-size: 12px; color: var(--colourful-neutral-500); }\n.bk .flag { margin-left: auto; font-size: 11px; color: var(--colourful-candy-pink-600); background: var(--colourful-candy-pink-100); padding: 2px 8px; border-radius: var(--radius-full); font-weight: 800; }\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u79d1\u76ee \u00b7 \u4e3b\u79d1/\u526f\u79d1\u5404\u4e00\u4e2a\u8272\u5757 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   \u6574\u4e2a\u4e3b\u79d1\u662f\u4e00\u5757\u6d45\u84dd\u6e10\u53d8\u5e95\u8272\uff0c\u6574\u4e2a\u526f\u79d1\u662f\u4e00\u5757\u6d45\u7d2b\u6e10\u53d8\u5e95\u8272\uff1b\n   \u6bcf\u4e2a\u79d1\u76ee\u884c\u5185\u4e0d\u518d\u5355\u72ec\u6807\"\u4e3b/\u526f\"\uff0c\u53ea\u7ed9\u4fee\u6539/\u5220\u9664\u4e24\u4e2a\u5c0f\u6309\u94ae\u3002 */\n.subject-block { border-radius: 20px; padding: 18px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,.7); }\n.subject-block.main { background: linear-gradient(135deg, rgba(62,148,245,.10), rgba(255,255,255,.62)); }\n.subject-block.sub  { background: linear-gradient(135deg, rgba(159,154,255,.09), rgba(255,255,255,.62)); }\n/* \u5f3a\u5236\u4e3b\u79d1\u533a\u5757\u9876\u5230\u5361\u7247\u5de6\u7f18\u3001\u6309\u5185\u5bb9\u9ad8\u5ea6\u6536\u7f29\uff0c\u6d88\u9664\"\u5de6\u8fb9/\u4e0b\u9762\u5927\u7247\u7a7a\u767d\" */\n.subject-block.main { margin-left: 0 !important; min-height: auto !important; }\n.subject-block-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }\n.subject-block-head .sb-badge { display: inline-flex; align-items: center; gap: 6px; font: 800 14px var(--font-display); padding: 5px 13px; border-radius: var(--radius-full); }\n.sb-main { background: var(--colourful-sky-blue-100); color: var(--colourful-sky-blue-700); }\n.sb-sub  { background: var(--colourful-lavender-100); color: var(--colourful-lavender-600); }\n.subject-block-head .sb-count { font-size: 12px; color: var(--colourful-neutral-500); font-weight: 700; }\n.subject-block-head .sb-add { margin-left: auto; }\n\n/* \u4e3b\u79d1\u5217\u8868\uff1a\u6bcf\u79d1\u4e00\u884c\uff0c\u80fd\u529b\u5c0f\u65b9\u5757+\u63cf\u8ff0\u6a2a\u6392\u5728\u540d\u79f0\u53f3\u4fa7\n   \u884c\u7ed3\u6784\uff1a\u56fe\u6807 | \u4fe1\u606f(\u540d\u79f0+\u80fd\u529b\u7b49\u5bbd\u94fa\u6ee1) | \u64cd\u4f5c\u6309\u94ae \u2014\u2014 \u6d88\u9664\"\u5de6\u6324\u53f3\u7a7a\" */\n.main-sub-list { display: grid; gap: 10px; }\n.main-sub {\n  display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center;\n  background: rgba(255,255,255,.72); border-radius: 16px; padding: 12px 14px;\n  border: 1px solid rgba(255,255,255,.75); box-shadow: var(--shadow-1);\n}\n/* \u4fe1\u606f\u5217\uff1a\u540d\u79f0 + \u80fd\u529b\u533a\uff0c\u540d\u79f0\u56fa\u5b9a\u3001\u80fd\u529b\u533a 1fr \u94fa\u6ee1\u5269\u4f59\u5bbd\u5ea6 */\n.main-sub .ms-info { min-width: 0; display: flex; align-items: center; gap: 12px; }\n.main-sub .ms-name { font: 800 16px var(--font-display); color: var(--colourful-neutral-900); white-space: nowrap; flex: 0 0 auto; }\n/* \u80fd\u529b\u533a\uff1a\u5185\u5bb9\u81ea\u9002\u5e94\u5c0f\u5757\uff0c\u5747\u5300\u94fa\u6ee1\u6574\u884c\uff0c\u4e0d\u518d\u6324\u5728\u5de6\u4fa7\u3001\u4e5f\u4e0d\u6491\u6210\u7a7a\u76d2\u5b50 */\n.main-sub .ms-abills { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }\n/* \u80fd\u529b\u5c0f\u65b9\u5757\uff1a\u5c0f\u65b9\u5757 + \u63cf\u8ff0\u6587\u5b57\uff0c\u5185\u5bb9\u5c45\u4e2d */\n.ab-cell {\n  display: inline-flex; align-items: center; justify-content: center; gap: 6px;\n  background: rgba(255,255,255,.9); border: 1px solid rgba(30,28,26,.06);\n  border-radius: 10px; padding: 5px 10px 5px 6px;\n  font-size: 12px; font-weight: 700; color: var(--colourful-neutral-700);\n  white-space: nowrap;\n}\n.ab-cell i {\n  width: 18px; height: 18px; border-radius: 6px; color: #fff;\n  display: grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 800;\n}\n.main-sub .ms-ops { display: flex; gap: 6px; }\n\n/* \u526f\u79d1\uff1a3 \u5217\u5c0f\u5361\u7247\u6392\u5f00\uff0c\u4e0d\u518d\u7ad6\u7740\u4e00\u957f\u4e32 */\n.sub-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }\n.sub-card {\n  display: flex; align-items: center; gap: 10px;\n  background: rgba(255,255,255,.72); border-radius: 14px; padding: 10px 12px;\n  border: 1px solid rgba(255,255,255,.75); box-shadow: var(--shadow-1);\n}\n.sub-card .icon-box { width: 36px; height: 36px; border-radius: 11px; font-size: 15px; }\n.sub-card b { font: 700 13px var(--font-body); color: var(--colourful-neutral-900); flex: 1; min-width: 0; }\n.sub-card .sc-ops { display: flex; gap: 4px; }\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u6821\u5386 \u00b7 \u5b66\u671f\u65f6\u95f4\u8f74 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   \u6309\u5b66\u671f\u5206\u7ec4\uff0c\u7ad6\u5411\u8fde\u63a5\u7ebf\u4e32\u8054\u4e8b\u4ef6\uff0c\u8282\u70b9\u7528\u7c7b\u578b\u8272\u5706\u70b9 + \u56fe\u6807\u5757 */\n.sem { margin-bottom: 18px; }\n.sem:last-child { margin-bottom: 0; }\n.sem-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }\n.sem-badge {\n  display: inline-flex; align-items: center; gap: 6px;\n  font: 800 13px var(--font-display);\n  color: var(--colourful-neutral-900);\n  background: var(--colourful-butter-yellow-100);\n  border: 1px solid rgba(253,216,50,.35);\n  padding: 5px 12px; border-radius: var(--radius-full);\n}\n.sem-badge i { font-style: normal; }\n.sem-meta { font-size: 12px; color: var(--colourful-neutral-500); font-weight: 700; margin-left: auto; }\n.timeline { position: relative; padding-left: 30px; }\n.timeline::before {\n  content: \"\"; position: absolute; left: 17px; top: 6px; bottom: 6px;\n  width: 2px; background: linear-gradient(180deg, rgba(62,148,245,.35), rgba(146,85,245,.35));\n  border-radius: 2px;\n}\n.tl-item { position: relative; padding: 9px 0; display: flex; align-items: center; gap: 12px; }\n.tl-item::before {\n  content: \"\"; position: absolute; left: -30px; top: 50%; transform: translateY(-50%);\n  width: 12px; height: 12px; border-radius: 50%;\n  background: #fff; border: 3px solid var(--colourful-sky-blue-400);\n  box-shadow: 0 0 0 3px rgba(255,255,255,.6);\n}\n.tl-item .tl-ic {\n  width: 40px; height: 40px; border-radius: 13px;\n  display: grid; place-items: center; color: #fff; font-size: 17px;\n  flex: 0 0 auto;\n}\n.tl-item .tl-t { flex: 1; min-width: 0; }\n.tl-item .tl-t b { font: 700 14px var(--font-body); color: var(--colourful-neutral-900); display: block; }\n.tl-item .tl-t span { font-size: 12px; color: var(--colourful-neutral-500); font-weight: 600; }\n.tl-item .tl-xp { font-size: 12px; font-weight: 800; color: var(--colourful-neutral-400); }\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u4efb\u52a1\u89c4\u5219 \u00b7 2 \u5217\u7f51\u683c\u56db\u677f\u5757\uff08\u53c2\u8003\u80fd\u91cf\u7248\u5757\uff09 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   \u56db\u677f\u5757\u5bf9\u534a\u6392\u5e03\uff0c\u6bcf\u5757\u72ec\u7acb\u6d45\u8272\u5361\u7247\u5e26\u5f69\u8272\u5934\u90e8\uff1b\u63cf\u8ff0\u5c45\u4e2d\u3001\u5206\u503c\u53f3\u5bf9\u9f50\u3002 */\n.rule-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }\n@media (max-width: 760px) { .rule-grid { grid-template-columns: 1fr; } }\n.rule-card {\n  border-radius: 18px; padding: 16px 16px 12px;\n  background: rgba(255,255,255,.62); border: 1px solid rgba(255,255,255,.7);\n  box-shadow: var(--shadow-1);\n}\n.rule-head { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; margin-bottom: 8px; border-bottom: 1px dashed rgba(30,28,26,.1); }\n.rule-head .r-dot { width: 20px; height: 20px; border-radius: 7px; flex: 0 0 auto; }\n.rule-head b { font: 800 15px var(--font-display); color: var(--colourful-neutral-900); }\n.rule-head .r-n { font-size: 11px; font-weight: 800; color: var(--colourful-neutral-500); margin-left: auto; }\n.rule-list { display: grid; gap: 2px; }\n.rule-item {\n  display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center;\n  padding: 8px 4px; border-bottom: 1px solid rgba(30,28,26,.05);\n}\n.rule-item:last-child { border-bottom: 0; }\n.rule-item .ri-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: #fff; font-size: 14px; flex: 0 0 auto; }\n.rule-item .ri-t b { font: 700 13px var(--font-body); color: var(--colourful-neutral-900); display: block; }\n.rule-item .ri-t span { font-size: 11px; color: var(--colourful-neutral-500); font-weight: 600; }\n.rule-item .ri-xp { font-size: 12px; font-weight: 800; text-align: right; white-space: nowrap; }\n.rule-item .ri-xp small { display: block; font-size: 10px; font-weight: 700; color: var(--colourful-neutral-400); }\n/* \u6bcf\u6761\u89c4\u5219\u72ec\u7acb\u7684\u7f16\u8f91/\u5220\u9664\u6309\u94ae */\n.rule-item .ri-ops { display: flex; gap: 4px; }\n.rule-item .ri-ops .btn { padding: 3px 8px; font-size: 10px; }\n.rule-head .rule-edit { margin-left: auto; }\n.rule-head .btn { padding: 4px 10px; font-size: 11px; }\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u9ed8\u8ba4\u8bb0\u5f55 \u00b7 \u81ea\u52a8\u53d1\u653e\uff08\u5355\u72ec\u5217\u51fa\uff0c\u4e0e\u624b\u52a8\u4efb\u52a1\u89c4\u5219\u533a\u5206\uff09 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n.def-card {\n  border-radius: 18px; padding: 16px 16px 12px;\n  background: linear-gradient(135deg, rgba(255,255,255,.72), rgba(255,255,255,.5));\n  border: 1px solid rgba(249,96,36,.28);\n  box-shadow: var(--shadow-1);\n  margin-bottom: 16px;\n}\n.def-head { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px dashed rgba(249,96,36,.3); }\n.def-head .r-dot { width: 20px; height: 20px; border-radius: 7px; flex: 0 0 auto; background: linear-gradient(135deg, var(--colourful-butter-yellow-300), var(--colourful-sunny-coral-300), var(--colourful-lime-pop-300)); }\n.def-head b { font: 800 15px var(--font-display); color: var(--colourful-neutral-900); }\n.def-head .def-tag { font-size: 11px; font-weight: 800; color: var(--colourful-sunny-coral-600); background: var(--colourful-sunny-coral-100); padding: 2px 8px; border-radius: var(--radius-full); }\n.def-head .r-n { font-size: 11px; font-weight: 800; color: var(--colourful-neutral-500); margin-left: auto; }\n.def-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }\n@media (max-width: 980px) { .def-grid { grid-template-columns: repeat(2, 1fr); } }\n@media (max-width: 620px) { .def-grid { grid-template-columns: 1fr; } }\n.def-item {\n  display: flex; align-items: center; gap: 10px;\n  background: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.78);\n  border-radius: 13px; padding: 10px 12px; box-shadow: var(--shadow-1);\n}\n.def-item .ri-ic { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; color: #fff; font-size: 14px; flex: 0 0 auto; }\n.def-item .ri-t b { font: 700 13px var(--font-body); color: var(--colourful-neutral-900); display: block; }\n.def-item .ri-t span { font-size: 11px; color: var(--colourful-neutral-500); font-weight: 600; }\n.def-item .ri-xp { font-size: 13px; font-weight: 800; text-align: right; white-space: nowrap; margin-left: auto; }\n.def-item .ri-xp small { display: block; font-size: 10px; font-weight: 700; color: var(--colourful-neutral-400); }\n.def-note { margin-top: 10px; font-size: 11px; font-weight: 700; color: var(--colourful-neutral-500); }\n.def-note b { color: var(--colourful-sunny-coral-600); }\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u6821\u5386 \u00b7 \u5b66\u671f\u4e24\u5217\u5e76\u6392\uff08PC \u89c6\u89c9\u5e73\u8861\uff09 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n.sem-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }\n@media (max-width: 820px) { .sem-grid { grid-template-columns: 1fr; } }\n.sem-box {\n  background: rgba(255,255,255,.55); border: 1px solid rgba(255,255,255,.7);\n  border-radius: 18px; padding: 16px 18px; box-shadow: var(--shadow-1);\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u8d22\u52a1 \u00b7 \u7f51\u683c\u5316\uff08PC \u89c6\u89c9\u5e73\u8861\uff09 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n.fin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }\n@media (max-width: 820px) { .fin-grid { grid-template-columns: 1fr; } }\n.fin-acc { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n@media (max-width: 820px) { .fin-acc { grid-template-columns: 1fr; } }\n.acc-card {\n  display: flex; align-items: center; gap: 12px;\n  background: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.75);\n  border-radius: 16px; padding: 14px; box-shadow: var(--shadow-1);\n}\n.acc-card b { font: 800 15px var(--font-display); color: var(--colourful-neutral-900); display: block; }\n.acc-card span { font-size: 12px; color: var(--colourful-neutral-500); font-weight: 600; }\n.acc-card .acc-ops { margin-left: auto; }\n.fin-cat-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }\n.fin-cat {\n  display: flex; align-items: center; gap: 10px;\n  background: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.75);\n  border-radius: 13px; padding: 9px 12px; box-shadow: var(--shadow-1);\n}\n.fin-cat .fc-mid { flex: 1; min-width: 0; }\n.fin-cat b { font: 700 13px var(--font-body); color: var(--colourful-neutral-900); display: block; }\n.fin-cat span { font-size: 11px; color: var(--colourful-neutral-500); font-weight: 600; }\n.fin-cat .fc-ops { display: flex; gap: 4px; }\n\n/* \u7b49\u7ea7\u5361\u7247\u7f51\u683c\uff1a\u6bcf\u4e2a\u7b49\u7ea7\u5bf9\u5e94\u4e13\u5c5e\u6d45\u8272\u6e10\u53d8 */\n.lvl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px,1fr)); gap: 12px; }\n.lvl {\n  background: rgba(255,255,255,.78);\n  border: 1px solid rgba(255,255,255,.6);\n  border-radius: var(--radius-lg);\n  padding: 14px;\n  backdrop-filter: blur(8px);\n  -webkit-backdrop-filter: blur(8px);\n  box-shadow: var(--shadow-1);\n  transition: transform var(--duration-normal) var(--easing-bounce), box-shadow var(--duration-normal);\n}\n.lvl:hover { transform: translateY(-3px); box-shadow: 0 12px 30px -12px rgba(30,28,26,.18); }\n.lvl-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }\n.lvl-badge {\n  width: 42px; height: 42px; border-radius: 50%;\n  display: grid; place-items: center;\n  color: var(--colourful-neutral-800); font-weight: 800; font-size: 12px;\n  flex: 0 0 auto; box-shadow: 0 2px 8px -2px rgba(30,28,26,.18);\n  border: 1px solid rgba(255,255,255,.7);\n}\n.lvl-m { flex: 1; min-width: 0; }\n.lvl-m b { font: 800 14px var(--font-display); color: var(--colourful-neutral-900); display: block; }\n.lvl-m span { font-size: 12px; color: var(--colourful-neutral-500); font-weight: 700; }\n.lvl-tag { font-size: 11px; font-weight: 800; color: var(--colourful-mint-green-600); background: var(--colourful-mint-green-100); padding: 2px 8px; border-radius: var(--radius-full); }\n.lvl-priv {\n  display: flex; align-items: center; gap: 8px;\n  font-size: 12px; color: var(--colourful-neutral-600); font-weight: 600;\n  padding: 5px 0; border-top: 1px dashed rgba(30,28,26,.08);\n}\n.lvl-priv:first-of-type { border-top: 0; }\n.lvl-priv i { font-style: normal; font-size: 13px; }\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u79fb\u52a8\u7aef\u5e95\u90e8\u5bfc\u822a\uff08\u4e0e\u4e3b\u5e73\u53f0\u4e00\u81f4\uff09 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n.bottom-tab-bar {\n  position: fixed;\n  bottom: 0; left: 0; right: 0;\n  height: 60px;\n  padding-bottom: env(safe-area-inset-bottom, 0);\n  background: rgba(255,255,255,.88);\n  backdrop-filter: blur(20px);\n  -webkit-backdrop-filter: blur(20px);\n  border-top: 1px solid rgba(0,0,0,.06);\n  display: flex;\n  align-items: stretch;\n  justify-content: space-around;\n  z-index: 100;\n  box-shadow: 0 -2px 20px rgba(0,0,0,.04);\n}\n.bottom-tab-item {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 2px;\n  color: var(--colourful-neutral-400);\n  text-decoration: none;\n  font-size: 10px;\n  font-weight: 600;\n  transition: color .2s;\n  cursor: pointer;\n}\n.bottom-tab-item i { width: 22px; height: 22px; font-size: 18px; line-height: 1; font-style: normal; display: grid; place-items: center; }\n.bottom-tab-item.active { color: var(--colourful-lavender-600); }\n.bottom-tab-item:hover { color: var(--colourful-lavender-600); }\n\n/* \u54cd\u5e94\u5f0f */\n@media (max-width: 920px) {\n  .hamburger-btn { display: flex; }\n  .main { padding-top: 72px; }\n  .sidebar { opacity: 0; visibility: hidden; pointer-events: none; transform: translateX(-100%); transition: transform .3s ease, opacity .3s ease, visibility .3s ease; }\n  .main { margin-left: 0; padding: 22px; }\n  body { padding-bottom: 66px; }\n}\n@media (min-width: 921px) {\n  .bottom-tab-bar { display: none; }\n  body { padding-bottom: 0; }\n}\n\n/* \u79fb\u52a8\u7aef\uff1a\u526f\u79d1\u5361\u7247\u4ece3\u5217\u6539\u4e3a2\u5217\uff0c\u907f\u514d\u6587\u5b57\u622a\u65ad\u548c\u6309\u94ae\u6ea2\u51fa */\n@media (max-width: 640px) {\n  .sub-grid { grid-template-columns: repeat(2, 1fr); }\n  .sub-card { padding: 8px 10px; gap: 8px; }\n  .sub-card .icon-box { width: 30px; height: 30px; border-radius: 9px; font-size: 13px; }\n  .sub-card b { font-size: 12px; }\n  .sub-card .sc-ops .btn.ghost.mini { padding: 3px 6px; font-size: 11px; }\n}\n/* \u8d85\u5c0f\u5c4f\uff1a\u526f\u79d1\u5361\u7247\u6539\u4e3a1\u5217 */\n@media (max-width: 400px) {\n  .sub-grid { grid-template-columns: 1fr; }\n}\n/* \u79fb\u52a8\u7aef\u5c0f\u5c4f\u9002\u914d */\n@media (max-width: 640px) {\n  .main { padding: 16px; }\n}\n/* \u79fb\u52a8\u7aef\uff1a\u4e3b\u79d1\u80fd\u529b\u533a\u5141\u8bb8\u6362\u884c\uff0c\u907f\u514d\u6ea2\u51fa */\n@media (max-width: 640px) {\n  .main-sub { grid-template-columns: auto 1fr; }\n  .main-sub .ms-info { flex-wrap: wrap; }\n  .main-sub .ms-abills { flex-wrap: wrap; justify-content: flex-start; gap: 6px; }\n  .main-sub .ms-ops { grid-column: 1 / -1; justify-content: flex-end; }\n  .ab-cell { font-size: 11px; padding: 2px 8px; }\n  .ab-cell i { width: 16px; height: 16px; font-size: 10px; }\n}\n";
    document.head.appendChild(style);
  }
  window.renderSettingsView = function () {
    var host = document.getElementById('view-settings');
    if (!host) return;
    injectCss();
    if (!once) {
      host.innerHTML = '<main class="main">' + "\n    <div class=\"page-head\">\n      <h1>\u7cfb\u7edf\u8bbe\u7f6e</h1>\n      <div class=\"sub\">\u4e2a\u4eba\u8d44\u6599 \u00b7 \u5168\u90e8\u5206\u7c7b\u914d\u7f6e \u00b7 \u8bb0\u5f55\u7ba1\u7406</div>\n    </div>\n\n    <div class=\"tabs\" role=\"tablist\">\n      <button class=\"on\" data-t=\"base\">\u57fa\u672c\u4fe1\u606f</button>\n      <button data-t=\"subject\">\u79d1\u76ee</button>\n      <button data-t=\"level\">\u7b49\u7ea7</button>\n      <button data-t=\"rule\">\u4efb\u52a1\u89c4\u5219</button>\n      <button data-t=\"finance\">\u8d22\u52a1\u5206\u7c7b</button>\n      <button data-t=\"record\">\u8bb0\u5f55\u7ba1\u7406</button>\n    </div>\n\n    <!-- \u57fa\u672c\u4fe1\u606f\uff1a\u4e2a\u4eba\u8d44\u6599 + \u6821\u5386 + GitHub -->\n    <div class=\"tabp on\" data-p=\"base\">\n      <div class=\"card\">\n        <div class=\"card-title yellow\">\ud83d\udc64 \u4e2a\u4eba\u8d44\u6599</div>\n        <div class=\"form-row\"><label>\u6635\u79f0</label><div class=\"field\"><input value=\"Yara\"></div><button class=\"btn ghost mini\">\u4fdd\u5b58</button></div>\n        <div class=\"form-row\"><label>\u5b66\u6821</label><div class=\"field\"><input value=\"\u6df1\u5733\u667a\u6c11\u5b9e\u9a8c\"></div></div>\n        <div class=\"form-row\"><label>\u73ed\u7ea7 / \u5b66\u53f7</label><div class=\"field\"><input value=\"(1)\u73ed \u00b7 40119\"></div></div>\n        <div class=\"form-row\"><label>\u5e74\u7ea7</label><div class=\"field\"><input value=\"\u56db\u5e74\u7ea7\"></div></div>\n        <div class=\"form-row\"><label>\u683c\u8a00</label><div class=\"field\"><input value=\"\u6bcf\u5929\u8fdb\u6b65\u4e00\u70b9\u70b9\"></div></div>\n        <div class=\"form-row\"><label>\u5174\u8da3\u7231\u597d</label><div class=\"field\"><input value=\"\u6f2b\u753b\u3001\u753b\u753b\u3001\u505a\u624b\u5de5\"></div></div>\n      </div>\n      <div class=\"card\">\n        <div class=\"card-title coral\">\ud83d\udcc5 \u6821\u5386 <span style=\"font-size:12px;color:var(--colourful-neutral-500);font-weight:700\">\u00b7 2026-2027 \u5b66\u5e74 \u00b7 \u56db\u5e74\u7ea7</span></div>\n        <div class=\"sem-grid\">\n          <div class=\"sem-box\">\n            <div class=\"sem-head\"><span class=\"sem-badge\">\ud83d\udcd6 \u5b66\u671f\u4e00</span><span class=\"sem-meta\">9-01 \u5f00\u5b66 \u00b7 22 \u5468</span></div>\n            <div class=\"timeline\">\n              <div class=\"tl-item\"><span class=\"tl-ic ic-blue\">\ud83c\udfeb</span><div class=\"tl-t\"><b>\u5b66\u671f\u4e00\u5f00\u5b66</b><span>2026-09-01</span></div></div>\n              <div class=\"tl-item\"><span class=\"tl-ic ic-yellow\">\ud83d\udcdd</span><div class=\"tl-t\"><b>\u5b66\u671f\u4e00\u671f\u4e2d</b><span>2026-11-02</span></div><span class=\"tl-xp\">\u7b2c 9 \u5468</span></div>\n              <div class=\"tl-item\"><span class=\"tl-ic ic-coral\">\ud83c\udf93</span><div class=\"tl-t\"><b>\u5b66\u671f\u4e00\u671f\u672b</b><span>2027-01-25</span></div><span class=\"tl-xp\">\u7b2c 21 \u5468</span></div>\n              <div class=\"tl-item\"><span class=\"tl-ic ic-lav\">\u26c4</span><div class=\"tl-t\"><b>\u5bd2\u5047\u5f00\u59cb</b><span>2027-01-31</span></div></div>\n            </div>\n          </div>\n          <div class=\"sem-box\">\n            <div class=\"sem-head\"><span class=\"sem-badge\">\ud83c\udf31 \u5b66\u671f\u4e8c</span><span class=\"sem-meta\">3-01 \u5f00\u5b66 \u00b7 19 \u5468</span></div>\n            <div class=\"timeline\">\n              <div class=\"tl-item\"><span class=\"tl-ic ic-mint\">\ud83c\udf31</span><div class=\"tl-t\"><b>\u5b66\u671f\u4e8c\u5f00\u5b66</b><span>2027-03-01 \u00b7 19 \u5468</span></div></div>\n              <div class=\"tl-item\"><span class=\"tl-ic ic-yellow\">\ud83d\udcdd</span><div class=\"tl-t\"><b>\u5b66\u671f\u4e8c\u671f\u4e2d</b><span>2027-05-03</span></div><span class=\"tl-xp\">\u7b2c 9 \u5468</span></div>\n              <div class=\"tl-item\"><span class=\"tl-ic ic-coral\">\ud83c\udf93</span><div class=\"tl-t\"><b>\u5b66\u671f\u4e8c\u671f\u672b</b><span>2027-07-05</span></div><span class=\"tl-xp\">\u7b2c 18 \u5468</span></div>\n              <div class=\"tl-item\"><span class=\"tl-ic ic-lime\">\ud83c\udfd6\ufe0f</span><div class=\"tl-t\"><b>\u6691\u5047\u5f00\u59cb</b><span>2027-07-12</span></div></div>\n            </div>\n          </div>\n        </div>\n      </div>\n      <div class=\"card\">\n        <div class=\"card-title mint\">\ud83d\udd17 GitHub \u8fde\u63a5</div>\n        <div class=\"conn\" id=\"connStatus\">\n          <div class=\"st no\" id=\"connDot\"></div>\n          <div class=\"ci\"><b id=\"connTitle\">\u672a\u8fde\u63a5</b><span id=\"connDesc\">\u8fd8\u6ca1\u6709\u914d\u7f6e Token\uff0c\u5199\u5165\u64cd\u4f5c\u6682\u4e0d\u53ef\u7528</span></div>\n          <button class=\"btn ghost mini\" id=\"connBtn\" onclick=\"disconnectGithub()\" style=\"display:none\">\u65ad\u5f00</button>\n        </div>\n        <div class=\"form-row token-row\">\n          <label>Token</label>\n          <div class=\"field\">\n            <input type=\"password\" id=\"githubTokenInput\" placeholder=\"\u7c98\u8d34 GitHub Token\uff08ghp_/github_pat_ \u5f00\u5934\uff09\" autocomplete=\"off\" />\n          </div>\n          <button class=\"btn primary mini\" onclick=\"saveGithubToken()\">\u4fdd\u5b58</button>\n        </div>\n        <div class=\"token-hint\" id=\"tokenHint\">Token \u53ea\u4fdd\u5b58\u5728\u672c\u673a\u6d4f\u89c8\u5668\uff0c\u7528\u4e8e\u628a\u6570\u636e\u5199\u5165 GitHub \u4ed3\u5e93\u3002\u4e3b\u7ad9\u4f1a\u636e\u6b64\u81ea\u52a8\u540c\u6b65\uff0c\u4e0d\u4f1a\u4e0a\u4f20\u5230\u4efb\u4f55\u670d\u52a1\u5668\u3002</div>\n      </div>\n    </div>\n\n    <!-- \u79d1\u76ee\uff1a\u4e3b\u79d1\u4e00\u4e2a\u8272\u5757\u3001\u526f\u79d1\u4e00\u4e2a\u8272\u5757\uff1b\u4e3b\u79d1\u80fd\u529b\u5c0f\u65b9\u5757+\u63cf\u8ff0\u6a2a\u6392\uff0c\u526f\u79d13\u5217\u5361\u7247 -->\n    <div class=\"tabp\" data-p=\"subject\">\n      <div class=\"card\">\n        <div class=\"card-title\">\ud83d\udcda \u5b66\u79d1\u79d1\u76ee <span style=\"font-size:12px;color:var(--colourful-neutral-500);font-weight:700\">\u00b7 13 \u4e2a\uff08\u542b\u80fd\u529b\u6a21\u5757\uff09</span></div>\n\n        <!-- \u4e3b\u79d1\uff1a\u4e00\u6574\u5757\u6d45\u84dd\u6e10\u53d8 -->\n        <div class=\"subject-block main\">\n          <div class=\"subject-block-head\">\n            <span class=\"sb-badge sb-main\">\ud83d\udcd6 \u4e3b\u79d1</span><span class=\"sb-count\">3 \u95e8 \u00b7 15 \u4e2a\u80fd\u529b</span>\n            <button class=\"btn primary mini sb-add\">\uff0b \u65b0\u589e\u4e3b\u79d1</button>\n          </div>\n          <div class=\"main-sub-list\">\n            <div class=\"main-sub\">\n              <div class=\"icon-box ic-chinese\">\ud83d\udcd6</div>\n              <div class=\"ms-info\"><b class=\"ms-name\">\u8bed\u6587</b><div class=\"ms-abills\"><span class=\"ab-cell\"><i style=\"background:#F95D9F\">1</i>\u62fc\u97f3</span><span class=\"ab-cell\"><i style=\"background:#F95D9F\">2</i>\u6c49\u5b57</span><span class=\"ab-cell\"><i style=\"background:#F95D9F\">3</i>\u7ec4\u8bcd</span><span class=\"ab-cell\"><i style=\"background:#F95D9F\">4</i>\u9605\u8bfb</span><span class=\"ab-cell\"><i style=\"background:#F95D9F\">5</i>\u4f5c\u6587</span></div></div>\n              <div class=\"ms-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></div>\n            </div>\n            <div class=\"main-sub\">\n              <div class=\"icon-box ic-math\">\ud83e\uddee</div>\n              <div class=\"ms-info\"><b class=\"ms-name\">\u6570\u5b66</b><div class=\"ms-abills\"><span class=\"ab-cell\"><i style=\"background:#4A9EFF\">6</i>\u6982\u5ff5</span><span class=\"ab-cell\"><i style=\"background:#4A9EFF\">7</i>\u516c\u5f0f\u5b9a\u7406</span><span class=\"ab-cell\"><i style=\"background:#4A9EFF\">8</i>\u8ba1\u7b97</span><span class=\"ab-cell\"><i style=\"background:#4A9EFF\">9</i>\u63a8\u7406</span><span class=\"ab-cell\"><i style=\"background:#4A9EFF\">10</i>\u76f4\u89c9</span></div></div>\n              <div class=\"ms-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></div>\n            </div>\n            <div class=\"main-sub\">\n              <div class=\"icon-box ic-english\">\ud83d\udd24</div>\n              <div class=\"ms-info\"><b class=\"ms-name\">\u82f1\u8bed</b><div class=\"ms-abills\"><span class=\"ab-cell\"><i style=\"background:#9255F5\">11</i>\u542c\u8bf4</span><span class=\"ab-cell\"><i style=\"background:#9255F5\">12</i>\u5355\u8bcd</span><span class=\"ab-cell\"><i style=\"background:#9255F5\">13</i>\u8bed\u611f</span><span class=\"ab-cell\"><i style=\"background:#9255F5\">14</i>\u9605\u8bfb</span><span class=\"ab-cell\"><i style=\"background:#9255F5\">15</i>\u5199\u4f5c</span></div></div>\n              <div class=\"ms-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></div>\n            </div>\n          </div>\n        </div>\n\n        <!-- \u526f\u79d1\uff1a\u4e00\u6574\u5757\u6d45\u7d2b\u6e10\u53d8\uff0c3 \u5217\u5c0f\u5361\u7247 -->\n        <div class=\"subject-block sub\">\n          <div class=\"subject-block-head\">\n            <span class=\"sb-badge sb-sub\">\ud83c\udfa8 \u526f\u79d1</span><span class=\"sb-count\">10 \u95e8</span>\n            <button class=\"btn primary mini sb-add\">\uff0b \u65b0\u589e\u526f\u79d1</button>\n          </div>\n          <div class=\"sub-grid\">\n            <div class=\"sub-card\"><div class=\"icon-box ic-science\">\ud83d\udd2c</div><b>\u79d1\u5b66</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-moral\">\u2696\ufe0f</div><b>\u9053\u5fb7\u4e0e\u6cd5\u6cbb</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-info\">\ud83d\udcbb</div><b>\u4fe1\u606f\u79d1\u6280</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-sport\">\ud83c\udfc3</div><b>\u4f53\u80b2</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-music\">\ud83c\udfb5</div><b>\u97f3\u4e50</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-art\">\ud83c\udfa8</div><b>\u7f8e\u672f</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-callig\">\ud83d\udd8c\ufe0f</div><b>\u4e66\u6cd5</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-mental\">\u2764\ufe0f</div><b>\u5fc3\u7406\u5065\u5eb7</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-activity\">\ud83d\udc65</div><b>\u7efc\u5408\u5b9e\u8df5\u6d3b\u52a8</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n            <div class=\"sub-card\"><div class=\"icon-box ic-labor\">\ud83d\udd28</div><b>\u52b3\u52a8</b><span class=\"sc-ops\"><button class=\"btn ghost mini\">\u4fee\u6539</button><button class=\"btn ghost mini\">\u5220\u9664</button></span></div>\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- \u7b49\u7ea7\uff1a\u6765\u81ea \u914d\u7f6e-\u7b49\u7ea7 / levels.json\uff0c\u4fdd\u7559 GitHub \u95e8\u69db\uff0c\u6bcf\u7ea7\u5bf9\u5e94\u4e13\u5c5e\u8272 -->\n    <div class=\"tabp\" data-p=\"level\">\n      <div class=\"card\">\n        <div class=\"card-title lav\">\ud83c\udfc5 \u7b49\u7ea7\u4e0e\u6743\u76ca</div>\n        <div style=\"display:flex;justify-content:flex-end;margin-bottom:8px\"><button class=\"btn primary mini\">\uff0b \u65b0\u589e\u7b49\u7ea7</button></div>\n        <div class=\"lvl-grid\">\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-mint-green-200),var(--colourful-mint-green-300))\">Lv.1</span><div class=\"lvl-m\"><b>\u840c\u65b0</b><span>0 XP</span></div><span class=\"lvl-tag\">\u5df2\u5151\u6362</span></div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u81ea\u7531\u4eab\u53d7\u6bcf\u5468\u96f6\u82b1\u94b1</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-butter-yellow-200),var(--colourful-butter-yellow-300))\">Lv.2</span><div class=\"lvl-m\"><b>\u9752\u94dc</b><span>800 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u81ea\u7531\u4eab\u53d7\u6bcf\u5468\u96f6\u82b1\u94b1</div>\n            <div class=\"lvl-priv\"><i>\u23f1\ufe0f</i>60\u5206\u949f\u81ea\u7531\u5b89\u6392\u65f6\u95f4</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-neutral-200),var(--colourful-neutral-300))\">Lv.3</span><div class=\"lvl-m\"><b>\u767d\u94f6</b><span>1800 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u81ea\u7531\u4eab\u53d7\u6bcf\u5468\u96f6\u82b1\u94b1</div>\n            <div class=\"lvl-priv\"><i>\u23f1\ufe0f</i>60\u5206\u949f\u81ea\u7531\u5b89\u6392\u65f6\u95f4</div>\n            <div class=\"lvl-priv\"><i>\ud83d\udc31</i>\u732b\u5496\u65f6\u95f41\u6b21</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-butter-yellow-200),var(--colourful-butter-yellow-400))\">Lv.4</span><div class=\"lvl-m\"><b>\u9ec4\u91d1</b><span>3000 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u81ea\u7531\u4eab\u53d7\u6bcf\u5468\u96f6\u82b1\u94b1</div>\n            <div class=\"lvl-priv\"><i>\u23f1\ufe0f</i>100\u5206\u949f\u81ea\u7531\u5b89\u6392\u65f6\u95f4</div>\n            <div class=\"lvl-priv\"><i>\ud83d\udc31</i>\u732b\u5496\u65f6\u95f41\u6b21</div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u96f6\u98df/\u6587\u5177\u5927\u793c\u53051\u5957\uff08100\u5143\u4ee5\u5185\uff09</div>\n            <div class=\"lvl-priv\"><i>\ud83d\udcb0</i>\u53ef\u63d0\u53d6\u8d22\u5bcc\u57fa\u91d1 5\u2030 \u4f5c\u4e3a\u96f6\u82b1\u94b1</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-sky-blue-200),var(--colourful-sky-blue-300))\">Lv.5</span><div class=\"lvl-m\"><b>\u94c2\u91d1</b><span>4500 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u81ea\u7531\u4eab\u53d7\u6bcf\u5468\u96f6\u82b1\u94b1</div>\n            <div class=\"lvl-priv\"><i>\u23f1\ufe0f</i>100\u5206\u949f\u81ea\u7531\u5b89\u6392\u65f6\u95f4</div>\n            <div class=\"lvl-priv\"><i>\ud83d\udc31</i>\u732b\u5496\u65f6\u95f41\u6b21</div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u96f6\u98df/\u6587\u5177\u5927\u793c\u53051\u5957\uff08100\u5143\u4ee5\u5185\uff09</div>\n            <div class=\"lvl-priv\"><i>\ud83d\udcb0</i>\u53ef\u63d0\u53d6\u8d22\u5bcc\u57fa\u91d1 5\u2030 \u4f5c\u4e3a\u96f6\u82b1\u94b1</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-lavender-200),var(--colourful-lavender-300))\">Lv.6</span><div class=\"lvl-m\"><b>\u94bb\u77f3</b><span>6300 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u81ea\u7531\u4eab\u53d7\u6bcf\u5468\u96f6\u82b1\u94b1</div>\n            <div class=\"lvl-priv\"><i>\u23f1\ufe0f</i>100\u5206\u949f\u81ea\u7531\u5b89\u6392\u65f6\u95f4</div>\n            <div class=\"lvl-priv\"><i>\ud83d\udc31</i>\u732b\u5496\u65f6\u95f41\u6b21</div>\n            <div class=\"lvl-priv\"><i>\ud83c\udf81</i>\u96f6\u98df/\u6587\u5177\u5927\u793c\u53051\u5957\uff08100\u5143\u4ee5\u5185\uff09</div>\n            <div class=\"lvl-priv\"><i>\ud83d\udcb0</i>\u53ef\u63d0\u53d6\u8d22\u5bcc\u57fa\u91d1 1% \u4f5c\u4e3a\u96f6\u82b1\u94b1</div>\n            <div class=\"lvl-priv\"><i>\u2728</i>\u8981\u6c42\u7238\u7238\u5988\u5988\u6ee1\u8db3\u4f60\u7684\u4e00\u4e2a\u5c0f\u613f\u671b</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-candy-pink-200),var(--colourful-candy-pink-300))\">Lv.7</span><div class=\"lvl-m\"><b>\u661f\u8000</b><span>8500 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83d\udd12</i>\u5f85\u5b9a</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-sunny-coral-200),var(--colourful-sunny-coral-300))\">Lv.8</span><div class=\"lvl-m\"><b>\u738b\u8005</b><span>11200 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83d\udd12</i>\u5f85\u5b9a</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-lime-pop-200),var(--colourful-lime-pop-300))\">Lv.9</span><div class=\"lvl-m\"><b>\u5927\u5e08</b><span>14500 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83d\udd12</i>\u5f85\u5b9a</div></div>\n          <div class=\"lvl\"><div class=\"lvl-head\"><span class=\"lvl-badge\" style=\"background:linear-gradient(135deg,var(--colourful-butter-yellow-200),var(--colourful-butter-yellow-400))\">Lv.10</span><div class=\"lvl-m\"><b>\u81f3\u5c0a</b><span>18500 XP</span></div><button class=\"btn ghost mini\">\u7f16\u8f91</button></div>\n            <div class=\"lvl-priv\"><i>\ud83d\udd12</i>\u5f85\u5b9a</div></div>\n        </div>\n      </div>\n    </div>\n\n    <!-- \u4efb\u52a1\u89c4\u5219\uff1a\u9ed8\u8ba4\u8bb0\u5f55\uff08\u81ea\u52a8\u53d1\u653e\uff09\u5355\u72ec\u5217\u51fa + \u624b\u52a8\u89c4\u5219 4 \u5927\u5206\u7c7b\u7f51\u683c -->\n    <div class=\"tabp\" data-p=\"rule\">\n      <div class=\"card\">\n        <div class=\"card-title\">\u2705 \u4efb\u52a1\u89c4\u5219 <span style=\"font-size:12px;color:var(--colourful-neutral-500);font-weight:700\">\u00b7 \u624b\u52a8 18 \u6761 \u00b7 \u9ed8\u8ba4\u8bb0\u5f55 7 \u6761</span></div>\n        <div style=\"display:flex;justify-content:flex-end;margin-bottom:14px\"><button class=\"btn primary mini\" onclick=\"openAddRuleModal()\">\uff0b \u65b0\u589e\u89c4\u5219</button></div>\n\n        <!-- \u9ed8\u8ba4\u8bb0\u5f55 \u00b7 \u81ea\u52a8\u53d1\u653e\uff08\u5355\u72ec\u5217\u51fa\uff09 -->\n        <div class=\"def-card\">\n          <div class=\"def-head\"><span class=\"r-dot\"></span><b>\u9ed8\u8ba4\u8bb0\u5f55 \u00b7 \u81ea\u52a8\u53d1\u653e</b><span class=\"def-tag\">\u2699\ufe0f \u81ea\u52a8\u52a0\u5206</span><span class=\"r-n\" id=\"defCount\">8 \u6761</span></div>\n          <div class=\"def-grid\" id=\"defGrid\">\n            <div style=\"grid-column:1/-1;text-align:center;padding:16px;color:var(--colourful-neutral-400);font-size:13px\">\u6b63\u5728\u52a0\u8f7d\u2026</div>\n          </div>\n          <div class=\"def-note\" id=\"defNote\">\u8bf4\u660e\uff1a\u4ee5\u4e0a\u4e3a\u64cd\u4f5c\u65f6\u81ea\u52a8\u53d1\u653e\u7684\u9ed8\u8ba4\u5206\u503c\uff0c\u5747\u4ece config.json \u5b9e\u65f6\u8bfb\u53d6\uff0c\u4e0e\u524d\u53f0\u53d1\u653e\u4e00\u81f4\u3002\u6210\u7ee9\u5f55\u5165 +2\uff0c\u52fe\u9009\u5931\u5206\u6a21\u5757\u518d +1\uff1b\u5199\u65e5\u8bb0\u6bcf\u5929\u4ec5\u52a0\u4e00\u6b21\uff1b\u8d22\u52a1\u80fd\u529b\u5206\u6790\uff08\u590d\u76d8\uff09\u5f53\u65e5\u7d2f\u8ba1\u5c01\u9876 +10\uff1b\u8d22\u52a1\u8fdb\u8d26\u4ec5\u8bb0\u5f55\u52a8\u4f5c\u3002\u5747\u8ba1\u5165\u5bf9\u5e94\u677f\u5757\u7684\u80fd\u91cf\u503c\uff0c\u4e0d\u4e0e\u5176\u4ed6\u677f\u5757\u4e32\u6270\u3002</div>\n        </div>\n\n        <div class=\"rule-grid\" id=\"ruleGrid\">\n          <div style=\"grid-column:1/-1;text-align:center;padding:24px;color:var(--colourful-neutral-400);font-size:13px\">\u6b63\u5728\u52a0\u8f7d\u4efb\u52a1\u89c4\u5219\u2026</div>\n        </div>\n\n        <div style=\"margin-top:20px;padding-top:16px;border-top:1px dashed var(--neutral-200);display:flex;flex-wrap:wrap;gap:10px;align-items:center\">\n          <div style=\"flex:1;min-width:200px\">\n            <div style=\"font-weight:600;font-size:14px;color:var(--neutral-700)\">\ud83d\udd04 \u5206\u503c\u540c\u6b65</div>\n            <div style=\"font-size:12px;color:var(--neutral-400);margin-top:2px\">\u5f53 config.json \u4e2d\u7684\u4efb\u52a1\u6216\u5206\u503c\u4fee\u6539\u540e\uff0c\u540c\u6b65\u5230\u5386\u53f2\u8bb0\u5f55</div>\n          </div>\n          <button class=\"btn primary\" onclick=\"openRecalcModal()\">\u91cd\u7b97\u5206\u503c</button>\n        </div>\n      </div>\n    </div>\n\n    <!-- \u8d22\u52a1\u5206\u7c7b\uff1a\u8d26\u6237\u4e24\u5217\u5e76\u6392 + \u6536\u652f\u5206\u7c7b\u5de6\u53f3\u5206\u680f\uff08\u7f51\u683c\u5316\uff0cPC \u89c6\u89c9\u5e73\u8861\uff09 -->\n    <div class=\"tabp\" data-p=\"finance\">\n      <div class=\"card\">\n        <div class=\"card-title coral\">\ud83d\udcb0 \u8d26\u6237 <span style=\"font-size:12px;color:var(--colourful-neutral-500);font-weight:700\">\u00b7 2 \u4e2a</span></div>\n        <div style=\"display:flex;justify-content:flex-end;margin-bottom:8px\"><button class=\"btn primary mini\">\uff0b \u65b0\u589e\u8d26\u6237</button></div>\n        <div class=\"fin-acc\">\n          <div class=\"acc-card\"><div class=\"icon-box ic-coral\">\ud83d\udcb0</div><div class=\"fc-mid\"><b>\u8d22\u5bcc\u589e\u503c\u8d26\u6237</b><span>\u957f\u671f\u50a8\u84c4\u5347\u503c</span></div><div class=\"acc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button></div></div>\n          <div class=\"acc-card\"><div class=\"icon-box ic-yellow\">\ud83e\ude99</div><div class=\"fc-mid\"><b>\u81ea\u7531\u57fa\u91d1\u8d26\u6237</b><span>\u53ef\u81ea\u7531\u652f\u914d\u96f6\u82b1\u94b1</span></div><div class=\"acc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button></div></div>\n        </div>\n      </div>\n      <div class=\"fin-grid\">\n        <div class=\"card\">\n          <div class=\"card-title mint\">\ud83d\udc9a \u6536\u5165\u5206\u7c7b <span style=\"font-size:12px;color:var(--colourful-neutral-500);font-weight:700\">\u00b7 6 \u4e2a</span></div>\n          <div style=\"display:flex;justify-content:flex-end;margin-bottom:8px\"><button class=\"btn primary mini\">\uff0b \u65b0\u589e\u5206\u7c7b</button></div>\n          <div class=\"fin-cat-grid\">\n            <div class=\"fin-cat\"><span class=\"tag tag-in\">\u6536\u5165</span><div class=\"fc-mid\"><b>\u6bcf\u5468\u96f6\u82b1\u94b1</b><span>\u6bcf\u5468\u56fa\u5b9a \u00a518</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n            <div class=\"fin-cat\"><span class=\"tag tag-in\">\u6536\u5165</span><div class=\"fc-mid\"><b>\u538b\u5c81\u94b1</b><span>\u7237\u7237\u5976\u5976 / \u59e5\u59e5\u59e5\u7237</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n            <div class=\"fin-cat\"><span class=\"tag tag-in\">\u6536\u5165</span><div class=\"fc-mid\"><b>\u8003\u8bd5\u5956\u52b1</b><span>\u671f\u672b / \u9636\u6bb5\u5956\u52b1</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n            <div class=\"fin-cat\"><span class=\"tag tag-in\">\u6536\u5165</span><div class=\"fc-mid\"><b>\u5229\u606f\u6536\u76ca</b><span>\u8d26\u6237\u5229\u606f\u7ed3\u7b97</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n            <div class=\"fin-cat\"><span class=\"tag tag-in\">\u6536\u5165</span><div class=\"fc-mid\"><b>\u957f\u8f88\u9988\u8d60</b><span>\u59e5\u59e5\u7ed9\u7684\u96f6\u82b1\u94b1\u7b49</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n            <div class=\"fin-cat\"><span class=\"tag tag-in\">\u6536\u5165</span><div class=\"fc-mid\"><b>\u5176\u4ed6\u6536\u5165</b><span>\u6253\u8d4c / \u5907\u7528\u91d1 / \u521d\u59cb\u8d44\u91d1</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n          </div>\n        </div>\n        <div class=\"card\">\n          <div class=\"card-title pink\">\ud83d\udcb8 \u652f\u51fa\u5206\u7c7b <span style=\"font-size:12px;color:var(--colourful-neutral-500);font-weight:700\">\u00b7 3 \u4e2a</span></div>\n          <div style=\"display:flex;justify-content:flex-end;margin-bottom:8px\"><button class=\"btn primary mini\">\uff0b \u65b0\u589e\u5206\u7c7b</button></div>\n          <div class=\"fin-cat-grid\">\n            <div class=\"fin-cat\"><span class=\"tag tag-out\">\u652f\u51fa</span><div class=\"fc-mid\"><b>\u4e70\u96f6\u98df\u996e\u6599</b><span>\u65e5\u5e38\u96f6\u98df\u996e\u54c1\u6d88\u8d39</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n            <div class=\"fin-cat\"><span class=\"tag tag-out\">\u652f\u51fa</span><div class=\"fc-mid\"><b>\u6587\u5177\u56fe\u4e66</b><span>\u5b66\u4e60\u7528\u54c1\u4e0e\u4e66\u7c4d</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n            <div class=\"fin-cat\"><span class=\"tag tag-out\">\u652f\u51fa</span><div class=\"fc-mid\"><b>\u7ef4\u4fee\u5f00\u652f</b><span>\u5982\u4fee\u590d\u5bb6\u4e2d\u79fb\u52a8\u786c\u76d8</span></div><div class=\"fc-ops\"><button class=\"btn ghost mini\">\u7f16\u8f91</button><button class=\"btn ghost mini\">\u5220\u9664</button></div></div>\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- \u8bb0\u5f55\u7ba1\u7406\uff1a\u6765\u81ea 5 \u5f20\u8bb0\u5f55\u8868\u771f\u5b9e\u6761\u6570\uff0c\u591a\u8272\u53e0\u52a0\uff0cTab \u5207\u6362 -->\n    <div class=\"tabp\" data-p=\"record\">\n      <div class=\"card\">\n        <div class=\"card-title lav\">\ud83d\uddc2\ufe0f \u8bb0\u5f55\u7ba1\u7406 <span id=\"drTotalCount\" style=\"font-size:12px;color:var(--colourful-neutral-500);font-weight:700\">\u00b7 \u52a0\u8f7d\u4e2d\u2026</span></div>\n        <style>\n          #drTabs{display:flex;gap:4px;flex-wrap:wrap;margin:14px 0 4px;border-bottom:2px solid var(--neutral-100);}\n          #drTabs .dr-tab{display:inline-flex;align-items:center;gap:5px;padding:9px 13px;border:none;background:transparent;font-size:13px;font-weight:600;color:var(--neutral-500);cursor:pointer;border-bottom:3px solid transparent;transition:all .15s;line-height:1;}\n          #drTabs .dr-tab .cnt{font-size:11px;background:var(--neutral-100);color:var(--neutral-500);border-radius:10px;padding:1px 7px;font-weight:700;}\n          #drTabs .dr-tab:hover{color:var(--neutral-800);}\n          #drTabs .dr-tab.active{color:var(--colourful-primary-600);border-bottom-color:var(--colourful-primary-500);background:var(--colourful-primary-50);border-radius:10px 10px 0 0;}\n          #drTabs .dr-tab.active .cnt{background:var(--colourful-primary-500);color:#fff;}\n        </style>\n        <div id=\"drTabs\">\n          <button type=\"button\" class=\"dr-tab active\" data-dr=\"finance\" onclick=\"drTab('finance')\">\ud83d\udcb0 \u8d22\u5bcc<span class=\"cnt\" id=\"drCount-finance\"></span></button>\n          <button type=\"button\" class=\"dr-tab\" data-dr=\"xp\" onclick=\"drTab('xp')\">\u26a1 \u80fd\u91cf<span class=\"cnt\" id=\"drCount-xp\"></span></button>\n          <button type=\"button\" class=\"dr-tab\" data-dr=\"homework\" onclick=\"drTab('homework')\">\ud83d\udcdd \u4f5c\u4e1a<span class=\"cnt\" id=\"drCount-homework\"></span></button>\n          <button type=\"button\" class=\"dr-tab\" data-dr=\"exam\" onclick=\"drTab('exam')\">\ud83c\udfc6 \u6210\u7ee9<span class=\"cnt\" id=\"drCount-exam\"></span></button>\n          <button type=\"button\" class=\"dr-tab\" data-dr=\"evaluation\" onclick=\"drTab('evaluation')\">\ud83c\udf96\ufe0f \u671f\u672b\u8bc4\u4ef7<span class=\"cnt\" id=\"drCount-evaluation\"></span></button>\n          <button type=\"button\" class=\"dr-tab\" data-dr=\"diary\" onclick=\"drTab('diary')\">\ud83d\udcd3 \u65e5\u8bb0<span class=\"cnt\" id=\"drCount-diary\"></span></button>\n          <button type=\"button\" class=\"dr-tab\" data-dr=\"commitment\" onclick=\"drTab('commitment')\">\ud83e\udd1d \u627f\u8bfa<span class=\"cnt\" id=\"drCount-commitment\"></span></button>\n          <button type=\"button\" class=\"dr-tab\" data-dr=\"aiweekly\" onclick=\"drTab('aiweekly')\">\ud83d\udcca \u5468\u62a5<span class=\"cnt\" id=\"drCount-aiweekly\"></span></button>\n        </div>\n        <div style=\"font-size:11px;line-height:1.7;color:var(--neutral-400);background:var(--neutral-50);border-radius:8px;padding:6px 10px;margin-top:4px\">\n          \u8fd9\u91cc\u7ba1\u7406\u4e1a\u52a1\u6d41\u6c34\u8bb0\u5f55\uff0c\u5df2\u8986\u76d6\u80fd\u91cf/\u8d22\u5bcc/\u4f5c\u4e1a/\u6210\u7ee9/\u671f\u672b\u8bc4\u4ef7/\u65e5\u8bb0/\u627f\u8bfa/AI\u5468\u62a5\u3002\u7b49\u7ea7\u4e0e\u6743\u76ca\u5728\u300c\u7b49\u7ea7\u300d\u6807\u7b7e\uff0c\u4efb\u52a1\u4e0e\u5206\u503c\u5728\u300c\u4efb\u52a1\u89c4\u5219\u300d\u3001\u8d22\u52a1\u5206\u7c7b\u5728\u300c\u8d22\u52a1\u5206\u7c7b\u300d\u3001\u5b69\u5b50\u8d44\u6599\u4e0e\u6821\u5386\u5728\u300c\u57fa\u672c\u4fe1\u606f\u300d\u91cc\u7ef4\u62a4\u3002\n        </div>\n        <div style=\"display:flex;justify-content:flex-end;align-items:center;gap:8px;margin:12px 0 6px;flex-wrap:wrap\">\n          <div id=\"drTpHint\" style=\"margin-right:auto;font-size:12px;color:var(--neutral-400)\"></div>\n          <button class=\"btn secondary mini\" onclick=\"drShowRelations()\" style=\"display:none\" id=\"drRelBtn\">\ud83d\udd17 \u5173\u8054</button>\n          <button class=\"btn primary mini\" onclick=\"drAdd()\">\uff0b \u65b0\u589e\u8bb0\u5f55</button>\n        </div>\n        <div id=\"drRelBox\" style=\"display:none;margin-bottom:12px;padding:12px;background:var(--colourful-info-50);border-radius:10px;font-size:13px;line-height:1.8;color:var(--neutral-700)\"></div>\n        <div id=\"drListWrap\" style=\"overflow-y:auto;border-radius:10px\"></div>\n        <div id=\"drEmpty\" style=\"padding:24px;text-align:center;color:var(--neutral-400);display:none\">\u8be5\u7c7b\u578b\u6682\u65e0\u8bb0\u5f55</div>\n      </div>\n    </div>\n  " + '</main>' + "<div class=\"modal-overlay\" id=\"recalcModal\" style=\"display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9999;align-items:center;justify-content:center;backdrop-filter:blur(4px)\">\n  <div class=\"modal-content\" style=\"background:var(--colourful-surface-50);border-radius:16px;padding:28px 32px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.12);position:relative\">\n    <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:20px\">\n      <div style=\"font-size:18px;font-weight:700;color:var(--neutral-800)\">\ud83d\udd04 \u5206\u503c\u540c\u6b65</div>\n      <button onclick=\"closeRecalcModal()\" class=\"btn ghost mini\" style=\"font-size:18px;width:32px;height:32px;border-radius:50%\">\u2715</button>\n    </div>\n    <div style=\"font-size:13px;color:var(--neutral-500);line-height:1.6;margin-bottom:20px;padding:12px;background:var(--colourful-warning-50);border-radius:10px;border:1px solid var(--colourful-warning-200)\">\n      \u5f53\u524d\u914d\u7f6e\u4e2d\u7684\u4efb\u52a1\u548c\u5206\u503c\u5df2\u66f4\u65b0\u3002\u8bf7\u9009\u62e9\u5982\u4f55\u5904\u7406\u5df2\u6709\u5386\u53f2\u8bb0\u5f55\uff1a\n    </div>\n    <div id=\"recalcDiff\" style=\"margin-bottom:16px;max-height:160px;overflow-y:auto;font-size:12px;background:var(--neutral-100);border-radius:8px;padding:10px\">\n      <div style=\"color:var(--neutral-400)\">\u6b63\u5728\u52a0\u8f7d\u4efb\u52a1\u5bf9\u6bd4\u2026</div>\n    </div>\n    <div style=\"margin-bottom:16px;border:1px solid var(--neutral-200);border-radius:10px;overflow:hidden\">\n      <div onclick=\"toggleRecalcMapping()\" style=\"display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--neutral-100);cursor:pointer;font-size:13px;font-weight:600;color:var(--neutral-700)\">\n        <span>\ud83d\udd17 \u4efb\u52a1\u540d\u6620\u5c04 <span style=\"font-weight:400;color:var(--neutral-400);font-size:11px\">\uff08\u6539\u8fc7\u4efb\u52a1\u540d\u65f6\u4f7f\u7528\uff09</span></span>\n        <span id=\"recalcMappingArrow\" style=\"transition:transform .2s\">\u25be</span>\n      </div>\n      <div id=\"recalcMappingBody\" style=\"display:none;padding:12px 14px;background:var(--colourful-surface-50)\">\n        <div style=\"font-size:12px;color:var(--neutral-500);line-height:1.6;margin-bottom:10px\">\u5982\u679c\u5386\u53f2\u8bb0\u5f55\u91cc\u7684\u4efb\u52a1\u540d\u548c\u5f53\u524d\u914d\u7f6e\u4e0d\u4e00\u81f4\uff08\u4f8b\u5982\u6539\u8fc7\u540d\uff09\uff0c\u8bf7\u628a<b>\u65e7\u4efb\u52a1\u540d</b>\u6620\u5c04\u5230<b>\u65b0\u4efb\u52a1\u540d</b>\uff0c\u8fd9\u6837\u5386\u53f2\u8bb0\u5f55\u4e5f\u80fd\u6309\u65b0\u89c4\u5219\u66f4\u65b0\u5206\u503c\u3002</div>\n        <div id=\"recalcMappingList\" style=\"margin-bottom:8px\"></div>\n        <button type=\"button\" class=\"btn-link\" onclick=\"addMappingRow()\" style=\"font-size:12px\"><i data-lucide=\"plus\" style=\"width:12px;height:12px;vertical-align:middle\"></i> \u6dfb\u52a0\u6620\u5c04</button>\n        <div id=\"recalcMappingDetect\" style=\"display:none;margin-top:10px;padding:10px;background:var(--colourful-warning-50);border-radius:8px;font-size:12px;color:var(--neutral-600);line-height:1.6\"></div>\n      </div>\n    </div>\n    <div style=\"display:flex;flex-direction:column;gap:10px\">\n      <button class=\"btn secondary\" onclick=\"recalcXp('new')\" style=\"justify-content:flex-start;padding:14px 18px;height:auto;text-align:left;border-radius:12px\">\n        <div><span style=\"font-weight:600;font-size:14px;display:block\">\ud83c\udd95 \u4ece\u65b0\u5f00\u59cb\u8ba1\u7b97</span><span style=\"font-size:12px;color:var(--neutral-500)\">\u5386\u53f2\u8bb0\u5f55\u4fdd\u6301\u539f\u6837\uff0c\u65b0\u63d0\u4ea4\u7684\u8bb0\u5f55\u4f7f\u7528\u65b0\u5206\u503c</span></div>\n      </button>\n      <button class=\"btn primary\" onclick=\"recalcXp('all')\" style=\"justify-content:flex-start;padding:14px 18px;height:auto;text-align:left;border-radius:12px\">\n        <div><span style=\"font-weight:600;font-size:14px;display:block\">\ud83d\udcdc \u5386\u53f2\u4e5f\u4e00\u8d77\u66f4\u65b0</span><span style=\"font-size:12px;color:var(--colourful-mint-green-100)\">\u904d\u5386\u6240\u6709\u5386\u53f2 XP \u8bb0\u5f55\uff0c\u6309\u4efb\u52a1\u540d\u5339\u914d\u5e76\u66f4\u65b0\u4e3a\u5f53\u524d\u5206\u503c</span></div>\n      </button>\n    </div>\n    <div id=\"recalcResult\" style=\"display:none;margin-top:16px;padding:12px;background:var(--colourful-success-50);border-radius:10px;font-size:13px;color:var(--colourful-success-700);line-height:1.6\"></div>\n  </div>\n</div>\n\n<!-- \u4efb\u52a1\u89c4\u5219\u7f16\u8f91\u5f39\u7a97 -->\n<div class=\"modal-overlay\" id=\"ruleModal\" style=\"display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9999;align-items:center;justify-content:center;backdrop-filter:blur(4px)\">\n  <div class=\"modal-content\" style=\"background:var(--colourful-surface-50);border-radius:16px;padding:28px 32px;max-width:520px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.12);position:relative;max-height:90vh;overflow-y:auto\">\n    <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:20px\">\n      <div style=\"font-size:18px;font-weight:700;color:var(--neutral-800)\" id=\"ruleModalTitle\">\u270f\ufe0f \u7f16\u8f91\u4efb\u52a1</div>\n      <button onclick=\"closeRuleModal()\" class=\"btn ghost mini\" style=\"font-size:18px;width:32px;height:32px;border-radius:50%\">\u2715</button>\n    </div>\n    <div style=\"display:grid;gap:14px\">\n      <div>\n        <label style=\"font-size:12px;font-weight:700;color:var(--neutral-600);display:block;margin-bottom:6px\">\u4efb\u52a1\u540d\u79f0</label>\n        <input id=\"ruleName\" type=\"text\" placeholder=\"\u4f8b\u5982\uff1a\u6bcf\u5929\u9605\u8bfb 30 \u5206\u949f\" style=\"width:100%;padding:10px 12px;border:1px solid var(--neutral-200);border-radius:10px;font-size:14px;outline:none;background:#fff\" />\n      </div>\n      <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">\n        <div>\n          <label style=\"font-size:12px;font-weight:700;color:var(--neutral-600);display:block;margin-bottom:6px\">\u6240\u5c5e\u5206\u7c7b</label>\n          <select id=\"ruleCategory\" style=\"width:100%;padding:10px 12px;border:1px solid var(--neutral-200);border-radius:10px;font-size:14px;outline:none;background:#fff\">\n            <option value=\"\u5b66\u4e60\u6210\u957f\">\u5b66\u4e60\u6210\u957f</option>\n            <option value=\"\u80fd\u529b\u6210\u957f\">\u80fd\u529b\u6210\u957f</option>\n            <option value=\"\u8eab\u4f53\u6210\u957f\">\u8eab\u4f53\u6210\u957f</option>\n            <option value=\"\u5174\u8da3\u7231\u597d\">\u5174\u8da3\u7231\u597d</option>\n          </select>\n        </div>\n        <div>\n          <label style=\"font-size:12px;font-weight:700;color:var(--neutral-600);display:block;margin-bottom:6px\">\u5206\u503c\uff08XP\uff09</label>\n          <input id=\"ruleXp\" type=\"number\" min=\"0\" max=\"100\" placeholder=\"5\" style=\"width:100%;padding:10px 12px;border:1px solid var(--neutral-200);border-radius:10px;font-size:14px;outline:none;background:#fff\" />\n        </div>\n      </div>\n      \n      <div style=\"grid-column:1/-1;font-size:12px;color:var(--neutral-400);background:var(--colourful-mint-green-50);border-radius:8px;padding:8px 10px;line-height:1.6\">\u5206\u503c\u5efa\u8bae\uff1a\u7b80\u5355\u4e60\u60ef\uff13-\uff15\uff0c\u4e2d\u7b49\uff15-\uff11\uff10\uff0c\u6709\u6311\u6218\uff11\uff10-\uff12\uff10\uff0c\u540e\u7eed\u53ef\u968f\u8fdb\u6b65\u8c03\u6574\u3002</div>\n\n      <div>\n        <label style=\"font-size:12px;font-weight:700;color:var(--neutral-600);display:block;margin-bottom:6px\">\u8bf4\u660e\uff08\u53ef\u9009\uff09</label>\n        <input id=\"ruleDesc\" type=\"text\" placeholder=\"\u4f8b\u5982\uff1a\u4e3b\u52a8\u8ba4\u9886\uff0c\u5bb6\u957f\u786e\u8ba4\u540e\u53d1\u653e\" style=\"width:100%;padding:10px 12px;border:1px solid var(--neutral-200);border-radius:10px;font-size:14px;outline:none;background:#fff\" />\n      </div>\n    </div>\n    <div style=\"display:flex;gap:10px;margin-top:22px;justify-content:flex-end\">\n      <button class=\"btn ghost\" onclick=\"closeRuleModal()\">\u53d6\u6d88</button>\n      <button class=\"btn primary\" onclick=\"saveRule()\">\u4fdd\u5b58</button>\n    </div>\n    <div id=\"ruleResult\" style=\"display:none;margin-top:14px;padding:12px;background:var(--colourful-success-50);border-radius:10px;font-size:13px;color:var(--colourful-success-700);line-height:1.6\"></div>\n  </div>\n</div>" + "<div class=\"toast\" id=\"settingsToast\"></div>";
      once = true;
      bindSettingsTabs();
    }
    renderGithubStatus();
    renderRuleGrid();
    renderDefGrid();
    initDr();
  };
  function bindSettingsTabs() {
    var bar = document.querySelector('#view-settings .tabs');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      document.querySelectorAll('#view-settings .tabs button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      document.querySelectorAll('#view-settings .tabp').forEach(function (p) { p.classList.toggle('on', p.dataset.p === b.dataset.t); });
    });
  }
})();

/* tabs 绑定移到 renderSettingsView */


/* ════════ 侧边栏个人信息：与首页完全一致（以首页为准） ════════ */
(function syncSidebarProfile() {
  function fmtAge(birthday) {
    if (!birthday) return "";
    var birth = new Date(String(birthday) + "T00:00:00");
    if (isNaN(birth.getTime())) return "";
    var today = new Date();
    var years = today.getFullYear() - birth.getFullYear();
    var months = today.getMonth() - birth.getMonth();
    var days = today.getDate() - birth.getDate();
    if (days < 0) { months -= 1; days += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); }
    if (months < 0) { years -= 1; months += 12; }
    return years + "岁" + months + "个月" + days + "天";
  }
  function render(name, birthday) {
    var nmEl = document.getElementById("sideChildName");
    var infoEl = document.getElementById("sideChildInfo");
    if (nmEl && name) nmEl.textContent = name;
    if (infoEl) {
      var age = fmtAge(birthday);
      // 与首页一致：显示“X岁Y个月Z天 ♀”
      infoEl.innerHTML = age + ' <span style="color:var(--colourful-candy-pink-500)">♀</span>';
    }
  }
  try {
    var raw = localStorage.getItem("yara_child_profile");
    var c = raw ? (JSON.parse(raw) || {}) : {};
    if (c.name && c.birthday) { render(c.name, c.birthday); return; }
    // 本地缓存不全时，回退读取 data/child.json（与首页同一数据源），保证与首页侧边栏一致
    fetch("data/child.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        render(data.name || "", data.birthday || "");
      })
      .catch(function () { /* 静默 */ });
  } catch (e) { /* 静默 */ }
})();

/* ════════ GitHub Token 配置 ════════ */
var GITHUB_TOKEN_KEY = "github_token";

function getGithubToken() {
  try { return localStorage.getItem(GITHUB_TOKEN_KEY) || ""; } catch (e) { return ""; }
}
function setGithubToken(token) {
  try { localStorage.setItem(GITHUB_TOKEN_KEY, token); } catch (e) {}
}
function clearGithubToken() {
  try { localStorage.removeItem(GITHUB_TOKEN_KEY); } catch (e) {}
}


// 读取当前连接状态并渲染
function renderGithubStatus() {
  var token = getGithubToken();
  var dot = document.getElementById("connDot");
  var title = document.getElementById("connTitle");
  var desc = document.getElementById("connDesc");
  var btn = document.getElementById("connBtn");
  var input = document.getElementById("githubTokenInput");
  var has = !!token;
  if (dot) dot.className = "st " + (has ? "ok" : "no");
  if (title) title.textContent = has ? "GitHub 已连接" : "未连接";
  if (desc) desc.textContent = has ? "Token 已配置，数据可自动同步到云端仓库" : "还没有配置 Token，写入操作暂不可用";
  if (btn) btn.style.display = has ? "" : "none";
  if (input) input.value = has ? token : "";
}

// 保存 Token
function saveGithubToken() {
  var input = document.getElementById("githubTokenInput");
  var token = (input && input.value || "").trim();
  if (!token) { showToast("请先粘贴 GitHub Token", false); return; }
  if (!/^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/.test(token)) {
    showToast("Token 格式看起来不对，请检查后重试", false);
    return;
  }
  setGithubToken(token);
  renderGithubStatus();
  showToast("✅ Token 已保存，数据可自动同步");
}

// 断开 GitHub 连接
function disconnectGithub() {
  clearGithubToken();
  renderGithubStatus();
  showToast("已断开 GitHub 连接");
}

document.addEventListener("DOMContentLoaded", renderGithubStatus);

/* ════════ 分值重算 ════════ */
const GITHUB_OWNER_R = 'meramei';
const GITHUB_REPO_R = 'Yara';
const GITHUB_BRANCH_R = 'main';
const GITHUB_RAW_BASE_R = 'https://raw.githubusercontent.com/' + GITHUB_OWNER_R + '/' + GITHUB_REPO_R + '/' + GITHUB_BRANCH_R + '/data';

/* fetchRawJSON 复用 app.js */

/* ─── 任务名映射 ─── */
var _mappingRuleNames = []; // 当前配置中的任务名列表

function toggleRecalcMapping() {
  var body = document.getElementById('recalcMappingBody');
  var arrow = document.getElementById('recalcMappingArrow');
  var show = body.style.display !== 'block';
  body.style.display = show ? 'block' : 'none';
  if (arrow) arrow.style.transform = show ? 'rotate(180deg)' : '';
}

function addMappingRow(oldName, newName) {
  var list = document.getElementById('recalcMappingList');
  if (!list) return;
  var div = document.createElement('div');
  div.className = 'recalc-mapping-row';
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center';
  var opts = '<option value="">选择新任务名…</option>';
  _mappingRuleNames.forEach(function(n) {
    opts += '<option value="' + n.replace(/"/g, '&quot;') + '"' + (n === newName ? ' selected' : '') + '>' + n + '</option>';
  });
  div.innerHTML = '<input type="text" class="form-input" style="flex:1;font-size:12px;padding:6px 8px" placeholder="旧任务名（历史记录里的）" value="' + (oldName || '').replace(/"/g, '&quot;') + '" />' +
    '<span style="color:var(--neutral-400);flex-shrink:0">→</span>' +
    '<select class="form-input" style="flex:1;font-size:12px;padding:6px 8px">' + opts + '</select>' +
    '<button type="button" class="btn ghost mini" onclick="removeMappingRow(this)" style="color:var(--colourful-error-500);flex-shrink:0">✕</button>';
  list.appendChild(div);
}

function removeMappingRow(btn) {
  var row = btn.closest('.recalc-mapping-row');
  if (row) row.remove();
}

// 收集当前填写的映射
function collectMappings() {
  var map = {};
  document.querySelectorAll('#recalcMappingList .recalc-mapping-row').forEach(function(row) {
    var oldName = row.querySelector('input').value.trim();
    var newName = row.querySelector('select').value;
    if (oldName && newName) map[oldName] = newName;
  });
  return map;
}

// 检测历史记录中未匹配的任务名
function detectUnmatchedNames(records, ruleMap) {
  var unmatched = {};
  records.forEach(function(r) {
    if (r.taskName && ruleMap[r.taskName] === undefined) {
      unmatched[r.taskName] = (unmatched[r.taskName] || 0) + 1;
    }
  });
  return unmatched;
}

function openRecalcModal() {
  var modal = document.getElementById('recalcModal');
  modal.classList.add('active');
  modal.style.display = 'flex';
  document.getElementById('recalcResult').style.display = 'none';
  document.getElementById('recalcDiff').innerHTML = '<div style="color:var(--neutral-400)">正在加载任务对比…</div>';
  // 重置映射区
  document.getElementById('recalcMappingList').innerHTML = '';
  document.getElementById('recalcMappingDetect').style.display = 'none';
  document.getElementById('recalcMappingBody').style.display = 'none';
  // 加载当前 config 和历史的 xpRecords
  Promise.all([ fetchRawJSON('config.json'), fetchRawJSON('xpRecords.json') ])
    .then(function(results) {
      var config = results[0];
      var records = results[1] || [];
      var rules = (config && config.xpRules) || {};
      // 构建任务名→XP 映射
      var ruleMap = {};
      _mappingRuleNames = [];
      Object.keys(rules).forEach(function(cat) {
        (rules[cat] || []).forEach(function(item) {
          ruleMap[item.name] = Number(item.xp) || 0;
          _mappingRuleNames.push(item.name);
        });
      });
      // 检测历史记录中未匹配的任务名（可能是改过名的）
      var unmatched = detectUnmatchedNames(records, ruleMap);
      var unmatchedKeys = Object.keys(unmatched);
      if (unmatchedKeys.length > 0) {
        var detectHtml = '⚠️ 检测到 <b>' + unmatchedKeys.length + '</b> 个历史任务名在当前配置中不存在（可能是改过名）：<br>';
        unmatchedKeys.forEach(function(name) {
          detectHtml += '· <b>' + name + '</b>（' + unmatched[name] + ' 条记录）<br>';
        });
        detectHtml += '<div style="margin-top:6px;font-size:11px;color:var(--neutral-500)">请在下方为它们添加映射，或忽略（保持原样）。</div>';
        document.getElementById('recalcMappingDetect').innerHTML = detectHtml;
        document.getElementById('recalcMappingDetect').style.display = '';
        // 自动为每个未匹配任务名添加一行映射
        unmatchedKeys.forEach(function(name) {
          addMappingRow(name, '');
        });
      }
      // 统计历史记录中可匹配的任务
      var matched = 0, changed = 0;
      var diffHtml = '';
      records.forEach(function(r) {
        if (r.taskName && ruleMap[r.taskName] !== undefined) {
          matched++;
          var oldXp = Number(r.xp) || 0;
          var newXp = ruleMap[r.taskName];
          if (oldXp !== newXp) {
            changed++;
            diffHtml += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--neutral-150)"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.taskName + '</span><span style="flex-shrink:0;color:var(--neutral-400)">' + oldXp + 'XP → <b style="color:var(--colourful-success-600)">' + newXp + 'XP</b></span></div>';
          }
        }
      });
      if (diffHtml) {
        diffHtml = '<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:600;color:var(--neutral-700);border-bottom:2px solid var(--neutral-300)"><span>任务</span><span>分值变化</span></div>' + diffHtml;
      } else {
        diffHtml = '<div style="color:var(--neutral-500)">所有历史记录的分值与当前配置一致，无需更新</div>';
      }
      document.getElementById('recalcDiff').innerHTML = diffHtml +
        '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--neutral-200);font-size:12px;color:var(--neutral-500)">共 ' + matched + ' 条可匹配记录，' + (changed > 0 ? '<b style="color:var(--colourful-sunny-coral-500)">' + changed + ' 条分值有变化</b>' : '0 条分值变化') + '</div>';
    })
    .catch(function(e) {
      document.getElementById('recalcDiff').innerHTML = '<div style="color:var(--colourful-error-500)">加载失败：' + e.message + '</div>';
    });
}

function closeRecalcModal() {
  var m = document.getElementById('recalcModal');
  m.classList.remove('active');
  m.style.display = 'none';
}

function recalcXp(mode) {
  var resultEl = document.getElementById('recalcResult');
  resultEl.style.display = '';
  resultEl.innerHTML = '⏳ 正在处理…';
  var btns = document.querySelectorAll('#recalcModal .btn.primary, #recalcModal .btn.secondary');
  btns.forEach(function(b) { b.disabled = true; });
  
  Promise.all([ fetchRawJSON('config.json'), fetchRawJSON('xpRecords.json') ])
    .then(function(results) {
      var config = results[0];
      var records = JSON.parse(JSON.stringify(results[1] || []));
      var rules = (config && config.xpRules) || {};
      // 构建任务名→XP 映射
      var ruleMap = {};
      Object.keys(rules).forEach(function(cat) {
        (rules[cat] || []).forEach(function(item) {
          ruleMap[item.name] = Number(item.xp) || 0;
        });
      });
      // 应用用户配置的旧名→新名映射
      var nameMap = collectMappings();
      var mappedCount = 0;
      records.forEach(function(r) {
        if (r.taskName && nameMap[r.taskName] && ruleMap[nameMap[r.taskName]] !== undefined) {
          r.taskName = nameMap[r.taskName];
          mappedCount++;
        }
      });
      
      if (mode === 'all') {
        var updated = 0, skipped = 0;
        records.forEach(function(r) {
          if (r.taskName && ruleMap[r.taskName] !== undefined) {
            var newXp = ruleMap[r.taskName];
            if (Number(r.xp) !== newXp) {
              r.xp = newXp;
              r.baseXp = newXp;
              r.xpValue = newXp;
              updated++;
            } else {
              skipped++;
            }
          }
        });
        if (updated === 0 && mappedCount === 0) {
          resultEl.innerHTML = '✅ 所有历史记录分值已与当前配置一致，无需更新（' + skipped + ' 条已匹配）';
          btns.forEach(function(b) { b.disabled = false; });
          return;
        }
        // 写回 GitHub
        var msgParts = [];
        if (mappedCount > 0) msgParts.push('任务名映射 ' + mappedCount + ' 条');
        if (updated > 0) msgParts.push('更新分值 ' + updated + ' 条');
        return DR.writeDataFile('xpRecords.json', records, '分值同步：' + msgParts.join('，'))
          .then(function() {
            var resHtml = '';
            if (mappedCount > 0) resHtml += '🔗 已应用 <b>' + mappedCount + '</b> 条任务名映射<br>';
            if (updated > 0) resHtml += '✅ 更新了 <b>' + updated + '</b> 条历史记录的分值，' + skipped + ' 条无需变动。';
            if (!resHtml) resHtml = '✅ 已完成处理。';
            resultEl.innerHTML = resHtml + '<br><span style="font-size:12px;color:var(--neutral-500)">💡 请刷新页面查看最新数据</span>';
          });
      } else {
        // 从新开始计算：无需操作，仅提示
        resultEl.innerHTML = '✅ 已确认。新提交的记录将使用当前配置中的新分值，历史记录保持不变。';
        btns.forEach(function(b) { b.disabled = false; });
      }
    })
    .catch(function(e) {
      resultEl.innerHTML = '❌ 操作失败：' + e.message;
      btns.forEach(function(b) { b.disabled = false; });
    });
}

/* ════════ 任务规则 · 动态渲染 & 编辑 ════════ */
var _ruleData = null; // 缓存 config.json 的 xpRules
var _fullConfig = null; // 缓存完整 config.json（增删改时直接基于内存修改写入，不走网络避免 CDN 返回旧数据）

// 分类 → 颜色/图标映射
var _ruleMeta = {
  '学习成长': { dot: '#82d632', ic: 'ic-learn', icon: '📖' },
  '能力成长': { dot: '#fdd832', ic: 'ic-ability', icon: '🌟' },
  '身体成长': { dot: '#36b98b', ic: 'ic-body', icon: '💪' },
  '兴趣爱好': { dot: '#f96024', ic: 'ic-hobby', icon: '🎨' }
};

// 根据任务名猜图标
function guessIcon(name) {
  var map = {
    '🏆': ['金牌', '进步', '荣誉'],
    '✅': ['完成作业', '60分钟'],
    '📖': ['阅读', '读书'],
    '✏️': ['练习', '额外', '写作', '画画'],
    '🖌️': ['练字', '书法'],
    '💪': ['认真投入', '遇到难题', '难题'],
    '🧩': ['独立', '不会的题'],
    '🔁': ['复盘', '错题'],
    '🧹': ['家务'],
    '🛏️': ['卧室', '收拾'],
    '🧦': ['袜子', '内裤'],
    '🚿': ['洗澡', '吹头发'],
    '💬': ['沟通', '父母'],
    '📊': ['财务', '分析'],
    '🍎': ['照顾', '营养'],
    '⏳': ['跳绳'],
    '🌙': ['关灯', '睡觉'],
    '⚽': ['锻炼', '户外'],
    '🎨': ['作品', '发布'],
    '💰': ['进账', '财富'],
    '📓': ['日记'],
    '🎯': ['成绩'],
    '🔥': ['坚持']
  };
  for (var icon in map) {
    if (map[icon].some(function(k) { return name.indexOf(k) > -1; })) return icon;
  }
  return '⭐';
}

// 从 _ruleData 内存数据渲染规则网格（不发起网络请求）
function _renderRuleGridFromData() {
  var grid = document.getElementById('ruleGrid');
  if (!grid) return;
  if (!_ruleData) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--colourful-neutral-500);font-size:13px">暂无任务规则配置</div>';
    return;
  }
  var cats = ['学习成长', '能力成长', '身体成长', '兴趣爱好'];
  var html = '';
  cats.forEach(function(cat) {
    var rules = _ruleData[cat] || [];
    var isAutoTask = function(t) {
      var d = String(t.description || "");
      var n = String(t.name || "");
      var m = String(t.method || "");
      return m.indexOf("自动") >= 0 || d.indexOf("自动发放") >= 0 || n.indexOf("作业·") === 0
        || n.indexOf("认真投入") >= 0 || n.indexOf("财务能力分析") >= 0 || n.indexOf("写日记") >= 0;
    };
    var visibleRules = rules.map(function(t, i) { return { t: t, i: i }; }).filter(function(x) { return !isAutoTask(x.t); });
    var meta = _ruleMeta[cat] || { dot: '#888', ic: 'ic-learn', icon: '📖' };
    var dotColor = meta.dot;
    html += '<div class="rule-card">';
    html += '<div class="rule-head"><span class="r-dot" style="background:' + dotColor + '"></span><b>' + cat + '</b><span class="r-n">' + visibleRules.length + ' 条</span></div>';
    html += '<div class="rule-list">';
    visibleRules.forEach(function(x) {
      var item = x.t;
      var idx = x.i;
      var desc = item.description || '';
      html += '<div class="rule-item" data-cat="' + cat + '" data-idx="' + idx + '">';
      html += '<div class="ri-t"><b>' + item.name + '</b>' + (desc ? '<span>' + desc + '</span>' : '') + '</div>';
      html += '<span class="ri-xp">+' + item.xp + '<small>XP</small></span>';
      html += '<span class="ri-ops"><button class="btn ghost mini" onclick="openEditRuleModal(\'' + cat + '\',' + idx + ')">编辑</button><button class="btn ghost mini" onclick="deleteRule(\'' + cat + '\',' + idx + ')">删除</button></span>';
      html += '</div>';
    });
    html += '</div></div>';
  });
  grid.innerHTML = html;
}

// 渲染规则网格（从服务器拉取最新数据）
function renderRuleGrid() {
  var grid = document.getElementById('ruleGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--colourful-neutral-400);font-size:13px">正在加载任务规则…</div>';

  fetchRawJSON('config.json', { cache: 'no-store' }).then(function(config) {
    if (!config || !config.xpRules) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--colourful-neutral-500);font-size:13px">暂无任务规则配置</div>';
      return;
    }
    _ruleData = config.xpRules;
    _fullConfig = config; // 缓存完整 config，供后续增删改直接使用
    _renderRuleGridFromData();
  }).catch(function() {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--colourful-sunny-coral-500);font-size:13px">⚠️ 加载失败，请检查网络</div>';
  });
}

// 打开编辑弹窗
function openEditRuleModal(cat, idx) {
  var rules = _ruleData[cat] || [];
  var item = rules[idx];
  if (!item) return;
  document.getElementById('ruleModalTitle').textContent = '✏️ 编辑任务';
  document.getElementById('ruleName').value = item.name || '';
  document.getElementById('ruleCategory').value = cat;
  document.getElementById('ruleXp').value = item.xp || 0;
  document.getElementById('ruleDesc').value = item.description || '';
  document.getElementById('ruleResult').style.display = 'none';
  document.getElementById('ruleModal').dataset.cat = cat;
  document.getElementById('ruleModal').dataset.idx = idx;
  var m = document.getElementById('ruleModal');
  m.classList.add('active');
  m.style.display = 'flex';
}

// 打开新增弹窗
function openAddRuleModal() {
  document.getElementById('ruleModalTitle').textContent = '➕ 新增任务';
  document.getElementById('ruleName').value = '';
  document.getElementById('ruleCategory').value = '学习成长';
  document.getElementById('ruleXp').value = 5;
  document.getElementById('ruleDesc').value = '';
  document.getElementById('ruleResult').style.display = 'none';
  delete document.getElementById('ruleModal').dataset.cat;
  delete document.getElementById('ruleModal').dataset.idx;
  var m = document.getElementById('ruleModal');
  m.classList.add('active');
  m.style.display = 'flex';
}

// 关闭弹窗
function closeRuleModal() {
  var m = document.getElementById('ruleModal');
  m.classList.remove('active');
  m.style.display = 'none';
}

// 保存规则
function saveRule() {
  var modal = document.getElementById('ruleModal');
  var name = document.getElementById('ruleName').value.trim();
  var cat = document.getElementById('ruleCategory').value;
  var xp = parseInt(document.getElementById('ruleXp').value) || 0;
  var method = '按次';
  var desc = document.getElementById('ruleDesc').value.trim();
  var resultEl = document.getElementById('ruleResult');

  if (!name) { showToast('请填写任务名称', false); return; }
  if (xp <= 0) { showToast('分值必须大于 0', false); return; }

  var isEdit = modal.dataset.cat !== undefined;
  var oldCat = isEdit ? modal.dataset.cat : null;
  var idx = isEdit ? parseInt(modal.dataset.idx) : -1;

  resultEl.style.display = 'none';

  // 生成唯一 id 的辅助函数
  function genRuleId(idxBase) {
    return 'xpr_' + Date.now().toString(36) + (idxBase !== undefined ? '_' + idxBase : '') + Math.random().toString(36).slice(2, 6);
  }
  function ensureId(item, fallbackIdx) {
    var it = item || {};
    if (!it.id) it.id = genRuleId(fallbackIdx);
    if (!it.method) it.method = '按次';
    if (it.description === undefined) it.description = '';
    return it;
  }

  // 直接使用内存中的 _fullConfig（避免从 CDN 拉取到旧数据覆盖修改）
  // 如果 _fullConfig 尚未初始化，则先拉取一次
  var configPromise = _fullConfig
    ? Promise.resolve(_fullConfig)
    : fetchRawJSON('config.json', { cache: 'no-store' }).then(function(c) { _fullConfig = c; return c; });

  configPromise.then(function(config) {
    if (!config) { showToast('无法加载配置', false); return; }
    if (!config.xpRules) config.xpRules = {};
    if (!config.xpRules[cat]) config.xpRules[cat] = [];

    if (isEdit) {
      // 如果改了分类，需要从旧分类移除
      if (oldCat !== cat) {
        if (config.xpRules[oldCat]) {
          var removed = config.xpRules[oldCat].splice(idx, 1);
          var preserved = removed[0] || {};
          config.xpRules[cat].push({ id: preserved.id, name: name, category: cat, xp: xp, method: method, description: desc, _manual: preserved._manual });
        }
      } else {
        var prev = config.xpRules[cat][idx] || {};
        config.xpRules[cat][idx] = { id: prev.id, name: name, category: cat, xp: xp, method: method, description: desc, _manual: prev._manual };
      }
    } else {
      // settings 面板新增 → 标 _manual:true（进打卡弹窗"手动新增"分组）
      config.xpRules[cat].push({ id: genRuleId(config.xpRules[cat].length), name: name, category: cat, xp: xp, method: method, description: desc, _manual: true });
    }

    // 同步内存中的 _ruleData
    _ruleData = config.xpRules;

    // 同步 xpRuleList（每次重算；历史任务补 id，保留原有 _manual 标签）
    config.xpRuleList = [];
    var cats = ['学习成长', '能力成长', '身体成长', '兴趣爱好'];
    cats.forEach(function(c) {
      (config.xpRules[c] || []).forEach(function(item) {
        config.xpRuleList.push(ensureId(item));
      });
    });

    // 立即从内存渲染（不等网络，确保编辑结果即时可见）
    _renderRuleGridFromData();

    return DR.writeDataFile('config.json', config, isEdit ? '编辑任务: ' + name : '新增任务: ' + name);
  }).then(function() {
    showToast(isEdit ? '✅ 任务已更新' : '✅ 任务已添加');
    closeRuleModal();
    // 同步刷新首页/app 侧的数据缓存，让打卡弹窗与能量星球读到最新任务（含 _manual 标记）
    if (window.DataStore && window.DataStore.refreshData) {
      window.DataStore.refreshData().catch(function() {});
    }
  }).catch(function(err) {
    resultEl.style.display = '';
    resultEl.innerHTML = '❌ 保存失败: ' + (err.message || '未知错误');
    resultEl.style.background = 'var(--colourful-warning-50)';
    resultEl.style.color = 'var(--colourful-sunny-coral-600)';
  });
}

// 轻量确认弹窗（替换原生 confirm）
function showConfirm(title, message, onConfirm) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
  overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.15);">' +
    '<div style="font-size:16px;font-weight:600;margin-bottom:8px;color:#1a1a1a;">' + title + '</div>' +
    '<div style="font-size:14px;color:#666;margin-bottom:20px;line-height:1.5;">' + message + '</div>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
    '<button id="confirmCancel" style="padding:8px 16px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;color:#666;">取消</button>' +
    '<button id="confirmOk" style="padding:8px 16px;border:none;border-radius:6px;background:#ff4d4f;color:#fff;cursor:pointer;font-size:14px;font-weight:500;">确认删除</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
  document.getElementById('confirmCancel').onclick = function() { document.body.removeChild(overlay); };
  document.getElementById('confirmOk').onclick = function() { document.body.removeChild(overlay); onConfirm(); };
  overlay.onclick = function(e) { if (e.target === overlay) document.body.removeChild(overlay); };
}

// 删除规则
function deleteRule(cat, idx) {
  var item = _ruleData && _ruleData[cat] && _ruleData[cat][idx];
  if (!item) { showToast('数据异常', false); return; }
  var name = item.name;
  showConfirm('确认删除', '确定要删除任务「' + name + '」吗？删除后不可恢复。', function() {
    // 乐观更新：先从 DOM 移除，不等网络
    var el = document.querySelector('.rule-item[data-cat="' + cat + '"][data-idx="' + idx + '"]');
    if (el) {
      el.style.transition = 'opacity 0.2s, transform 0.2s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(function() { el.remove(); }, 200);
    }
    // 直接从内存 _ruleData 修改，不走网络重新拉取（避免 CDN 缓存拿到旧数据覆盖修改）
    if (!_ruleData[cat]) { showToast('数据异常', false); return; }
    _ruleData[cat].splice(idx, 1);
    if (_ruleData[cat].length === 0) delete _ruleData[cat];

    // 直接使用内存中的 _fullConfig 更新写入（不走网络，避免 CDN 返回旧数据）
    var config = _fullConfig || {};
    config.xpRules = _ruleData;
    config.xpRuleList = [];
    ['学习成长', '能力成长', '身体成长', '兴趣爱好'].forEach(function(c) {
      (_ruleData[c] || []).forEach(function(item) {
        config.xpRuleList.push(item);
      });
    });
    DR.writeDataFile('config.json', config, '删除任务: ' + name).then(function() {
      showToast('✅ 已删除');
      // 从内存重新渲染，确保界面与数据一致
      _renderRuleGridFromData();
      // 同步刷新首页/app 侧的数据缓存
      if (window.DataStore && window.DataStore.refreshData) {
        window.DataStore.refreshData().catch(function() {});
      }
    }).catch(function(err) {
      showToast('删除失败: ' + (err.message || '未知错误'), false);
      // 失败时从内存恢复渲染
      _renderRuleGridFromData();
    });
  });
}

// 渲染"默认记录 · 自动发放"网格（从 config.json 实时读取，与前台发放保持一致）
function renderDefGrid() {
  var grid = document.getElementById('defGrid');
  if (!grid) return;
  fetchRawJSON('config.json').then(function(config) {
    var rules = (config && config.xpRules) ? config.xpRules : {};
    // 从各分类中查找自动发放任务
    var defs = [];
    var findRule = function(name) {
      for (var cat in rules) {
        var found = (rules[cat] || []).find(function(t) { return t.name === name; });
        if (found) return found;
      }
      return null;
    };
    // 根据规则的真实分类动态取色，不再硬编码
    var clsForCat = function(cat) {
      var m = { '学习成长': 'ic-learn', '能力成长': 'ic-ability', '身体成长': 'ic-body', '兴趣爱好': 'ic-hobby' };
      return m[cat] || 'ic-learn';
    };
    var clsForRule = function(r) { return r && r.category ? clsForCat(r.category) : 'ic-learn'; };
    // 作业类（学习成长）
    var hwTypes = [
      { name: '作业·日常预习', icon: '📝', desc: '完成作业自动发放' },
      { name: '作业·日常复习', icon: '📚', desc: '完成作业自动发放' },
      { name: '作业·假期作业', icon: '🏖️', desc: '完成作业自动发放' },
      { name: '作业·特色作业', icon: '🎨', desc: '完成作业自动发放（含家庭作业）' },
    ];
    hwTypes.forEach(function(h) {
      var r = findRule(h.name);
      defs.push({ name: h.name, icon: h.icon, desc: h.desc, xp: r ? (Number(r.xp) || 0) : 0, cls: clsForRule(r) });
    });
    // 成绩录入（固定默认值，config 无对应任务）
    defs.push({ name: '成绩录入', icon: '🎯', desc: '录入成绩自动发放', xp: null, xpText: '+2~3', cls: 'ic-learn' });
    // 写日记（能力成长）
    var diary = findRule('写日记：写作四要素+感受');
    defs.push({ name: '写日记 · 能量记录', icon: '📓', desc: '写日记自动发放', xp: diary ? (Number(diary.xp) || 0) : 0, cls: clsForRule(diary) });
    // 财务能力分析（复盘）——以复盘为准，自动发放
    var fin = findRule('财务能力分析（复盘）') || findRule('财务能力分析');
    defs.push({ name: '财务能力分析（复盘）', icon: '🔄', desc: '每笔支出分析自动复盘 · 当日封顶 +10', xp: fin ? (Number(fin.xp) || 0) : 0, xpUnit: 'XP/笔', cls: clsForRule(fin) });

    var html = '';
    defs.forEach(function(d) {
      var xpHtml;
      if (d.xpText) {
        xpHtml = '<span class="ri-xp">' + d.xpText + '<small>XP</small></span>';
      } else if (d.xp > 0) {
        xpHtml = '<span class="ri-xp">+' + d.xp + '<small>' + (d.xpUnit || 'XP') + '</small></span>';
      } else {
        xpHtml = '<span class="ri-xp" style="color:var(--neutral-400)">-</span>';
      }
      html += '<div class="def-item"><span class="ri-ic ' + d.cls + '">' + d.icon + '</span><div class="ri-t"><b>' + d.name + '</b><span>' + d.desc + '</span></div>' + xpHtml + '</div>';
    });
    grid.innerHTML = html;
    var countEl = document.getElementById('defCount');
    if (countEl) countEl.textContent = defs.length + ' 条';
  }).catch(function() {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--colourful-sunny-coral-500);font-size:13px">⚠️ 加载失败</div>';
  });
}

/* ════════ 记录管理（统一数据关联层） ════════ */
var DR = (typeof window.DataRelations === 'object') ? window.DataRelations : null;
var _drType = 'xp';
var _drRecords = [];
var _drSel = null;

var DR_ICON = { xp: '⚡', finance: '💰', homework: '📝', exam: '🏆', evaluation: '🎖️', diary: '📓', commitment: '🤝', aiweekly: '📊' };
var DR_LABEL = { xp: '能量记录', finance: '财富记录', homework: '作业记录', exam: '成绩记录', evaluation: '期末评价', diary: '日记', commitment: '家庭会议承诺', aiweekly: 'AI周报' };

function initDr() {
  if (!DR) { showToast('数据关联层未加载', false); return; }
  var first = document.querySelector('#drTabs .dr-tab.active');
  var t = first ? first.getAttribute('data-dr') : 'finance';
  drTab(t);
}

// 刷新各记录类型条数（写进各 tab 的计数角标）· 直接复用已加载数据，避免二次请求
function refreshDrCounts() {
  if (!DR) return;
  try {
    var c = DR.getCounts();
    var total = 0;
    Object.keys(c).forEach(function(k) {
      total += c[k];
      var el = document.getElementById('drCount-' + k);
      if (el) el.textContent = c[k];
    });
    var tc = document.getElementById('drTotalCount');
    if (tc) tc.textContent = '· ' + total + ' 条';
  } catch (e) {}
}

// 切换 tab -> 加载该类型列表
function drTab(type) {
  if (!DR) { showToast('数据关联层未加载', false); return; }
  _drType = type;
  _drSel = null;
  // 激活当前 tab
  var tabs = document.querySelectorAll('#drTabs .dr-tab');
  tabs.forEach(function(b) { if (b.getAttribute('data-dr') === type) b.classList.add('active'); else b.classList.remove('active'); });
  document.getElementById('drRelBtn').style.display = 'none';
  document.getElementById('drRelBox').style.display = 'none';
  var hint = document.getElementById('drTpHint');
  if (hint) hint.textContent = '当前：' + (DR_LABEL[type] || type) + ' · 编辑/删除会自动重算关联的等级/余额/承诺等';
  DR.load().then(function() {
    _drRecords = DR.getRecords(type);
    renderDrList();
    refreshDrCounts();
  }).catch(function() { showToast('加载记录失败', false); });
}

// 打开某类型的记录列表（兼容旧引用）
function drOpenType(type) {
  drTab(type);
}

function esc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escTitle(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/\r?\n/g,' ');
}

function fmtVal(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? '是' : '否';
  return String(v);
}

// 选项对象统一取值/取标签：支持 ['待确认'] 或 [{v,l}] 两种写法
function optVal(o) { return (o && typeof o === 'object' && 'v' in o) ? o.v : o; }
function optLabel(o) {
  if (o && typeof o === 'object' && 'l' in o) return o.l;
  return fmtVal(o);
}

// 列表展示：select 栏位把存储值(可能是英文)映射为界面中文标签
function fieldDisp(f, val) {
  if (f && f.type === 'select' && f.options && f.options.length) {
    var need = String(val === undefined ? '' : val);
    for (var i = 0; i < f.options.length; i++) {
      var o = f.options[i];
      if (String(optVal(o)) === need || (val === true && String(optVal(o)) === 'true')) return optLabel(o);
    }
    // 存储值与选项值不一致（如已是中文）时直接显示
    return fmtVal(val);
  }
  return fmtVal(val);
}

// 表单下落值：可能来自多个字段名，取第一个非空
function pickVal(rec, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = rec[keys[i]];
    if (v !== undefined && v !== null && String(v) !== '') return v;
  }
  return '';
}

// 输入框自适应高度：文字越多框越高，匹配内容文字量
function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 4) + 'px';
}

// 任务关联下拉变化 → 自动回填分值/类别/任务名等派生字段
function drTaskRefChange(selIdx) {
  var sel = document.getElementById('drf_' + selIdx);
  if (!sel) return;
  var name = sel.value;
  var snap = (DR && DR.getSnapshot) ? DR.getSnapshot() : {};
  var src = snap['xpSources.json'] || [];
  var task = null;
  src.forEach(function(cat) {
    (cat.tasks || []).forEach(function(t) {
      if (t.name === name) task = Object.assign({ category: cat.type }, t);
    });
  });
  var rel = DR.RELATIONS[_drType];
  var derive = null;
  (rel.fields || []).forEach(function(f) { if (f.key === 'taskRef' && f.deriveTo) derive = f.deriveTo; });
  if (!derive || !task) return;
  Object.keys(derive).forEach(function(targetKey) {
    var tval;
    if (targetKey === 'title' || targetKey === 'taskName') tval = task.name;
    else if (targetKey === 'xp') tval = task.xp;
    else if (targetKey === 'taskCategory') tval = task.category;
    else tval = task[targetKey];
    var el = document.querySelector('#drListWrap [data-fk="' + targetKey + '"]');
    if (el) el.value = (tval === undefined || tval === null ? '' : tval);
  });
}

// 渲染列表
function renderDrList() {
  var wrap = document.getElementById('drListWrap');
  var empty = document.getElementById('drEmpty');
  if (!_drRecords || _drRecords.length === 0) {
    wrap.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  // AI周报：整块卡片展示全部内容，而非一行摘要
  if (_drType === 'aiweekly') { wrap.innerHTML = renderDrAiweekly(); return; }

  var rel = DR.RELATIONS[_drType];
  // 只用精简列（listFields），控制列数不再挤成一坨；找不到则退回全部字段
  var cols = [];
  var all = rel.fields || [];
  var lf = rel.listFields;
  if (lf && lf.length) {
    cols = lf.map(function(k) {
      for (var j = 0; j < all.length; j++) if (all[j].key === k) return all[j];
      return { key: k, name: k };
    });
  } else {
    cols = all;
  }
  // 表格 100% 宽、随浏览器自适应拉伸，去掉硬性 max-width 缩短
  var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:auto">';
  html += '<thead><tr>';
  cols.forEach(function(f) { html += '<th style="text-align:left;padding:8px 10px;background:var(--neutral-100);color:var(--neutral-500);border-bottom:2px solid var(--neutral-200);white-space:nowrap">' + esc(f.name) + '</th>'; });
  html += '<th style="padding:8px 10px;background:var(--neutral-100);width:96px"></th></tr></thead><tbody>';
  (_drRecords || []).forEach(function(r, idx) {
    html += '<tr style="border-bottom:1px solid var(--neutral-100)">';
    cols.forEach(function(f) {
      var val = pickVal(r, f.use || [f.key]);
      var disp = fieldDisp(f, val);
      var dispTxt = String(disp === undefined || disp === null ? '' : disp);
      // 保留完整内容，交给 CSS 省略，同时用 title 悬停显示全文（不再在 JS 端硬切 60 字符）
      html += '<td style="padding:8px 10px;color:var(--neutral-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0" title="' + escTitle(dispTxt) + '">' + esc(dispTxt) + '</td>';
    });
    html += '<td style="padding:8px 10px;white-space:nowrap;text-align:right">';
    html += '<button class="btn ghost mini" onclick="drEdit(' + idx + ')">编辑</button> ';
    html += '<button class="btn ghost mini" style="color:var(--colourful-error-500)" onclick="drDel(' + idx + ')">删除</button>';
    html += '</td></tr>';
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// AI周报完整展示：把一条周报的所有数据全部展开显示
function renderDrAiweekly() {
  var html = '<div style="display:flex;flex-direction:column;gap:12px">';
  (_drRecords || []).forEach(function(r, idx) {
    var stats = r.stats || {};
    var academic = r.academic || {};
    var behavior = r.behavior || {};
    var emotion = r.emotion || {};
    var sugg = r.suggestions || {};
    var growth = r.growth || {};
    var body = '';

    // 数据概览 → 药丸标签
    var statMap = [['energy','⚡ 能量','XP'],['study','📚 学习','项'],['finance','💰 花销','元'],['diary','📓 日记','篇']];
    var pillsHtml = '';
    statMap.forEach(function(kv) {
      var s = stats[kv[0]] || {};
      if (s.hasData === false) return;
      var trendArrow = s.trend === 'up' ? '↑' : (s.trend === 'down' ? '↓' : '→');
      var trendColor = s.trend === 'up' ? 'var(--colourful-mint-green-500)' : (s.trend === 'down' ? 'var(--colourful-sunny-coral-500)' : 'var(--neutral-400)');
      pillsHtml += '<span class="dr-wr-pill"><span class="pp-icon">' + kv[1] + '</span><span class="pp-val">' + fmtVal(s.value) + kv[2] + '</span><span class="pp-trend" style="color:' + trendColor + '">' + trendArrow + (s.diff > 0 ? '+' : '') + fmtVal(s.diff) + '</span></span>';
    });
    if (pillsHtml) body += '<div class="dr-wr-section"><div class="dr-wr-label">📊 本周数据</div><div class="dr-wr-pills">' + pillsHtml + '</div></div>';

    // 学习表现 → 科目标签 + 趋势芯片 + 薄弱提示
    if (academic.hasData || (academic.homework && academic.homework.subjects && academic.homework.subjects.length)) {
      var acHtml = '<div class="dr-wr-section"><div class="dr-wr-label">📚 学习表现</div>';
      var subs = (academic.homework && academic.homework.subjects) || [];
      if (subs.length) {
        acHtml += '<div class="dr-wr-subj-tags">' + subs.map(function(s) { return '<span class="dr-wr-subj-tag">' + esc(s) + '</span>'; }).join('') + '</div>';
      }
      var trendText = { up: '📈 上升', down: '📉 下降', stable: '➡️ 稳定', wave: '🔀 波动' };
      var trendColor = { up: 'var(--colourful-mint-green-500)', down: 'var(--colourful-sunny-coral-500)', stable: 'var(--neutral-400)', wave: '#c4a030' };
      (academic.trends || []).forEach(function(t) {
        var tt = typeof t === 'string' ? t : (t.subject + ' · ' + (trendText[t.trend] || t.trend) + ' · ' + (t.lastGrade || ''));
        acHtml += '<span class="dr-wr-trend-chip">' + esc(tt) + '</span>';
      });
      (academic.weakModules || []).forEach(function(w) {
        acHtml += '<div class="dr-wr-weak">⚠ 薄弱：' + esc(w) + '</div>';
      });
      acHtml += '</div>';
      body += acHtml;
    }
    if (academic.hasData === false && academic.emptyHint) body += '<div class="dr-wr-empty">' + esc(academic.emptyHint) + '</div>';

    // 行为表现 → 迷你能量条
    var profile = behavior.profile || [];
    if (profile.length) {
      var maxXp = 1;
      profile.forEach(function(p) { if (p.xp > maxXp) maxXp = p.xp; });
      var palette = ['#7bb8f7','#f28daf','#b88af5','#7cd4b0','#fba07a','#fee680'];
      var bhHtml = '<div class="dr-wr-section"><div class="dr-wr-label">🌟 行为表现</div><div class="dr-wr-bars">';
      profile.forEach(function(p, i) {
        var w = Math.max(12, Math.round((p.xp / maxXp) * 100));
        var c = palette[i % palette.length];
        bhHtml += '<div class="dr-wr-bar-row"><span class="dr-wr-bar-name">' + esc(p.category) + '</span><span class="dr-wr-bar-track"><span class="dr-wr-bar-fill" style="width:' + w + '%;background:' + c + '"></span></span><span class="dr-wr-bar-meta">' + fmtVal(p.count) + '次 +' + fmtVal(p.xp) + 'XP</span></div>';
      });
      bhHtml += '</div>';
      (behavior.effortStories || []).forEach(function(e) {
        var storyText = typeof e === 'string' ? e : (e.story || e.description || '');
        var storyDate = typeof e === 'object' ? (e.date || '') : '';
        if (storyText) bhHtml += '<div class="dr-wr-diary-quote"><div class="dr-wr-diary-text">' + esc(storyText) + '</div>' + (storyDate ? '<div class="dr-wr-diary-date">' + esc(storyDate) + '</div>' : '') + '</div>';
      });
      if (behavior.badge && behavior.badge.earned) bhHtml += '<div style="margin-top:4px"><span class="dr-wr-badge">🎖 ' + esc(behavior.badge.name || '达成徽章') + ' · 连续' + fmtVal(behavior.badge.days) + '天</span></div>';
      bhHtml += '</div>';
      body += bhHtml;
    }

    // 情绪 / 日记 → 心情芯片 + 日记引用块
    var md = emotion.moodDistribution || {};
    var moodKeys = Object.keys(md);
    if (moodKeys.length) {
      var emHtml = '<div class="dr-wr-section"><div class="dr-wr-label">😊 情绪与日记</div>';
      var moodEmojis = { '开心':'😊','难过':'😢','生气':'😡','兴奋':'😄','平静':'😌','惊喜':'🤩' };
      emHtml += '<div class="dr-wr-mood-chips">';
      moodKeys.forEach(function(k) {
        var emoji = moodEmojis[k] || '😐';
        emHtml += '<span class="dr-wr-mood-chip">' + emoji + ' ' + esc(k) + ' ×' + md[k] + '</span>';
      });
      emHtml += '</div>';
      if (emotion.diaryCount !== undefined) emHtml += '<div class="dr-wr-empty">本周日记 ' + fmtVal(emotion.diaryCount) + ' 篇</div>';
      if (emotion.bestDiary) {
        emHtml += '<div class="dr-wr-diary-quote"><div class="dr-wr-diary-text">' + esc(emotion.bestDiary.snippet || '') + '</div>';
        if (emotion.bestDiary.date) emHtml += '<div class="dr-wr-diary-date">· ' + esc(emotion.bestDiary.date) + ' · 写作要素 ' + fmtVal(emotion.bestDiary.elements) + '/4</div>';
        emHtml += '</div>';
      }
      if (emotion.financeStatus) {
        var finMap = { good: '🟢 理性消费', watch: '🟡 需要关注', alert: '🔴 冲动消费' };
        var finColor = { good: 'var(--colourful-mint-green-500)', watch: '#c4a030', alert: 'var(--colourful-sunny-coral-500)' };
        var finBg = { good: 'rgba(54,185,139,.06)', watch: 'rgba(253,216,50,.06)', alert: 'rgba(249,96,36,.06)' };
        emHtml += '<div style="margin-top:4px"><span class="dr-wr-fin-chip" style="background:' + (finBg[emotion.financeStatus]||finBg.good) + ';color:' + (finColor[emotion.financeStatus]||finColor.good) + '">' + (finMap[emotion.financeStatus]||'🟢 理性消费') + ' · 值得率 ' + fmtVal(emotion.financeWorthIt) + '%</span></div>';
      }
      emHtml += '</div>';
      body += emHtml;
    }

    // 建议 → 彩色标签卡
    if (sugg.keep || sugg.improve || sugg.challenge) {
      var sgHtml = '<div class="dr-wr-section"><div class="dr-wr-label">💡 成长建议</div><div class="dr-wr-sugg">';
      if (sugg.keep) sgHtml += '<div class="dr-wr-sugg-item keep"><span class="si-label">继续保持：</span>' + esc(sugg.keep) + '</div>';
      if (sugg.improve) sgHtml += '<div class="dr-wr-sugg-item improve"><span class="si-label">可以改进：</span>' + esc(sugg.improve) + '</div>';
      if (sugg.challenge) sgHtml += '<div class="dr-wr-sugg-item challenge"><span class="si-label">趣味挑战：</span>' + esc(sugg.challenge) + '</div>';
      sgHtml += '</div></div>';
      body += sgHtml;
    }

    // 成长画像 → 小徽章
    var hi = (growth.profileUpdate && growth.profileUpdate.highlights) || [];
    if (hi.length) {
      var hiIcons = { '说到':'🤝','日记':'✏️','财务':'💰','习惯':'🎯','能力':'💪','学习':'📚' };
      var hiHtml = '<div class="dr-wr-section"><div class="dr-wr-label">🌱 成长档案更新</div><div class="dr-wr-highlights">';
      hi.forEach(function(h) {
        var icon = '⭐';
        for (var key in hiIcons) { if (h.indexOf(key) >= 0) { icon = hiIcons[key]; break; } }
        hiHtml += '<span class="dr-wr-highlight">' + icon + ' ' + esc(h) + '</span>';
      });
      hiHtml += '</div></div>';
      body += hiHtml;
    }

    html += '<div class="dr-wr-card">'
      + '<div class="dr-wr-head">'
      + '<span class="dr-wr-title">第 ' + fmtVal(r.weekNumber) + ' 周 · ' + fmtVal(r.date) + '</span>'
      + '<span class="dr-wr-actions">'
      + '<button class="btn ghost mini" onclick="drEdit(' + idx + ')">编辑</button> '
      + '<button class="btn ghost mini" style="color:var(--colourful-error-500)" onclick="drDel(' + idx + ')">删除</button>'
      + '</span></div>'
      + (r.summary ? '<div class="dr-wr-summary">' + esc(r.summary) + '</div>' : '')
      + (body || '<div class="dr-wr-empty">暂无详细数据。</div>')
      + '</div>';
  });
  html += '</div>';
  return html;
}

// 关联说明
function drShowRelations() {
  if (!_drSel || !DR) return;
  var rels = DR.getRelations(_drType, _drSel);
  var box = document.getElementById('drRelBox');
  if (!rels.length) {
    box.innerHTML = '<b>🔗 ' + (DR_LABEL[_drType] || '该记录') + '</b><br>该记录暂未建立明确关联（仅独立数据）。';
  } else {
    var html = '<b>🔗 ' + (DR_LABEL[_drType] || '该记录') + ' · 关联数据</b>';
    rels.forEach(function(r) {
      html += '<div style="display:flex;gap:8px;margin-top:4px"><span style="flex-shrink:0;font-weight:600">' + esc(r.kind) + '</span><span style="flex:1;color:var(--neutral-500)">' + esc(r.desc) + '</span><span style="flex-shrink:0;font-size:11px;color:var(--colourful-info-600)">→ ' + esc(r.target) + '</span></div>';
    });
    html += '<div style="margin-top:8px;font-size:11px;color:var(--neutral-400)">编辑/删除该记录时，右侧列出的关联数据会通过统一关联层自动同步更新。</div>';
    box.innerHTML = html;
  }
  box.style.display = '';
}

function drOpenDetail(idx) {
  _drSel = _drRecords[idx];
  document.getElementById('drRelBtn').style.display = '';
  drShowRelations();
}

function drEdit(idx) {
  drOpenDetail(idx);
  var r = _drRecords[idx];
  buildDrForm(r);
}

function drAdd() {
  _drSel = null;
  document.getElementById('drRelBtn').style.display = 'none';
  document.getElementById('drRelBox').style.display = 'none';
  buildDrForm({});
}

// 构建编辑/新增表单
function buildDrForm(rec) {
  var rel = DR.RELATIONS[_drType];
  var cols = rel && rel.fields || [];
  var wrap = document.getElementById('drListWrap');
  var html = '<div style="padding:12px">';
  html += '<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">';
  cols.forEach(function(f, i) {
    var val = pickVal(rec, f.use || [f.key]);
    var id = 'drf_' + i;
    var labelHtml = '<label style="font-size:11px;font-weight:700;color:var(--neutral-500);display:block;margin-bottom:4px">' + esc(f.name) + '</label>';

    // 任务关联：直接选取模块里的任务，选中后自动带出分值/类别/任务名
    if (f.type === 'taskRef') {
      var snap = (DR && DR.getSnapshot) ? DR.getSnapshot() : {};
      var src = snap['xpSources.json'] || [];
      var opts2 = '<option value=""></option>';
       var selTaskName = String(pickVal(rec, ['taskRef', 'title', 'taskName']) || '');
      src.forEach(function(cat) {
        var tasks = cat.tasks || [];
        if (!tasks.length) return;
        opts2 += '<optgroup label="' + esc(cat.type) + '">';
        tasks.forEach(function(t) {
          var sel2 = (String(t.name) === selTaskName) ? ' selected' : '';
          opts2 += '<option value="' + esc(t.name) + '"' + sel2 + '>' + esc(t.name) + '（+' + fmtVal(t.xp) + 'XP）</option>';
        });
        opts2 += '</optgroup>';
      });
      html += '<div style="grid-column:1 / -1">' + labelHtml
        + '<select id="' + id + '" data-fk="' + esc(f.key) + '" onchange="drTaskRefChange(' + i + ')" style="width:100%;padding:8px 10px;border:1px solid var(--neutral-200);border-radius:8px;font-size:13px;background:#fff;outline:none">' + opts2 + '</select>'
        + '<div style="font-size:10px;color:var(--neutral-400);margin-top:3px">从任务清单选一条，分值、类别、任务名会自动带出，无需手动填写</div>'
        + '</div>';
      return;
    }

    html += '<div>';
    html += labelHtml;
    if (f.type === 'select') {
      var opts = (f.options || []).map(function(o) {
        var oVal = optVal(o);
        var need = String(val);
        var selected = String(oVal) === need || (val === true && String(oVal) === 'true') ? ' selected' : '';
        return '<option value="' + (typeof oVal === 'boolean' ? oVal : esc(oVal)) + '"' + selected + '>' + esc(optLabel(o)) + '</option>';
      }).join('');
      html += '<select id="' + id + '" data-fk="' + esc(f.key) + '" style="width:100%;padding:8px 10px;border:1px solid var(--neutral-200);border-radius:8px;font-size:13px;background:#fff;outline:none">' + opts + '</select>';
    } else if (f.type === 'textarea') {
      html += '<textarea id="' + id + '" data-fk="' + esc(f.key) + '" oninput="autoGrow(this)" style="width:100%;padding:8px 10px;border:1px solid var(--neutral-200);border-radius:8px;font-size:13px;outline:none;min-height:44px;resize:none;overflow:hidden;line-height:1.6">' + esc(val) + '</textarea>';
    } else if (f.type === 'date') {
      html += '<input type="date" id="' + id + '" data-fk="' + esc(f.key) + '" value="' + esc(val) + '" style="width:100%;padding:8px 10px;border:1px solid var(--neutral-200);border-radius:8px;font-size:13px;outline:none;background:#fff">';
    } else if (f.type === 'number') {
      html += '<input type="number" id="' + id + '" data-fk="' + esc(f.key) + '" value="' + (val === '' ? '' : esc(val)) + '" style="width:100%;padding:8px 10px;border:1px solid var(--neutral-200);border-radius:8px;font-size:13px;outline:none;background:#fff">';
    } else {
      html += '<input type="text" id="' + id + '" data-fk="' + esc(f.key) + '" value="' + esc(val) + '" style="width:100%;padding:8px 10px;border:1px solid var(--neutral-200);border-radius:8px;font-size:13px;outline:none;background:#fff">';
    }
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">';
  html += '<button class="btn ghost mini" onclick="drCancelForm()">取消</button>';
  html += '<button class="btn primary mini" onclick="drSave()">保存</button>';
  html += '</div></div>';
  wrap.innerHTML = html;
  // 渲染后统一把文本框高度调整到与内容一致
  runAutoGrowAll();
}

function runAutoGrowAll() {
  var tas = document.querySelectorAll('#drListWrap textarea');
  for (var i = 0; i < tas.length; i++) autoGrow(tas[i]);
}

function drCancelForm() { renderDrList(); }

// 收集表单 -> 记录对象
function collectDrForm() {
  var rel = DR.RELATIONS[_drType];
  var cols = rel && rel.fields || [];
  var rec = {};
  cols.forEach(function(f, i) {
    var el = document.getElementById('drf_' + i);
    if (!el) return;
    var key = f.key;
    var v;
    if (f.type === 'number') {
      v = el.value === '' ? 0 : Number(el.value);
    } else if (f.type === 'select') {
      // 选项是布尔（完成/未完成）时以字符串 'true'/'false' 语义还原
      var firstOpt = (f.options && f.options[0]) ? optVal(f.options[0]) : null;
      if (typeof firstOpt === 'boolean') v = (el.value === 'true');
      else v = el.value;
      // 若是带 label 的对象选项，保存的是界面原本的存储值(v)，确保数据库口径不变
      if (f.options) {
        for (var oi = 0; oi < f.options.length; oi++) {
          if (String(optVal(f.options[oi])) === String(v)) { v = optVal(f.options[oi]); break; }
        }
      }
    } else {
      v = el.value;
    }
    // use 映射：该表单字段可能对应记录的多个候选键名（不同记录写法不同）。
    // 保存时应回写到"原记录实际存在的那个键"，并清掉其余候选键，避免字段错位/堆积。
    var writeKeys;
    if (f.use && f.use.length) writeKeys = f.use;
    else writeKeys = [f.key];
    // 若是编辑且原记录已有某个候选键，就优先回写到那个键；否则写主键
    var targetKey = f.key;
    if (_drSel) {
      for (var ui = 0; ui < writeKeys.length; ui++) {
        if (writeKeys[ui] in _drSel) { targetKey = writeKeys[ui]; break; }
      }
    }
    // 移除候选键中的其余键，只保留一个，避免同时出现与原值冲突
    writeKeys.forEach(function(wk) { if (wk !== targetKey) delete rec[wk]; });
    rec[targetKey] = v;
  });
  // 保留原 id
  if (_drSel && _drSel.id) rec.id = _drSel.id;
  return rec;
}

// 保存（新增=create / 修改=update），通过关联层级联更新
function drSave() {
  var rec = collectDrForm();
  if (!DR) { showToast('关联层未加载', false); return; }
  var isNew = !_drSel || !_drSel.id;
  var btn = null;
  DR.apply(_drType, isNew ? 'create' : 'update', rec).then(function(res) {
    if (res && res.ok) {
      showToast(isNew ? '✅ 已新增记录，关联数据已同步' : '✅ 已修改记录，关联数据已同步');
      _drSel = null;
      // 保留当前类型列表并刷新
      return DR.load().then(function() {
        _drRecords = DR.getRecords(_drType);
        renderDrList();
        refreshDrCounts();
      });
    }
    if (res && res.error) { showToast('保存失败: ' + res.error, false); return null; }
    showToast('保存完成', false); return null;
  }).catch(function(e) {
    showToast('保存失败: ' + (e && e.message || '未知错误'), false);
  });
}

// 删除记录，通过关联层级联更新
function drDel(idx) {
  var r = _drRecords[idx];
  if (!r || !r.id) { showToast('无法删除（缺少ID）', false); return; }
  var desc = r.taskName || r.title || r.text || r.description || r.date || '';
  if (!confirm('确定删除这条 ' + (DR_LABEL[_drType] || '') + '：\n' + (fmtVal(desc).slice(0, 40) || '(无标题)') + '\n\n关联的等级/余额/承诺等数据会一并重算。')) return;
  DR.apply(_drType, 'remove', r).then(function(res) {
    showToast('✅ 已删除，关联数据已同步重算');
    return DR.load().then(function() {
      _drRecords = DR.getRecords(_drType);
      renderDrList();
      refreshDrCounts();
    });
  }).catch(function(e) {
    showToast('删除失败: ' + (e && e.message || '未知错误'), false);
  });
}

/* 初始化移到 renderSettingsView */

