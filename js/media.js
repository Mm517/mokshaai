"use strict";
/* media.js - رفع الصور والفيديوهات: تصغير الصور، سحب لقطات من الفيديو للتحليل */

MK.assets = {};      // مسار -> عنصر وسائط (بيتحط في المشروع كملف في assets/)
MK.chatMedia = [];   // مرفقات الشات (للتحليل بس، مش بتدخل المشروع)

const IMG_MAX_SIDE = 1280, FRAME_W = 640, MAX_IMG_BYTES = 15 * 1048576, MAX_VID_BYTES = 80 * 1048576;
const MAX_ASSETS = 12, MAX_CHAT_MEDIA = 4, MAX_AI_IMAGES = 10;

const loadImg = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error("img"));
  i.src = src;
});
const toBlob = (c, mime, q) => new Promise((r) => c.toBlob(r, mime, q));

function uniquePath(dir, name, ext) {
  let base = dir + "/" + MK.slug(name), p = base + "." + ext, n = 2;
  while (MK.assets[p]) p = base + "-" + n++ + "." + ext;
  return p;
}

async function procImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const w0 = img.naturalWidth || 512, h0 = img.naturalHeight || 512;
    const sc = Math.min(1, IMG_MAX_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * sc)), h = Math.max(1, Math.round(h0 * sc));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const isSvg = file.type === "image/svg+xml";
    const keepPng = isSvg || (file.type === "image/png" && file.size < 700000); // نحافظ على الشفافية
    const mime = keepPng ? "image/png" : "image/jpeg";
    if (!keepPng) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = c.toDataURL(mime, 0.84);
    // لو SVG نحتفظ بالأصلي كملف، غير كده بنستخدم النسخة المصغرة
    const blob = isSvg ? file : await toBlob(c, mime, 0.84);
    return { kind: "image", w, h, dataUrl, blob, ext: isSvg ? "svg" : keepPng ? "png" : "jpg", thumb: dataUrl, frames: [] };
  } finally { URL.revokeObjectURL(url); }
}

async function procVideo(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  const ok = await new Promise((res) => {
    v.onloadedmetadata = () => res(true);
    v.onerror = () => res(false);
    setTimeout(() => res(false), 9000);
  });
  const item = { kind: "video", w: v.videoWidth || 0, h: v.videoHeight || 0, dur: isFinite(v.duration) ? v.duration : 0, blob: file, objUrl: url, frames: [], thumb: "" };
  if (ok && item.dur > 0 && item.w) {
    const n = Math.max(3, Math.min(6, Math.round(item.dur / 1.5)));
    const fw = Math.min(FRAME_W, item.w), fh = Math.round(fw * item.h / item.w);
    const c = document.createElement("canvas");
    c.width = fw; c.height = fh;
    const ctx = c.getContext("2d");
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * item.dur;
      await new Promise((res) => {
        const done = () => { v.onseeked = null; res(); };
        v.onseeked = done; v.currentTime = t; setTimeout(done, 4000);
      });
      try {
        ctx.drawImage(v, 0, 0, fw, fh);
        item.frames.push({ t, data: c.toDataURL("image/jpeg", 0.7) });
      } catch (e) { /* الكودك مش مدعوم للقطات */ }
    }
    if (item.frames.length) item.thumb = item.frames[0].data;
  }
  return item;
}

MK.processFile = async function (file) {
  const isImg = /^image\//.test(file.type), isVid = /^video\//.test(file.type);
  if (!isImg && !isVid) throw new Error(file.name + ": نوع الملف مش مدعوم (صور أو فيديو بس)");
  if (isImg && file.size > MAX_IMG_BYTES) throw new Error(file.name + ": الصورة أكبر من 15MB");
  if (isVid && file.size > MAX_VID_BYTES) throw new Error(file.name + ": الفيديو أكبر من 80MB");
  const item = isImg ? await procImage(file) : await procVideo(file);
  item.id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  item.name = file.name;
  item.size = file.size;
  if (isVid) {
    const m = /\.(mp4|webm|mov|m4v|ogv)$/i.exec(file.name);
    item.ext = m ? m[1].toLowerCase() : "mp4";
  }
  return item;
};

