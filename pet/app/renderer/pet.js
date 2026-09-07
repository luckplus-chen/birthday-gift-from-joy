/* 桌宠渲染。所有时长/幅度都来自 assets/动画参数.json，
   那个文件是调速台拨出来的，改动画请改它，别在这儿写死数字。 */

const C = document.getElementById("c");
const X = C.getContext("2d", { willReadFrequently: true });

/* Retina 上一个 CSS 像素是 2 个物理像素。画布不按倍率放大的话，
   等于先画一张 240×260 的小图再被系统拉伸一倍——看着就是糊的。 */
let DPR = window.devicePixelRatio || 1;
const W = 300, H = 340;             // 逻辑尺寸（比人物大一圈，留给头顶的气泡）
function sizeCanvas() {
  DPR = window.devicePixelRatio || 1;
  C.width = Math.round(W * DPR); C.height = Math.round(H * DPR);
  C.style.width = W + "px"; C.style.height = H + "px";
  X.setTransform(DPR, 0, 0, DPR, 0, 0);   // 之后所有坐标都按逻辑像素写
}
sizeCanvas();
/* 拖到另一块屏幕上，倍率可能从 2 变成 1。不重建画布的话，
   要么整个人糊掉，要么只画到左上角四分之一。 */
matchMedia(`(resolution: ${DPR}dppx)`).addEventListener("change", sizeCanvas);
window.addEventListener("resize", () => {
  if (Math.abs((window.devicePixelRatio || 1) - DPR) > 0.01) sizeCanvas();
});

const FLOOR = H - 10;               // 脚踩的那条线

/* GPT 各组帧不是一个尺度画的：睡觉和工作明显画大了，各自缩回来。
   基准 0.287 = 待机原图 557px 显示成 160px。 */
const BASE = 0.287;
const SCALE = { idle: 1.00, walk: 1.00, lift: 0.93, sleep: 0.66, work: 0.80 };

const P = {};                       // 动画参数
const IMG = {};                     // 帧图
/* 装帧时顺手量出人物在这张图里的实际底边和横向中心。
   各组帧的透明留白不一样（走路那组底下比待机多留了 28px），
   按画布底边对齐的话，站着切成走路会整个人往上跳一下。 */
const _m = document.createElement("canvas"), _mx = _m.getContext("2d", { willReadFrequently: true });
function measure(i) {
  _m.width = i.width; _m.height = i.height;
  _mx.clearRect(0, 0, i.width, i.height); _mx.drawImage(i, 0, 0);
  const d = _mx.getImageData(0, 0, i.width, i.height).data;
  let bottom = 0, top = -1, x0 = i.width, x1 = 0;
  for (let y = 0; y < i.height; y++)
    for (let x = 0; x < i.width; x++)
      if (d[(y * i.width + x) * 4 + 3] > 24) {
        bottom = y; if (top < 0) top = y;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
      }
  return { bottom: bottom + 1, top: Math.max(0, top), cx: (x0 + x1) / 2 };
}
const load = (n) => new Promise((r) => {
  const i = new Image();
  i.onload = () => { i.anchor = measure(i); IMG[n] = i; r(); };
  i.src = `../assets/frames/${n}.png`;
});

/* ---------------- 状态 ---------------- */
let state = "idle";                 // idle | walk | sleep | work | lift | fall
let auto = true;                    // 自己随机换动作
let t0 = performance.now();
let held = false, ang = 0, vel = 0, dragV = 0;
const HOLD_Y = 26;                  // 被拎着时头顶停在窗口的这个高度
let fallT = 0;
let walkDir = 1, walkPhase = 0, walkLast = 0, walkTurn = 0;
let nextSwitch = 0, nextTalk = 0;
let win = { x: 0, y: 0 }, area = null;

