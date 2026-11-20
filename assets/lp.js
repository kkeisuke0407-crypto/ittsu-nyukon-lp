/* アクセス数を数える。送り先は予約ツール（../予約ツール_GAS）のウェブアプリ。
   経路：URLの ?from=qr などの目印。目印がなければ、ほかのサイトから来たら web、直接なら direct。
   最初の経路を30日おぼえて、予約・申し込みにも付ける（集計は stats.html で見る）。
   ?nocount=1 を一度開いた端末は「test」として分けて数える（自分の確認用）。?nocount=0 で元に戻す */
const ITTSU = (() => {
  const API = 'https://script.google.com/macros/s/AKfycbxBJRm_ohJWD63o2AXTjYe5XmsFrlkCXiPk_2QnOeM6-oOwxNugMeikpqdvQPATlssT/exec';
  const q = new URLSearchParams(location.search);
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 保存できない端末はそのまま */ } },
  };
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const api = (local && q.get('bookapi')) || API;
  if (q.has('nocount')) ls.set('ittsu_nocount', q.get('nocount') === '0' ? null : '1');
  const test = ls.get('ittsu_nocount') === '1';

  let src = (q.get('from') || '').toLowerCase();
  if (!/^[a-z0-9_-]{1,20}$/.test(src)) src = '';
  if (q.has('from') || q.has('nocount')) {
    // 目印はURLから消す（ブックマークや共有で、同じ目印が数えられ続けないように）
    q.delete('from'); q.delete('nocount');
    const s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
  }
  let saved = null;
  try { saved = JSON.parse(ls.get('ittsu_src') || 'null'); } catch (e) { saved = null; }
  if (src) ls.set('ittsu_src', JSON.stringify({ src, t: Date.now() }));
  else if (saved && Date.now() - saved.t < 30 * 864e5) src = saved.src;
  else {
    const r = document.referrer;
    src = r && r.indexOf(location.origin) !== 0 ? 'web' : 'direct';
    ls.set('ittsu_src', JSON.stringify({ src, t: Date.now() }));
  }
  if (test) src = 'test';

  const send = (ev, extra) => {
    if (navigator.webdriver && !local) return; // 自動で動くブラウザ（巡回ロボットなど）は数えない
    const body = JSON.stringify(Object.assign({ kind: 'hit', ev, src }, extra || {}));
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(api, body)) return;
      fetch(api, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }).catch(() => {});
    } catch (e) { /* 数えられなくてもページは動かす */ }
  };

  // トップページを開いた回数と、その日はじめての訪問か
  const contact = document.getElementById('contact');
  if (contact) {
    const today = new Date().toLocaleDateString('sv'); // この端末の日付（YYYY-MM-DD）
    const first = ls.get('ittsu_day') !== today;
    ls.set('ittsu_day', today);
    send('pv', { u: first ? 1 : 0 });
    // 予約・申し込み欄まで見たか（1回の訪問で1回だけ）
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        if (!es.some(x => x.isIntersecting)) return;
        io.disconnect(); send('contact');
      }, { threshold: 0.15 });
      io.observe(contact);
    }
  }
  return { src };
})();

