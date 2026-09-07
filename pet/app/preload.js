const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pet", {
  ignoreMouse: (v) => ipcRenderer.send("ignore-mouse", v),
  dragStart: (off) => ipcRenderer.send("drag-start", off),
  dragEnd: () => ipcRenderer.send("drag-end"),
  onDragMove: (fn) => ipcRenderer.on("drag-move", (_e, d) => fn(d)),
  onState: (fn) => ipcRenderer.on("state", (_e, s) => fn(s)),
  onSay: (fn) => ipcRenderer.on("say", (_e, k) => fn(k)),
  onMute: (fn) => ipcRenderer.on("mute", (_e, v) => fn(v)),
  bounds: () => ipcRenderer.invoke("bounds"),
  moveTo: (x, y) => ipcRenderer.send("move-to", { x, y }),
  menu: () => ipcRenderer.send("menu"),
  quit: () => ipcRenderer.send("quit"),
});