/* ---------------- 画一帧 ---------------- */
function baseY(name, kind) {          // 让人物的脚（不是画布底边）落在地板线上
  const im = IMG[name], s = BASE * SCALE[kind];
  return FLOOR - im.anchor.bottom * s;
}
function draw(name, kind, { dy = 0, sy = 1, rot = 0, pivot = null } = {}) {
  const im = IMG[name]; if (!im) return;
  const s = BASE * SCALE[kind];
  const w = im.width * s, h = im.height * s;
  const x = W / 2 - im.anchor.cx * s, y = baseY(name, kind) + dy;
  headTop = y + im.anchor.top * s;      // 气泡挂在这个高度上面
  bodyBottom = y + im.anchor.bottom * s;
  X.save();
  if (rot) {
    // 绕头顶抓取点转
    const px = x + w * pivot.x, py = y + h * pivot.y;
    X.translate(px, py); X.rotate(rot * Math.PI / 180); X.translate(-px, -py);
  }
  if (sy !== 1) { X.translate(W / 2, FLOOR); X.scale(1, sy); X.translate(-W / 2, -FLOOR); }
  X.drawImage(im, x, y, w, h);
  X.restore();
}

/* 呼吸：上浮 + 一点点纵向拉伸，两者同相，看起来像吸气 */
function breath(cfg, now) {
  const k = (1 - Math.cos(2 * Math.PI * (now % cfg.周期毫秒) / cfg.周期毫秒)) / 2;
  return { dy: -cfg.上浮px * k, sy: 1 + (cfg.纵向缩放 ? cfg.纵向缩放 - 1 : 0.014) * k };
}

/* ---------------- 主循环 ---------------- */
function tick() {
  const now = performance.now();
  X.clearRect(0, 0, W, H);

  if (state === "lift" || state === "fall") {
    const cfg = P.拎起来;
    const tgt = held ? Math.max(-cfg.晃动幅度度, Math.min(cfg.晃动幅度度, -dragV * 1.6)) : 0;
    vel = (vel + (tgt - ang) * cfg.回弹系数) * cfg.阻尼;
    ang += vel;
    dragV *= 0.86;

    const h = IMG.lift_1.height * BASE * SCALE.lift;
    /* 吊点固定在窗口上方一点，不跟着"你点在哪儿"走。
       原来按点击位置吊，抓脚的时候人整个被推到窗口下面去，脚就切没了。
       改成不管抓哪儿都是拎着后领——本来那张图画的就是这个姿势。 */
    const holdDy = HOLD_Y - h * cfg.抓取点.y比例 - baseY("lift_1", "lift");
    if (state === "lift") {
      draw("lift_1", "lift", { dy: holdDy, rot: ang,
        pivot: { x: cfg.抓取点.x比例, y: cfg.抓取点.y比例 } });
    } else {
      // 松手：往下掉，越掉越快，落地切回站着
      const k = Math.min(1, (now - fallT) / 260);
      const dy = (HOLD_Y - h * cfg.抓取点.y比例 - baseY("lift_1", "lift")) * (1 - k * k);
      draw("lift_1", "lift", { dy, rot: ang * (1 - k),
        pivot: { x: cfg.抓取点.x比例, y: cfg.抓取点.y比例 } });
      if (k >= 1) { state = "idle"; ang = vel = 0; t0 = now; }
    }
  }

  else if (state === "idle") {
    // 眨眼由 blinkLoop 单独驱动，这里只管取当前该显示哪张
    draw(blinkFrame || P.待机呼吸.基础帧, "idle", breath(P.待机呼吸, now));
  }

  else if (state === "walk") {
    const cfg = P.走路, seq = cfg.帧顺序;
    if (now - walkLast >= cfg.每帧毫秒) {
      walkLast = now;
      if (walkTurn > 0) { walkTurn--; }
      else {
        walkPhase = (walkPhase + 1) % seq.length;
        win.x += walkDir * cfg.每帧位移px;
        if (area) {
          const lo = area.x + 4, hi = area.x + area.width - W - 4;
          if (win.x <= lo || win.x >= hi) {
            win.x = Math.max(lo, Math.min(hi, win.x));
            walkDir *= -1; walkTurn = Math.round(1200 / cfg.每帧毫秒);
          }
        }
        window.pet.moveTo(win.x, win.y);
      }
    }
    const bob = walkPhase % 2 === 1 ? -cfg.重心起伏px : 0;
    X.save();
    if (walkDir < 0) { X.translate(W, 0); X.scale(-1, 1); }
    draw(seq[walkPhase], "walk", { dy: bob });
    X.restore();
  }

  else if (state === "sleep") {
    const cfg = P.睡觉呼吸, seq = cfg.帧顺序;
    const n = seq.length, per = cfg.每帧毫秒;
    const j = Math.floor((now - t0) / per) % (2 * n - 2);          // 来回播
    const b = breath({ ...cfg.叠加代码呼吸, 纵向缩放: 1.010 }, now);
    draw(seq[j < n ? j : 2 * n - 2 - j], "sleep", b);
  }

  else if (state === "work") {
    const cfg = P.打字, seq = cfg.帧顺序;
    const n = seq.length;
    const j = Math.floor((now - t0) / cfg.每帧毫秒) % (2 * n - 2);
    draw(seq[j < n ? j : 2 * n - 2 - j], "work");
  }

  drawBubble(now);

  // 自己随机在「站着」和「走走」之间换
  if (auto && (state === "idle" || state === "walk") && now > nextSwitch) {
    if (state === "idle") { state = "walk"; walkLast = now; nextSwitch = now + 4000 + Math.random() * 6000; }
    else { state = "idle"; t0 = now; nextSwitch = now + 9000 + Math.random() * 12000; say("endWalk"); }
  }

  // 自言自语：25–45 分钟一次，睡着和被拎着的时候不说
  if (now > nextTalk) {
    if (state === "idle" || state === "walk" || state === "work") say("idleTalk");
    nextTalk = now + (25 + Math.random() * 20) * 60000;
  }
  requestAnimationFrame(tick);
}