(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* 炎と火の粉は fx.js で描く */

  /* 見出しを1文字ずつに分ける（中のspanは残す） */
  $$('[data-split-io]').forEach(el => {
    let i = 0;
    el.setAttribute('aria-label', el.textContent);
    (function walk(node) {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          Array.from(n.textContent).forEach(ch => {
            const s = document.createElement('span');
            s.className = 'ch'; s.textContent = ch; s.style.setProperty('--i', i++);
            frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    })(el);
  });

  /* 流れる帯 */
  $$('[data-ticker]').forEach(t => { const one = `<span>${t.dataset.ticker}</span>`.repeat(8); t.innerHTML = one + one; });
  $$('[data-tags]').forEach(t => { const one = t.dataset.tags.split('|').map(s => `<span>${s}</span>`).join(''); t.innerHTML = one + one; });

  /* スクロールで表示 */
  /* 速いスクロールで一気に通り過ぎた要素（すでに画面より上）も表示済みにする */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting && e.boundingClientRect.top > 0) return;
    e.target.classList.add('is-in');
    io.unobserve(e.target);
  }), { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  $$('.rv,.svc__list,[data-split-io]').forEach(t => io.observe(t));
  $$('.svc__list li').forEach((li, i) => li.style.setProperty('--i', i));

  /* カルーセル（中央のカードを強調・自動送り・ドット） */
  function carousel(root, auto) {
    if (!root) return;
    const track = $('[class$="__track"]', root), cards = Array.from(track.children), dots = $('.dots', root);
    let cur = 0, timer, visible = false;
    const center = i => cards[i].offsetLeft + cards[i].offsetWidth / 2 - track.clientWidth / 2;
    const go = i => { cur = (i + cards.length) % cards.length; track.scrollTo({ left: center(cur), behavior: reduce ? 'auto' : 'smooth' }); };
    const restart = () => { clearInterval(timer); if (!reduce && auto) timer = setInterval(() => { if (!document.hidden && visible) go(cur + 1); }, auto); };
    cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', `${i + 1}枚目`);
      b.addEventListener('click', () => { go(i); restart(); });
      dots.appendChild(b);
      c.addEventListener('click', () => { go(i); restart(); });
    });
    const mark = () => {
      const mid = track.scrollLeft + track.clientWidth / 2;
      let best = 0, bd = Infinity;
      cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
      cur = best;
      cards.forEach((c, i) => c.classList.toggle('is-active', i === best));
      Array.from(dots.children).forEach((d, i) => d.setAttribute('aria-current', String(i === best)));
    };
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); }, { passive: true });
    $$('[data-dir]', root).forEach(b => b.addEventListener('click', () => { go(cur + +b.dataset.dir); restart(); }));
    ['pointerdown', 'touchstart', 'wheel'].forEach(ev => track.addEventListener(ev, restart, { passive: true }));
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(root);
    /* 横に並んだ画像は画面外のまま遅延読み込みが進まないので、カルーセルが近づいたらまとめて読む */
    const pre = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      pre.disconnect();
      $$('img[loading="lazy"]', root).forEach(img => { img.loading = 'eager'; });
    }, { rootMargin: '600px 0px' });
    pre.observe(root);
    addEventListener('resize', () => track.scrollTo({ left: center(cur) }));
    requestAnimationFrame(() => { track.scrollTo({ left: center(0) }); mark(); });
    restart();
  }
  /* LPチラシ見本：samples/samples.js から10枚のカードを作る。押すとA4の紙面を拡大表示 */
  const wt = $('#worksTrack');
  if (wt && window.SAMPLES) {
    const src = s => `samples/img/${s.id}.webp?v=3`;
    wt.innerHTML = SAMPLES.map((s, i) => `<button type="button" class="wcard" data-i="${i}" aria-label="${s.ind}の見本を拡大して見る">
      <span class="wcard__view"><img src="samples/img/thumb/${s.id}.webp?v=3" alt="" width="440" height="622" loading="lazy" decoding="async"><i class="wcard__zoom" aria-hidden="true"></i></span>
      <span class="wcard__no">SAMPLE ${String(i + 1).padStart(2, '0')}</span>
      <span class="wcard__ind">${s.ind}</span>
      <span class="wcard__h">${s.h1.replace(/<br>/g, '')}</span></button>`).join('');

    /* 拡大表示（閉じる：×・背景・Esc／前後：矢印ボタン・キー） */
    const box = document.createElement('div');
    box.className = 'zoom'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'チラシの見本');
    box.innerHTML = `<div class="zoom__bar"><p class="zoom__ttl"></p><button type="button" class="zoom__x" aria-label="閉じる">×</button></div>
      <div class="zoom__body"><img class="zoom__img" alt=""></div>
      <button type="button" class="zoom__nav zoom__nav--prev" data-step="-1" aria-label="前の見本">‹</button>
      <button type="button" class="zoom__nav zoom__nav--next" data-step="1" aria-label="次の見本">›</button>
      <p class="zoom__note">会社名・サービス名・条件は架空の例です</p>`;
    document.body.appendChild(box);
    const img = $('.zoom__img', box), ttl = $('.zoom__ttl', box), body = $('.zoom__body', box);
    let at = 0, back = null;
    const show = i => {
      at = (i + SAMPLES.length) % SAMPLES.length;
      const s = SAMPLES[at];
      img.src = src(s); img.alt = `${s.ind}（${s.name}）のA4チラシの見本`;
      ttl.textContent = `SAMPLE ${String(at + 1).padStart(2, '0')}　${s.ind}`;
      body.scrollTop = 0;
    };
    const open = i => { back = document.activeElement; show(i); box.hidden = false; document.documentElement.classList.add('is-zoom'); $('.zoom__x', box).focus(); };
    const close = () => { box.hidden = true; document.documentElement.classList.remove('is-zoom'); back && back.focus(); };
    wt.addEventListener('click', e => { const c = e.target.closest('.wcard'); if (c) open(+c.dataset.i); });
    $('.zoom__x', box).addEventListener('click', close);
    box.addEventListener('click', e => { if (e.target === box || e.target === body) close(); });
    $$('.zoom__nav', box).forEach(b => b.addEventListener('click', () => show(at + +b.dataset.step)));
    addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(at + 1);
      if (e.key === 'ArrowLeft') show(at - 1);
    });
  }
  carousel($('[data-carousel="works"]'), 3600);
  carousel($('[data-carousel="scene"]'), 4200);
  carousel($('[data-carousel="case"]'), 0); /* 事例は読む量が多いので自動送りしない */

  /* スクロール連動：理由の進み具合・流れのライン・追従CTA・目次 */
  const rail = $('.flow__rail'), flowList = $('.flow__steps'), steps = $$('.step');
  const reasons = $$('[data-reason]'), fiveDots = $$('.five__list span');
  const fv = $('.fv'), stick = $('#stick'), close = $('#contact');
  const sections = $$('[data-index]'), index = $('#index');
  if (!index || !flowList || !fv || !stick || !close) return; /* サブページでは以下を使わない */
  sections.forEach((s, i) => {
    if (!s.id) s.id = 'sec-' + i;
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${s.id}">${s.dataset.index}</a>`;
    index.appendChild(li);
  });
  const links = $$('a', index);
  function onScroll() {
    const vh = innerHeight, r = flowList.getBoundingClientRect();
    rail.style.setProperty('--p', Math.max(0, Math.min(1, (vh * 0.6 - r.top) / r.height)).toFixed(3));
    steps.forEach(s => s.classList.toggle('is-lit', s.getBoundingClientRect().top < vh * (s.classList.contains('step--goal') ? 0.5 : 0.6)));
    let seen = -1;
    reasons.forEach((p, i) => { if (p.getBoundingClientRect().top < vh * 0.7) seen = i; });
    fiveDots.forEach((d, i) => d.classList.toggle('is-on', i <= seen));
    /* FVを過ぎたら出し、申込欄が画面の7割まで来たら消す */
    stick.classList.toggle('is-on', fv.getBoundingClientRect().bottom < 0 && close.getBoundingClientRect().top > vh * 0.7);
    let cur = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top < vh * 0.4) cur = i; });
    links.forEach((a, i) => a.classList.toggle('is-current', i === cur));
  }
  let ticking = false;
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { onScroll(); ticking = false; }); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

})();

