import { createClient } from "jsr:@supabase/supabase-js@2";

/* ---------- الإعدادات (تتغير من Secrets بدون تعديل الكود) ---------- */
const num = (k: string, d: number) => Number(Deno.env.get(k)) || d;
const PER_IP_DAILY = num("PER_IP_DAILY", 60);
const GLOBAL_DAILY = num("GLOBAL_DAILY", 1500);
const MAX_PROMPT = 12000;
const MAX_CTX = 90000;          // أقصى حجم ملفات بتتبعت كسياق للتعديل
const MAX_IMAGES = 10;          // أقصى عدد صور/لقطات فيديو في الطلب الواحد
const MAX_IMG_CHARS = 2_200_000; // أقصى حجم صورة (base64)
const MAX_PUBLISH = 3_000_000;
const TIMEOUT_MS = 135_000;

const MODELS: Record<string, string[]> = {
  gemini: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"],
  grok: ["grok-4.7", "grok-4.6", "grok-4.5"],
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/* ---------- المرجعية: اللي الموديل اتعلمه من المشاريع المرفوعة ---------- */
const STYLE_GUIDE = `REFERENCE STANDARD (learned from the reference projects; match this level of craft):

1) Nasaq (Arabic marketplace). One token file drives everything. css/tokens.css holds ALL colors, the type scale, a 4px spacing ladder, radii, shadows, motion timings and z-index layers as CSS custom properties; no hard-coded colors anywhere else. Restrained palette: white or near-white surface, cool gray panels, deep ink for text, ONE saturated accent used only for interactive elements. Contrast at least 4.5:1 (note the ratio in a comment beside the token). Radii scale with importance (images small, inputs medium, panels larger, buttons pill). Fonts: "IBM Plex Sans Arabic" for body and "Readex Pro" for headings via Google Fonts, fluid type with clamp(). Layout vocabulary: .container (max-width + fluid gutter), .section with generous vertical rhythm, .section__head (title + "view all" link), responsive .grid--2/3/4, .btn variants (primary, accent, ghost, lg), .field/.input with visible labels and error text, benefit rows with inline SVG icons, newsletter strip, header with search, footer in columns. Content cards have skeleton-loading and empty states. Accessibility: skip link, :focus-visible ring, .sr-only, aria-labels, semantic landmarks (header, nav, main, footer), prefers-reduced-motion, a noscript message. SEO: title, meta description, theme-color, Open Graph, JSON-LD. Content is rendered from a data file (js/data.js) by small functions with an escape helper; state lives in localStorage inside try/catch. Multi-page structure: index, listing, detail, cart, checkout, auth, dashboards, each page its own html file sharing the same css and js files.

2) CodeBot (Arabic chat UI). App shell with sidebar + main panel; message bubbles with avatar; assistant text rendered with textContent only (never innerHTML from untrusted text); fenced code blocks with a header showing the language and a copy button; typing indicator; auto-growing textarea; toast for feedback; several conversations saved in localStorage; off-canvas sidebar on mobile.

3) Millano (video-led brand site). Full-bleed 16:9 hero videos (muted, loop, playsinline, preload="metadata", with a poster and a gradient overlay so text stays legible), one video per story section, large display type over the video, scroll-triggered reveals with IntersectionObserver, videos paused when off-screen, and prefers-reduced-motion shows the poster instead of playing. Uploaded videos are used as <video src="assets/video/..."> exactly as given.

4) 3D portfolio (Three.js scene + interactive book). When the brief asks for 3D or motion-heavy work: load three.js from cdnjs pinned to https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js, keep scene code in js/scene.js and shared state in js/core.js, drive camera and objects from scroll progress, cap devicePixelRatio at 2, pause rendering when the tab is hidden or the canvas is off-screen, provide a static CSS fallback when WebGL is unavailable, and keep all content readable as real HTML (never only inside the canvas). Small, single-purpose script files that share one namespace.`;

const CODE_SYS = `You are a principal front-end engineer and art director. You build complete, production-grade static websites, split into separate files.

OUTPUT FORMAT (strict, machine-parsed):
- Output ONLY files. Every file starts with a marker line written exactly like this:
=== FILE: index.html ===
and is followed by the full content of that file. No markdown fences, and no commentary before, between or after the files.
- To remove a file during an edit, output a marker line: === DELETE: path ===
- Allowed paths: .html at the root, css/*.css, js/*.js, plus optional manifest or svg files. Never use "..", never use absolute paths.

PROJECT STRUCTURE:
- index.html is the entry. Extra pages are sibling .html files at the root linked with relative links (about.html, contact.html, ...). Only add pages the brief needs.
- css/tokens.css (all design tokens), css/base.css (reset, typography, accessibility), css/components.css (buttons, cards, forms, nav, footer), css/pages.css only if needed.
- js/data.js (content and configuration), js/ui.js (shared components such as header and footer), js/main.js (page logic). Add small focused files when useful (js/cart.js, js/scene.js). Load them with <script defer src="..."> in dependency order.
- No ES modules (no import/export). No inline <style> and no inline <script> blocks, except JSON-LD. Every page links the same shared css files.
- Split by responsibility. No empty files. No file over about 600 lines. Total output must stay under roughly 55,000 characters, so write dense, meaningful code rather than filler.

HARD RULES:
- NO emojis and no emoji-like pictographs anywhere: text, code, comments, alt text, titles. Use inline SVG icons (a small sprite or helper) or CSS shapes instead.
- Arabic by default with lang="ar" dir="rtl" unless the brief asks for another language. Use logical CSS properties (margin-inline, padding-block, inset-inline-start).
- Real, specific, believable copy. No lorem ipsum. Plausible numbers, names and prices in the local currency.
- External resources: Google Fonts only, plus three.js from cdnjs when 3D is requested. Use CSS gradients, SVG art and the uploaded media instead of remote images.
- Uploaded media: use the exact paths from the manifest (assets/img/..., assets/video/...). Place every uploaded image and video in a meaningful spot (hero, gallery, story sections, cards). Every image has alt text. Every video is muted, playsinline, loop where it is decorative, and has a fallback.
- Fully responsive, mobile first, verified mentally at 360px, 768px and 1280px. No horizontal overflow. Touch targets of at least 44px.
- Accessible: semantic landmarks, skip link, visible focus, labels for every control, aria-expanded on toggles, sufficient contrast, prefers-reduced-motion.
- Every button, link and form does something real: menu toggle, tabs, filters, cart or favorites in localStorage (inside try/catch), form validation with a thank-you state, smooth scroll, active nav state.
- Clean code: 'use strict', one namespace instead of loose globals, guard against missing elements, no console errors, escape any text inserted with innerHTML.
- If spreadsheet data is provided use it as the real content (products, prices, tables).

${STYLE_GUIDE}

QUALITY BAR (aim for the top score on each):
1. Visual design: a clear concept, a disciplined palette, a real type hierarchy, generous spacing, consistent components, tasteful motion. It must not look like a template.
2. Structure: tokens first, components second, pages third. Names are consistent (BEM-like).
3. Completeness: header, hero, content sections, social proof or numbers, call to action, footer, 404-safe links, empty and loading states.
4. Robustness: works without the network except for fonts, no layout shift, no overflow, no broken references.

EDITING: when existing files and a change request are given, return only the files that change, each one in full. Keep everything else untouched and keep the existing design system. You may add new files and you may delete files with a DELETE marker.`;

const DESIGN_SYS = `You are a senior art director and UX architect. From the request write a SHORT design brief (max 350 words, in Arabic or English) that another engineer will follow exactly. Cover: (1) concept and tone in one sentence, (2) palette as CSS token names with hex values and the contrast ratio of text on background, (3) fonts from Google Fonts, (4) the file plan (pages and css/js files), (5) the sections of each page in order, (6) key interactions and motion, (7) exactly where each uploaded image or video is used, with its path. Draw on the reference standard: Nasaq (tokens-driven marketplace), CodeBot (chat UI), Millano (video-led brand), 3D portfolio. No code, no emojis.`;

const REVIEW_SYS = `You are a meticulous senior reviewer and fixer for a static website made of several files. You receive the original request, the design brief, the current files and an automatic list of detected issues. Find real defects and fix them: broken file references, missing files, truncated files, logic bugs in the JavaScript, accessibility gaps, weak contrast, mobile overflow, missing states, bland or inconsistent design, leftover emojis, lorem ipsum, uploaded media that is not used. Improve the weakest part of the design if it looks generic.

Return ONLY the files you changed or added, each one in full, using the same marker format:
=== FILE: path ===
(content)
Use === DELETE: path === to remove a file. No commentary and no markdown fences. If the project is already excellent and has no detected problems, reply with exactly: NO_CHANGES
No emojis. Keep the existing design system and file structure.`;

const ASK_SYS = `You help scope a website project. Read the conversation. If key information is still missing, ask at most 3 short numbered questions in Egyptian Arabic and nothing else. When you have enough, reply exactly: READY: followed by a complete, detailed website brief in Arabic (pages, sections, content, style, colors, features). No emojis.`;

const CHAT_SYS = `You are Mokasha, a senior web developer and designer chatting with a person who is building a website with this tool. Reply in Egyptian Arabic unless they write in another language. Be direct and practical, short by default. No emojis. You can see the current project files and any images they attach. Use fenced code blocks with a language tag for code. When they ask for a change, say precisely what you would change and in which file; they can press the apply button under your reply to have the builder do it. Do not claim you changed files yourself. Reference standard you design by: Nasaq (token-driven Arabic marketplace), CodeBot (chat UI), Millano (video-led brand site), 3D portfolio (Three.js scene).`;

/* ---------- أدوات النصوص والملفات ---------- */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const stripEmoji = (s: string) => s.replace(EMOJI_RE, "");
const stripFence = (h: string) => h.replace(/^\s*```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/, "");

type FileItem = { path: string; content: string };
type Media = { label: string; data: string };
type Msg = { role: "user" | "assistant"; text: string; media?: Media[] };

const ALLOWED_EXT = /\.(html|css|js|json|svg|txt|md|xml|webmanifest)$/i;
function cleanPath(p: string): string | null {
  p = String(p).trim().replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!p || p.length > 80 || p.includes("..") || !/^[A-Za-z0-9_\-./]+$/.test(p) || !ALLOWED_EXT.test(p)) return null;
  return p;
}

function parseFiles(raw: string): { files: FileItem[]; deleted: string[] } {
  raw = raw.replace(/\r/g, "");
  const re = /^=== (FILE|DELETE): *([^\n=]+?) *===[ \t]*$/gm;
  const marks = [...raw.matchAll(re)];
  const files: FileItem[] = [], deleted: string[] = [];
  if (!marks.length) {
    const html = stripFence(raw).trim();
    if (/<html|<!doctype/i.test(html)) return { files: splitInline(stripEmoji(html)), deleted };
    return { files, deleted };
  }
  marks.forEach((m, i) => {
    const path = cleanPath(m[2]);
    if (!path) return;
    if (m[1] === "DELETE") { deleted.push(path); return; }
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index! : raw.length;
    const content = stripEmoji(stripFence(raw.slice(start, end))).replace(/^\n+/, "").replace(/\s+$/, "") + "\n";
    if (content.trim()) files.push({ path, content });
  });
  return { files, deleted };
}

// لو الموديل رجّع صفحة واحدة فيها style وscript جواها، نفصلهم لملفات
function splitInline(html: string): FileItem[] {
  let css = "", js = "";
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_m, c) => { css += c.trim() + "\n\n"; return ""; });
  html = html.replace(/<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi,
    (_m, c) => { js += c.trim() + "\n\n"; return ""; });
  if (css) html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="css/style.css">\n</head>');
  if (js) html = html.replace(/<\/body>/i, '  <script defer src="js/main.js"></script>\n</body>');
  const out: FileItem[] = [{ path: "index.html", content: html.trim() + "\n" }];
  if (css) out.push({ path: "css/style.css", content: css.trim() + "\n" });
  if (js) out.push({ path: "js/main.js", content: js.trim() + "\n" });
  return out;
}

function resolveRef(from: string, ref: string): string {
  ref = ref.split("#")[0].split("?")[0];
  if (ref.startsWith("/")) return ref.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const p of ref.split("/")) {
    if (p === "..") parts.pop();
    else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}

// فحص آلي سريع بيتبعت للمراجع
function lint(files: Record<string, string>, assets: string[]): string[] {
  const issues: string[] = [];
  const known = new Set([...Object.keys(files), ...assets]);
  if (!files["index.html"]) issues.push("index.html is missing.");
  for (const [path, c] of Object.entries(files)) {
    if (EMOJI_RE.test(c)) { issues.push(`${path}: contains emoji characters.`); EMOJI_RE.lastIndex = 0; }
    if (/lorem ipsum/i.test(c)) issues.push(`${path}: contains lorem ipsum text.`);
    if (path.endsWith(".html")) {
      if (!/<\/html>/i.test(c)) issues.push(`${path}: looks truncated (no closing </html>).`);
      if (!/<meta[^>]+viewport/i.test(c)) issues.push(`${path}: missing viewport meta.`);
      if (!/<title>[^<]+<\/title>/i.test(c)) issues.push(`${path}: missing or empty <title>.`);
      if (!/<html[^>]+lang=/i.test(c)) issues.push(`${path}: <html> has no lang attribute.`);
      if (/<style[\s>]/i.test(c)) issues.push(`${path}: has an inline <style>; move it into css/.`);
      if (/<img\b(?![^>]*\balt=)/i.test(c)) issues.push(`${path}: has an <img> without alt.`);
      for (const m of c.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
        const ref = m[1];
        if (/^(https?:|\/\/|mailto:|tel:|data:|blob:|#|javascript:)/i.test(ref)) continue;
        const target = resolveRef(path, ref);
        if (target && !known.has(target)) issues.push(`${path}: references missing file "${ref}".`);
      }
    }
    if (path.endsWith(".js") && /^\s*(import|export)\s/m.test(c)) issues.push(`${path}: uses ES module syntax; scripts are loaded as classic scripts.`);
  }
  const used = Object.values(files).join("\n");
  for (const a of assets) if (!used.includes(a)) issues.push(`Uploaded media "${a}" is not used anywhere.`);
  return issues.slice(0, 40);
}

function formatFiles(files: Record<string, string>, focus?: string, budget = MAX_CTX): string {
  const rank = (p: string) =>
    p === focus ? 0 : p.startsWith("css/") ? 1 : p.startsWith("js/") ? 2 : p.endsWith(".html") ? 3 : 4;
  const paths = Object.keys(files).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  let used = 0, out = "";
  const omitted: string[] = [];
  for (const p of paths) {
    const c = files[p];
    if (used + c.length > budget) { omitted.push(`${p} (${c.length} chars)`); continue; }
    used += c.length;
    out += `=== FILE: ${p} ===\n${c}\n`;
  }
  if (omitted.length) out += `\n[Files omitted for size, do not rewrite them unless required: ${omitted.join(", ")}]\n`;
  return out;
}

/* ---------- المزودين ---------- */
const parseData = (d: string) => {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i.exec(d);
  return m ? { mime: m[1].toLowerCase(), b64: m[2] } : null;
};

function cleanMedia(input: unknown): Media[] {
  if (!Array.isArray(input)) return [];
  const out: Media[] = [];
  for (const x of input.slice(0, MAX_IMAGES)) {
    const data = String((x as Media)?.data ?? "");
    if (!parseData(data) || data.length > MAX_IMG_CHARS) continue;
    out.push({ label: String((x as Media)?.label ?? "").slice(0, 160), data });
  }
  return out;
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("النموذج اتأخر في الرد. جرّب نموذج أسرع أو اطلب حاجة أصغر.");
    throw e;
  } finally { clearTimeout(t); }
}

async function callGrok(model: string, system: string, msgs: Msg[], max: number, withMedia: boolean): Promise<string> {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) throw new Error("مفتاح Grok لسه متحطش كـ Secret في Supabase (اسمه XAI_API_KEY)");
  const messages: unknown[] = [{ role: "system", content: system }];
  for (const m of msgs) {
    if (withMedia && m.media?.length) {
      const parts: unknown[] = [];
      for (const x of m.media) {
        if (x.label) parts.push({ type: "text", text: x.label });
        parts.push({ type: "image_url", image_url: { url: x.data, detail: "high" } });
      }
      parts.push({ type: "text", text: m.text });
      messages.push({ role: m.role, content: parts });
    } else {
      messages.push({ role: m.role, content: m.text });
    }
  }
  const send = (field: string) => timedFetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, [field]: max }),
  });
  let r = await send("max_completion_tokens");
  let d = await r.json().catch(() => ({}));
  if (!r.ok && /max_completion_tokens|max_tokens|unknown field|unsupported/i.test(JSON.stringify(d))) {
    r = await send("max_tokens");
    d = await r.json().catch(() => ({}));
  }
  if (!r.ok) {
    const e = new Error(d?.error?.message ?? d?.error ?? `Grok error (${r.status})`) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return d.choices?.[0]?.message?.content ?? "";
}

async function callGemini(model: string, system: string, msgs: Msg[], max: number): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("مفتاح Gemini لسه متحطش كـ Secret في Supabase (اسمه GEMINI_API_KEY)");
  const contents = msgs.map((m) => {
    const parts: unknown[] = [];
    for (const x of m.media ?? []) {
      const p = parseData(x.data)!;
      if (x.label) parts.push({ text: x.label });
      parts.push({ inlineData: { mimeType: p.mime, data: p.b64 } });
    }
    parts.push({ text: m.text });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const r = await timedFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: Math.max(max, 16000) } }),
  });
  const d = await r.json();
  if (!r.ok) {
    const e = new Error(d?.error?.message ?? "Gemini error") as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return (d.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
}

// بيجرب النموذج المختار، ولو رجع خطأ نموذج (مش موجود/زحمة) بيكمل على اللي بعده
async function llm(provider: string, model: string, system: string, msgs: Msg[], max = 8000): Promise<string> {
  const list = [model, ...MODELS[provider].filter((m) => m !== model)];
  let lastErr: Error | null = null;
  for (const m of list) {
    try {
      if (provider === "gemini") return await callGemini(m, system, msgs, max);
      try {
        return await callGrok(m, system, msgs, max, true);
      } catch (e) {
        // لو النموذج مش بيقبل صور، نعيد المحاولة بنص بس
        if (msgs.some((x) => x.media?.length) && /image|vision|multimodal|modalit/i.test((e as Error).message)) {
          const plain = msgs.map((x) => ({ ...x, text: x.text + (x.media?.length ? "\n\n[ملحوظة: الصور المرفقة مقدرتش تتقرا بالنموذج ده، اعتمد على الوصف المكتوب]" : ""), media: undefined }));
          return await callGrok(m, system, plain, max, false);
        }
        throw e;
      }
    } catch (e) {
      lastErr = e as Error;
      const st = (e as Error & { status?: number }).status ?? 0;
      const retryable = st === 404 || st === 429 || st >= 500 || /model|not found|does not exist|overloaded|capacity/i.test(lastErr.message);
      if (!retryable || /اتأخر/.test(lastErr.message)) break;
    }
  }
  throw lastErr ?? new Error("حصل خطأ غير معروف");
}

/* ---------- الخدمة ---------- */
const fileMap = (x: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      const p = cleanPath(k);
      if (p && typeof v === "string") out[p] = v;
    }
  }
  return out;
};
const strList = (x: unknown) => (Array.isArray(x) ? x.map(String).slice(0, 60) : []);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const since = new Date(Date.now() - 864e5).toISOString();
    const q = () => admin.from("sb_anon_usage").select("id", { count: "exact", head: true }).gte("created_at", since);
    const [mine, all] = await Promise.all([q().eq("ip", ip), q()]);
    if ((mine.count ?? 0) >= PER_IP_DAILY) return json({ error: `وصلت للحد اليومي (${PER_IP_DAILY} عملية). جرب بكرة.` }, 429);
    if ((all.count ?? 0) >= GLOBAL_DAILY) return json({ error: "الخدمة وصلت للحد اليومي، جرب بكرة." }, 429);
    const b = await req.json();
    const mode = String(b.mode ?? "generate");
    const used = () => admin.from("sb_anon_usage").insert({ ip });

    if (mode === "publish") {
      const h = String(b.html ?? "");
      if (!h || h.length > MAX_PUBLISH) return json({ error: "الموقع كبير أو فاضي. شيل فيديوهات أو صور كبيرة وجرب تاني." }, 400);
      const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const { error } = await admin.from("sb_published_pages").insert({ slug, html: h });
      if (error) throw new Error(error.message);
      await used();
      return json({ slug });
    }

    // "groq" القديمة بتتحول لـ Grok بتاع xAI
    const provider = b.provider === "gemini" ? "gemini" : "grok";
    const model = MODELS[provider].includes(b.model) ? b.model : MODELS[provider][0];
    const prompt = stripEmoji(String(b.prompt ?? ""));
    const media = cleanMedia(b.media);
    const assets = strList(b.assets);
    if (!prompt && !media.length && mode !== "review") return json({ error: "اكتب الأول." }, 400);
    if (prompt.length > MAX_PROMPT) return json({ error: `الوصف طويل (${prompt.length} حرف). الحد ${MAX_PROMPT}.` }, 400);

    if (mode === "clarify") {
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-12)
        .map((m: { r?: string; t?: unknown }) => `${m.r === "a" ? "Assistant" : "User"}: ${String(m.t).slice(0, 4000)}`).join("\n");
      const force = (b.history?.length ?? 0) >= 6 ? "\n\nYou have asked enough. Reply with READY: and the brief now." : "";
      const text = await llm(provider, model, ASK_SYS, [{ role: "user", text: hist + force, media }], 2000);
      await used();
      return json({ text: stripEmoji(text).trim() });
    }

    if (mode === "design") {
      const brief = stripEmoji(await llm(provider, model, DESIGN_SYS, [{ role: "user", text: prompt, media }], 2500)).trim();
      await used();
      return json({ brief });
    }

    if (mode === "chat") {
      const files = fileMap(b.files);
      const hist: Msg[] = (Array.isArray(b.history) ? b.history : []).slice(-14)
        .map((m: { r?: string; t?: unknown }) => ({ role: m.r === "a" ? "assistant" : "user", text: String(m.t).slice(0, 6000) }) as Msg);
      const ctx = Object.keys(files).length
        ? `\n\nCURRENT PROJECT FILES (read-only context):\n${formatFiles(files, String(b.focus ?? ""), 45000)}`
        : "\n\n(No project has been generated yet.)";
      const last: Msg = { role: "user", text: prompt || "شوف الصور المرفقة.", media };
      const text = await llm(provider, model, CHAT_SYS + ctx, [...hist, last], 4000);
      await used();
      return json({ text: stripEmoji(text).trim() });
    }

    if (mode === "review") {
      const files = fileMap(b.files);
      if (!Object.keys(files).length) return json({ error: "مفيش ملفات للمراجعة." }, 400);
      const issues = [...new Set([...strList(b.issues), ...lint(files, assets)])];
      const user = `REQUEST:\n${prompt}\n\nDESIGN BRIEF:\n${String(b.brief ?? "").slice(0, 4000)}\n\nUPLOADED MEDIA PATHS: ${assets.join(", ") || "none"}\n\nDETECTED ISSUES:\n${issues.map((i) => "- " + i).join("\n") || "- none detected automatically"}\n\nCURRENT FILES:\n${formatFiles(files)}`;
      const raw = await llm(provider, model, REVIEW_SYS, [{ role: "user", text: user }], 20000);
      await used();
      if (/^\s*NO_CHANGES\s*$/i.test(raw)) return json({ files: [], deleted: [], changed: false, issues });
      const { files: out, deleted } = parseFiles(raw);
      return json({ files: out, deleted, changed: out.length > 0 || deleted.length > 0, issues });
    }

    // generate (إنشاء أو تعديل)
    const cur = fileMap(b.files);
    const editing = Object.keys(cur).length > 0;
    let user = prompt;
    if (assets.length) user += `\n\nUPLOADED MEDIA (use these exact paths): ${assets.join(", ")}`;
    if (b.brief) user += `\n\nDESIGN BRIEF from the design agent (follow it):\n${String(b.brief).slice(0, 6000)}`;
    if (editing) user = `CURRENT PROJECT FILES:\n${formatFiles(cur, String(b.focus ?? ""))}\n\nCHANGE REQUEST:\n${user}\n\nReturn only the changed or new files, each in full.`;
    else user = `Build this website as separate files.\n\n${user}`;
    const raw = await llm(provider, model, CODE_SYS, [{ role: "user", text: user, media }], 20000);
    const { files: out, deleted } = parseFiles(raw);
    if (!out.length) return json({ error: "لم يتم توليد ملفات. جرب وصف تاني أو نموذج تاني." }, 502);
    await used();
    const merged = { ...cur };
    for (const f of out) merged[f.path] = f.content;
    for (const d of deleted) delete merged[d];
    return json({ files: out, deleted, issues: lint(merged, assets) });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 400);
  }
});
