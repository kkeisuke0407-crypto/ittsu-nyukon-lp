(() => {
  document.documentElement.classList.add('js');
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
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
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
    addEventListener('resize', () => track.scrollTo({ left: center(cur) }));
    requestAnimationFrame(() => { track.scrollTo({ left: center(0) }); mark(); });
    restart();
  }
  /* LPチラシ見本：samples/samples.js から10枚のカードを作る。押すとA4の紙面を拡大表示 */
  const wt = $('#worksTrack');
  if (wt && window.SAMPLES) {
    const src = s => `samples/img/${s.id}.jpg`;
    wt.innerHTML = SAMPLES.map((s, i) => `<button type="button" class="wcard" data-i="${i}" aria-label="${s.ind}の見本を拡大して見る">
      <span class="wcard__view"><img src="samples/img/thumb/${s.id}.jpg" alt="" loading="lazy" decoding="async"><i class="wcard__zoom" aria-hidden="true"></i></span>
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

/* キャラ画像：assets/img/<data-img>.png を置くと、枠が画像に替わる（無ければ枠のまま） */
document.querySelectorAll('.char[data-img]').forEach(el => {
  const img = new Image();
  img.alt = ''; img.width = 690; img.height = 941; img.decoding = 'async';
  img.onload = () => { const s = el.querySelector('.slot'); if (s) s.replaceWith(img); else el.append(img); };
  img.src = `assets/img/${el.dataset.img}.png`;
});
/* ヤギ（FV・中間CTA・固定ボタン）：タップ（クリック）すると大きく跳ねる */
document.querySelectorAll('.char--hero, .char--must, .stick__goat').forEach(el => {
  el.addEventListener('click', () => {
    el.classList.remove('is-hop'); void el.offsetWidth; el.classList.add('is-hop');
  });
  el.addEventListener('animationend', e => { if (e.animationName === 'hop') el.classList.remove('is-hop'); });
});

/* 画像枠：data-src のファイルを置くと、枠が画像に替わる（無ければ枠のまま）。
   枠の種類（slot--env など）は ph--env として画像に引き継ぎ、縦横比と見た目をそろえる */
/* 画面に近づいた枠から読み込む（ページ外の Image に loading=lazy を付けると読み込まれないため、自前で遅延） */
(() => {
  const swap = s => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      img.alt = s.dataset.alt || '';
      img.width = img.naturalWidth; img.height = img.naturalHeight;
      img.className = ['ph', ...[...s.classList].filter(c => c.startsWith('slot--')).map(c => 'ph--' + c.slice(6))].join(' ');
      s.replaceWith(img);
    };
    img.src = s.dataset.src;
  };
  /* 横スクロールの中の枠は画面外のまま交差しないので、セクション単位で見て、近づいたら中の枠をまとめて読む */
  const groups = new Map();
  document.querySelectorAll('.slot[data-src]').forEach(s => {
    const g = s.closest('section') || s.parentElement;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  });
  if (!('IntersectionObserver' in window)) { groups.forEach(list => list.forEach(swap)); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { io.unobserve(e.target); groups.get(e.target).forEach(swap); }
  }), { rootMargin: '800px 0px' });
  groups.forEach((_, g) => io.observe(g));
})();

/* フォームの送信先は未設定（決まったら action を設定してこの処理を外す） */
document.querySelectorAll('form[data-placeholder]').forEach(f => f.addEventListener('submit', e => {
  e.preventDefault();
  alert('フォームの送信先はまだ設定されていません。送信後は thanks.html に移る想定です。');
}));

/* 予約・申し込みのタブ。ページ内のボタン（data-open="book" / "apply"）からも切り替える */
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

  /* 予約カレンダー（TimeRex）。#book の data-url-online / data-url-phone に予約ページのURLを入れると表示される。
     TimeRexの埋め込みは1ページに1つなので、方法を切り替えるたびに読み込み直す */
  const book = document.getElementById('book');
  const ways = Array.from(document.querySelectorAll('.way__btn'));
  if (!book) return;
  let scriptLoaded = null;
  const loadScript = () => scriptLoaded || (scriptLoaded = new Promise((ok, ng) => {
    const sc = document.createElement('script');
    sc.id = 'timerex_embed'; sc.src = 'https://asset.timerex.net/js/embed.js';
    sc.onload = ok; sc.onerror = ng;
    document.body.appendChild(sc);
  }));
  const render = way => {
    ways.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.way === way)));
    const url = book.dataset[way === 'phone' ? 'urlPhone' : 'urlOnline'];
    book.textContent = '';
    if (!url) {
      book.innerHTML = '<p class="book__wait">予約カレンダーは準備中です。<br>お手数ですが「申し込む」からご連絡ください。<br><button type="button">申し込むへ</button></p>';
      book.querySelector('button').addEventListener('click', () => show('apply'));
      return;
    }
    const box = document.createElement('div');
    box.id = 'timerex_calendar'; box.dataset.url = url;
    book.appendChild(box);
    loadScript().then(() => window.TimerexCalendar && window.TimerexCalendar({
      onBookingComplete: () => { location.href = 'thanks.html?type=book&way=' + way; }
    })).catch(() => {
      book.innerHTML = '<p class="book__wait">予約カレンダーを読み込めませんでした。<br>時間をおいて開き直すか、「申し込む」からご連絡ください。</p>';
    });
  };
  ways.forEach(b => b.addEventListener('click', () => render(b.dataset.way)));
  render('online');
})();