/* ヤギ（FV・中間CTA・固定ボタン）：タップ（クリック）すると大きく跳ねる */
document.querySelectorAll('.char--hero, .char--must, .stick__goat').forEach(el => {
  el.addEventListener('click', () => {
    el.classList.remove('is-hop'); void el.offsetWidth; el.classList.add('is-hop');
  });
  el.addEventListener('animationend', e => { if (e.animationName === 'hop') el.classList.remove('is-hop'); });
});

/* 申し込み・問い合わせのフォーム。予約と同じ受付（../予約ツール_GAS、#book の data-api）へ送り、受け付けたら thanks.html へ */
document.querySelectorAll('form[data-apply], form[data-inquiry]').forEach(f => {
  const kind = f.hasAttribute('data-inquiry') ? 'inquiry' : 'apply';
  const bookEl = document.getElementById('book');
  const dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('bookapi');
  const api = dev || (bookEl && bookEl.dataset.api) || '';
  const btn = f.querySelector('button[type="submit"]');
  const label = btn.textContent;
  const msg = document.createElement('p');
  msg.className = 'bk-err'; msg.setAttribute('role', 'alert'); msg.hidden = true;
  btn.before(msg);
  const say = t => { msg.textContent = t; msg.hidden = !t; if (t) msg.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const g = k => (f.elements[k] && f.elements[k].value || '').trim();
  f.addEventListener('change', () => { if (!msg.hidden) say(''); });
  f.addEventListener('submit', e => {
    e.preventDefault();
    const bad = kind === 'apply' && (!g('company') || !g('name')) ? '会社名とお名前を入れてください。'
      : kind === 'inquiry' && !g('name') ? 'お名前を入れてください。'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g('email')) ? 'メールアドレスを確かめてください。'
      : kind === 'inquiry' && !g('note') ? 'お問い合わせ内容を入れてください。'
      : !f.elements.agree.checked ? 'プライバシーポリシーへの同意が必要です。' : '';
    if (bad) { say(bad); return; }
    if (!api) { say('受付は準備中です。お手数ですが「無料相談を予約」からご連絡ください。'); return; }
    say('');
    btn.disabled = true; btn.textContent = '送信しています…';
    const body = { kind, agree: true, website: g('website'), src: ITTSU.src };
    (kind === 'inquiry' ? ['company', 'name', 'email', 'note'] : ['company', 'name', 'email', 'tel', 'volume', 'plan', 'list', 'when', 'code', 'note']).forEach(k => { body[k] = g(k); });
    fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(r => r.json()).then(j => {
        if (j.ok) { location.href = 'thanks.html?type=' + kind; return; }
        say(j.error || '送信できませんでした。もう一度お試しください。');
        btn.disabled = false; btn.textContent = label;
      })
      .catch(() => { say('通信できませんでした。電波のよい所でもう一度お試しください。'); btn.disabled = false; btn.textContent = label; });
  });
});

