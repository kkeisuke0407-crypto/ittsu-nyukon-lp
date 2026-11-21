/* 一通入魂：炎と火の粉の描画
   [data-fx="fire"]   … WebGLでゆらぐ炎を描く（キャラや封筒の背後に置く）
     data-cx   炎の中心の横位置 0〜1（既定 .5）
     data-w    炎の横幅 0〜1（既定 .5）
     data-h    炎の高さ 0〜1（既定 .8）
   [data-embers="数"] … 光る火の粉を描く（セクション全体）
   [data-sparks="数"] … 尾を引いて飛ぶ火花を描く（セクション全体。中に炎があればそこから弾ける）
   画面外では止め、「動きを減らす」設定では1コマだけ描く */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* 見えている間だけ動かす */
  /* 画面外に出たら描画ループごと止め、戻ってきたら再開する（スマホの電池とCPUを使わない） */
  const vis = new WeakMap(), kick = new WeakMap();
  const vio = new IntersectionObserver(es => es.forEach(e => {
    vis.set(e.target, e.isIntersecting);
    if (e.isIntersecting && kick.has(e.target)) kick.get(e.target)();
  }), { rootMargin: '100px' });
  /* 要素ごとの描画ループ。draw(now) を毎コマ呼び、見えなくなったら止まる */
  function loop(el, draw) {
    let running = false;
    const frame = now => {
      if (vis.get(el) === false) { running = false; return; }
      draw(now);
      if (reduce) { running = false; return; }
      requestAnimationFrame(frame);
    };
    const start = () => { if (running) return; running = true; requestAnimationFrame(frame); };
    kick.set(el, start);
    vio.observe(el);
    start();
  }

  /* ---------- 炎（WebGL） ---------- */
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `
precision mediump float;
uniform vec2 r;uniform float t,cx,w,h;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  float asp=r.x/r.y;
  vec2 p=vec2((uv.x-cx)*asp,uv.y)*3.2;
  /* 上に流れる乱れ（ドメインワープ） */
  vec2 q=vec2(fbm(p+vec2(0.,-t*1.3)),fbm(p+vec2(4.7,-t*1.6)));
  float n=fbm(p*vec2(1.,.9)+q*1.9+vec2(0.,-t*2.4));
  float dx=abs(uv.x-cx+(q.x-.5)*.18*uv.y)/w;      /* 上ほど横に揺れる */
  float body=1.-dx*dx;                            /* 中央が高い焚き火の形 */
  float y=uv.y/h;
  float f=n*1.25+body*.62-y*1.32-.18;
  f=smoothstep(0.,.75,f);
  f=pow(f,1.25);
  vec3 c=vec3(.42,.03,.01);
  c=mix(c,vec3(.86,.16,.03),smoothstep(.04,.3,f));
  c=mix(c,vec3(1.,.47,.07),smoothstep(.28,.58,f));
  c=mix(c,vec3(1.,.8,.36),smoothstep(.55,.86,f));
  c=mix(c,vec3(1.,.95,.8),smoothstep(.92,1.05,f));
  float a=clamp(f*1.6,0.,1.);
  gl_FragColor=vec4(c*a,a);
}`;
  function initFire(el) {
    const cv = document.createElement('canvas');
    cv.className = 'fx fx--fire'; cv.setAttribute('aria-hidden', 'true');
    el.prepend(cv);
    const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) { el.classList.add('fx-fallback'); return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { el.classList.add('fx-fallback'); return; }
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const ur = U('r'), ut = U('t'), ucx = U('cx'), uw = U('w'), uh = U('h');
    gl.uniform1f(ucx, +(el.dataset.cx || .5)); gl.uniform1f(uw, +(el.dataset.w || .5)); gl.uniform1f(uh, +(el.dataset.h || .8));
    const SCALE = 0.6; /* 解像度を落として軽くする（ぼけが炎らしさにもなる） */
    function size() {
      const b = cv.getBoundingClientRect();
      cv.width = Math.max(2, Math.round(b.width * DPR * SCALE)); cv.height = Math.max(2, Math.round(b.height * DPR * SCALE));
      gl.viewport(0, 0, cv.width, cv.height); gl.uniform2f(ur, cv.width, cv.height);
    }
    size(); addEventListener('resize', size);
    const t0 = performance.now() - Math.random() * 10000;
    loop(el, now => {
      gl.uniform1f(ut, (now - t0) / 1000);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
  }

  /* ---------- 火の粉（Canvas 2D） ---------- */
  const sprite = (() => {
    const s = document.createElement('canvas'); s.width = s.height = 64;
    const g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(.18, 'rgba(255,200,90,.95)');
    gr.addColorStop(.42, 'rgba(255,110,20,.45)'); gr.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return s;
  })();
  function initEmbers(el) {
    const cv = document.createElement('canvas');
    cv.className = 'fx fx--embers'; cv.setAttribute('aria-hidden', 'true');
    el.prepend(cv);
    const g = cv.getContext('2d');
    let W = 0, H = 0;
    const count = +el.dataset.embers || 12;
    const ps = [];
    const spawn = (p, init) => {
      p.x = Math.random() * W; p.y = init ? Math.random() * H : H + 10;
      p.vy = 18 + Math.random() * 42; p.vx = (Math.random() - .5) * 10;
      p.r = 2 + Math.random() * 5; p.life = 0; p.max = 3 + Math.random() * 4;
      p.ph = Math.random() * 6.28; p.sw = 6 + Math.random() * 18;
      return p;
    };
    function size() {
      const b = el.getBoundingClientRect(); W = b.width; H = b.height;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    size(); addEventListener('resize', size);
    for (let i = 0; i < count; i++) ps.push(spawn({}, true));
    let last = performance.now();
    loop(el, now => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      {
        g.clearRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        for (const p of ps) {
          p.life += dt; p.y -= p.vy * dt; p.x += (p.vx + Math.sin(p.life * 2 + p.ph) * p.sw) * dt;
          const k = p.life / p.max;
          if (k >= 1 || p.y < -20) { spawn(p, false); continue; }
          const fl = .65 + .35 * Math.sin(p.life * 23 + p.ph);           /* ちらつき */
          const a = Math.min(1, k * 5) * (1 - k) * fl;
          const s = p.r * (1 - k * .5) * 4;
          g.globalAlpha = a;
          g.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
        }
        g.globalAlpha = 1;
      }
    });
  }

  /* ---------- 火花（Canvas 2D）：速く飛んで尾を引く。ときどき炎のあたりで弾ける ---------- */
  function initSparks(el) {
    const cv = document.createElement('canvas');
    cv.className = 'fx fx--sparks'; cv.setAttribute('aria-hidden', 'true');
    el.prepend(cv);
    const g = cv.getContext('2d');
    let W = 0, H = 0, src = null;
    const count = +el.dataset.sparks || 30;
    const ps = [];
    const fireEl = el.querySelector('[data-fx="fire"]');
    function size() {
      const b = el.getBoundingClientRect(); W = b.width; H = b.height;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); g.setTransform(DPR, 0, 0, DPR, 0, 0);
      if (fireEl) {
        const f = fireEl.getBoundingClientRect();
        src = { x: f.left - b.left + f.width * (+(fireEl.dataset.cx || .5)), y: f.top - b.top + f.height * .75, w: f.width * .35 };
      }
    }
    /* from: 'fire' 炎から / 'burst' 弾ける / それ以外は画面のどこかを横切る */
    const spawn = (p, from, ox, oy) => {
      if (from === 'burst') {
        const a = -Math.PI / 2 + (Math.random() - .5) * 2.6, v = 160 + Math.random() * 260;
        p.x = ox; p.y = oy; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
        p.max = .5 + Math.random() * .7;
      } else if (from === 'fire' && src) {
        p.x = src.x + (Math.random() - .5) * src.w; p.y = src.y - Math.random() * 40;
        p.vx = (Math.random() - .5) * 140; p.vy = -(160 + Math.random() * 260);
        p.max = .8 + Math.random() * 1.1;
      } else {
        p.x = Math.random() * W; p.y = H * (.25 + Math.random() * .8);
        p.vx = (Math.random() - .5) * 120; p.vy = -(120 + Math.random() * 240);
        p.max = .7 + Math.random() * 1.2;
      }
      p.life = 0; p.w = .8 + Math.random() * 1.6; p.ph = Math.random() * 6.28;
      p.hot = Math.random() < .35;
      return p;
    };
    size(); addEventListener('resize', size);
    for (let i = 0; i < count; i++) { const p = spawn({}, Math.random() < .5 ? 'fire' : 'any'); p.life = Math.random() * p.max; ps.push(p); }
    const bursts = [];
    let last = performance.now(), nextBurst = last + 600;
    loop(el, now => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      /* ときどき炎のあたりでパッと弾ける */
      if (src && now > nextBurst) {
        nextBurst = now + 900 + Math.random() * 1600;
        const ox = src.x + (Math.random() - .5) * src.w * 1.4, oy = src.y - 20 - Math.random() * src.w * .8;
        for (let i = 0, n = 8 + (Math.random() * 8 | 0); i < n; i++) bursts.push(spawn({}, 'burst', ox, oy));
      }
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      const draw = (p) => {
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1 || p.y < -30 || p.x < -30 || p.x > W + 30) return false;
        p.vx *= 1 - 1.2 * dt; p.vy = p.vy * (1 - .9 * dt) + 60 * dt;          /* 空気で減速し、少し落ちる */
        p.vx += Math.sin(p.life * 9 + p.ph) * 90 * dt;                        /* 熱で揺れる */
        p.x += p.vx * dt; p.y += p.vy * dt;
        const a = Math.min(1, k * 8) * (1 - k) * (.7 + .3 * Math.sin(p.life * 40 + p.ph));
        const tl = .045;                                                     /* 尾の長さ（秒ぶん） */
        g.globalAlpha = a;
        g.strokeStyle = p.hot ? 'rgb(255,236,180)' : 'rgb(255,150,40)';
        g.lineWidth = p.w;
        g.beginPath(); g.moveTo(p.x - p.vx * tl, p.y - p.vy * tl); g.lineTo(p.x, p.y); g.stroke();
        const s = p.w * 7;
        g.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
        return true;
      };
      for (const p of ps) if (!draw(p)) spawn(p, Math.random() < .55 ? 'fire' : 'any');
      for (let i = bursts.length - 1; i >= 0; i--) if (!draw(bursts[i])) bursts.splice(i, 1);
      g.globalAlpha = 1;
    });
  }

  document.querySelectorAll('[data-fx="fire"]').forEach(initFire);
  if (!reduce) document.querySelectorAll('[data-embers]').forEach(initEmbers);
  if (!reduce) document.querySelectorAll('[data-sparks]').forEach(initSparks);
})();
