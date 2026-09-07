/* 主进程：一个透明、无边框、永远在最上层的小窗口。
   窗口本身是方的，但只有画到人物的那几个像素才接收鼠标——
   其余部分点下去应该直接穿到后面的窗口，不然会挡住她干活。 */
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor } = require("electron");
const path = require("path");
const fs = require("fs");

let win = null, tray = null, dragTimer = null;

const WIN_W = 300, WIN_H = 340;   // 高度要放得下被拎起来那张（吊点 26 + 人 171）


/* ================= 记住一点东西 =================
   放在 userData 里，跟着 app 走，卸载也一起没。
   只存两样：她被放在哪、有没有打过招呼。 */
let store = {};
const STORE_FILE = () => path.join(app.getPath("userData"), "state.json");
function loadStore() {
  try { store = JSON.parse(fs.readFileSync(STORE_FILE(), "utf8")); } catch (e) { store = {}; }
}
let saveTimer = null;
function saveStore(patch) {
  Object.assign(store, patch);
  clearTimeout(saveTimer);            // 她走路时位置一直在变，攒一下再写
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(STORE_FILE(), JSON.stringify(store)); } catch (e) {}
  }, 2000);
}
/* 存过的位置未必还有效：外接屏拔了、分辨率变了，
   照着放会把她扔到看不见的地方。落在任何一块屏幕里才认。 */
function usable(x, y) {
  if (typeof x !== "number" || typeof y !== "number") return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return x > a.x - WIN_W + 80 && x < a.x + a.width - 80 &&
           y > a.y - 40 && y < a.y + a.height - 80;
  });
}

function create() {
  const { workArea } = screen.getPrimaryDisplay();
  const keep = usable(store.x, store.y);
  win = new BrowserWindow({
    width: WIN_W, height: WIN_H,
    x: keep ? store.x : workArea.x + workArea.width - WIN_W - 60,
    y: keep ? store.y : workArea.y + workArea.height - WIN_H - 20,
    transparent: true, frame: false, hasShadow: false,
    resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"),
                      contextIsolation: true, nodeIntegration: false },
  });
  // 浮在全屏应用之上也能看见
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 他把她挪到哪儿就记在哪儿——包括系统自己移动窗口的情况
  win.on("moved", () => { const [x, y] = win.getPosition(); saveStore({ x, y }); });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

/* 鼠标穿透：渲染进程按像素透明度判断该不该接收点击 */
ipcMain.on("ignore-mouse", (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});

/* 拖拽：窗口跟着系统光标走。
   不能只靠渲染进程的 mousemove——拖快了光标会甩出窗口，事件就断了。
   所以改成主进程按帧读系统光标位置。 */
ipcMain.on("drag-start", (_e, off) => {
  if (dragTimer) clearInterval(dragTimer);
  let lastX = screen.getCursorScreenPoint().x;
  dragTimer = setInterval(() => {
    if (!win) return;
    const p = screen.getCursorScreenPoint();
    win.setPosition(Math.round(p.x - off.x), Math.round(p.y - off.y));
    win.webContents.send("drag-move", { vx: p.x - lastX });   // 横向速度 → 摆动幅度
    lastX = p.x;
  }, 16);
});
ipcMain.on("drag-end", () => {
  clearInterval(dragTimer); dragTimer = null;
  if (win) { const [x, y] = win.getPosition(); saveStore({ x, y }); }
});

/* 让渲染进程知道自己能在多大范围里走动 */
ipcMain.handle("bounds", () => {
  // 用她现在所在的那块屏幕，不能写死主屏——
  // 拖到第二个显示器上之后，散步的边界会整个错位
  const { workArea } = screen.getDisplayMatching(win.getBounds());
  const [x, y] = win.getPosition();
  return { workArea, x, y };
});
ipcMain.on("move-to", (_e, { x, y }) => {
  if (!win) return;
  win.setPosition(Math.round(x), Math.round(y));
  saveStore({ x: Math.round(x), y: Math.round(y) });
});

ipcMain.on("quit", () => app.quit());


/* ================= 作息 =================
   23:00–08:00 默认睡觉；白天看他在不在用电脑：
   连着用了一段时间就搬电脑过来陪着，人走开了就自己溜达。
   从菜单里手动选过之后就听手动的，直到他选回「跟着作息」。 */
const NIGHT_FROM = 23, NIGHT_TO = 8;
const WORK_AFTER_MIN = 20;      // 连续用电脑超过这么久 → 陪你工作
const AWAY_AFTER_SEC = 180;     // 超过这么久没动 → 当他人不在

let manual = null;              // 手动指定的状态；null = 跟着作息
let activeSince = 0;
let lastSent = null;
let preview = null;

// 参数留着是为了能测：平时不传，就是「现在几点、他多久没动了」
function scheduled(h = new Date().getHours(), idle = powerMonitor.getSystemIdleTime()) {
  if (h >= NIGHT_FROM || h < NIGHT_TO) { activeSince = 0; return "sleep"; }
  if (idle > AWAY_AFTER_SEC) { activeSince = 0; return "auto"; }
  if (!activeSince) activeSince = Date.now();
  return (Date.now() - activeSince > WORK_AFTER_MIN * 60000) ? "work" : "auto";
}

