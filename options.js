(function () {
  'use strict';

  /** 搜索命中过多时仅渲染前 N 条，避免 DOM 过大 */
  const MAX_DISPLAY = 100;

  const $filter = document.getElementById('filter');
  const $reload = document.getElementById('reload');
  const $status = document.getElementById('status');
  const $listLocal = document.getElementById('list-local');
  const $listServer = document.getElementById('list-server');
  const $hintLocal = document.getElementById('hint-local');
  const $hintServer = document.getElementById('hint-server');
  const $countLocal = document.getElementById('count-local');
  const $countServer = document.getElementById('count-server');

  let serverAll = [];
  let localOnlyAll = [];

  function send(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(Object.assign({ type }, payload || {}), (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (res && res.error) {
          const err = new Error(res.error);
          if (res.data) {
            err.weiboData = res.data;
          }
          reject(err);
          return;
        }
        resolve(res);
      });
    });
  }

  function setStatus(text, kind) {
    $status.textContent = text || '';
    $status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function profileUrl(uid) {
    return 'https://weibo.com/u/' + encodeURIComponent(uid);
  }

  function getSearchQuery() {
    return ($filter.value || '').trim();
  }

  function filterUids(uids, q) {
    if (!q) {
      return [];
    }
    return uids.filter((u) => String(u).indexOf(q) >= 0);
  }

  function setListHint(el, kind, extra) {
    el.className = 'list-hint' + (kind ? ' list-hint--' + kind : '');
    el.textContent = extra || '';
  }

  function updateSectionHints(total, matched, displayed) {
    const q = getSearchQuery();
    return function apply($hint) {
      if (!q) {
        setListHint(
          $hint,
          'idle',
          total > 0
            ? '共 ' + total + ' 条，请输入 uid 片段后展示匹配结果（不默认列出全部）'
            : '暂无记录',
        );
        return;
      }
      if (matched === 0) {
        setListHint($hint, 'nomatch', '无匹配「' + q + '」');
        return;
      }
      if (matched > displayed) {
        setListHint(
          $hint,
          'cap',
          '匹配 ' + matched + ' 条，仅展示前 ' + MAX_DISPLAY + ' 条，请缩小搜索',
        );
        return;
      }
      setListHint($hint, 'ok', '匹配 ' + matched + ' 条');
    };
  }

  function renderList(ul, uids, btnClass, btnLabel, onClick) {
    ul.textContent = '';
    const q = getSearchQuery();
    const matched = filterUids(uids, q);
    const slice = matched.slice(0, MAX_DISPLAY);
    for (const uid of slice) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'uid-link';
      a.href = profileUrl(uid);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = uid;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = btnClass;
      btn.textContent = btnLabel;
      btn.addEventListener('click', () => onClick(uid, btn));
      li.appendChild(a);
      li.appendChild(btn);
      ul.appendChild(li);
    }
    return { matched: matched.length, displayed: slice.length };
  }

  function renderLocalList() {
    $listLocal.textContent = '';
    const q = getSearchQuery();
    const matched = filterUids(localOnlyAll, q);
    const slice = matched.slice(0, MAX_DISPLAY);
    for (const uid of slice) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'uid-link';
      a.href = profileUrl(uid);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = uid;
      const actions = document.createElement('div');
      actions.className = 'row-actions';

      const btnBlock = document.createElement('button');
      btnBlock.type = 'button';
      btnBlock.className = 'btn-block-server';
      btnBlock.textContent = '拉黑';
      btnBlock.title = '调用微博服务器拉黑；成功后将移入「微博已拉黑」';

      const btnLocal = document.createElement('button');
      btnLocal.type = 'button';
      btnLocal.className = 'btn-local';
      btnLocal.textContent = '取消本机屏蔽';

      btnBlock.addEventListener('click', async () => {
        btnBlock.disabled = true;
        btnLocal.disabled = true;
        setStatus('请求微博拉黑接口…');
        try {
          await send('weiboLajiePopupBlockServer', { uid });
          const id = String(uid);
          localOnlyAll = localOnlyAll.filter((u) => u !== id);
          if (serverAll.indexOf(id) < 0) {
            serverAll.push(id);
            serverAll.sort();
          }
          setStatus('已拉黑并移入微博已拉黑：' + id, 'ok');
          paint();
        } catch (e) {
          setStatus(e.message || String(e), 'err');
          btnBlock.disabled = false;
          btnLocal.disabled = false;
        }
      });

      btnLocal.addEventListener('click', async () => {
        btnBlock.disabled = true;
        btnLocal.disabled = true;
        setStatus('处理中…');
        try {
          await send('weiboLajiePopupRemoveLocal', { uid });
          localOnlyAll = localOnlyAll.filter((u) => u !== String(uid));
          setStatus('已取消本机屏蔽：' + uid, 'ok');
          paint();
        } catch (e) {
          setStatus(e.message || String(e), 'err');
          btnBlock.disabled = false;
          btnLocal.disabled = false;
        }
      });

      actions.appendChild(btnBlock);
      actions.appendChild(btnLocal);
      li.appendChild(a);
      li.appendChild(actions);
      $listLocal.appendChild(li);
    }
    return { matched: matched.length, displayed: slice.length };
  }

  function paint() {
    $countLocal.textContent = String(localOnlyAll.length);
    $countServer.textContent = String(serverAll.length);

    const localStats = renderLocalList();
    const serverStats = renderList($listServer, serverAll, 'btn-server', '取消拉黑', async (uid, btn) => {
      btn.disabled = true;
      setStatus('请求微博接口…');
      try {
        await send('weiboLajiePopupUnblockServer', { uid });
        serverAll = serverAll.filter((u) => u !== String(uid));
        localOnlyAll = localOnlyAll.filter((u) => u !== String(uid));
        setStatus('已取消拉黑：' + uid, 'ok');
        paint();
      } catch (e) {
        setStatus(e.message || String(e), 'err');
        btn.disabled = false;
      }
    });

    updateSectionHints(
      localOnlyAll.length,
      localStats.matched,
      localStats.displayed,
    )($hintLocal);
    updateSectionHints(
      serverAll.length,
      serverStats.matched,
      serverStats.displayed,
    )($hintServer);
  }

  async function load() {
    setStatus('加载中…');
    try {
      const res = await send('weiboLajiePopupGetLists');
      serverAll = res.server || [];
      localOnlyAll = res.localOnly || [];
      setStatus('');
      paint();
    } catch (e) {
      setStatus(e.message || String(e), 'err');
    }
  }

  $filter.addEventListener('input', () => {
    paint();
  });
  $reload.addEventListener('click', () => {
    load();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }
    if (changes.weiboLajieUids || changes.weiboLajieLocalOnlyUids) {
      load();
    }
  });

  load();
})();