/* ---------- تحويل الوسائط لصيغة الإرسال ---------- */
MK.forAI = function (items) {
  let all = [];
  items.forEach((it) => {
    if (it.kind === "image") all.push({ label: "Image file: " + (it.path || it.name), data: it.dataUrl });
  });
  const vids = items.filter((it) => it.kind === "video" && it.frames.length);
  const room = Math.max(vids.length, MAX_AI_IMAGES - all.length);
  const per = vids.length ? Math.max(1, Math.floor(room / vids.length)) : 0;
  vids.forEach((it) => {
    const fr = it.frames.length <= per ? it.frames : Array.from({ length: per }, (_, k) => it.frames[Math.floor((k * it.frames.length) / per)]);
    fr.forEach((f) => all.push({ label: "Frame at " + f.t.toFixed(1) + "s of video file: " + (it.path || it.name), data: f.data }));
  });
  return all.slice(0, MAX_AI_IMAGES);
};

MK.assetList = () => Object.keys(MK.assets);
MK.manifest = function () {
  return Object.entries(MK.assets).map(([p, it]) => {
    if (it.kind === "image") return "- " + p + " : image " + it.w + "x" + it.h;
    return "- " + p + " : video " + (it.w ? it.w + "x" + it.h + ", " : "") + (it.dur ? it.dur.toFixed(1) + "s" : "unknown length") + (it.frames.length ? " (the attached frames come from it)" : "");
  }).join("\n");
};

/* ---------- واجهة الرفع ---------- */
function renderStrip(el, items, onRemove) {
  el.replaceChildren();
  items.forEach((it) => {
    const box = document.createElement("div");
    box.className = "thumb";
    if (it.thumb) {
      const im = document.createElement("img");
      im.src = it.thumb; im.alt = it.name;
      box.append(im);
    } else {
      const ph = document.createElement("span");
      ph.className = "thumb__ph"; ph.textContent = it.kind === "video" ? "فيديو" : "صورة";
      box.append(ph);
    }
    const tag = document.createElement("i");
    tag.textContent = it.kind === "video" ? "فيديو" : "صورة";
    const nm = document.createElement("small");
    nm.textContent = it.path ? it.path.split("/").pop() : it.name;
    nm.title = it.path || it.name;
    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "thumb__rm"; rm.textContent = "x";
    rm.setAttribute("aria-label", "إزالة " + it.name);
    rm.onclick = () => onRemove(it);
    box.append(tag, nm, rm);
    el.append(box);
  });
}

MK.renderAssets = () => renderStrip($("mlist"), Object.values(MK.assets), (it) => {
  if (it.objUrl) URL.revokeObjectURL(it.objUrl);
  delete MK.assets[it.path];
  MK.renderAssets();
});
MK.renderChatMedia = () => renderStrip($("cmlist"), MK.chatMedia, (it) => {
  MK.chatMedia = MK.chatMedia.filter((x) => x !== it);
  MK.renderChatMedia();
});

/* target: "assets" أو "chat" */
MK.bindPicker = function (input, drop, target, notify) {
  async function take(fileList) {
    const files = [...fileList];
    for (const f of files) {
      const count = target === "assets" ? Object.keys(MK.assets).length : MK.chatMedia.length;
      if (count >= (target === "assets" ? MAX_ASSETS : MAX_CHAT_MEDIA)) { notify("وصلت للحد الأقصى من الوسائط.", "err"); break; }
      try {
        notify("بجهّز " + f.name + " ...");
        const it = await MK.processFile(f);
        if (target === "assets") {
          it.path = uniquePath(it.kind === "video" ? "assets/video" : "assets/img", f.name, it.ext);
          MK.assets[it.path] = it;
          MK.renderAssets();
        } else {
          MK.chatMedia.push(it);
          MK.renderChatMedia();
        }
        notify(it.kind === "video" && !it.frames.length ? "اترفع " + f.name + " لكن مقدرتش أحلل لقطاته، هيتحط في الموقع زي ما هو." : "اترفع " + f.name, "ok");
      } catch (e) { notify(e.message, "err"); }
    }
    input.value = "";
  }
  input.onchange = () => take(input.files);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files.length) take(e.dataTransfer.files); });
};
