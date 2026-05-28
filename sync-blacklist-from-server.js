/**
 * 从微博服务器拉取全量黑名单 UID，覆盖写入扩展本地 storage（weiboLajieUids）。
 *
 * 【用法 — 方案 A，不修改扩展代码】
 * 1. 在 Edge/Chrome 打开 edge://extensions 或 chrome://extensions
 * 2. 找到「微博列表拉黑」→ Service Worker →「检查」/ Inspect
 * 3. 在 Service Worker 的 Console 中：先打开本文件，复制下面 IIFE 整段粘贴执行
 *    （或：在 Console 里用 fetch 加载本文件路径不可行，必须复制脚本体执行）
 * 4. 保持已登录 weibo.com；约 10～30 秒（5010 条约 26 页 × 300ms）
 *
 * 【注意】
 * - 须已登录；请求走扩展 SW，带 weibo.com Cookie
 * - 用服务器名单覆盖本地，不与本地合并
 * - 黑名单已满（如 total≥5000）时仍可对齐已有名单，但无法新增拉黑
 * - 若遇 418，把末尾 sleep 改为 500～800ms 后重跑
 *
 * 执行完成后可在 SW Console 验证：
 *   chrome.storage.local.get('weiboLajieUids', r => console.log((r.weiboLajieUids||[]).length));
 */

/* eslint-disable no-console */
(async () => {
  const STORAGE_KEY = 'weiboLajieUids';
  const count = 200;
  const delayMs = 300;
  const all = [];
  let page = 1;
  let total = 0;

  while (true) {
    const r = await fetch(
      `https://www.weibo.com/ajax/setting/getFilteredUsers?page=${page}&count=${count}`,
      { credentials: 'include' },
    );
    if (!r.ok) {
      console.error('[sync-blacklist] HTTP', r.status, 'page', page);
      break;
    }
    let j;
    try {
      j = await r.json();
    } catch (e) {
      console.error('[sync-blacklist] JSON 解析失败 page', page, e);
      break;
    }
    if (page === 1) {
      total = Number(j.total) || 0;
      console.log('[sync-blacklist] 服务器 total =', total);
    }
    const group = j.card_group || [];
    for (const c of group) {
      const m = String(c.scheme || '').match(/uid=(\d+)/);
      if (m) all.push(m[1]);
    }
    console.log(`[sync-blacklist] page ${page}, 累计 ${all.length}`);
    if (!group.length || (total > 0 && all.length >= total)) {
      break;
    }
    page++;
    await new Promise((res) => setTimeout(res, delayMs));
  }

  const uniq = [...new Set(all)];
  await chrome.storage.local.set({ [STORAGE_KEY]: uniq });
  console.log('[sync-blacklist] 已写入本地', STORAGE_KEY, '条数 =', uniq.length);
})();
