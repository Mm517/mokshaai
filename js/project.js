"use strict";
/* project.js - بناء المعاينة من الملفات المقسمة، المحرر البصري، التحميل ZIP، والنشر */

MK.editing = false;

/* ---------- استبدال مسارات الوسائط بروابط حقيقية ---------- */
/* الصور بتتحط كـ data URL. الفيديو الكبير ينفع data URL، فبنكتب مكانه mkv:المسار
   وبعدين بنبعت الـ Blob لجوه الـ iframe وهو اللي بيعمل له رابط (لأن الـ iframe معزول وميقدرش يفتح blob من برّه) */
MK.skippedVideos = 0;
function replaceAssets(text, mode) {
  const paths = Object.keys(MK.assets).sort((a, b) => b.length - a.length);
  paths.forEach((p) => {
    const it = MK.assets[p];
    const url = it.kind === "image" ? it.dataUrl : mode === "publish" ? null : "mkv:" + p;
    const re = new RegExp("(?:\\.{1,2}/)*" + MK.escRe(p), "g");
    if (url == null) { MK.skippedVideos++; text = text.replace(re, () => "about:blank"); }
    else text = text.replace(re, () => url);
  });
  return text;
}
// العكس: يرجّع روابط الوسائط لمساراتها (للتعديل البصري)
function restoreAssets(text) {
  Object.entries(MK.assets).forEach(([p, it]) => {
    if (it.dataUrl && text.includes(it.dataUrl)) text = text.split(it.dataUrl).join(p);
    if (text.includes("mkv:" + p)) text = text.split("mkv:" + p).join(p);
  });
  return text;
}

/* ---------- السكربتات اللي بتتحقن في المعاينة ---------- */
const VID_JS = "(function(){var M={};function fix(el){['src','poster'].forEach(function(a){var v=el.getAttribute&&el.getAttribute(a);if(v&&v.indexOf('mkv:')===0){var p=v.slice(4);if(M[p]){el.setAttribute('data-mkv-'+a,p);el.setAttribute(a,M[p])}}})}"
  + "function scan(r){if(r.querySelectorAll)r.querySelectorAll('[src^=\"mkv:\"],[poster^=\"mkv:\"]').forEach(fix)}"
  + "addEventListener('message',function(e){var d=e.data;if(!d||d.t!=='vids')return;for(var p in d.map)M[p]=URL.createObjectURL(d.map[p]);scan(document)});"
  + "new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='attributes')fix(m.target);else m.addedNodes.forEach(function(n){if(n.nodeType===1){fix(n);scan(n)}})})}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src','poster']})})()";

const NAV_JS = "(function(){document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';if(/^(https?:|mailto:|tel:|#|javascript:|\\/\\/)/i.test(h))return;if(/\\.html?($|[?#])/i.test(h)){e.preventDefault();parent.postMessage({t:'nav',href:h},'*')}},true)})()";

const ED_JS = "(function(){var cur=null,st=document.createElement('style');st.setAttribute('data-mk','1');st.textContent='[data-sel]{outline:2px solid #2358e6!important;outline-offset:2px}*{cursor:pointer}';document.head.appendChild(st);"
  + "function pth(el){var p=[];while(el&&el!==document.body){var par=el.parentElement;if(!par)return null;p.unshift(Array.prototype.indexOf.call(par.children,el));el=par}return el===document.body?p:null}"
  + "function op(o){if(!cur)return;var p=pth(cur);if(!p)return;o.path=p;o.tag=cur.tagName;parent.postMessage({t:'op',op:o},'*')}"
  + "document.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(cur){cur.removeAttribute('data-sel');cur.removeAttribute('contenteditable')}cur=e.target;cur.setAttribute('data-sel','1');var skip=/^(IMG|HTML|BODY|VIDEO|SVG|CANVAS)$/i.test(cur.tagName);if(!skip)cur.setAttribute('contenteditable','true');var s=getComputedStyle(cur);parent.postMessage({t:'sel',tag:cur.tagName,color:s.color,bg:s.backgroundColor,size:parseInt(s.fontSize),img:cur.tagName=='IMG'},'*')},true);"
  + "document.addEventListener('input',function(){if(!cur)return;var c=cur.cloneNode(true);c.removeAttribute('data-sel');c.removeAttribute('contenteditable');['src','poster'].forEach(function(a){c.querySelectorAll('[data-mkv-'+a+']').forEach(function(n){n.setAttribute(a,n.getAttribute('data-mkv-'+a));n.removeAttribute('data-mkv-'+a)})});op({k:'html',v:c.innerHTML})});"
  + "addEventListener('message',function(e){var d=e.data;if(!cur||!d)return;if(d.c=='style'){cur.style[d.p]=d.v;op({k:'style',p:d.p,v:d.v})}else if(d.c=='del'){op({k:'del'});cur.remove();cur=null}else if(d.c=='src'){cur.src=d.v;op({k:'src',v:d.v})}})})()";

