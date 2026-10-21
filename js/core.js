"use strict";
/* core.js - الحالة المشتركة والاتصال بالسيرفر وأدوات عامة */

const MK = {
  FN: "https://dbzqejwsivgndftfnezb.supabase.co/functions/v1/generate-site",
  REST: "https://dbzqejwsivgndftfnezb.supabase.co/rest/v1/sb_published_pages",
  KEY: "sb_publishable_JtpQxfx0h2GkUm6xoGEUNw_bQKopifH",
  files: {},      // مسار الملف -> المحتوى
  page: "index.html", // الصفحة المعروضة في المعاينة
  sel: "index.html",  // الملف المفتوح في تبويب الملفات
  pid: null,
  viewer: false,
};
const $ = (id) => document.getElementById(id);

/* ---------- تخزين محلي آمن ---------- */
MK.lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
MK.lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ممتلئ أو ممنوع */ } };

/* ---------- نصوص ---------- */
MK.EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu;
MK.noEmoji = (s) => String(s).replace(MK.EMOJI_RE, "");
MK.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
MK.escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
MK.slug = (s) => String(s).toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "file";
MK.kb = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB");

MK.say = (t, c = "") => { const m = $("msg"); m.textContent = t; m.className = c; };

/* ---------- الاتصال بالـ Function ---------- */
const NET = "تعذّر الاتصال بالسيرفر. افتح الصفحة من رابط حقيقي (Vercel أو localhost) مش من معاينة داخل محرر.";
MK.fe = (e) => (/fetch|network|failed to load/i.test(e.message) ? NET : e.message);

MK.call = async (body) => {
  const r = await fetch(MK.FN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: $("prov").value, model: $("model").value, ...body }),
  });
  const d = await r.json().catch(() => ({ error: "رد غير متوقع من السيرفر" }));
  if (!r.ok || d.error) throw new Error(d.error || "حصل خطأ");
  return d;
};

/* ---------- مسارات الملفات ---------- */
MK.resolve = (from, ref) => {
  ref = String(ref).split("#")[0].split("?")[0];
  if (ref.startsWith("/")) return ref.slice(1);
  const parts = from.split("/").slice(0, -1);
  ref.split("/").forEach((p) => { if (p === "..") parts.pop(); else if (p && p !== ".") parts.push(p); });
  return parts.join("/");
};
MK.pages = () => Object.keys(MK.files).filter((p) => /\.html?$/i.test(p)).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
MK.hasProject = () => Object.keys(MK.files).length > 0;

/* ---------- دمج رد السيرفر في المشروع ---------- */
MK.merge = (res) => {
  (res.files || []).forEach((f) => { MK.files[f.path] = MK.noEmoji(f.content); });
  (res.deleted || []).forEach((p) => { delete MK.files[p]; });
  if (!MK.files[MK.page]) MK.page = MK.pages()[0] || "index.html";
  if (!MK.files[MK.sel]) MK.sel = MK.page;
};

/* ---------- وضع المشاهدة: الموقع المنشور ---------- */
(function viewer() {
  const sp = new URLSearchParams(location.search).get("s");
  if (!sp) return;
  MK.viewer = true;
  document.addEventListener("DOMContentLoaded", () => {
    document.body.style.cssText = "display:block;height:100vh;background:#fff";
    document.body.innerHTML = '<iframe id="v" title="الموقع" style="width:100%;height:100%;border:0" sandbox="allow-scripts allow-forms allow-popups"></iframe>';
    fetch(MK.REST + "?slug=eq." + encodeURIComponent(sp) + "&select=html", { headers: { apikey: MK.KEY } })
      .then((r) => r.json())
      .then((d) => { document.getElementById("v").srcdoc = d[0] ? d[0].html : "<h2 style='font-family:sans-serif;padding:40px'>الموقع غير موجود</h2>"; })
      .catch(() => { document.body.textContent = "تعذّر تحميل الموقع"; });
  });
})();
