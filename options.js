(function () {
  'use strict';

  const $filter = document.getElementById('filter');
  const $reload = document.getElementById('reload');
  const $status = document.getElementById('status');
  const $listLocal = document.getElementById('list-local');
  const $listServer = document.getElementById('list-server');
  const $emptyLocal = document.getElementById('empty-local');
  const $emptyServer = document.getElementById('empty-server');
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

  function matchFilter(uid, q) {
    if (!q) {
      return true;
    }
    return String(uid).indexOf(q) >= 0;
  }

  function renderList(ul, uids, btnClass, btnLabel, onClick) {
    ul.textContent = '';
    const q = ($filter.value || '').trim();
    const filtered = uids.filter((u) => matchFilter(u, q));
    for (const uid of filtered) {
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
    return filtered.length;
  }

  function renderLocalList() {
    $listLocal.textContent = '';
    const q = ($filter.value || '').trim();
    const filtered = localOnlyAll.filter((u) => matchFilter(u, q));
    for (const uid of filtered) {
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
    return filtered.length;
  }

  function updateEmpty() {
    const q = ($filter.value || '').trim();
    const localShown = localOnlyAll.filter((u) => matchFilter(u, q)).length;
    const serverShown = serverAll.filter((u) => matchFilter(u, q)).length;
    $emptyLocal.classList.toggle('hidden', localShown > 0);
    $emptyServer.classList.toggle('hidden', serverShown > 0);
    $countLocal.textContent = String(localOnlyAll.length);
    $countServer.textContent = String(serverAll.length);
  }

  function paint() {
    renderLocalList();
    renderList($listServer, serverAll, 'btn-server', '取消拉黑', async (uid, btn) => {
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
    updateEmpty();
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
