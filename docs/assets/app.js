// date-no-kuni: frontend is fully custom (assets/app.js). No shared templates.

/* date-no-kuni custom frontend:
   Left = article list, click = article shows in the right panel.
   Data comes from the Markdown CMS build (data/sites/date.json + data/posts/date/*.json). */
(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!app) return;
  var SITE = app.dataset.siteId || 'date';
  var ROOT = app.dataset.root || './';
  var preview = app.dataset.preview === 'true';
  var snapshot = null;
  if (preview) {
    var pd = document.getElementById('preview-data');
    if (pd) { try { snapshot = JSON.parse(pd.textContent); } catch (e) { snapshot = null; } }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function getJSON(path) {
    return fetch(new URL(path, new URL(ROOT, location.href))).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  var GROUPS = ['案内', '第1部・福島', '第2部・置賜', '第3部・会津', '第4部・岩出山', '第5部・仙台城下', '第6部・水と堀', 'コラム'];
  var entries = [], bySlug = {}, postCache = {};
  var currentSlug = null, suppressHash = false;
  var map = null, markers = {}, mapReady = false, mapOpen = false;

  app.innerHTML =
    '<main>' +
    '<h1 id="siteName">読み込み中…</h1>' +
    '<div class="sub" id="siteSub"></div>' +
    '<h2>地図 ― 登場する城と神社仏閣<button id="mapToggle" type="button">開く</button></h2>' +
    '<div id="mapWrap" class="hidden"><div id="map2d"></div>' +
    '<p class="note">ピンを押すと、その場所の説明と、本の対応する章への案内が出ます。各場所の3D地図は<a href="./map-list.html">3Dマップ一覧</a>からも開けます。</p></div>' +
    '<button id="menuBtn" type="button">☰ 目次・章一覧</button>' +
    '<div class="layout">' +
    '<aside id="side"></aside>' +
    '<div class="content"><section id="detail"><div class="rstatus">読み込み中…</div></section>' +
    '<p class="note">原稿はMarkdownで書かれ、Markdown CMSの仕組みで記事になっています。章を選ぶと、右側に本文が出ます。</p>' +
    '</div></div></main>';

  var side = document.getElementById('side');
  var detail = document.getElementById('detail');
  document.getElementById('menuBtn').addEventListener('click', function () { side.classList.toggle('open'); });
  document.getElementById('mapToggle').addEventListener('click', function () { toggleMap(); });

  function slugFromPlaceUrl(u) {
    var m = String(u).match(/#\/post\/[^/]+\/([a-z0-9-]+)/) || String(u).match(/docs\/(book-[a-z0-9-]+)\.md/);
    return m ? m[1] : null;
  }
  function placesOfChapter(slug) {
    if (!window.PLACES) return [];
    var out = [];
    window.PLACES.forEach(function (p) {
      (p.chapters || []).forEach(function (c) { if (slugFromPlaceUrl(c.url) === slug) out.push(p); });
    });
    return out;
  }

  function renderTOC() {
    var html = '';
    GROUPS.forEach(function (g) {
      var items = entries.filter(function (e) { return e.category === g; });
      if (!items.length) return;
      html += '<div class="part">' + esc(g) + '</div><ul>';
      items.forEach(function (e) {
        html += '<li data-slug="' + esc(e.slug) + '"><span class="name">' + esc(e.title) + '</span></li>';
      });
      html += '</ul>';
    });
    side.innerHTML = html;
    side.querySelectorAll('li[data-slug]').forEach(function (li) {
      li.addEventListener('click', function () { goPost(li.dataset.slug); });
    });
  }
  function markSelected(slug) {
    side.querySelectorAll('li').forEach(function (li) {
      li.classList.toggle('selected', li.dataset.slug === slug);
    });
  }
  function closeSideOnMobile() { side.classList.remove('open'); }

  function goPost(slug) {
    if (location.hash !== '#/post/' + SITE + '/' + slug) {
      suppressHash = true;
      location.hash = '#/post/' + SITE + '/' + slug;
    }
    showPost(slug);
  }
  function fetchPost(slug) {
    if (postCache[slug]) return Promise.resolve(postCache[slug]);
    if (preview && snapshot && snapshot.posts) {
      var d = snapshot.posts[SITE + ':' + slug];
      if (d) { postCache[slug] = d; return Promise.resolve(d); }
    }
    return getJSON('data/posts/' + SITE + '/' + encodeURIComponent(slug) + '.json').then(function (d) {
      postCache[slug] = d; return d;
    });
  }
  function showPost(slug) {
    var entry = bySlug[slug];
    if (!entry) return;
    currentSlug = slug;
    markSelected(slug);
    closeSideOnMobile();
    detail.innerHTML = '<div class="rstatus">読み込み中…</div>';
    fetchPost(slug).then(function (d) {
      if (currentSlug !== slug) return;
      var idx = entries.indexOf(entry);
      var prev = idx > 0 ? entries[idx - 1] : null;
      var next = idx >= 0 && idx < entries.length - 1 ? entries[idx + 1] : null;
      var places = placesOfChapter(slug);
      var ph = '';
      if (places.length) {
        ph = '<p class="dplaces">この章に出てくる場所: ' + places.map(function (p) {
          return '<a href="javascript:void(0)" data-place="' + esc(p.name) + '">' + esc(p.name) + '</a>';
        }).join(' ／ ') + '（押すと地図がその場所に寄ります）</p>';
      }
      detail.innerHTML =
        '<div class="dpart">' + esc(d.category || entry.category || '') + '</div>' +
        '<h3>' + esc(d.title || entry.title) + '</h3>' +
        (d.subtitle ? '<p class="dsub">' + esc(d.subtitle) + '</p>' : '') +
        '<div class="dmeta">投稿者: ' + esc(d.author || 'ミューズさん') + '</div>' +
        '<article class="abody">' + (d.html || '') + '</article>' +
        ph +
        '<div class="rnav">' +
        (prev ? '<a href="#/post/' + SITE + '/' + esc(prev.slug) + '">← ' + esc(prev.title) + '</a>' : '<span></span>') +
        (next ? '<a href="#/post/' + SITE + '/' + esc(next.slug) + '">' + esc(next.title) + ' →</a>' : '<span></span>') +
        '</div>';
      document.title = (d.title || entry.title) + ' | ' + (feedSiteName || '');
      detail.querySelectorAll('[data-place]').forEach(function (a) {
        a.addEventListener('click', function () { focusPlace(a.dataset.place); });
      });
      window.scrollTo({ top: 0 });
    }).catch(function () {
      detail.innerHTML = '<div class="rstatus">記事を読み込めませんでした。</div>';
    });
  }
  function ensureMap() {
    if (mapReady) return Promise.resolve();
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'assets/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    return loadScript('assets/vendor/leaflet/leaflet.js')
      .then(function () { return loadScript('places.js'); })
      .then(function () {
        if (!window.L || !window.PLACES) return;
        map = L.map('map2d', { zoomControl: false });
        // Zoom buttons at bottom-left: the default top-left overlaps the
        // place popups (user's report, 2026-11-03).
        L.control.zoom({ position: 'bottomleft' }).addTo(map);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
        var pts = [];
        window.PLACES.forEach(function (p) {
          var icon = L.divIcon({ className: '', html: '<div class="pin ' + esc(p.kind) + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
          var m = L.marker([p.lat, p.lon], { icon: icon }).addTo(map);
          markers[p.name] = m;
          var chap = '';
          if (p.chapters && p.chapters.length) {
            chap = '本では: ' + p.chapters.map(function (c) {
              var s = slugFromPlaceUrl(c.url);
              return s && bySlug[s] ? '<a href="#/post/' + SITE + '/' + s + '">' + esc(c.label) + '</a>' : esc(c.label);
            }).join(' ／ ') + ' に出てきます。';
          } else {
            chap = '本ではまだ取り上げていません（この地図が先行しています）。';
          }
          var html = '<div class="pop"><h3>' + esc(p.name) + '<span class="kind">' + esc(({ castle: '城', shrine: '神社', temple: '寺', site: '史跡' })[p.kind] || '神社仏閣') + '</span></h3>' +
            '<p>' + esc(p.desc) + '</p>' +
            '<div class="chap">' + chap + '<br><a href="./map.html?scene=' + esc(p.scene) + '&focus=' + encodeURIComponent(p.name) + '">3Dマップで見る（' + esc(p.sceneTitle) + '）</a></div></div>';
          m.bindPopup(html, { maxWidth: 320 });
          pts.push([p.lat, p.lon]);
        });
        if (pts.length) map.fitBounds(pts, { padding: [30, 30] });
        mapReady = true;
      });
  }
  function toggleMap(forceOpen) {
    var wrap = document.getElementById('mapWrap');
    var btn = document.getElementById('mapToggle');
    var willOpen = forceOpen != null ? forceOpen : !mapOpen;
    if (willOpen) {
      wrap.classList.remove('hidden');
      btn.textContent = '閉じる';
      mapOpen = true;
      ensureMap().then(function () {
        if (map) setTimeout(function () { map.invalidateSize(); }, 60);
      });
    } else {
      wrap.classList.add('hidden');
      btn.textContent = '開く';
      mapOpen = false;
    }
  }
  function focusPlace(name) {
    toggleMap(true);
    ensureMap().then(function () {
      var m = markers[name];
      if (!m) return;
      setTimeout(function () {
        map.invalidateSize();
        map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 13));
        m.openPopup();
      }, 120);
    });
  }

  function route() {
    var m = location.hash.match(/#\/post\/[^/]+\/([a-z0-9-]+)/);
    if (m && bySlug[m[1]]) { showPost(m[1]); return true; }
    return false;
  }
  window.addEventListener('hashchange', function () {
    if (suppressHash) { suppressHash = false; return; }
    route();
  });

  var feedSiteName = '';
  var feedPromise;
  if (preview && snapshot && snapshot.sites && snapshot.sites[SITE]) {
    feedPromise = Promise.resolve(snapshot.sites[SITE]);
  } else {
    feedPromise = getJSON('data/sites/' + SITE + '.json');
  }
  feedPromise.then(function (feed) {
    feedSiteName = (feed.site && feed.site.name) || '';
    document.getElementById('siteName').textContent = feedSiteName || '伊達の国を歩く（仮）';
    document.getElementById('siteSub').textContent = (feed.site && feed.site.description) || '';
    document.title = feedSiteName;
    entries = (feed.entries || []).slice();
    entries.forEach(function (e) { bySlug[e.slug] = e; });
    renderTOC();
    if (!route()) {
      var first = bySlug['about-this-site'] ? 'about-this-site' : (entries[0] && entries[0].slug);
      if (first) showPost(first);
    }
    // Places are only needed for the map / in-article place links; load quietly in background.
    loadScript('places.js').catch(function () { });
  }).catch(function () {
    detail.innerHTML = '<div class="rstatus">サイトのデータを読み込めませんでした。</div>';
  });
})();