/* ---------------- 眨眼（单独跑，不跟主循环耦合） ---------------- */
function blinkLoop() {
  const cfg = P.眨眼;
  const run = () => {
    if (state === "idle") {
      cfg.帧顺序.forEach((f, i) => setTimeout(() => { if (state === "idle") blinkFrame = f; }, i * cfg.每帧毫秒));
      setTimeout(() => { blinkFrame = null; }, cfg.帧顺序.length * cfg.每帧毫秒);
    }
    setTimeout(run, cfg.平均间隔毫秒 * (cfg.间隔随机范围[0] +
      Math.random() * (cfg.间隔随机范围[1] - cfg.间隔随机范围[0])));
  };
  setTimeout(run, 1500);
}
let blinkFrame = null;
let headTop = 0, bodyBottom = 0;


/* ================== 说话 ==================
   句子来自 assets/台词.json（由 台词.md 编译），
   代码里一句台词都不写死。 */
const LINES = {};
let bubble = null;                  // {lines, w, h, born, dur, below}
const recent = {};                  // 每一组最近用过哪几句，避免连着重复
let muted = false;

const FONT = '15px -apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif';
const MAXW = 200, LH = 22, PADX = 13, PADY = 9;

function wrap(text) {
  X.font = FONT;
  const lines = [];
  let cur = "";
  for (const ch of text) {
    if (ch === "\n" || X.measureText(cur + ch).width > MAXW) {
      lines.push(cur); cur = ch === "\n" ? "" : ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);         // 桌宠不该长篇大论
}

function say(key, fallback) {
  if (muted) return;
  const pool = (LINES[key] && LINES[key].length) ? LINES[key] : LINES[fallback];
  if (!pool || !pool.length) return;
  const seen = recent[key] || [];
  let pick = pool.filter((l) => !seen.includes(l));
  if (!pick.length) pick = pool;
  const line = pick[Math.floor(Math.random() * pick.length)];
  // 池子大就多记两句，小池子只避开上一句
  recent[key] = [line, ...seen].slice(0, pool.length >= 4 ? 2 : 1);

  const lines = wrap(line);
  X.font = FONT;
  bubble = {
    lines,
    w: Math.max(...lines.map((l) => X.measureText(l).width)) + PADX * 2,
    h: lines.length * LH + PADY * 2,
    born: performance.now(),
    dur: 2200 + line.length * 130,   // 长一点的句子多停一会儿
  };
}

function bubbleBox() {
  if (!bubble) return null;
  const cx = W / 2;
  let y0 = headTop - 12 - bubble.h, below = false;
  if (y0 < 4) { y0 = bodyBottom + 12; below = true; }   // 头顶没地方（被拎着时）就挂下面
  return { x0: cx - bubble.w / 2, y0, cx, below };
}

function drawBubble(now) {
  if (!bubble) return;
  const age = now - bubble.born;
  if (age > bubble.dur) { bubble = null; return; }
  const a = Math.min(1, age / 130, (bubble.dur - age) / 320);
  const b = bubbleBox(), { w, h } = bubble;

  X.save();
  X.globalAlpha = a;
  X.beginPath();
  X.roundRect(b.x0, b.y0, w, h, 12);
  X.fillStyle = "#fcf8f1"; X.fill();
  X.strokeStyle = "#d6c1a6"; X.lineWidth = 1.6; X.stroke();
  // 尖角指向她
  const ty = b.below ? b.y0 : b.y0 + h, dir = b.below ? -1 : 1;
  X.beginPath();
  X.moveTo(b.cx - 7, ty); X.lineTo(b.cx + 7, ty); X.lineTo(b.cx, ty + 9 * dir);
  X.closePath(); X.fillStyle = "#fcf8f1"; X.fill();
  X.strokeStyle = "#d6c1a6"; X.stroke();
  // 把尖角根部的那道边盖掉
  X.beginPath(); X.moveTo(b.cx - 6, ty); X.lineTo(b.cx + 6, ty);
  X.strokeStyle = "#fcf8f1"; X.lineWidth = 2.6; X.stroke();

  X.font = FONT; X.fillStyle = "#4a3628"; X.textBaseline = "top";
  bubble.lines.forEach((l, i) => {
    X.fillText(l, b.cx - X.measureText(l).width / 2, b.y0 + PADY + i * LH + 2);
  });
  X.restore();
}

function inBubble(x, y) {
  const b = bubbleBox();
  return !!b && x >= b.x0 && x <= b.x0 + bubble.w && y >= b.y0 && y <= b.y0 + bubble.h;
}

/* ---------------- 鼠标 ---------------- */
let ignoring = true;
function hit(x, y) {
  // getImageData 不认 ctx 的缩放，坐标要自己换成物理像素
  const d = X.getImageData(Math.max(0, (x * DPR) | 0), Math.max(0, (y * DPR) | 0), 1, 1).data;
  return d[3] > 24;                       // 只有画到人的像素才算点得到
}
// 气泡是不透明的，会一起被 hit 判成"点得到"。
// 它只停三四秒，但那几秒里挡住的是他真正想点的东西，所以单独排掉。
function hitPet(x, y) { return hit(x, y) && !inBubble(x, y); }
window.addEventListener("mousemove", (e) => {
  if (held) { dragV = dragV * 0.6 + e.movementX * 0.4; return; }
  if (pending && (Math.abs(e.clientX - pending.x) > LIFT_MOVE_PX ||
                  Math.abs(e.clientY - pending.y) > LIFT_MOVE_PX)) { beginLift(); return; }
  const on = hit(e.clientX, e.clientY);   // 气泡也算，不然点不掉它
  if (on === ignoring) { ignoring = !on; window.pet.ignoreMouse(ignoring); }
  document.body.style.cursor = on ? "grab" : "default";
});
/* 按下去先别急着变成"拎起来"：
   快速点一下是戳她，按住不放或者拖动才是拎。
   之前一按就切成悬空的图，轻点一下也会闪一下，很怪。 */
let pending = null;                 // {x, y, at, timer}
const LIFT_HOLD_MS = 190, LIFT_MOVE_PX = 4;

function beginLift() {
  if (!pending) return;
  clearTimeout(pending.timer); pending = null;
  held = true; state = "lift"; ang = vel = dragV = 0;
  document.body.style.cursor = "grabbing";
  say("grab");
  // 光标对准吊点：抓哪儿都一样，她会被提到手上
  window.pet.dragStart({ x: W / 2, y: HOLD_Y });
}

window.addEventListener("mousedown", (e) => {
  if (e.button === 2) { window.pet.menu(); return; }
  if (bubble && inBubble(e.clientX, e.clientY)) { bubble = null; return; }  // 点气泡＝收起来
  if (!hit(e.clientX, e.clientY)) return;
  pending = { x: e.clientX, y: e.clientY, at: performance.now(),
              timer: setTimeout(beginLift, LIFT_HOLD_MS) };
});

let pokeN = 0, pokeAt = 0;
function poke() {
  const now = performance.now();
  if (now - pokeAt > 30000) pokeN = 0;      // 隔太久就从头算
  pokeAt = now; pokeN++;
  // 连着戳会升级；升级的话不分状态，就是那几句
  const step = pokeN >= 8 ? "poke.x8" : pokeN >= 5 ? "poke.x5" : pokeN >= 3 ? "poke.x3" : null;
  if (step && LINES[step]) return say(step);
  say("poke." + (state === "fall" ? "idle" : state), "poke.idle");
}

window.addEventListener("mouseup", () => {
  if (pending) {                     // 没拖也没按住 → 是戳
    clearTimeout(pending.timer); pending = null;
    poke();
    return;
  }
  if (!held) return;
  held = false; state = "fall"; fallT = performance.now();
  document.body.style.cursor = "grab";
  say("drop");
  window.pet.dragEnd();
  window.pet.bounds().then((b) => { win.x = b.x; win.y = b.y; area = b.workArea; });
});
window.addEventListener("contextmenu", (e) => e.preventDefault());
/* 兜底：万一 mouseup 没送到（光标甩出窗口、切了别的 app），
   她会一直黏在鼠标上。失焦就当松手了。 */
function forceRelease() {
  if (pending) { clearTimeout(pending.timer); pending = null; }
  if (!held) return;
  held = false; state = "fall"; fallT = performance.now();
  document.body.style.cursor = "default";
  window.pet.dragEnd();
  window.pet.bounds().then((b) => { win.x = b.x; win.y = b.y; area = b.workArea; });
}
window.addEventListener("blur", forceRelease);
document.addEventListener("mouseleave", forceRelease);
window.pet.onDragMove(({ vx }) => { dragV = dragV * 0.5 + vx * 0.5; });
window.pet.onState((s) => {
  const was = state;
  if (s === "auto") { auto = true; state = "idle"; t0 = performance.now(); nextSwitch = performance.now() + 6000; }
  else { auto = false; state = s; t0 = performance.now(); walkLast = performance.now(); }
  if (was === "sleep" && state !== "sleep") say("wake");
  else if (state === "work" && was !== "work") say("enterWork");
});
window.pet.onSay((key) => say(key));
window.pet.onMute((v) => { muted = v; if (v) bubble = null; });

/* ---------------- 启动 ---------------- */
(async () => {
  P.__ = await fetch("../assets/动画参数.json").then((r) => r.json());
  Object.assign(P, P.__); delete P.__;
  const names = new Set(["lift_1", P.待机呼吸.基础帧,
    ...P.眨眼.帧顺序, ...P.走路.帧顺序, ...P.睡觉呼吸.帧顺序, ...P.打字.帧顺序]);
  await Promise.all([...names].map(load));
  Object.assign(LINES, await fetch("../assets/台词.json").then((r) => r.json()));
  nextTalk = performance.now() + (25 + Math.random() * 20) * 60000;
  const b = await window.pet.bounds();
  win = { x: b.x, y: b.y }; area = b.workArea;
  nextSwitch = performance.now() + 8000;
  // 开局先让整扇窗透明穿透，不然鼠标还没移过来之前，
  // 那块 240×260 的空白会挡住后面窗口的点击
  window.pet.ignoreMouse(true);
  blinkLoop(); tick();
})();