/* 到点提醒：每种一天最多一次，跨天自动清零 */
let fired = { day: null };
let muted = false;
function remind() {
  if (!win || preview) return;
  const d = new Date(), day = d.toDateString();
  if (fired.day !== day) fired = { day };
  const h = d.getHours();
  const idle = powerMonitor.getSystemIdleTime();
  const once = (k, cond) => {
    if (!cond || fired[k]) return false;
    // 静音的时候不标记已触发——否则他中午静音，生日那句就永远错过了
    if (muted) return false;
    fired[k] = true; win.webContents.send("say", k); return true;
  };
  // 生日优先，那天开机第一句就是它。
  // 不能只认 9 月 1 日当天——他要是 9 月 2 号才装上，那句话就永远不会出现了。
  const bd = new Date(d.getFullYear(), 8, 1);
  const days = Math.floor((d - bd) / 86400000);
  if (once("birthday", days === 0 || (!store.saidBirthday && days > 0 && days <= 6))) {
    saveStore({ saidBirthday: true });
    return;
  }
  if (once("lateNight", h >= 0 && h < 5 && idle < 90)) return;
  if (once("bedtime", h === 23)) return;
  once("tooLong", activeSince && Date.now() - activeSince > 120 * 60000);
}

function apply() {
  if (!win || preview) return;
  // 就算手动选了状态，也要跑一遍 scheduled() 维护 activeSince，
  // 不然「工作太久」的提醒会拿着几小时前的旧值判断
  const auto = scheduled();
  const s = manual || auto;
  if (s === lastSent) return;            // 别重复发，会把动画从头切一遍
  lastSent = s;
  win.webContents.send("state", s);
}
setInterval(() => { apply(); remind(); }, 20000);

/* 预览：把四个动作依次演一遍，演完回到原来的状态 */
async function runPreview() {
  if (preview || !win) return;
  preview = true;
  const back = manual || scheduled();
  try {
    for (const s of ["idle", "walk", "sleep", "work"]) {
      if (!win || win.isDestroyed()) return;
      win.webContents.send("state", s);
      await new Promise((r) => setTimeout(r, 4500));
    }
    if (win && !win.isDestroyed()) win.webContents.send("state", back);
  } finally {
    preview = null; lastSent = null;   // 中途出错也要解锁，否则作息永远不动了
  }
}

function makeTray() {
  // 只取头那一块：整个人缩到 18px 高，五官全糊没了
  const full = nativeImage.createFromPath(path.join(__dirname, "assets", "frames", "idle3_1.png"));
  const { width: fw, height: fh } = full.getSize();
  const img = full
    .crop({ x: Math.round(fw * 0.16), y: 0, width: Math.round(fw * 0.68), height: Math.round(fh * 0.30) })
    .resize({ height: 18 });
  tray = new Tray(img);
  tray.setToolTip("Here");
  const pick = (s) => () => { manual = s; lastSent = null; apply(); };
  const menu = Menu.buildFromTemplate([
    { label: "跟着作息（默认）", click: () => { manual = null; lastSent = null; apply(); } },
    { type: "separator" },
    { label: "站着", click: pick("idle") },
    { label: "走走", click: pick("walk") },
    { label: "睡觉", click: pick("sleep") },
    { label: "陪我工作", click: pick("work") },
    { type: "separator" },
    { label: "把四个动作演一遍", click: runPreview },
    { type: "separator" },
    { label: "让她安静一会儿", type: "checkbox", checked: false,
      click: (mi) => { muted = mi.checked; win.webContents.send("mute", mi.checked); } },
    { label: "藏起来", type: "checkbox", checked: false,
      click: (mi) => { if (mi.checked) win.hide(); else win.show(); } },
    { type: "separator" },
    { label: "开机时自动打开", type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked, openAsHidden: false }) },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}
ipcMain.on("menu", () => tray && tray.popUpContextMenu());

app.whenReady().then(() => {
  loadStore();
  create();
  makeTray();
  win.webContents.once("did-finish-load", () => {
    setTimeout(apply, 1200);
    if (!store.greeted) {
      // 他刚装好第一次打开：先打个招呼，再告诉他能怎么玩。只说这一次。
      saveStore({ greeted: true });
      setTimeout(() => win && win.webContents.send("say", "firstMeet"), 2200);
      setTimeout(() => win && win.webContents.send("say", "howto"), 9000);
    }
  });
  if (app.dock) app.dock.hide();          // 不占程序坞，就是个挂件
});
/* 位置是攒着写的，退出时要把最后一次补上，不然刚挪完就退出会丢 */
app.on("before-quit", () => {
  clearTimeout(saveTimer);
  if (win && !win.isDestroyed()) {
    const [x, y] = win.getPosition();
    Object.assign(store, { x, y });
  }
  try { fs.writeFileSync(STORE_FILE(), JSON.stringify(store)); } catch (e) {}
});
app.on("window-all-closed", () => app.quit());

module.exports = { scheduled, _reset: () => { activeSince = 0; }, _activeSince: (t) => { activeSince = t; } };
