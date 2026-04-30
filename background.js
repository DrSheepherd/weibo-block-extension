/**
 * 主站/顶点：MAIN 里 location.origin 发 aj。
 * 搜索 s.weibo.com：在 SW 里对 www 发 fetch；须带与搜索页一致的 Referer/Origin，用
 * declarativeNetRequest 会话规则注入。URL 加 weiboLajie=1 只匹配本扩展，避免改到站内其它 XHR。
 * 注：readSt 与注入到主站页的函数均须自包含。
 */
const WWW = 'https://www.weibo.com';
const DNR_ID_LO = 9200000;
const DNR_ID_HI = 9999000;
function nextDnrSessionId() {
  return DNR_ID_LO + (Date.now() % (DNR_ID_HI - DNR_ID_LO)) + (Math.floor(Math.random() * 2000) | 0);
}

function readStInPage() {
  try {
    if (window.$CONFIG && window.$CONFIG.st) {
      return window.$CONFIG.st;
    }
  } catch (e) {
    /* empty */
  }
  const list = document.querySelectorAll('script');
  for (const el of list) {
    const t = el.textContent || '';
    const m = t.match(/["']st["']\s*:\s*["']([^"']+)["']/);
    if (m) {
      return m[1];
    }
  }
  return '';
}

function parseWeiboJson(t) {
  try {
    return JSON.parse(t);
  } catch (e) {
    return { code: 0, msg: String(t).slice(0, 200) };
  }
}

async function fetchStFromTab(tabId) {
  const r = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: readStInPage,
    args: [],
  });
  return (r && r[0] && typeof r[0].result === 'string' ? r[0].result : '') || '';
}

/**
 * 仅对 urlFilter 命中的、本扩展发出的 XHR 补 Referer/Origin
 */
async function withSearchPageHeadersOnWww(pageUrl, urlFilter, doFetch) {
  const ref =
    pageUrl && String(pageUrl).indexOf('https://') === 0
      ? String(pageUrl)
      : 'https://s.weibo.com/weibo';
  const ruleId = nextDnrSessionId();
  let added = false;
  try {
    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateSessionRules) {
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [
          {
            id: ruleId,
            priority: 2,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [
                { header: 'Referer', operation: 'set', value: ref },
                { header: 'Origin', operation: 'set', value: 'https://s.weibo.com' },
              ],
            },
            condition: {
              urlFilter: urlFilter,
              resourceTypes: ['xmlhttprequest', 'other'],
            },
          },
        ],
      });
      added = true;
      await new Promise((r) => setTimeout(r, 5));
    }
  } catch (e) {
    /* 无 DNR 时仍发请求 */
  }
  try {
    return await doFetch();
  } finally {
    if (added) {
      try {
        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
      } catch (e) {
        /* ignore */
      }
    }
  }
}

const DNR_URL_FILTER_BLOCK = '||www.weibo.com/aj/filter/block?ajwvr=6&weiboLajie=1';
const DNR_URL_FILTER_UNBLOCK = '||www.weibo.com/aj/f/delblack?ajwvr=6&weiboLajie=1';
const URL_BLOCK = WWW + '/aj/filter/block?ajwvr=6&weiboLajie=1';
const URL_UNBLOCK = WWW + '/aj/f/delblack?ajwvr=6&weiboLajie=1';

async function postWeiboBlockInWorker(_tabId, _pageUrl, uid) {
  const st = await fetchStFromTab(_tabId);
  const p = new URLSearchParams();
  p.set('uid', String(uid));
  p.set('filter_type', '1');
  p.set('status', '1');
  p.set('interact', '1');
  p.set('follow', '1');
  if (st) {
    p.set('st', st);
  }
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json, text/javascript, */*; q=0.01',
  };
  if (st) {
    headers['X-CSRF-Token'] = st;
  }
  return withSearchPageHeadersOnWww(_pageUrl, DNR_URL_FILTER_BLOCK, async () => {
    const r = await fetch(URL_BLOCK, {
      method: 'POST',
      credentials: 'include',
      body: p.toString(),
      headers: headers,
    });
    return parseWeiboJson(await r.text());
  });
}

async function postWeiboUnblockInWorker(_tabId, _pageUrl, uid) {
  const st = await fetchStFromTab(_tabId);
  const p = new URLSearchParams();
  p.set('uid', String(uid));
  p.set('objectid', '');
  p.set('f', '1');
  p.set('__rnd', String(Date.now()));
  if (st) {
    p.set('st', st);
  }
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json, text/javascript, */*; q=0.01',
  };
  if (st) {
    headers['X-CSRF-Token'] = st;
  }
  return withSearchPageHeadersOnWww(_pageUrl, DNR_URL_FILTER_UNBLOCK, async () => {
    const r = await fetch(URL_UNBLOCK, {
      method: 'POST',
      credentials: 'include',
      body: p.toString(),
      headers: headers,
    });
    return parseWeiboJson(await r.text());
  });
}

