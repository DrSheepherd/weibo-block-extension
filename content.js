(function () {
  'use strict';

  const STORAGE_KEY = 'weiboLajieUids';
  const WRAP_CLASS = 'weibo-lajie-wrap';
  /** 日期行前的灰标：整卡隐藏，不进入列表展示 */
  const PROMO_TAG_WORDS = ['推荐', '荐读', '广告'];
  const DATA_PROMO_BLOCKED = 'data-weibo-lajie-promo-blocked';
  const SEL_PROMO_BLOCKED = '[' + DATA_PROMO_BLOCKED + '="1"]';
  /** 相对卡片顶部的最大竖直距离，避免误伤正文里偶然只有两字的块 */
  const PROMO_MAX_TOP_OFFSET = 200;
  /** 灰标「广告」为图片时，prd 下该资源，见 d.sinaimg.cn/prd/1005/891/.../icon_auth_white.png */
  function isWeiboAdLabelImageSrc(s) {
    if (!s) {
      return false;
    }
    const u = String(s).toLowerCase();
    if (u.indexOf('d.sinaimg.cn/prd/1005/891/') >= 0) {
      return true;
    }
    if (u.indexOf('d.sinaimg.cn/prd/') >= 0 && u.indexOf('icon_auth_white') >= 0) {
      return true;
    }
    return false;
  }

  function normalizePath() {
    let p = window.location.pathname || '/';
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  function isWwwApexWeibo() {
    const h = (location.hostname || '').toLowerCase();
    return h === 'weibo.com' || h === 'www.weibo.com';
  }

  /**
   * s 站：综合搜索 / 用户搜索 / 实时 / 热门 / 视频等流式结果页（与主站流共用注入；拉黑走 SW+DNR）
   */
  function isWeiboSearchResultPage() {
    if (location.hostname !== 's.weibo.com') {
      return false;
    }
    const p = normalizePath();
    if (p === '/user' || /^\/user\//i.test(p)) {
      return true;
    }
    if (p === '/weibo' || /^\/weibo\//i.test(p)) {
      return true;
    }
    if (p === '/realtime' || /^\/realtime\//i.test(p)) {
      return true;
    }
    if (p === '/hot' || /^\/hot\//i.test(p)) {
      return true;
    }
    if (p === '/video' || /^\/video\//i.test(p)) {
      return true;
    }
    return false;
  }

  function isTargetPage() {
    if (isWeiboSearchResultPage()) {
      return true;
    }
    if (!isWwwApexWeibo()) {
      return false;
    }
    const p = normalizePath();
    /** 分组详情流 mygroups?gid= 不注入（与列表页 /mygroups 区分） */
    if (p === '/mygroups') {
      try {
        if (new URLSearchParams(window.location.search || '').has('gid')) {
          return false;
        }
      } catch (e) {
        /* ignore */
      }
    }
    if (p === '/' || p === '/mygroups') {
      return true;
    }
    /** 热门 tab：含 /hot、/hot/weibo/… 等（新版 SPA 路径多样） */
    if (/^\/hot(\/|$)/i.test(p)) {
      return true;
    }
    return false;
  }

  /**
   * 灰标隐藏：范围大于「拉黑按钮」页。超话 /p/…、个人 /u/… 等也有 vue-recycle-scroller + wbpro-tag，
   * 原 isTargetPage 不含这些路径会导致 hidePromoFeedItems 整段不执行。
   */
  function shouldRunPromoWbproHide() {
    if (isWeiboSearchResultPage()) {
      return true;
    }
    if (!isWwwApexWeibo()) {
      return false;
    }
    const p = normalizePath();
    if (p.indexOf('/setting') === 0 || /^\/(login|signup)\b/i.test(p)) {
      return false;
    }
    /** 分组详情 /mygroups?gid= 不注入拉黑按钮，但流里同样有 wbpro 荐读卡，需跑灰标隐藏 */
    if (p === '/mygroups') {
      try {
        if (new URLSearchParams(window.location.search || '').has('gid')) {
          return true;
        }
      } catch (e) {
        /* ignore */
      }
    }
    if (isTargetPage()) {
      return true;
    }
    if (/^\/p\/\d/i.test(p) || /^\/u\/\d/i.test(p) || /^\/n\//i.test(p)) {
      return true;
    }
    if (/^\/\d{6,}(?:\/|$|[?#])/i.test(p)) {
      return true;
    }
    return false;
  }

  function extractUid(href) {
    if (!href) {
      return null;
    }
    const s0 = String(href).trim();
    if (s0.indexOf('javascript:') === 0) {
      return null;
    }
    if (
      s0.indexOf('huati.weibo.com') >= 0 ||
      s0.indexOf('c.weibo.com') >= 0 ||
      s0.indexOf('pay.biz.weibo.com') >= 0 ||
      s0.indexOf('service.account') >= 0
    ) {
      return null;
    }
    try {
      const u = new URL(s0, 'https://weibo.com');
      const host = (u.hostname || '').toLowerCase();
      if (host && !/^(www|m|s)\.weibo\.com$|^weibo\.com$/i.test(host)) {
        return null;
      }
      const p = u.pathname || '';
      const mU = p.match(/\/u\/(\d{3,})/);
      if (mU) {
        return mU[1];
      }
      const m1 = p.match(/^\/(\d{3,})$/);
      if (m1) {
        return m1[1];
      }
      const m2 = p.match(/^\/(\d{3,})\/([0-9A-Za-z_]+)\/?/);
      if (m2) {
        return m2[1];
      }
    } catch (e) {
      /* fall through */
    }
    if (s0.match(/\/u\/(\d{3,})/)) {
      return s0.match(/\/u\/(\d{3,})/)[1];
    }
    if (s0.match(/weibo\.com\/(\d{3,})[/?#]/) || s0.match(/weibo\.com\/(\d{3,})$/)) {
      const m = s0.match(/weibo\.com\/(\d{3,})/);
      if (m) {
        return m[1];
      }
    }
    if (s0.match(/weibo\.com\/(\d{3,})\//)) {
      return s0.match(/weibo\.com\/(\d{3,})\//)[1];
    }
    return null;
  }

  function queryWeiboUserLinksIn(item) {
    if (!item || !item.querySelectorAll) {
      return [];
    }
    return Array.prototype.filter.call(item.querySelectorAll('a[href]'), (a) => {
      return !!extractUid(a.getAttribute('href') || a.href);
    });
  }

  /** 新版信息流卡片（woo-panel / wbpro 灰标），用于放宽「页脚」类祖先误判 */
  function isWeiboFeedArticle(article) {
    if (!article || article.tagName !== 'ARTICLE') {
      return false;
    }
    const cn = String(article.className || '');
    if (cn.indexOf('woo-panel') >= 0) {
      return true;
    }
    if (article.querySelector('.wbpro-feed-content, .wbpro-tag')) {
      return true;
    }
    return false;
  }

  function getFeedItem(el) {
    if (!el || !el.closest) return null;
    return (
      el.closest('div.card-feed') ||
      el.closest('div.card') ||
      el.closest('div[action-type="feed"]') ||
      el.closest('article') ||
      el.closest('div[action-type="feed_list_item"]') ||
      el.closest('[mid]') ||
      el.closest('div[module-type="status"]') ||
      el.closest('section[role]') ||
      el.closest('div[role="listitem"]') ||
      el.closest('[class*="List_item"]') ||
      el.closest('[class*="-item-"]') ||
      el.closest('[id*="v6_"] [class*="-con"]') ||
      null
    );
  }

  function inPrimaryFeedContext(a) {
    const feedArticle = a.closest && a.closest('article');
    const inFeedArticle = feedArticle && isWeiboFeedArticle(feedArticle);
    const inMainColumn =
      a.closest(
        'main, [role="main"], #plc_main, #plc_frame, [class*="listContent"], ' +
          '[class*="List-content"], [class*="Frame_content"], [id*="pl_content"], #app, ' +
          '#v6_pl_content, [id*="_v6_"], [id*="_v6_pl_"], [id*="_pl_"], ' +
          'div.card, .card-feed, .m-wrap, [class*="wbpro-scroller"]',
      ) || (!a.closest('aside, [class*="sideBar"], [class*="side-bar"], nav[aria-label]'));
    if (a.closest('aside, [class*="sideBar"], [class*="side-bar"]') && !inMainColumn) {
      return false;
    }
    /**
     * 仅排除「整段在页脚/页脚类布局层内」的节点；信息流 article 内自带 <footer> 互动条，
     * 且外层常有 class 含 footer 的布局容器，否则会整流不注入、荐读也不隐藏。
     */
    if (!inFeedArticle && a.closest('footer, [class*="footer"]')) {
      return false;
    }
    return true;
  }

  /**
   * 同一条内第一个带 /u/ 的 a 常是「头像」；带昵称文字的才是发帖人，按钮应接在昵称链右侧
   */
  function isLikelyAvatarOnlyUserLink(a) {
    if (!a || !a.querySelector || !a.querySelector('img')) {
      return false;
    }
    const text = a.textContent.replace(/[\s\u00a0…·.]/g, '');
    return text.length === 0;
  }

  /** 超话：一般 href 里含 100808 等池，或 /p/1008… 超话页，或文中有「超话」的 /p/ 链 */
  function isWeiboSuperTopicLink(a) {
    if (!a || a.tagName !== 'A') {
      return false;
    }
    const h = (a.getAttribute('href') || a.href || '').toLowerCase();
    if (h.indexOf('100808') !== -1) {
      return true;
    }
    if (h.indexOf('/p/1008') !== -1) {
      return true;
    }
    if (/\/p\//.test(h) && (a.textContent || '').indexOf('超话') !== -1) {
      return true;
    }
    return false;
  }

  /** 从超话 a 同层往前找，定位紧邻其前的「昵称」用户链（/u/uid 或 weibo.com/uid）（不抢头像、不误选更早的链） */
  function findUlinkInRowBeforeSuperTopic(st) {
    let s = st.previousElementSibling;
    for (let i = 0; i < 10 && s; i++) {
      if (s.nodeType === 1) {
        if (s.tagName === 'A') {
          const h = s.getAttribute('href') || '';
          if (extractUid(h)) {
            if (isLikelyAvatarOnlyUserLink(s)) {
              s = s.previousElementSibling;
              continue;
            }
            return s;
          }
        }
        const inners = queryWeiboUserLinksIn(s);
        if (inners && inners.length) {
          for (let j = inners.length - 1; j >= 0; j--) {
            const u = inners[j];
            if (isLikelyAvatarOnlyUserLink(u)) {
              continue;
            }
            if (extractUid(u.getAttribute('href') || u.href)) {
              return u;
            }
          }
        }
      }
      s = s.previousElementSibling;
    }
    const p = st.parentElement;
    if (p) {
      const ch = p.children;
      const idx = Array.prototype.indexOf.call(ch, st);
      for (let k = idx - 1; k >= 0; k--) {
        const n = ch[k];
        if (n.nodeType !== 1) {
          continue;
        }
        if (n.tagName === 'A') {
          const h = n.getAttribute('href') || '';
          if (extractUid(h) && !isLikelyAvatarOnlyUserLink(n)) {
            return n;
          }
        }
        const inners2 = queryWeiboUserLinksIn(n);
        if (inners2 && inners2.length) {
          for (let j = inners2.length - 1; j >= 0; j--) {
            const u = inners2[j];
            if (isLikelyAvatarOnlyUserLink(u)) {
              continue;
            }
            if (extractUid(u.getAttribute('href') || u.href)) {
              return u;
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * 在整条微博内，在首个超话链接之前、文档树中排最后的用户链（即离超话最近的发帖人昵称）
   */
  function findLastUlinkBeforeInTreeOrder(item, st) {
    const ulinks = queryWeiboUserLinksIn(item);
    let best = null;
    for (const u of ulinks) {
      if (isLikelyAvatarOnlyUserLink(u)) {
        continue;
      }
      if (!extractUid(u.getAttribute('href') || u.href)) {
        continue;
      }
      if (!inPrimaryFeedContext(u)) {
        continue;
      }
      if ((u.compareDocumentPosition(st) & Node.DOCUMENT_POSITION_FOLLOWING) === Node.DOCUMENT_POSITION_FOLLOWING) {
        best = u;
      }
    }
    return best;
  }

  function findFirstSuperTopicInItem(item) {
    if (!item) {
      return null;
    }
    for (const a of item.querySelectorAll('a[href]')) {
      if (isWeiboSuperTopicLink(a) && inPrimaryFeedContext(a)) {
        return a;
      }
    }
    return null;
  }

  function findAuthorNameUserLinkInFeedItem(item) {
    if (!item) {
      return null;
    }
    const st = findFirstSuperTopicInItem(item);
    if (st) {
      const fromRow = findUlinkInRowBeforeSuperTopic(st);
      if (fromRow) {
        return fromRow;
      }
      const fromOrder = findLastUlinkBeforeInTreeOrder(item, st);
      if (fromOrder) {
        return fromOrder;
      }
    }
    const list = queryWeiboUserLinksIn(item);
    for (const a of list) {
      if (!extractUid(a.getAttribute('href') || a.href)) {
        continue;
      }
      if (isLikelyAvatarOnlyUserLink(a)) {
        continue;
      }
      return a;
    }
    for (const a of list) {
      if (extractUid(a.getAttribute('href') || a.href)) {
        return a;
      }
    }
    return null;
  }

  let cachedSet = new Set();
  let storageReady = false;
  const storageWaiters = [];

  function onStorageReady(cb) {
    if (storageReady) cb();
    else storageWaiters.push(cb);
  }

  function flushWaiters() {
    storageWaiters.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        /* ignore */
      }
    });
    storageWaiters.length = 0;
  }

  function initStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      storageReady = true;
      flushWaiters();
      return;
    }
    chrome.storage.local.get([STORAGE_KEY], (r) => {
      const list = r && r[STORAGE_KEY];
      const arr = Array.isArray(list) ? list : [];
      cachedSet = new Set(arr.map(String));
      storageReady = true;
      flushWaiters();
    });
  }

  function persistIdSet() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const arr = Array.from(cachedSet);
    chrome.storage.local.set({ [STORAGE_KEY]: arr });
  }

  function isBlocked(uid) {
    return cachedSet && cachedSet.has(String(uid));
  }

  function isWeiboOk(data) {
    if (!data || typeof data !== 'object') return false;
    const c = data.code;
    return c == 100000 || c === '100000' || c === 100000;
  }

  function sendToBackground(msg) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error('no extension runtime'));
        return;
      }
      chrome.runtime.sendMessage(msg, (res) => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (res && res.error) {
          reject(new Error(res.error));
          return;
        }
        resolve(res && res.data);
      });
    });
  }

  function apiBlockUser(uid) {
    return sendToBackground({ type: 'weiboLajieBlock', uid: String(uid) });
  }

  function apiUnblockUser(uid) {
    return sendToBackground({ type: 'weiboLajieUnblock', uid: String(uid) });
  }

  function applyButtonState(btn, uid) {
    const blocked = isBlocked(uid);
    btn.classList.remove('weibo-lajie--blocked-yes', 'weibo-lajie--blocked-no', 'weibo-lajie--loading');
    btn.disabled = false;
    if (blocked) {
      btn.classList.add('weibo-lajie--blocked-yes');
      btn.textContent = '已拉黑';
    } else {
      btn.classList.add('weibo-lajie--blocked-no');
      btn.textContent = '拉黑';
    }
  }

  function setButtonLoading(btn) {
    btn.classList.remove('weibo-lajie--blocked-yes', 'weibo-lajie--blocked-no');
    btn.classList.add('weibo-lajie--loading');
    btn.textContent = '处理中';
    btn.disabled = true;
  }

  function syncAllButtonsForUid(uid) {
    const sel = `.weibo-lajie-btn[data-uid="${uid}"]`;
    document.querySelectorAll(sel).forEach((b) => applyButtonState(b, uid));
  }

  async function onToggleClick(btn, uid) {
    if (btn.disabled) return;
    setButtonLoading(btn);
    try {
      const wasBlocked = isBlocked(uid);
      if (!wasBlocked) {
        const data = await apiBlockUser(uid);
        if (!isWeiboOk(data)) {
          // eslint-disable-next-line no-console
          console.error('[weibo-lajie] 拉黑失败', data);
          applyButtonState(btn, uid);
          return;
        }
        cachedSet.add(String(uid));
        persistIdSet();
        applyButtonState(btn, uid);
        syncAllButtonsForUid(uid);
      } else {
        const data = await apiUnblockUser(uid);
        if (!isWeiboOk(data)) {
          // eslint-disable-next-line no-console
          console.error('[weibo-lajie] 取消拉黑失败', data);
          applyButtonState(btn, uid);
          return;
        }
        cachedSet.delete(String(uid));
        persistIdSet();
        applyButtonState(btn, uid);
        syncAllButtonsForUid(uid);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[weibo-lajie] 请求异常', e);
      applyButtonState(btn, uid);
    }
  }

  function createWrapAfter(anchor) {
    const uid = extractUid(anchor.getAttribute('href') || anchor.href);
    if (!uid) return;

    const wrap = document.createElement('span');
    wrap.className = WRAP_CLASS;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weibo-lajie-btn';
    btn.setAttribute('data-uid', uid);
    onStorageReady(() => {
      applyButtonState(btn, uid);
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onToggleClick(btn, uid);
    });
    wrap.appendChild(btn);
    anchor.insertAdjacentElement('afterend', wrap);
  }

  function normalizeLabelText(s) {
    return (s || '').replace(/[\s\u00a0]+/g, '');
  }

  /**
   * 灰标整词，或与时间、来源等挤在同一节点内时的短前缀（如「广告」+「17小时前」）
   */
  function textMatchesPromoLabel(raw) {
    const n = normalizeLabelText(raw);
    if (PROMO_TAG_WORDS.indexOf(n) >= 0) {
      return true;
    }
    for (const w of PROMO_TAG_WORDS) {
      if (n.length > w.length && n.length <= w.length + 28 && n.indexOf(w) === 0) {
        return true;
      }
    }
    return false;
  }

  function isPromoMetaLabelElement(el, card) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    if (!textMatchesPromoLabel(el.textContent)) {
      return false;
    }
    const h = el.offsetHeight || 0;
    const w = el.offsetWidth || 0;
    /** 单独小灰标很窄；「广告+时间」同一行时整行会远超 320px，不能用旧阈值误杀 */
    if (h > 160 || w > 920) {
      return false;
    }
    const cRect = card.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (cRect.height < 1) {
      return false;
    }
    if (eRect.top - cRect.top > PROMO_MAX_TOP_OFFSET) {
      return false;
    }
    if (eRect.top < cRect.top - 2) {
      return false;
    }
    return true;
  }

  function isPromoAdLabelImageInHeader(card) {
    const cRect = card.getBoundingClientRect();
    if (cRect.height < 1) {
      return false;
    }
    for (const img of card.querySelectorAll('img')) {
      const s = (img.getAttribute('src') || img.getAttribute('data-src') || img.currentSrc || img.src || '').toLowerCase();
      if (!isWeiboAdLabelImageSrc(s)) {
        continue;
      }
      const eRect = img.getBoundingClientRect();
      if (eRect.top - cRect.top > PROMO_MAX_TOP_OFFSET + 48) {
        continue;
      }
      if (eRect.top < cRect.top - 4) {
        continue;
      }
      if (eRect.width > 320 || eRect.height > 120) {
        continue;
      }
      return true;
    }
    return false;
  }

  /**
   * 新版顶栏灰标容器：如 <div class="wbpro-tag wbpro-tag-c2"><div>荐读</div></div>
   * 外层可能被 flex 拉宽，不走 isPromoMetaLabelElement 的宽度上限逻辑。
   */
  function isPromoWbproTagInHeader(card) {
    const cRect = card.getBoundingClientRect();
    if (cRect.height < 1) {
      return false;
    }
    for (const tag of card.querySelectorAll('.wbpro-tag')) {
      if (!textMatchesPromoLabel(tag.textContent)) {
        continue;
      }
      const eRect = tag.getBoundingClientRect();
      if (eRect.top - cRect.top > PROMO_MAX_TOP_OFFSET) {
        continue;
      }
      if (eRect.top < cRect.top - 2) {
        continue;
      }
      return true;
    }
    return false;
  }

  function isPromoTaggedInMetaLine(card) {
    if (isPromoAdLabelImageInHeader(card)) {
      return true;
    }
    if (isPromoWbproTagInHeader(card)) {
      return true;
    }
    const all = card.querySelectorAll(
      'span, em, i, small, label, font, time, a, li, b, strong, p, h3, h4, h5, section, div, button, ins',
    );
    for (const el of all) {
      if (isPromoMetaLabelElement(el, card)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 虚拟列表会复用 vue-recycle-scroller__item-view：若曾在外层打标，新内容无荐读仍会 display:none。
   * 每次扫描前摘掉「当前 DOM 已不构成推广灰标」的标记。
   */
  function clearStalePromoBlocked() {
    for (const el of Array.from(document.querySelectorAll(SEL_PROMO_BLOCKED))) {
      const article =
        el.tagName === 'ARTICLE'
          ? el
          : el.querySelector && el.querySelector('article');
      if (!article) {
        el.removeAttribute(DATA_PROMO_BLOCKED);
        el.style.removeProperty('display');
        continue;
      }
      if (isPromoTaggedInMetaLine(article)) {
        continue;
      }
      el.removeAttribute(DATA_PROMO_BLOCKED);
      el.style.removeProperty('display');
    }
  }

  function hidePromoFeedItems() {
    if (!shouldRunPromoWbproHide()) {
      return;
    }
    clearStalePromoBlocked();
    const done = new Set();

    function markPromoHidden(card) {
      if (!card || !card.setAttribute) {
        return;
      }
      if (done.has(card)) {
        return;
      }
      if (card.getAttribute(DATA_PROMO_BLOCKED) === '1') {
        done.add(card);
        return;
      }
      card.setAttribute(DATA_PROMO_BLOCKED, '1');
      card.style.setProperty('display', 'none', 'important');
      done.add(card);
    }

    /**
     * 新版灰标：<div class="wbpro-tag wbpro-tag-c2"><div>荐读</div></div>
     * 勿在 vue-recycle-scroller__item-view 上打标（槽位复用会误杀下一条）；可用 wbpro-scroller-item 或 article。
     */
    for (const tag of document.querySelectorAll('.wbpro-tag.wbpro-tag-c2, .wbpro-tag')) {
      if (tag.closest(SEL_PROMO_BLOCKED)) {
        continue;
      }
      if (!textMatchesPromoLabel(tag.textContent)) {
        continue;
      }
      const cls = String(tag.className || '');
      if (cls.indexOf('wbpro-tag') < 0) {
        continue;
      }
      const article = tag.closest('article');
      if (!article) {
        continue;
      }
      if (article.closest('aside, [class*="sideBar"], [class*="SideBar"], [class*="side-bar"]')) {
        continue;
      }
      const host = article.closest('div.wbpro-scroller-item') || article;
      markPromoHidden(host);
    }

    const roots = document.querySelectorAll(
      'div.wbpro-scroller-item article, ' +
        '#app article, article[class*="woo-panel"], ' +
        'main article, [role=main] article, #plc_frame article, #plc_main article, ' +
        'div[action-type="feed_list_item"], ' +
        '#v6_pl_content article, [id*="_v6_"] article, ' +
        'div[action-type="feed"], div.card',
    );
    for (const n of roots) {
      if (!n.closest) {
        continue;
      }
      if (!inPrimaryFeedContext(n)) {
        continue;
      }
      const card =
        getFeedItem(n) || n.closest('article, div[action-type="feed_list_item"], div.card') || n;
      if (done.has(card)) {
        continue;
      }
      if (card.closest(SEL_PROMO_BLOCKED)) {
        done.add(card);
        continue;
      }
      if (!isPromoTaggedInMetaLine(card)) {
        done.add(card);
        continue;
      }
      markPromoHidden(card);
    }
  }

  function shouldInject(anchor) {
    if (anchor.getAttribute('data-weibo-lajie-bound') === '1') return false;
    if (anchor.nextElementSibling && anchor.nextElementSibling.classList.contains(WRAP_CLASS)) {
      return false;
    }
    if (!extractUid(anchor.getAttribute('href') || anchor.href)) return false;
    if (!inPrimaryFeedContext(anchor)) return false;
    const item = getFeedItem(anchor);
    if (item && item.closest(SEL_PROMO_BLOCKED)) {
      return false;
    }
    if (item) {
      const nameLink = findAuthorNameUserLinkInFeedItem(item);
      if (nameLink !== anchor) {
        return false;
      }
    } else {
      if (
        !anchor.closest(
          'main, [role=main], #plc_main, #plc_frame, #v6_pl_content, [id*="_v6_"], [id*="_pl_"], ' +
            'div.card, .card-feed',
        )
      ) {
        return false;
      }
      if (isLikelyAvatarOnlyUserLink(anchor)) {
        return false;
      }
    }
    return true;
  }

  function collectWeiboUserAnchorElements() {
    const set = new Set();
    const add = (a) => {
      if (extractUid(a.getAttribute('href') || a.href)) {
        set.add(a);
      }
    };
    document.querySelectorAll('a[href*="/u/"]').forEach(add);
    document.querySelectorAll('a[href*="weibo.com/"]').forEach(add);
    return set;
  }

  function scanOnce() {
    if (shouldRunPromoWbproHide()) {
      hidePromoFeedItems();
    }
    if (!isTargetPage()) {
      return;
    }
    for (const a of collectWeiboUserAnchorElements()) {
      if (!shouldInject(a)) continue;
      a.setAttribute('data-weibo-lajie-bound', '1');
      createWrapAfter(a);
    }
  }

  let obs = null;
  function startObserver() {
    if (obs) return;
    let scheduled = null;
    const run = () => {
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = null;
        scanOnce();
      });
    };
    obs = new MutationObserver(() => {
      run();
    });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  function onUrlChange() {
    requestAnimationFrame(() => {
      scanOnce();
    });
  }

  (function hookHistoryForSpa() {
    if (typeof history === 'undefined' || !history.pushState) {
      return;
    }
    const fire = () => {
      onUrlChange();
    };
    const _ps = history.pushState;
    const _rs = history.replaceState;
    history.pushState = function () {
      const r = _ps.apply(this, arguments);
      fire();
      return r;
    };
    history.replaceState = function () {
      const r = _rs.apply(this, arguments);
      fire();
      return r;
    };
    window.addEventListener('popstate', fire);
  })();

  initStorage();
  onStorageReady(() => {
    scanOnce();
  });
  startObserver();

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const n = changes[STORAGE_KEY].newValue;
      const arr = Array.isArray(n) ? n : [];
      cachedSet = new Set(arr.map(String));
      document.querySelectorAll('.weibo-lajie-btn[data-uid]').forEach((b) => {
        const u = b.getAttribute('data-uid');
        if (u) applyButtonState(b, u);
      });
    });
  }
})();
