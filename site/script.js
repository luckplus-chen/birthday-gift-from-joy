/**
 * script.js — 场景流程 + 交互
 * 文案全部来自 content.js，这里只管行为。
 *
 * 流程：lock → letter → cake → celebrate → gift → pet
 */
(function () {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const SCENES = ["lock", "letter", "match", "cake", "celebrate", "dark", "gift"];
  const STEP_LABEL = {
    lock: "01 / 门", letter: "02 / 信", match: "03 / 火柴",
    cake: "04 / 蛋糕", celebrate: "05 / 生日", dark: "06 / 黑", gift: "07 / 礼物",
  };
  /* 每一幕配哪首歌。留空 = 沿用上一首 */
  /* 每一幕配哪首歌。没列出来的 = 沿用上一首。
     摸黑和刚进礼物那会儿故意不换，等盒子真的打开才切到礼物那首，
     因为文件名写的是"开礼物之后"。 */
  const SCENE_TRACK = {
    letter: "letter", match: "letter",
    cake: "cake", celebrate: "cake",
  };
  const FIRST_BACKABLE = 1;   // 密码那步不给回退

  let scene = "lock";

  /* =========================================================
     场景切换
  ========================================================= */
  function go(name) {
    $$(".scene").forEach((s) => s.classList.remove("is-active"));
    const el = $(`.scene[data-scene="${name}"]`);
    if (!el) return;
    el.classList.add("is-active");
    el.scrollTop = 0;
    scene = name;
    $("#hud-step").textContent = STEP_LABEL[name] || "";
    if (name !== "celebrate") stopConfetti();
    if (name !== "letter") $("#hint").classList.remove("on-light");
    const idx = SCENES.indexOf(name);
    $("#hud-back").classList.toggle("is-visible", idx > FIRST_BACKABLE);
    clearHint();
    onEnter(name);
  }

  function onEnter(name) {
    if (name === "lock")      enterLock();
    if (name === "letter")    enterLetter();
    if (name === "match")     enterMatch();
    if (name === "cake")      enterCake();
    if (name === "celebrate") enterCelebrate();
    if (name === "dark")      enterDark();
    if (name === "gift")      enterGift();
    switchTrack(SCENE_TRACK[name]);
  }

  /* 返回上一步 */
  $("#hud-back").addEventListener("click", () => {
    const i = SCENES.indexOf(scene);
    if (i > FIRST_BACKABLE) go(SCENES[i - 1]);
  });

  /* =========================================================
     引导提示：闲着不动就在该点的地方弹小气泡
  ========================================================= */
  let hintTimer = null, hintTarget = null, hintText = "", hintBelow = false;

  function armHint(targetEl, text, preferBelow) {
    disarmHint();
    hintTarget = targetEl;
    hintText = text;
    hintBelow = !!preferBelow;
    hintTimer = setTimeout(showHint, CONTENT.hints.delay);
  }

  function disarmHint() {
    clearTimeout(hintTimer);
    hintTimer = null;
  }

  function clearHint() {
    disarmHint();
    cancelAnimationFrame(hintRAF);
    $("#hint").classList.remove("is-on");
    hintTarget?.classList?.remove("is-pulsing");
    hintTarget = null;
  }

  let hintRAF = null;

  function showHint() {
    if (!hintTarget || !document.body.contains(hintTarget)) return;
    const hint = $("#hint");
    $("#hint-text").textContent = hintText;
    hint.classList.add("is-on");
    hintTarget.classList.add("hot", "is-pulsing");
    positionLoop();
  }

  /* 位置每帧跟着目标走。
     字体加载完、窗口缩放、内容滚动都会让目标移位，
     只量一次的话气泡会飘到角落里去。 */
  function positionLoop() {
    cancelAnimationFrame(hintRAF);
    const hint = $("#hint");
    const step = () => {
      if (!hint.classList.contains("is-on") || !hintTarget) return;
      const r = hintTarget.getBoundingClientRect();
      if (r.width || r.height) {
        const hw = hint.offsetWidth, hh = hint.offsetHeight;
        let top = r.top - hh - 14;
        const below = hintBelow || top < 78;
        if (below) top = Math.min(r.bottom + 14, innerHeight - hh - 12);
        let left = r.left + r.width / 2 - hw / 2;
        left = Math.max(12, Math.min(left, innerWidth - hw - 12));
        hint.style.left = left + "px";
        hint.style.top = top + "px";
        hint.classList.toggle("is-below", below);
      }
      hintRAF = requestAnimationFrame(step);
    };
    step();
  }

  // 任何动作都把提示推迟
  ["mousemove", "keydown", "click", "wheel", "touchstart"].forEach((ev) =>
    addEventListener(ev, () => {
      if ($("#hint").classList.contains("is-on")) clearHintSoft();
      if (hintTarget) { disarmHint(); hintTimer = setTimeout(showHint, CONTENT.hints.delay); }
    }, { passive: true })
  );
  function clearHintSoft() {
    cancelAnimationFrame(hintRAF);
    $("#hint").classList.remove("is-on");
    hintTarget?.classList?.remove("is-pulsing");
  }

  /* =========================================================
     1. 密码
  ========================================================= */
  function initLock() {
    const boxes = $$(".lock__box");
    const row = $("#lock-pass");
    const hint = $("#lock-hint");
    let wrong = 0;

    boxes.forEach((b, i) => {
      b.addEventListener("input", () => {
        b.value = b.value.toUpperCase().replace(/[^A-Z]/g, "");
        if (b.value && i < boxes.length - 1) boxes[i + 1].focus();
        check();
      });
      b.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !b.value && i > 0) boxes[i - 1].focus();
        if (e.key === "Enter") check(true);
      });
    });

    function check(force) {
      const v = boxes.map((b) => b.value).join("");
      if (v.length < 4 && !force) return;
      if (v.toUpperCase() === CONTENT.lock.password.toUpperCase()) pass();
      else if (v.length === 4) fail();
    }

    function fail() {
      wrong++;
      row.classList.add("is-bad");
      setTimeout(() => row.classList.remove("is-bad"), 420);
      const lines = CONTENT.lock.wrongLines;
      if (lines.length) {
        hint.textContent = lines[Math.min(wrong - 1, lines.length - 1)];
        hint.classList.add("is-on");
      }
      setTimeout(() => { boxes.forEach((b) => (b.value = "")); boxes[0].focus(); }, 260);
    }

    function pass() {
      boxes.forEach((b) => b.blur());
      clearHint();
      hint.style.color = "var(--accent)";
      hint.textContent = CONTENT.lock.success;
      hint.classList.add("is-on");
      if (anyTrack() && CONTENT.bgm.autoplay) { bgmOn = true; $("#bgm-btn").classList.remove("is-off"); }
      setTimeout(() => go("letter"), 1800);
    }

    setTimeout(() => boxes[0].focus(), 500);
  }

  /* go("lock") 会 clearHint()，所以提示要在进入场景之后再挂 */
  function enterLock() {
    armHint($(".lock__box"), CONTENT.hints.lock);
  }

  /* =========================================================
     2. 信
  ========================================================= */
  let letterReady = false;

  function renderLetter() {
    const body = CONTENT.letter.paragraphs
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
    // 落款单独一块，靠右顶格，跟正文分开
    const sign = (CONTENT.letter.signature || []).length
      ? `<div class="paper__sign">` +
        CONTENT.letter.signature.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
        `</div>`
      : "";
    $("#paper-inner").innerHTML = body + sign;
    $("#roll-cue").textContent = CONTENT.roll.cue;
  }

  let cueTimer = null;
  let letterScroll = null;

  function enterLetter() {
    letterReady = false;
    const sc = $('.scene[data-scene="letter"]');
    $("#roll-cue").classList.remove("is-on");
    $("#scroll-cue").classList.remove("is-hidden");
    $(".letter-wrap").classList.remove("is-rolling", "is-rolled");
    $("#rod-bottom").classList.remove("is-on");
    $("#paper").style.maxHeight = "";
    clearTimeout(cueTimer);

    armHint(sc, CONTENT.hints.letter);
    $("#hint").classList.add("on-light");

    const onScroll = () => {
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 40;
      $("#scroll-cue").classList.toggle("is-hidden", sc.scrollTop > 40);

      // 到底之后不立刻蹦出来——等他停下来 2.4 秒，那行字才慢慢浮现
      clearTimeout(cueTimer);
      if (atBottom && !letterReady) {
        cueTimer = setTimeout(() => {
          letterReady = true;
          $("#roll-cue").classList.add("is-on");
          clearHint();   // 那行字本身就是提示了，不用再叠一个
        }, 2400);
      }
    };
    // 每次进这一幕都会挂一个监听，回退再进来就会越堆越多，先把上一个摘掉
    if (letterScroll) sc.removeEventListener("scroll", letterScroll);
    letterScroll = onScroll;
    sc.addEventListener("scroll", onScroll, { passive: true });
    setTimeout(onScroll, 1200);   // 信短到不用滚的情况
  }

  $("#roll-cue").addEventListener("click", rollUp);

  function rollUp() {
    if (!letterReady) return;
    letterReady = false;
    clearHint();
    clearTimeout(cueTimer);
    const sc = $('.scene[data-scene="letter"]');
    const wrap = $(".letter-wrap");
    const paper = $("#paper");

    $("#roll-cue").classList.remove("is-on");
    $("#scroll-cue").classList.add("is-hidden");
    sc.scrollTo({ top: 0, behavior: "smooth" });

    setTimeout(() => {
      paper.style.maxHeight = paper.scrollHeight + "px";
      $("#rod-bottom").classList.add("is-on");
      requestAnimationFrame(() => wrap.classList.add("is-rolling"));
    }, 620);

    setTimeout(() => wrap.classList.add("is-rolled"), 2150);
    setTimeout(() => go("match"), 3050);
  }

  /* =========================================================
     3. 火柴过场
  ========================================================= */
  let matchLit = false;

  function enterMatch() {
    matchLit = false;
    const m = $("#match");
    m.classList.remove("is-lit", "is-striking");
    $("#match-line1").textContent = CONTENT.match.line1;
    $("#match-line2").textContent = CONTENT.match.line2;
    $("#match-cue").textContent = CONTENT.match.cue;
    $("#match-cue").style.opacity = "";
    ["#match-line1", "#match-line2"].forEach((x) => $(x).classList.remove("is-on"));

    setTimeout(() => $("#match-line1").classList.add("is-on"), 350);
    setTimeout(() => $("#match-line2").classList.add("is-on"), 1200);
    armHint(m, CONTENT.hints.match, true);
  }

  /* 划火柴：横向拖一下点燃；直接点也行 */
  (function initMatch() {
    const m = $("#match");
    let downX = null;

    const start = (e) => {
      if (matchLit) return;
      downX = (e.touches ? e.touches[0] : e).clientX;
    };
    const move = (e) => {
      if (matchLit || downX === null) return;
      const x = (e.touches ? e.touches[0] : e).clientX;
      if (Math.abs(x - downX) > 46) { downX = null; strike(); }
    };
    const end = () => { downX = null; };

    m.addEventListener("mousedown", start);
    m.addEventListener("mousemove", move);
    m.addEventListener("mouseup", end);
    m.addEventListener("mouseleave", end);
    m.addEventListener("touchstart", start, { passive: true });
    m.addEventListener("touchmove", move, { passive: true });
    m.addEventListener("touchend", end);
    m.addEventListener("click", () => { if (!matchLit) strike(); });
  })();

  function strike() {
    if (matchLit) return;
    matchLit = true;
    clearHint();
    const m = $("#match");
    m.classList.add("is-striking");
    setTimeout(() => {
      m.classList.remove("is-striking");
      m.classList.add("is-lit");
      $("#match-cue").textContent = CONTENT.match.lit;
      $("#match-cue").style.opacity = ".85";
    }, 340);
    setTimeout(() => go("cake"), 2100);
  }

  /* =========================================================
     3. 蛋糕
  ========================================================= */
  let candleOut = false, micStream = null;

  function buildCake() {
    const art = $("#cake-art");
    const C = CONTENT.cake;

    // 蛋糕本体：有图用图，没图用画的占位
    const body = C.img
      ? `<img src="${C.img}" alt="">`
      : `<svg viewBox="0 0 320 220" fill="none">
           <ellipse cx="160" cy="196" rx="132" ry="17" fill="rgba(0,0,0,.28)"/>
           <rect x="34" y="120" width="252" height="72" rx="12" fill="#c98b5e" stroke="#8f5a34" stroke-width="3"/>
           <rect x="56" y="72" width="208" height="56" rx="10" fill="#dda06e" stroke="#8f5a34" stroke-width="3"/>
           <circle cx="96" cy="112" r="5" fill="#d4695e"/><circle cx="160" cy="108" r="5" fill="#78a86a"/>
           <circle cx="224" cy="112" r="5" fill="#d4695e"/>
         </svg>`;

    /* 火苗。蛋糕图自带数字蜡烛，所以这里只画火苗，
       按百分比钉在每根蜡烛的顶端。 */
    const H = C.flameSize || 46;
    const W = Math.round(H * 0.62);
    const flames = (C.flames || []).map((f, i) => {
      const s2 = i % 2 ? "--b" : "";
      return `
      <span class="flame-unit" style="left:${f.x}%; top:${f.y}%; width:${W}px">
        <svg viewBox="0 0 40 62" style="width:${W}px; height:${H}px">
          <ellipse class="halo halo${s2}" cx="20" cy="26" rx="19" ry="24"
                   fill="var(--accent)" opacity=".55" style="filter:blur(9px)"/>
          <path class="smoke smoke${s2}" d="M20 26 C14 16 26 9 20 1"
                stroke="rgba(255,240,220,.65)" stroke-width="2.4" stroke-linecap="round" fill="none"/>
          <g class="flame flame${s2}">
            <path d="M20 4 C31 20 29 34 20 44 C11 34 9 20 20 4 Z" fill="var(--accent)"/>
            <path d="M20 17 C26 27 25 35 20 41 C15 35 14 27 20 17 Z" fill="#fff7e4" opacity=".95"/>
          </g>
        </svg>
      </span>`;
    }).join("");

    art.innerHTML = body + flames;
  }

  let wishDone = false;

  function enterCake() {
    candleOut = false;
    wishDone = false;
    $("#cake").classList.remove("is-out");
    $("#cake-line").textContent = CONTENT.cake.found;
    $("#cake-wish").textContent = CONTENT.cake.wish;
    $("#wish-done").textContent = CONTENT.cake.wished;
    $("#cake-sub").textContent = CONTENT.cake.sub;
    $("#mic-btn").classList.remove("is-listening");
    $("#mic-btn").textContent = "…或者对着麦克风真的吹";

    // 许愿阶段：先藏起"吹"的相关提示
    ["#cake-line", "#cake-wish"].forEach((x) => $(x).classList.remove("is-on"));
    $("#wish-done").classList.remove("is-on", "is-gone");
    $("#cake-sub").style.opacity = "0";
    $("#mic-btn").style.opacity = "0";
    $("#mic-btn").style.pointerEvents = "none";

    setTimeout(() => $("#cake-line").classList.add("is-on"), 400);
    setTimeout(() => $("#cake-wish").classList.add("is-on"), 1800);
    setTimeout(() => {
      $("#wish-done").classList.add("is-on");
      armHint($("#wish-done"), CONTENT.hints.wish, true);
    }, 3400);
  }

  /* 许好愿了 → 才进入可以吹的状态 */
  $("#wish-done").addEventListener("click", (e) => {
    /* 必须吞掉：不然这一下会继续冒泡到整幕的监听器，
       那时 wishDone 已经是 true，蜡烛当场就被"吹"灭了，
       许愿和吹灭连在一起，中间的动画和引导全看不到。 */
    e.stopPropagation();
    if (wishDone) return;
    wishDone = true;
    clearHint();
    $("#wish-done").classList.add("is-gone");
    $("#cake-wish").classList.remove("is-on");
    setTimeout(() => {
      $("#cake-line").textContent = CONTENT.cake.hint;
      $("#cake-sub").style.opacity = "";
      $("#mic-btn").style.opacity = "";
      $("#mic-btn").style.pointerEvents = "";
      armHint($("#cake"), CONTENT.hints.cake, true);
    }, 700);
  });

  /* 整个蛋糕这一幕点哪都能吹，不用非得点中蛋糕本身。
     还没许愿就点的话，把「许好了」那行字闪一下告诉他下一步，
     而不是毫无反应——之前就是这里显得"不灵敏"。 */
  $('.scene[data-scene="cake"]').addEventListener("click", (e) => {
    if (candleOut) return;
    // 这两个按钮有自己的行为，任何阶段都不算"吹"
    if (e.target.closest("#wish-done") || e.target.closest("#mic-btn")) return;
    if (!wishDone) {
      const wd = $("#wish-done");
      wd.classList.remove("is-nudge");
      void wd.offsetWidth;              // 重启动画
      wd.classList.add("is-nudge");
      return;
    }
    blowOut();
  });

  function blowOut() {
    if (candleOut || !wishDone) return;   // 没许愿之前吹不灭
    candleOut = true;
    clearHint();
    $("#cake").classList.add("is-out");
    stopMic();
    setTimeout(() => go("celebrate"), 1900);
  }

  /* 麦克风：只有他主动点了才请求权限，不给也没关系 */
  $("#mic-btn").addEventListener("click", (e) => { e.stopPropagation(); listenForBlow(); });

  function listenForBlow() {
    const btn = $("#mic-btn");
    if (micStream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      btn.textContent = "这个浏览器不支持麦克风 —— 点蛋糕就行"; return;
    }
    btn.textContent = "在听了……吹吧";
    btn.classList.add("is-listening");
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      micStream = stream;
      const AC = window.AudioContext || window.webkitAudioContext;
      const actx = new AC();
      const an = actx.createAnalyser();
      an.fftSize = 512;
      actx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      let loud = 0, baseline = null;
      (function tick() {
        if (candleOut) return;
        an.getByteFrequencyData(data);
        let low = 0;
        for (let i = 0; i < 24; i++) low += data[i];
        low /= 24;
        // 先用前几十帧摸清环境底噪，再按"高出底噪多少"判断，
        // 比写死一个阈值灵敏得多，安静和吵闹的房间都能用
        baseline = baseline === null ? low : baseline * 0.95 + low * 0.05;
        loud = low > baseline + 26 && low > 42 ? loud + 1 : 0;
        if (loud > 3) return blowOut();
        requestAnimationFrame(tick);
      })();
    }).catch(() => {
      btn.classList.remove("is-listening");
      btn.textContent = "没拿到麦克风权限 —— 点蛋糕也一样";
    });
  }

  function stopMic() {
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  }

  /* =========================================================
     4. 庆祝
  ========================================================= */
  function enterCelebrate() {
    const name = CONTENT.meta.hisName || "你";
    $("#cel-cn").textContent = CONTENT.celebrate.cn.replace(/\{name\}/g, name);

    // Birthday / Everyday 两个词包成 <em>，CSS 会放大高亮
    $("#cel-en").innerHTML = escapeHtml(CONTENT.celebrate.en)
      .replace(/\b(Birthday|Everyday)\b/gi, "<em>$1</em>");

    $("#cel-next").textContent = CONTENT.celebrate.button;
    ["#cel-cn", "#cel-en", "#cel-next"].forEach((x) => $(x).classList.remove("is-on"));

    setTimeout(() => $("#cel-cn").classList.add("is-on"), 250);
    setTimeout(() => $("#cel-en").classList.add("is-on"), 750);
    setTimeout(() => {
      $("#cel-next").classList.add("is-on");
      armHint($("#cel-next"), CONTENT.hints.celebrate, true);
    }, 1600);
    confetti();   // 纸屑只留在生日这一幕
  }

  $("#cel-next").addEventListener("click", () => go("dark"));

  /* ---- 纸屑 ---- */
  const fx = $("#fx"), fxc = fx.getContext("2d");
  let bits = [], fxRAF = null;
  function sizeFx(){ fx.width = innerWidth; fx.height = innerHeight; }
  addEventListener("resize", sizeFx); sizeFx();

  function stopConfetti() {
    cancelAnimationFrame(fxRAF);
    bits = [];
    fxc.clearRect(0, 0, fx.width, fx.height);
  }

  function confetti() {
    const COLORS = ["#e0a75e", "#f0d08a", "#d4795f", "#f6ecdc", "#c98b5e"];
    bits = Array.from({ length: 150 }, () => ({
      x: Math.random() * fx.width,
      y: -20 - Math.random() * fx.height * 0.6,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 11,
      vy: 1.6 + Math.random() * 2.6,
      vx: -1 + Math.random() * 2,
      rot: Math.random() * Math.PI,
      vr: -0.09 + Math.random() * 0.18,
      c: COLORS[(Math.random() * COLORS.length) | 0],
    }));
    cancelAnimationFrame(fxRAF);
    drawConfetti();
  }

  function drawConfetti() {
    fxc.clearRect(0, 0, fx.width, fx.height);
    let alive = 0;
    bits.forEach((b) => {
      b.y += b.vy; b.x += b.vx; b.rot += b.vr;
      if (b.y < fx.height + 30) alive++;
      fxc.save();
      fxc.translate(b.x, b.y);
      fxc.rotate(b.rot);
      fxc.fillStyle = b.c;
      fxc.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      fxc.restore();
    });
    if (alive) fxRAF = requestAnimationFrame(drawConfetti);
    else fxc.clearRect(0, 0, fx.width, fx.height);
  }

  /* =========================================================
     6. 摸黑找礼物（手电筒）
  ========================================================= */
  let foundBox = false;

  function enterDark() {
    foundBox = false;
    const torch = $("#torch");
    torch.classList.remove("is-off");
    torch.style.setProperty("--tx", "18%");
    torch.style.setProperty("--ty", "82%");
    $("#dark-line").textContent = CONTENT.dark.line1;
    $("#dark-cue").textContent = CONTENT.dark.cue;
    $("#dark-cue").style.opacity = "";
    $("#dark-line").classList.remove("is-on");
    $("#dark-hidden").classList.remove("is-found");
    setTimeout(() => $("#dark-line").classList.add("is-on"), 500);
    armHint($("#dark-cue"), CONTENT.hints.dark, true);
  }

  /* 光跟着鼠标走；扫到盒子上就算找到 */
  (function initTorch() {
    const sc = $('.scene[data-scene="dark"]');
    const torch = $("#torch");

    const moveLight = (e) => {
      if (scene !== "dark") return;
      const p = e.touches ? e.touches[0] : e;
      torch.style.setProperty("--tx", p.clientX + "px");
      torch.style.setProperty("--ty", p.clientY + "px");
      if (foundBox) return;
      const b = $("#dark-hidden").getBoundingClientRect();
      const near =
        p.clientX > b.left - 24 && p.clientX < b.right + 24 &&
        p.clientY > b.top - 24 && p.clientY < b.bottom + 24;
      if (near) revealBox();
    };

    sc.addEventListener("mousemove", moveLight);
    sc.addEventListener("touchmove", moveLight, { passive: true });
    sc.addEventListener("click", () => { if (foundBox) go("gift"); });
  })();

  function revealBox() {
    if (foundBox) return;
    foundBox = true;
    clearHint();
    $("#dark-hidden").classList.add("is-found");
    $("#dark-cue").textContent = CONTENT.dark.found;
    setTimeout(() => $("#torch").classList.add("is-off"), 400);
    setTimeout(() => go("gift"), 2000);
  }

  /* =========================================================
     6. 礼物 → 安装包弹出来
  ========================================================= */
  let giftOpen = false;

  function enterGift() {
    giftOpen = false;
    $("#giftbox").classList.remove("is-open");
    $("#dmg").classList.remove("is-out", "is-float");
    $("#burst").classList.remove("is-on");
    $("#gift-line").textContent = CONTENT.gift.hint;
    $("#gift-sub").textContent = CONTENT.gift.sub;
    $("#dmg-name").textContent = CONTENT.pet.filename;
    /* 这段可能有好几行。textContent 会把换行吃掉挤成一行，
       而单纯换成 <br> 又和段内折行一样紧，两件事会读成一句话。
       每行独立成块，从第二行起留一点间距。 */
    $("#pet-desc").innerHTML = String(CONTENT.pet.desc)
      .split("\n")
      .filter((l) => l.trim())
      .map((l, i) => `<span class="pet__p"${i ? ' style="margin-top:.7em"' : ""}>${escapeHtml(l.trim())}</span>`)
      .join("");
    $("#pet-btn").textContent = CONTENT.pet.button;
    $("#pet-note").textContent = CONTENT.pet.note;

    $("#gift-line").classList.remove("is-on");
    $("#pet-desc").classList.remove("is-on");
    $("#pet-note").classList.remove("is-on");
    $("#pet-btn").classList.remove("is-on");

    setTimeout(() => $("#gift-line").classList.add("is-on"), 300);
    armHint($("#giftbox"), CONTENT.hints.gift, true);
  }

  $("#giftbox").addEventListener("click", () => {
    if (giftOpen) return;
    giftOpen = true;
    clearHint();

    $("#giftbox").classList.add("is-open");
    $("#gift-sub").textContent = CONTENT.gift.opened || "";
    switchTrack("gift");            // ← 开礼物之后才换这首

    // 盖子飞起来一点之后，安装包才"啵"一下弹出来
    setTimeout(() => {
      $("#burst").classList.add("is-on");
      $("#dmg").classList.add("is-out");
    }, 320);

    // 弹完切成漂浮
    setTimeout(() => {
      $("#dmg").classList.remove("is-out");
      $("#dmg").classList.add("is-float");
    }, 1480);

    setTimeout(() => {
      $("#pet-desc").classList.add("is-on");
      $("#pet-btn").classList.add("is-on");
      $("#pet-note").classList.add("is-on");
      armHint($("#pet-btn"), CONTENT.hints.pet, true);
    }, 1700);
  });

  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent) &&
                !/iPhone|iPad|iPod/i.test(navigator.userAgent);

  $("#pet-btn").addEventListener("click", async () => {
    clearHint();
    const note = $("#pet-note"), btn = $("#pet-btn");
    const show = (t) => { note.textContent = t; note.classList.add("is-on"); };

    // 手机上下一个 Mac 安装包毫无意义，先说清楚
    if (!isMac) {
      show("这个是 Mac 上的小程序，用电脑打开这个网页再点一次就行。");
      return;
    }

    /* 安装包不内嵌在网页里（一百多兆，塞进 HTML 会打不开），
       就放在这个网页旁边。先确认它真的在，不然点了没反应
       却显示「已经在下载了」，他只会以为坏了。 */
    /* 安装包默认就放在网页旁边；content.md 里填了「安装包地址」就用那个，
       是给安装包太大、传不上托管平台时准备的退路。 */
    const href = CONTENT.pet.url || CONTENT.pet.filename;
    const sameFolder = !CONTENT.pet.url;

    if (sameFolder) {
      let there = true;
      try {
        const r = await fetch(href, { method: "HEAD" });
        there = r.ok;
      } catch (e) {
        // file:// 打开时 fetch 会被浏览器拦掉，那就不做这个检查，直接下
        there = true;
      }
      if (!there) {
        show("咦，安装包不在这个网页旁边。它应该和这个文件放在同一个文件夹里。");
        return;
      }
    }

    const a = document.createElement("a");
    a.href = href;
    a.download = CONTENT.pet.filename;
    if (!sameFolder) a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();

    btn.classList.add("is-done");
    /* 双击本地 html 打开时（file://），浏览器不会"下载"一个已经在硬盘上的文件，
       只会在访达里把它指给你看。这时候说「已经在下载了」是骗人的。 */
    if (location.protocol === "file:") {
      btn.textContent = "它就在旁边";
      show("安装包就在这个网页旁边，叫 " + CONTENT.pet.filename +
           "。双击它装上。" + (CONTENT.pet.firstRun ? "\n" + CONTENT.pet.firstRun : ""));
    } else {
      btn.textContent = "已经在下载了";
      if (CONTENT.pet.firstRun) show(CONTENT.pet.firstRun);
    }
  });

  /* =========================================================
     背景音乐
  ========================================================= */
  const audio = $("#bgm");
  let bgmOn = false, fadeT = null, curTrack = null;

  const trackSrc = (key) => (CONTENT.bgm && CONTENT.bgm[key]) || "";
  const anyTrack = () => ["letter", "cake", "gift"].some((k) => trackSrc(k));

  function initBgm() {
    if (!anyTrack()) return;          // 一首都没配就不显示开关
    audio.volume = 0;
    $("#bgm-btn").classList.add("is-visible");
    $("#bgm-btn").addEventListener("click", () => {
      if (bgmOn) { bgmOn = false; fadeOut(); $("#bgm-btn").classList.add("is-off"); }
      else { bgmOn = true; $("#bgm-btn").classList.remove("is-off"); switchTrack(curTrack, true); }
    });
  }

  /* 换歌：淡出 → 换源 → 淡入。同一首就不动。 */
  function switchTrack(key, force) {
    if (!key || !anyTrack()) return;
    const src = trackSrc(key);
    if (!src) return;                 // 这一段没配歌，就让上一首继续放
    if (key === curTrack && !force) return;
    curTrack = key;
    if (!bgmOn) return;

    const target = CONTENT.bgm.volume || 0.3;
    clearInterval(fadeT);
    const stepDown = () => {
      audio.volume = Math.max(0, audio.volume - 0.06);
      if (audio.volume <= 0.001) {
        clearInterval(fadeT);
        if (!audio.src.endsWith(src)) { audio.src = src; }
        audio.play().then(() => {
          clearInterval(fadeT);
          fadeT = setInterval(() => {
            audio.volume = Math.min(target, audio.volume + target / 40);
            if (audio.volume >= target - 0.001) clearInterval(fadeT);
          }, 55);
        }).catch(() => {
          // 浏览器拦了自动播放：把按钮显示成关着的，
          // 不然它亮着却没声音，他会以为是坏的
          bgmOn = false;
          $("#bgm-btn").classList.add("is-off");
        });
      }
    };
    if (audio.src && !audio.paused) fadeT = setInterval(stepDown, 45);
    else { audio.volume = 0; audio.src = src; stepDown(); }
  }

  function fadeOut() {
    clearInterval(fadeT);
    fadeT = setInterval(() => {
      audio.volume = Math.max(0, audio.volume - 0.05);
      if (audio.volume <= 0.001) { clearInterval(fadeT); audio.pause(); }
    }, 45);
  }

  /* =========================================================
     小工具
  ========================================================= */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* 调试用：地址栏加 ?scene=cake 直接跳到某一幕 */
  function debugScene() {
    const q = new URLSearchParams(location.search).get("scene");
    return SCENES.includes(q) ? q : null;
  }

  /* =========================================================
     初始化
  ========================================================= */
  function init() {
    renderLetter();
    buildCake();
    initLock();
    initBgm();
    const d = debugScene();
    if (d) go(d); else go("lock");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