async function weiboLajiePostBlockInPage(uid) {
  function readSt() {
    try {
      if (window.$CONFIG && window.$CONFIG.st) {
        return window.$CONFIG.st;
      }
    } catch (e) {
      /* empty */
    }
    const list = document.querySelectorAll('script');
    for (const el of list) {
      const t = el.textContent || '';
      const m = t.match(/["']st["']\s*:\s*["']([^"']+)["']/);
      if (m) {
        return m[1];
      }
    }
    return '';
  }
  function parseText(t) {
    try {
      return JSON.parse(t);
    } catch (e) {
      return { code: 0, msg: String(t).slice(0, 200) };
    }
  }
  const p = new URLSearchParams();
  p.set('uid', String(uid));
  p.set('filter_type', '1');
  p.set('status', '1');
  p.set('interact', '1');
  p.set('follow', '1');
  const st = readSt();
  if (st) {
    p.set('st', st);
  }
  const origin =
    typeof location !== 'undefined' && location.origin && /^https?:/i.test(location.origin)
      ? location.origin
      : 'https://weibo.com';
  const ref =
    typeof location !== 'undefined' && location.href
      ? String(location.href)
      : origin + '/u/' + String(uid);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    Referer: ref,
  };
  if (st) {
    headers['X-CSRF-Token'] = st;
  }
  const r = await fetch(origin + '/aj/filter/block?ajwvr=6', {
    method: 'POST',
    credentials: 'include',
    mode: 'cors',
    body: p.toString(),
    headers: headers,
  });
  const out = parseText(await r.text());
  return out == null ? { code: 0, msg: '空响应' } : out;
}

async function weiboLajiePostUnblockInPage(uid) {
  function readSt() {
    try {
      if (window.$CONFIG && window.$CONFIG.st) {
        return window.$CONFIG.st;
      }
    } catch (e) {
      /* empty */
    }
    const list = document.querySelectorAll('script');
    for (const el of list) {
      const t = el.textContent || '';
      const m = t.match(/["']st["']\s*:\s*["']([^"']+)["']/);
      if (m) {
        return m[1];
      }
    }
    return '';
  }
  function parseText(t) {
    try {
      return JSON.parse(t);
    } catch (e) {
      return { code: 0, msg: String(t).slice(0, 200) };
    }
  }
  const p = new URLSearchParams();
  p.set('uid', String(uid));
  p.set('objectid', '');
  p.set('f', '1');
  p.set('__rnd', String(Date.now()));
  const st = readSt();
  if (st) {
    p.set('st', st);
  }
  const origin =
    typeof location !== 'undefined' && location.origin && /^https?:/i.test(location.origin)
      ? location.origin
      : 'https://weibo.com';
  const ref =
    typeof location !== 'undefined' && location.href
      ? String(location.href)
      : origin + '/u/' + String(uid);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    Referer: ref,
  };
  if (st) {
    headers['X-CSRF-Token'] = st;
  }
  const r = await fetch(origin + '/aj/f/delblack?ajwvr=6', {
    method: 'POST',
    credentials: 'include',
    mode: 'cors',
    body: p.toString(),
    headers: headers,
  });
  const out = parseText(await r.text());
  return out == null ? { code: 0, msg: '空响应' } : out;
}

function isSearchWeiboPage(tabUrl) {
  if (!tabUrl || typeof tabUrl !== 'string') {
    return false;
  }
  try {
    return new URL(tabUrl).hostname === 's.weibo.com';
  } catch (e) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || !msg.type) {
    return false;
  }

  const tabId = sender && sender.tab && sender.tab.id;
  const pageUrl = sender && sender.tab && sender.tab.url;
  const search = isSearchWeiboPage(pageUrl);

  if (msg.type === 'weiboLajieBlock' && msg.uid) {
    (async () => {
      if (!tabId) {
        sendResponse({ error: 'no tab id' });
        return;
      }
      try {
        let data;
        if (search) {
          data = await postWeiboBlockInWorker(tabId, pageUrl, String(msg.uid));
        } else {
          const r = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: weiboLajiePostBlockInPage,
            args: [String(msg.uid)],
          });
          data = r && r[0] && r[0].result;
        }
        if (data == null) {
          data = { code: 0, msg: '无返回数据' };
        }
        sendResponse({ data });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }
  if (msg.type === 'weiboLajieUnblock' && msg.uid) {
    (async () => {
      if (!tabId) {
        sendResponse({ error: 'no tab id' });
        return;
      }
      try {
        let data;
        if (search) {
          data = await postWeiboUnblockInWorker(tabId, pageUrl, String(msg.uid));
        } else {
          const r = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: weiboLajiePostUnblockInPage,
            args: [String(msg.uid)],
          });
          data = r && r[0] && r[0].result;
        }
        if (data == null) {
          data = { code: 0, msg: '无返回数据' };
        }
        sendResponse({ data });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }
  return false;
});