/* ---------- تجميع صفحة واحدة من ملفاتها ---------- */
MK.bundle = function (entry, opt) {
  opt = opt || {};
  const mode = opt.mode || "preview";
  const F = MK.files;
  let h = F[entry] || "";

  h = h.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel=["']?stylesheet/i.test(tag)) return tag;
    const m = tag.match(/href=["']([^"']+)["']/i);
    if (!m || /^(https?:|\/\/|data:)/i.test(m[1])) return tag;
    const p = MK.resolve(entry, m[1]);
    if (F[p] == null) return tag;
    return '<style data-mk-src="' + m[1] + '">\n' + F[p] + "\n</style>";
  });

  h = h.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
    if (/^(https?:|\/\/|data:)/i.test(src)) return tag;
    const p = MK.resolve(entry, src);
    if (F[p] == null) return tag;
    const deferred = /\bdefer\b|type=["']module["']/i.test(a + b) ? " data-mk-defer" : "";
    return '<script data-mk-src="' + src + '"' + deferred + ">\n" + F[p].replace(/<\/script/gi, "<\\/script") + "\n</script>";
  });

  // السكربتات المؤجلة (defer) بتشتغل بعد تحميل الصفحة، فننقلها لآخر الـ body بنفس الترتيب
  const later = [];
  h = h.replace(/<script data-mk-src="[^"]*" data-mk-defer>[\s\S]*?<\/script>/g, (m) => { later.push(m); return ""; });
  const inject = later.join("\n") + (opt.editing ? "\n<script data-mk>" + ED_JS + "</script>" : opt.nav !== false && (mode === "preview" || opt.nav) ? "\n<script data-mk>" + NAV_JS + "</script>" : "");
  h = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, () => inject + "\n</body>") : h + inject;

  if (mode === "preview" && Object.values(MK.assets).some((it) => it.kind === "video")) {
    const tag = "<script data-mk>" + VID_JS + "</script>";
    h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => m + tag) : tag + h;
  }
  return replaceAssets(h, mode);
};

// بعد ما الـ iframe يحمّل، نبعتله ملفات الفيديو
MK.sendVideos = function () {
  const map = {};
  Object.entries(MK.assets).forEach(([p, it]) => { if (it.kind === "video" && it.blob) map[p] = it.blob; });
  const w = $("frame").contentWindow;
  if (w && Object.keys(map).length) w.postMessage({ t: "vids", map }, "*");
};

/* ---------- العرض ---------- */
MK.render = function () {
  const f = $("frame");
  if (!MK.hasProject()) { f.hidden = true; $("empty").hidden = false; return; }
  $("empty").hidden = true;
  if (!MK.files[MK.page]) MK.page = MK.pages()[0];
  f.srcdoc = MK.bundle(MK.page, { mode: "preview", editing: MK.editing });
  MK.renderPageSelect();
};

MK.renderPageSelect = function () {
  const sel = $("pagesel"), pages = MK.pages();
  sel.hidden = pages.length < 2;
  sel.innerHTML = pages.map((p) => '<option value="' + MK.esc(p) + '"' + (p === MK.page ? " selected" : "") + ">" + MK.esc(p) + "</option>").join("");
};

/* ---------- تطبيق تعديلات المحرر البصري على ملف الصفحة الأصلي ---------- */
let opQueue = [], opTimer = null;
MK.queueOp = function (op) {
  if (op.v != null) op.v = restoreAssets(String(op.v));
  opQueue.push(op);
  clearTimeout(opTimer);
  opTimer = setTimeout(MK.flushOps, 450);
};
MK.flushOps = function () {
  clearTimeout(opTimer);
  if (!opQueue.length || MK.files[MK.page] == null) { opQueue = []; return; }
  const doc = new DOMParser().parseFromString(MK.files[MK.page], "text/html");
  let fail = 0;
  opQueue.forEach((o) => {
    let el = doc.body;
    for (const i of o.path) el = el && el.children[i];
    if (!el || el.tagName !== o.tag) { fail++; return; }
    if (o.k === "html") el.innerHTML = o.v;
    else if (o.k === "style") el.style[o.p] = o.v;
    else if (o.k === "del") el.remove();
    else if (o.k === "src") el.setAttribute("src", o.v);
  });
  opQueue = [];
  MK.files[MK.page] = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML + "\n";
  if (MK.onFilesChanged) MK.onFilesChanged();
  if (fail) MK.say("بعض التعديلات متحفظتش لأن العنصر بيتولد بالكود. عدّله من تبويب الملفات أو بالشات.", "err");
  else MK.say("اتحفظ التعديل في ملف " + MK.page, "ok");
};