/* 予約・申し込み・問い合わせのタブ。ページ内のボタン（data-open="book" / "apply" / "inquiry"）や、URLの #inquiry からも切り替える */
(() => {
  const tabs = Array.from(document.querySelectorAll('#ctab [role="tab"]'));
  if (!tabs.length) return;
  const show = id => tabs.forEach(t => {
    const on = t.id === 'tab-' + id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.id.slice(4)));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      show(n.id.slice(4)); n.focus();
    });
  });
  document.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', () => show(a.dataset.open)));
  if (location.hash === '#inquiry') { show('inquiry'); document.getElementById('ctab').scrollIntoView({ block: 'start' }); }

  /* 無料相談の予約。自前の予約ツール（../予約ツール_GAS、Google Apps Script）から空き日時をもらい、
     選んだ枠でGoogleカレンダーに予定を入れる。オンラインはGoogle Meetのリンクが自動で付く。
     #book の data-api に、デプロイしたウェブアプリのURL（…/exec）を入れると動く */
  const book = document.getElementById('book');
  const ways = Array.from(document.querySelectorAll('.way__btn'));
  if (!book) return;
  const dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('bookapi');
  const api = dev || book.dataset.api || '';
  const WEEK = '日月火水木金土';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wd = ymd => { const [y, m, d] = ymd.split('-').map(Number); return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
  const md = ymd => { const [, m, d] = ymd.split('-').map(Number); return { m, d }; };
  const addMin = (hm, n) => { const t = +hm.slice(0, 2) * 60 + +hm.slice(3) + n; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  const when = (ymd, hm) => { const { m, d } = md(ymd); return `${m}月${d}日（${wd(ymd)}）${hm}〜${addMin(hm, st.minutes)}`; };

  const st = { way: 'online', days: null, minutes: 30, day: null, time: null, msg: '', input: {} };

  const toApply = () => { show('apply'); document.getElementById('pane-apply').scrollIntoView({ block: 'start' }); };
  const note = (html, retry) => {
    book.innerHTML = `<p class="book__wait">${html}<br><button type="button" data-act="apply">申し込むへ</button>${retry ? ' <button type="button" data-act="retry">読み込み直す</button>' : ''}</p>`;
  };

  const load = () => {
    book.innerHTML = '<p class="book__wait">空いている日時を読み込んでいます…</p>';
    return fetch(api, { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (!j.ok) throw new Error(j.error || '');
      st.days = j.days || []; st.minutes = j.minutes || 30;
      if (!st.days.some(x => x.date === st.day)) { st.day = st.days[0] ? st.days[0].date : null; st.time = null; }
      draw();
    }).catch(() => note('予約できる日時を読み込めませんでした。<br>時間をおいて開き直すか、「申し込む」からご連絡ください。', true));
  };

  const draw = () => {
    if (!api) { note('予約カレンダーは準備中です。<br>お手数ですが「申し込む」からご連絡ください。'); return; }
    if (!st.days) { load(); return; }
    if (!st.days.length) { note('いま予約できる日時がありません。<br>お手数ですが「申し込む」からご連絡ください。'); return; }
    const err = st.msg ? `<p class="bk-err" role="alert">${esc(st.msg)}</p>` : '';
    if (!st.time) {
      const cur = st.days.find(x => x.date === st.day) || st.days[0];
      book.innerHTML = `${err}<p class="bk-h">1. 日にちを選ぶ</p>
        <div class="bk-days">${st.days.map(x => { const { m, d } = md(x.date); return `<button type="button" class="bk-day" data-day="${x.date}" aria-pressed="${x.date === cur.date}">${m}/${d}<small>（${wd(x.date)}）</small></button>`; }).join('')}</div>
        <p class="bk-h">2. 時間を選ぶ<small>${st.minutes}分間</small></p>
        <div class="bk-times">${cur.slots.map(t => `<button type="button" class="bk-time" data-time="${t}">${t}</button>`).join('')}</div>`;
      const on = book.querySelector('.bk-day[aria-pressed="true"]');
      if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const v = k => esc(st.input[k] || '');
    const phone = st.way === 'phone';
    book.innerHTML = `<div class="bk-sel"><p><small>${phone ? 'お電話' : 'オンライン（Google Meet）'}</small>${(() => { const { m, d } = md(st.day); return `${m}月${d}日（${wd(st.day)}）<br>${st.time}〜${addMin(st.time, st.minutes)}`; })()}</p><button type="button" data-act="back">日時を変える</button></div>${err}
      <form class="form bk-form" novalidate>
        <label>会社名<em>必須</em><input type="text" name="company" autocomplete="organization" maxlength="100" required value="${v('company')}"></label>
        <label>お名前<em>必須</em><input type="text" name="name" autocomplete="name" maxlength="60" required value="${v('name')}"></label>
        <label>メールアドレス<em>必須</em><input type="email" name="email" autocomplete="email" maxlength="200" required value="${v('email')}"></label>
        <label>電話番号${phone ? '<em>必須</em>' : ''}<input type="tel" name="tel" autocomplete="tel" maxlength="30" ${phone ? 'required' : ''} value="${v('tel')}"></label>
        <label>相談したいこと<textarea name="note" rows="3" maxlength="1000" placeholder="売りたいサービスや、送りたい相手など">${v('note')}</textarea></label>
        <label>特典コード<input type="text" name="code" autocomplete="off" maxlength="30" placeholder="チラシをお持ちの方のみ" value="${v('code')}"></label>
        <label class="bk-hp" aria-hidden="true">ホームページ<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        <label class="form__agree"><input type="checkbox" name="agree" required ${st.input.agree ? 'checked' : ''}><span><a href="privacy.html">プライバシーポリシー</a>に同意する</span></label>
        <button class="btn btn--fire" type="submit">この日時で予約する</button>
        <p class="form__note">${phone ? 'ご予約の日時に、こちらからお電話します。' : 'Google Meetのリンクを、招待メールでお送りします。'}</p>
      </form>`;
  };

  const keep = () => {
    const f = book.querySelector('.bk-form');
    if (!f) return;
    ['company', 'name', 'email', 'tel', 'note', 'code'].forEach(k => { st.input[k] = f.elements[k].value; });
    st.input.agree = f.elements.agree.checked;
  };

  const check = f => {
    const g = k => f.elements[k].value.trim();
    if (!g('company') || !g('name')) return '会社名とお名前を入れてください。';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g('email'))) return 'メールアドレスを確かめてください。';
    if (st.way === 'phone' && g('tel').replace(/\D/g, '').length < 10) return 'お電話の相談は、電話番号を入れてください。';
    if (!f.elements.agree.checked) return 'プライバシーポリシーへの同意が必要です。';
    return '';
  };

  book.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !book.contains(b)) return;
    if (b.dataset.day) { st.day = b.dataset.day; st.msg = ''; draw(); }
    else if (b.dataset.time) { st.time = b.dataset.time; st.msg = ''; draw(); book.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    else if (b.dataset.act === 'back') { keep(); st.time = null; st.msg = ''; draw(); }
    else if (b.dataset.act === 'apply') toApply();
    else if (b.dataset.act === 'retry') { st.days = null; draw(); }
  });

  book.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    keep();
    const bad = check(f);
    if (bad) { st.msg = bad; draw(); return; }
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '予約しています…';
    const body = { way: st.way, date: st.day, time: st.time, agree: true, website: f.elements.website.value, src: ITTSU.src };
    ['company', 'name', 'email', 'tel', 'note', 'code'].forEach(k => { body[k] = f.elements[k].value.trim(); });
    fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(r => r.json()).then(j => {
        if (j.ok) { location.href = `thanks.html?type=book&way=${st.way}&at=${encodeURIComponent(when(st.day, st.time))}`; return; }
        st.msg = j.error || '予約できませんでした。もう一度お試しください。';
        if (j.taken) { st.time = null; st.days = null; load().then(() => { st.msg = j.error; draw(); }); return; }
        draw();
      })
      .catch(() => { st.msg = '通信できませんでした。電波のよい所でもう一度お試しください。'; draw(); });
  });

  ways.forEach(b => b.addEventListener('click', () => {
    keep();
    st.way = b.dataset.way; st.msg = '';
    ways.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  }));
  // 空き日時は、予約欄が近づいてから読み込む（ページを開いただけで予約ツールを呼ばない）
  if (api && 'IntersectionObserver' in window) {
    book.innerHTML = '<p class="book__wait">空いている日時を読み込んでいます…</p>';
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); draw(); } }, { rootMargin: '800px 0px' });
    io.observe(book);
  } else draw();
})();