/* ---------- ZIP ---------- */
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
MK.downloadZip = async function () {
  if (!MK.hasProject()) { MK.say("اعمل موقع الأول.", "err"); return; }
  MK.flushOps();
  const name = MK.slug($("name").value || "site");
  if (!window.JSZip) { // مكتبة الضغط مش متحملة: نزّل الملفات واحد واحد
    Object.entries(MK.files).forEach(([p, c]) => download(new Blob([c], { type: "text/plain" }), p.replace(/\//g, "_")));
    MK.say("مكتبة الضغط مش متاحة، نزّلت الملفات منفصلة (استبدل _ بـ / عند الترتيب).", "err");
    return;
  }
  const z = new JSZip();
  Object.entries(MK.files).forEach(([p, c]) => z.file(p, c));
  Object.entries(MK.assets).forEach(([p, it]) => z.file(p, it.blob));
  z.file("README.txt", "افتح index.html في المتصفح.\nالملفات: css/ للتصميم، js/ للسلوك، assets/ للصور والفيديو.\n");
  download(await z.generateAsync({ type: "blob" }), name + ".zip");
  MK.say("تم تحميل المشروع (" + Object.keys(MK.files).length + " ملف + الوسائط).", "ok");
};

/* ---------- النشر: تجميع كل حاجة في صفحة واحدة ---------- */
MK.publishHtml = function () {
  MK.flushOps();
  MK.skippedVideos = 0;
  const pages = MK.pages();
  if (pages.length <= 1) return MK.bundle(pages[0] || "index.html", { mode: "publish", nav: false });
  const map = {};
  pages.forEach((p) => { map[p] = MK.bundle(p, { mode: "publish", nav: true }); });
  const data = JSON.stringify(map).replace(/</g, "\\u003c").replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
  const t = (MK.files["index.html"] || "").match(/<title>([^<]*)<\/title>/i);
  return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
    + (t ? t[1] : "Site") + "</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body>"
    + '<iframe id="f" title="site" sandbox="allow-scripts allow-forms allow-popups"></iframe><script>var P=' + data
    + ";var f=document.getElementById('f');function go(p){if(P[p])f.srcdoc=P[p]}"
    + "addEventListener('message',function(e){if(e.source!==f.contentWindow||!e.data||e.data.t!=='nav')return;go(String(e.data.href).split('#')[0].split('?')[0].replace(/^\\.?\\//,''))});"
    + "go('" + (pages.includes("index.html") ? "index.html" : pages[0]) + "')</script></body></html>";
};

/* ---------- تبويب الملفات ---------- */
const fileRank = (p) => (p.endsWith(".html") ? 0 : p.startsWith("css/") ? 1 : p.startsWith("js/") ? 2 : 3);
MK.renderFiles = function () {
  const tree = $("ftree"), paths = Object.keys(MK.files).sort((a, b) => fileRank(a) - fileRank(b) || a.localeCompare(b));
  tree.replaceChildren();
  paths.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ft" + (p === MK.sel ? " on" : "");
    b.textContent = p; b.title = MK.kb(MK.files[p].length);
    b.onclick = () => { MK.sel = p; MK.renderFiles(); };
    tree.append(b);
  });
  const assets = Object.keys(MK.assets);
  if (assets.length) {
    const h = document.createElement("div");
    h.className = "ft-h"; h.textContent = "الوسائط";
    tree.append(h);
    assets.forEach((p) => {
      const s = document.createElement("div");
      s.className = "ft ft--asset"; s.textContent = p;
      s.title = MK.kb(MK.assets[p].size || 0);
      tree.append(s);
    });
  }
  const code = $("code");
  code.value = MK.files[MK.sel] ?? "";
  code.disabled = MK.files[MK.sel] == null;
  $("fname").textContent = MK.sel + (MK.files[MK.sel] != null ? "  -  " + MK.kb(MK.files[MK.sel].length) : "");
};
MK.onFilesChanged = () => { if ($("tFiles").getAttribute("aria-pressed") === "true") MK.renderFiles(); };

/* ---------- مشاريعي (محلي) ---------- */
MK.store = {
  get() { try { return JSON.parse(MK.lsGet("mk_projects2", "[]")); } catch (e) { return []; } },
  set(v) {
    let list = v.slice(0, 8);
    while (list.length) { // لو التخزين ممتلئ نقلل العدد
      try { localStorage.setItem("mk_projects2", JSON.stringify(list)); return; } catch (e) { list = list.slice(0, -1); }
    }
  },
};
MK.renderProjects = function () {
  const ul = $("hist");
  ul.innerHTML = "";
  MK.store.get().forEach((p) => {
    const li = document.createElement("li"), b = document.createElement("button");
    b.className = "sec"; b.style.cssText = "width:100%;text-align:start;margin-top:4px";
    b.textContent = p.name + " (" + Object.keys(p.files).length + " ملف)";
    b.onclick = () => {
      MK.pid = p.id; MK.files = { ...p.files }; MK.page = MK.pages()[0] || "index.html"; MK.sel = MK.page;
      MK.assets = {}; MK.renderAssets();
      MK.render(); MK.renderFiles(); $("go").textContent = "تطبيق التعديل";
      MK.say("اتفتح المشروع. الصور والفيديوهات القديمة مش بتتحفظ محليًا، ارفعها تاني لو محتاجها.", "ok");
    };
    li.append(b); ul.append(li);
  });
};
MK.saveProject = function () {
  const all = MK.store.get(), i = all.findIndex((p) => p.id === MK.pid);
  if (i >= 0) { all[i].files = { ...MK.files }; }
  else { MK.pid = Date.now(); all.unshift({ id: MK.pid, name: $("name").value || "بدون اسم", files: { ...MK.files } }); }
  MK.store.set(all);
  MK.renderProjects();
};
