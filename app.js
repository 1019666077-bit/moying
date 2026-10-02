(() => {
  const BASE_W = 900;
  const BASE_H = 1200;
  // Free downloads stay 900×1200 and watermarked. A paid design exports 1800×2400 with no watermark.
  const FREE_W = 900;
  const FREE_H = 1200;
  const CLEAN_HD_W = 1800;
  const CLEAN_HD_H = 2400;
  const MAX_LEN = 16;
  const segmenter = (typeof Intl !== "undefined" && Intl.Segmenter)
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

  const FONTS = {
    gong: "fonts/zcoolxiaowei-latin.ttf",
    kai: "fonts/mashanzheng-latin.ttf",
    xing: "fonts/longcang-latin.ttf",
    cao: "fonts/liujianmaocao-latin.ttf",
    kuang: "fonts/zhimangxing-latin.ttf",
    seal: "fonts/seal.ttf",
  };
  // Chinese characters for the name combos. Kept out of FONTS so it never
  // becomes a brush-style key (?style=).
  const HANZI_FONT = "fonts/mashanzheng-hanzi.ttf";
  const NAMES_URL = "data/names-zh.json";
  // Landing pages for these words are not names; skip the "no Chinese name" note.
  const WORD_PAGES = new Set(["love", "peace", "hope", "dream"]);

  const fontPromises = {};
  const fontReady = {};
  const canvas = document.getElementById("stage");
  const ui = {
    text: document.getElementById("textInput"),
    size: document.getElementById("size"),
    track: document.getElementById("track"),
    dry: document.getElementById("dry"),
    seal: document.getElementById("sealOn"),
    loading: document.getElementById("loading"),
    count: document.getElementById("charCount"),
    charHint: document.getElementById("charHint"),
    limitHint: document.getElementById("limitHint"),
    nameHint: document.getElementById("nameHint"),
    btnExport: document.getElementById("btnExport"),
    btnPay: document.getElementById("btnPay"),
    payNote: document.getElementById("payNote"),
    btnRestore: document.getElementById("btnRestore"),
    exportHint: document.getElementById("exportHint"),
  };
  // Landing pages ship only <canvas id="stage"> plus <body data-text="…">, so every
  // control is optional: missing ones fall back to the generator's default value.
  const DEFAULT_SIZE = 196;
  const DEFAULT_TRACK = 38;
  const DEFAULT_DRY = 22;
  const textSource = () => (ui.text ? ui.text.value : (document.body.dataset.text || ""));
  const valueOf = (el, fallback) => (el ? Number(el.value) : fallback);
  const state = { style: "kai", dir: "h", paper: "xuan", ink: "black", fmt: "png" };
  let previewGen = 0;
  let previewWaiting = 0;
  let exportCount = 0;
  let exporting = false;
  let paidDesign = null;
  let payBusy = false;
  let payError = "";
  let waitingForPayment = false;
  let expectReturn = false;
  let appliedReturn = false;
  let pollTimer = 0;
  let pollAttempts = 0;
  let memoryToken = "";
  let namesMap = null; // lowercased English name -> Chinese transliteration
  let priceLabel = "$4.99"; // matches functions/lib/pricing.js; refreshed from /api/config
  const UNLOCK_KEY = "moying-unlock";

  document.querySelectorAll(".seg").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      seg.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("on", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      state[seg.dataset.name] = btn.dataset.v;
      if (seg.dataset.name !== "fmt") drawPreview();
    });
  });
  if (ui.text) {
    ui.text.addEventListener("input", () => {
      const next = clampText(ui.text.value);
      if (next !== ui.text.value) {
        const at = ui.text.selectionStart;
        ui.text.value = next;
        const pos = Math.min(at == null ? next.length : at, next.length);
        ui.text.setSelectionRange(pos, pos);
      }
      drawPreview();
    });
  }
  [ui.size, ui.track, ui.dry].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", drawPreview);
  });
  if (ui.seal) ui.seal.addEventListener("change", drawPreview);
  if (ui.btnExport) ui.btnExport.onclick = () => exportCurrent();
  if (ui.btnPay) ui.btnPay.onclick = () => startCheckout();
  if (ui.btnRestore) ui.btnRestore.onclick = () => {
    if (paidDesign) applyDesign(paidDesign);
  };

  function designPayload(snap) {
    return {
      text: snap.text,
      style: snap.style,
      dir: snap.dir,
      paper: snap.paper,
      ink: snap.ink,
      size: snap.size,
      track: snap.track,
      dry: snap.dry,
      seal: !!snap.seal,
    };
  }

  // A purchase unlocks the word itself, so every brush style, paper, ink, size
  // and layout is clean once the same word is drawn. Changing the word locks again.
  function cleanNow(snap) {
    return !!paidDesign && paidDesign.word === snap.text;
  }

  function isToken(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  }

  function rememberToken(token) {
    memoryToken = token;
    try { localStorage.setItem(UNLOCK_KEY, token); } catch (_) { /* private mode */ }
  }

  function currentToken() {
    try { return localStorage.getItem(UNLOCK_KEY) || memoryToken; } catch (_) { return memoryToken; }
  }

  function forgetToken() {
    memoryToken = "";
    try { localStorage.removeItem(UNLOCK_KEY); } catch (_) { /* private mode */ }
  }

  function setPayNote(message) {
    if (!ui.payNote) return;
    ui.payNote.textContent = message || "";
  }

  function updatePayUi() {
    // Landing pages have no checkout UI, so there is nothing to update there.
    if (!ui.btnPay) return;
    const snap = snapshot();
    const match = cleanNow(snap);
    if (match) {
      ui.btnPay.textContent = "Watermark removed";
      ui.btnPay.disabled = true;
      ui.btnPay.classList.add("paid");
      ui.btnRestore.hidden = true;
      setPayNote("Watermark removed for this word. Every brush style and setting exports clean at 1800×2400.");
      ui.exportHint.textContent = "Clean download: 1800×2400, no watermark";
      return;
    }
    ui.btnPay.classList.remove("paid");
    ui.btnPay.disabled = payBusy;
    ui.btnPay.textContent = payBusy ? "Starting checkout…" : `Remove watermark · ${priceLabel}`;
    ui.exportHint.textContent = "Free downloads: 900×1200 watermarked preview";
    if (paidDesign) {
      ui.btnRestore.hidden = false;
      setPayNote(`A clean download is saved for “${paidDesign.text}”. Switch style or paper freely — the word stays unlocked.`);
      return;
    }
    ui.btnRestore.hidden = true;
    if (payError) setPayNote(payError);
    else if (waitingForPayment) setPayNote("Waiting for payment confirmation…");
    else setPayNote("");
  }

  function applyDesign(design) {
    // Only the generator has these controls; a landing page just re-renders.
    if (ui.text) ui.text.value = design.text;
    if (ui.size) ui.size.value = String(design.size);
    if (ui.track) ui.track.value = String(design.track);
    if (ui.dry) ui.dry.value = String(design.dry);
    if (ui.seal) ui.seal.checked = !!design.seal;
    ["style", "dir", "paper", "ink"].forEach((name) => {
      state[name] = design[name];
      document.querySelectorAll(`[data-name="${name}"] button`).forEach((btn) => {
        const on = btn.dataset.v === design[name];
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
    drawPreview();
  }

  function schedulePoll(limit) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => refreshUnlock(limit), 2000);
  }

  async function refreshUnlock(limit) {
    const token = currentToken();
    if (!isToken(token)) {
      paidDesign = null;
      waitingForPayment = false;
      updatePayUi();
      return;
    }
    let response;
    try {
      response = await fetch(`/api/status?token=${token}`, { cache: "no-store" });
    } catch (_) {
      updatePayUi();
      return;
    }
    if (response.status === 503 || response.status === 404) {
      payError = "Payments are unavailable right now. You can still download a free watermarked preview.";
      waitingForPayment = false;
      updatePayUi();
      return;
    }
    if (!response.ok) {
      updatePayUi();
      return;
    }
    let data;
    try {
      data = await response.json();
    } catch (_) {
      updatePayUi();
      return;
    }
    if (data.status === "paid" && data.design) {
      const firstConfirm = !paidDesign;
      paidDesign = { ...data.design, word: data.word || data.design.text };
      waitingForPayment = false;
      payError = "";
      if (expectReturn && firstConfirm) track("purchase-confirmed");
      if (expectReturn && !appliedReturn) {
        appliedReturn = true;
        applyDesign(data.design);
        return;
      }
      updatePayUi();
      drawPreview();
      return;
    }
    if (data.status === "refunded") {
      paidDesign = null;
      waitingForPayment = false;
      forgetToken();
      payError = "This purchase was refunded. The watermark is back.";
      updatePayUi();
      drawPreview();
      return;
    }
    if (data.status === "unknown") {
      paidDesign = null;
      waitingForPayment = false;
      forgetToken();
      updatePayUi();
      return;
    }
    if (data.status === "pending") {
      pollAttempts += 1;
      if (expectReturn && !appliedReturn && data.design) {
        appliedReturn = true;
        applyDesign(data.design);
      }
      if (pollAttempts >= limit) {
        waitingForPayment = false;
        if (expectReturn) payError = "Payment is not confirmed yet. If you paid, refresh this page in a moment.";
        updatePayUi();
        return;
      }
      waitingForPayment = expectReturn;
      schedulePoll(limit);
      updatePayUi();
      return;
    }
    updatePayUi();
  }

  async function startCheckout() {
    track("buy-click");
    if (payBusy || cleanNow(snapshot())) return;
    const snap = snapshot();
    if (!snap.text) {
      payError = "Type a word or name first.";
      updatePayUi();
      return;
    }
    payBusy = true;
    payError = "";
    updatePayUi();
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ design: designPayload(snap) }),
      });
      if (response.status === 404 || response.status === 503) {
        payError = "Payments are unavailable right now. You can still download a free watermarked preview.";
        return;
      }
      let data = null;
      try { data = await response.json(); } catch (_) { data = null; }
      if (!response.ok || !data || !data.checkoutUrl || !isToken(data.token)) {
        payError = data && data.error === "bad_design"
          ? "That design cannot be checked out. Use English letters, numbers, and simple punctuation."
          : "Could not start checkout. Please try again in a moment.";
        return;
      }
      rememberToken(data.token);
      location.href = data.checkoutUrl;
    } catch (_) {
      payError = "Payments are unavailable right now. You can still download a free watermarked preview.";
    } finally {
      payBusy = false;
      updatePayUi();
    }
  }

  function track(name) {
    try {
      const gc = window.goatcounter;
      if (gc && typeof gc.count === "function") gc.count({ path: name, event: true });
    } catch (err) {
      console.error(err);
    }
  }

  // The price shown in the button comes from the server config when it is
  // reachable, and from the static HTML fallback otherwise. Both match
  // functions/lib/pricing.js, which tests enforce.
  async function loadPrice() {
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data.priceLabel === "string" && data.priceLabel) {
        priceLabel = data.priceLabel;
        updatePayUi();
      }
    } catch (_) { /* keep the fallback price */ }
  }

  async function loadNames() {
    try {
      const res = await fetch(NAMES_URL, { cache: "force-cache" });
      if (!res.ok) return null;
      const data = await res.json();
      // The table nests records under "names" as { zh, pinyin }; a flat
      // "Name": "汉字" map is still accepted so an older cached file keeps working.
      const table = data && typeof data.names === "object" && data.names ? data.names : data;
      const map = new Map();
      for (const [key, value] of Object.entries(table)) {
        if (key.startsWith("_")) continue;
        const zh = value && typeof value === "object" ? value.zh : value;
        if (typeof zh !== "string" || !zh) continue;
        map.set(key.toLowerCase(), zh);
      }
      return map.size ? map : null;
    } catch (_) {
      return null;
    }
  }

  // Only a single Latin word that is in the fixed table gets a combo. Words and
  // phrases outside it stay English-only.
  function comboFor(text) {
    if (!namesMap || !text) return "";
    if (!/^[A-Za-z][A-Za-z'’-]*$/.test(text)) return "";
    return namesMap.get(text.toLowerCase()) || "";
  }

  function updateComboHint(text) {
    if (!ui.nameHint) return;
    const lower = String(text || "").toLowerCase();
    const missing = !!namesMap && /^[A-Za-z][A-Za-z'’-]*$/.test(text)
      && !WORD_PAGES.has(lower) && !namesMap.has(lower);
    ui.nameHint.hidden = !missing;
    ui.nameHint.textContent = missing
      ? `We don't have a Chinese name for ${text} yet.`
      : "";
  }

  function loadFont(key) {
    if (!fontPromises[key]) {
      fontPromises[key] = (async () => {
        // `key` is a FONTS style name or a direct font path (the hanzi subset).
        const res = await fetch(FONTS[key] || key);
        if (!res.ok) throw new Error("font " + res.status);
        const font = opentype.parse(await res.arrayBuffer());
        fontReady[key] = font;
        return font;
      })().catch((err) => {
        delete fontPromises[key];
        throw err;
      });
    }
    return fontPromises[key];
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Letters that do not decompose under NFD.
  const ASCII_FOLD = {
    æ: "ae", Æ: "Ae", œ: "oe", Œ: "Oe",
    ø: "o", Ø: "O", ł: "l", Ł: "L",
    đ: "d", Đ: "D", ð: "d", Ð: "D",
    þ: "th", Þ: "Th", ß: "ss",
    ı: "i", İ: "I", ŋ: "n", Ŋ: "N",
  };

  function foldToAscii(ch) {
    if (ASCII_FOLD[ch]) return ASCII_FOLD[ch];
    const stripped = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!stripped || stripped === ch) return "";
    let out = "";
    for (const part of stripped) {
      const cp = part.codePointAt(0);
      if (cp >= 0x20 && cp <= 0x7e) out += part;
      else if (ASCII_FOLD[part]) out += ASCII_FOLD[part];
      else return "";
    }
    return out;
  }

  function graphemes(value) {
    const s = String(value || "");
    if (segmenter) return Array.from(segmenter.segment(s), (part) => part.segment);
    return Array.from(s);
  }

  function clampText(raw) {
    const parts = graphemes(raw);
    if (parts.length <= MAX_LEN) return parts.join("");
    return parts.slice(0, MAX_LEN).join("");
  }

  function analyze(raw) {
    // Same 16-grapheme cap as the counter. One emoji counts as one character.
    const value = clampText(raw);
    let unsupported = false;
    let changed = false;
    let kept = "";
    for (const ch of value) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x20 && cp <= 0x7e) {
        kept += ch;
        continue;
      }
      const folded = foldToAscii(ch);
      if (folded) {
        kept += folded;
        changed = true;
      } else {
        unsupported = true;
      }
    }
    const text = kept.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
    return { text, unsupported, changed };
  }

  function filterGlyphs(font, text) {
    let dropped = false;
    let out = "";
    for (const ch of text) {
      if (ch === " ") {
        out += ch;
        continue;
      }
      const g = font.charToGlyph(ch);
      if (!g || g.name === ".notdef") dropped = true;
      else out += ch;
    }
    return { text: out.replace(/\s+/g, " ").trim(), dropped };
  }

  function snapshot() {
    const parsed = analyze(textSource());
    return {
      text: parsed.text,
      unsupported: parsed.unsupported,
      changed: parsed.changed,
      style: state.style,
      dir: state.dir,
      paper: state.paper,
      ink: state.ink,
      fmt: state.fmt,
      size: valueOf(ui.size, DEFAULT_SIZE),
      track: valueOf(ui.track, DEFAULT_TRACK),
      dry: valueOf(ui.dry, DEFAULT_DRY),
      seal: !ui.seal || ui.seal.checked,
    };
  }

  function syncControls(flags, drawable) {
    const len = graphemes(textSource()).length;
    if (ui.count) {
      ui.count.textContent = `${len}/${MAX_LEN}`;
      ui.count.classList.toggle("at-limit", len >= MAX_LEN);
    }
    if (ui.limitHint) ui.limitHint.hidden = len < MAX_LEN;
    const notes = [];
    if (flags.changed) notes.push("Accents are drawn as plain letters.");
    if (flags.unsupported) notes.push("Some characters cannot be drawn. Use English letters, numbers, and simple punctuation.");
    if (ui.charHint) {
      ui.charHint.hidden = notes.length === 0;
      ui.charHint.textContent = notes.join(" ");
    }
    if (ui.btnExport) ui.btnExport.disabled = drawable.length === 0;
  }

  function showLoading(msg) {
    if (!ui.loading) return;
    ui.loading.textContent = msg;
    ui.loading.classList.remove("hide");
  }

  function hideLoadingIfIdle() {
    if (ui.loading && exportCount === 0 && previewWaiting === 0) ui.loading.classList.add("hide");
  }

  function paperColors(kind) {
    if (kind === "aged") return { bg: ["#e4c992", "#c9a56a"], fiber: "#b08950" };
    if (kind === "night") return { bg: ["#1b1713", "#0e0c0a"], fiber: "#3a3228" };
    return { bg: ["#f4ead4", "#e8d7b4"], fiber: "#cbb892" };
  }

  function inkColor(snap) {
    const night = snap.paper === "night";
    if (snap.ink === "cinnabar") return night ? { r: 232, g: 92, b: 74 } : { r: 152, g: 36, b: 28 };
    return night ? { r: 236, g: 226, b: 206 } : { r: 28, g: 20, b: 14 };
  }

  function seedKey(snap) {
    return [snap.text, snap.style, snap.dir, snap.paper, snap.ink, snap.size, snap.track, snap.dry, snap.seal ? 1 : 0, "v3"].join("|");
  }

  function paintPaper(ctx, snap, rng, w, h) {
    const c = paperColors(snap.paper);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c.bg[0]);
    g.addColorStop(1, c.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = rng() > 0.55 ? "#fff8e8" : c.fiber;
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 1.6, 4 + rng() * 10);
    }
    ctx.restore();
    ctx.save();
    for (let i = 0; i < 18; i++) {
      ctx.globalAlpha = 0.04 + rng() * 0.05;
      ctx.fillStyle = snap.paper === "night" ? "#2a241c" : "#6b5340";
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, 0.6 + rng() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const rod = snap.paper === "night" ? "rgba(90,70,50,0.45)" : "rgba(90,62,36,0.18)";
    ctx.fillStyle = rod;
    ctx.fillRect(0, 0, w, h * 0.028);
    ctx.fillRect(0, h * 0.972, w, h * 0.028);
  }

  function scratchDry(ctx, path, dry, rng) {
    if (dry < 4) return;
    const bb = path.getBoundingBox();
    const w = bb.x2 - bb.x1;
    const h = bb.y2 - bb.y1;
    if (!(w > 1 && h > 1)) return;
    ctx.save();
    ctx.clip(new Path2D(path.toPathData(2)));
    ctx.globalCompositeOperation = "destination-out";
    const n = Math.round(5 + dry * 0.42);
    for (let i = 0; i < n; i++) {
      const len = Math.min(w, h) * (0.12 + rng() * 0.38);
      const thick = 0.35 + rng() * (0.35 + dry / 160);
      ctx.globalAlpha = 0.1 + rng() * 0.22 * (0.35 + dry / 80);
      ctx.save();
      ctx.translate(bb.x1 + rng() * w, bb.y1 + rng() * h);
      ctx.rotate(rng() * Math.PI);
      if (rng() > 0.55) {
        ctx.beginPath();
        ctx.arc(0, 0, thick * (0.8 + rng()), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-len / 2, -thick / 2, len * (0.35 + rng() * 0.65), thick);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function wildOn(snap) { return snap.style === "kuang"; }
  function wildJitter(snap, size, i, axis) {
    if (!wildOn(snap)) return 0;
    return Math.sin(i * 2.1 + (axis === "y" ? 1 : 0)) * size * (axis === "y" ? 0.12 : 0.06);
  }
  function wildScale(snap, i) { return wildOn(snap) ? 0.86 + ((i * 37) % 10) / 40 : 1; }
  function fleckAmount(snap) {
    const d = snap.style === "kuang" ? Math.min(88, snap.dry + 36) : snap.dry;
    if (snap.style === "gong") return d * 0.25;
    if (snap.style === "kuang") return Math.min(90, d + 28);
    return d;
  }

  function paintGlyph(ctx, font, snap, ch, x, y, size, ink, rng, idx) {
    ctx.save();
    if (wildOn(snap)) {
      const cx = x + size * 0.2;
      const cy = y - size * 0.3;
      ctx.translate(cx, cy);
      ctx.rotate((-14 + ((idx || 0) * 11) % 28) * Math.PI / 180);
      ctx.translate(-cx, -cy);
    }
    const p = font.getPath(ch, x, y, size);
    p.fill = `rgb(${ink.r},${ink.g},${ink.b})`;
    ctx.globalAlpha = snap.style === "gong" ? 0.96 : 0.94;
    p.draw(ctx);
    scratchDry(ctx, p, fleckAmount(snap), rng);
    ctx.restore();
  }

  function drawSealRun(ctx, font, text, centerX, centerY, size, color) {
    const gap = size * 0.06;
    const glyphs = [...text].map((ch) => {
      const bb = font.getPath(ch, 0, 0, size).getBoundingBox();
      return { ch, bb, gw: Math.max(1, bb.x2 - bb.x1) };
    });
    const total = glyphs.reduce((s, g) => s + g.gw, 0) + gap * Math.max(0, glyphs.length - 1);
    let x = centerX - total / 2;
    glyphs.forEach((g) => {
      const path = font.getPath(g.ch, x - g.bb.x1, centerY - (g.bb.y1 + g.bb.y2) / 2, size);
      path.fill = color;
      path.draw(ctx);
      x += g.gw + gap;
    });
    return total;
  }

  function drawSeal(ctx, sealFont, x, y, size, night) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.18);
    const stroke = night ? "#e15a4a" : "#b42318";
    ctx.strokeStyle = stroke;
    ctx.fillStyle = night ? "rgba(180,40,30,0.18)" : "rgba(180,35,24,0.12)";
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.fillRect(-size / 2, -size / 2, size, size);
    if (sealFont) {
      const glyphSize = size * 0.4;
      drawSealRun(ctx, sealFont, "墨", 0, -size * 0.16, glyphSize, stroke);
      drawSealRun(ctx, sealFont, "英", 0, size * 0.2, glyphSize, stroke);
    }
    ctx.restore();
  }

  // Short irregular nicks, about 20–25% of the ink. Not a repeating stripe.
  function cutHere(lx, ly) {
    const wx = lx + Math.sin(ly * 0.023 + 0.4) * 17 + Math.sin(lx * 0.011 + ly * 0.007) * 9;
    const wy = ly + Math.sin(lx * 0.019 + 1.1) * 15 + Math.sin(ly * 0.013 + 0.6) * 8;
    const cell = 28;
    const gx = Math.floor(wx / cell);
    const gy = Math.floor(wy / cell);
    const fx = wx / cell - gx;
    const fy = wy / cell - gy;
    function hash(a, b, s) {
      const n = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
      return n - Math.floor(n);
    }
    for (let k = 0; k < 2; k++) {
      const h1 = hash(gx, gy, k + 1.3);
      const h2 = hash(gx, gy, k + 8.1);
      const h3 = hash(gx, gy, k + 19.4);
      const dx = fx - (0.12 + 0.76 * h1);
      const dy = fy - (0.12 + 0.76 * h2);
      const ang = h3 * Math.PI;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const u = dx * ca + dy * sa;
      const v = -dx * sa + dy * ca;
      const halfL = 0.18 + 0.10 * h1;
      const halfW = 0.115 + 0.04 * h2;
      if (Math.abs(u) < halfL && Math.abs(v) < halfW) return true;
    }
    return false;
  }

  // Opaque files copy the paper under each scratch. Transparent files punch alpha out.
  function cutInkWatermark(layer, paper, transparent) {
    const ctx = layer.getContext("2d");
    const w = layer.width;
    const h = layer.height;
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    const paperData = transparent ? null : paper.getContext("2d").getImageData(0, 0, w, h).data;
    const scale = w / BASE_W;
    for (let y = 0; y < h; y++) {
      const ly = y / scale;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] === 0) continue;
        if (!cutHere(x / scale, ly)) continue;
        if (transparent) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        } else {
          data[i] = paperData[i];
          data[i + 1] = paperData[i + 1];
          data[i + 2] = paperData[i + 2];
          data[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function drawPreviewMark(ctx, w, h, night) {
    const label = "mymoying.com preview";
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.font = "600 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    const bw = tw + 20;
    const bh = 26;
    const x = (w - bw) / 2;
    const y = h - 46;
    ctx.fillStyle = night ? "rgba(16,12,9,0.9)" : "rgba(244,234,212,0.92)";
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = night ? "#f3ead6" : "#3a2a1c";
    ctx.fillText(label, w / 2, y + bh / 2 + 0.5);
    ctx.restore();
  }

  function measureGlyphs(font, chars, fontSize) {
    const scale = fontSize / font.unitsPerEm;
    return chars.map((ch) => {
      if (ch === " ") {
        const adv = (font.charToGlyph(" ").advanceWidth || 0) * scale;
        return { ch, space: true, gw: Math.max(fontSize * 0.2, adv || fontSize * 0.28), gh: fontSize * 0.2, bb: null };
      }
      const path = font.getPath(ch, 0, 0, fontSize);
      const bb = path.getBoundingBox();
      const rawW = bb.x2 - bb.x1;
      const rawH = bb.y2 - bb.y1;
      return {
        ch,
        space: false,
        bb,
        gw: Math.max(fontSize * 0.28, Number.isFinite(rawW) ? rawW : fontSize * 0.5),
        gh: Math.max(fontSize * 0.55, Number.isFinite(rawH) ? rawH : fontSize * 0.7),
      };
    });
  }

  function glyphWidth(gs, gap) {
    return gs.reduce((s, g) => s + g.gw, 0) + gap * Math.max(0, gs.length - 1);
  }

  function gapOf(snap, fontSize) {
    const trackRatio = snap.track / 100;
    const trackBias = snap.style === "gong" ? 0.14 : 0.06;
    return fontSize * (0.08 + trackRatio * 0.35 + trackBias);
  }

  function baseSize(snap) {
    return snap.size * ((snap.style === "cao" || snap.style === "kuang") ? 1.12 : 1.06);
  }

  // Break only on spaces. A single long word stays on one line and is scaled down.
  function wrapWords(font, text, fontSize, maxWidth, gap) {
    const words = text.split(" ").filter(Boolean);
    if (!words.length) return [[]];
    const space = measureGlyphs(font, [" "], fontSize)[0];
    const lines = [];
    let current = [];
    words.forEach((word) => {
      const gs = measureGlyphs(font, [...word], fontSize);
      if (!current.length) {
        current = gs;
        return;
      }
      const trial = current.concat([space], gs);
      if (glyphWidth(trial, gap) > maxWidth) {
        lines.push(current);
        current = gs;
      } else {
        current = trial;
      }
    });
    if (current.length) lines.push(current);
    return lines;
  }

  function layoutHorizontal(font, snap) {
    const maxW = BASE_W * 0.88;
    const maxH = BASE_H * 0.78;
    let size = baseSize(snap);
    let measured = [];
    let gap = gapOf(snap, size);
    let lineHs = [];
    const lineGapOf = (s) => s * 0.28;
    for (let pass = 0; pass < 12; pass++) {
      gap = gapOf(snap, size);
      measured = wrapWords(font, snap.text, size, maxW, gap);
      lineHs = measured.map((gs) => Math.max(size * 0.6, ...gs.map((g) => g.gh)));
      const widest = Math.max(1, ...measured.map((gs) => glyphWidth(gs, gap)));
      const blockH = lineHs.reduce((s, v) => s + v, 0) + lineGapOf(size) * Math.max(0, measured.length - 1);
      const fit = Math.min(widest > maxW ? maxW / widest : 1, blockH > maxH ? maxH / blockH : 1);
      if (fit > 0.992 || size <= 18) break;
      size = Math.max(18, size * fit * 0.995);
    }
    return { size, measured, gap, lineHs, lineGap: lineGapOf(size) };
  }

  function layoutVertical(font, snap) {
    const maxH = BASE_H * 0.84;
    let size = baseSize(snap);
    let glyphs = [];
    let gap = gapOf(snap, size);
    const chars = [...snap.text];
    for (let pass = 0; pass < 12; pass++) {
      glyphs = measureGlyphs(font, chars, size);
      gap = gapOf(snap, size);
      const colH = glyphs.reduce((s, g) => s + g.gh, 0) + gap * Math.max(0, glyphs.length - 1);
      const fit = colH > maxH ? maxH / colH : 1;
      if (fit > 0.992 || size <= 18) break;
      size = Math.max(18, size * fit * 0.995);
    }
    return { size, glyphs, gap };
  }

  function paintWords(ctx, font, snap, ink, rng) {
    let idx = 0;
    let fitted = baseSize(snap);
    if (snap.dir === "v") {
      const layout = layoutVertical(font, snap);
      const { size, glyphs, gap } = layout;
      fitted = size;
      const colH = glyphs.reduce((s, g) => s + g.gh, 0) + gap * Math.max(0, glyphs.length - 1);
      let y = (BASE_H - colH) / 2 - BASE_H * 0.03;
      const cx = BASE_W * 0.5;
      glyphs.forEach((item) => {
        if (!item.space && item.bb) {
          const drawn = size * wildScale(snap, idx);
          const x = cx - (item.bb.x1 + item.bb.x2) / 2 + wildJitter(snap, size, idx, "x");
          const baseline = y - item.bb.y1 + wildJitter(snap, size, idx, "y");
          paintGlyph(ctx, font, snap, item.ch, x, baseline, drawn, ink, rng, idx);
          idx += 1;
        }
        y += item.gh + gap;
      });
      return fitted;
    }
    const layout = layoutHorizontal(font, snap);
    const { size, measured, gap, lineHs, lineGap } = layout;
    fitted = size;
    const blockH = lineHs.reduce((s, v) => s + v, 0) + lineGap * Math.max(0, measured.length - 1);
    let y0 = (BASE_H - blockH) / 2 - BASE_H * 0.04;
    measured.forEach((gs, li) => {
      let x = (BASE_W - glyphWidth(gs, gap)) / 2;
      const midY = y0 + lineHs[li] / 2;
      gs.forEach((item) => {
        if (!item.space && item.bb) {
          const drawn = size * wildScale(snap, idx);
          const px = x - item.bb.x1 + wildJitter(snap, size, idx, "x");
          const baseline = midY - (item.bb.y1 + item.bb.y2) / 2 + wildJitter(snap, size, idx, "y");
          paintGlyph(ctx, font, snap, item.ch, px, baseline, drawn, ink, rng, idx);
          idx += 1;
        }
        x += item.gw + gap;
      });
      y0 += lineHs[li] + lineGap;
    });
    return fitted;
  }

  function paintHanzi(ctx, font, chars, size, centerX, centerY, ink) {
    const glyphs = [...chars].map((ch) => {
      const bb = font.getPath(ch, 0, 0, size).getBoundingBox();
      return { ch, bb, gw: Math.max(size * 0.72, bb.x2 - bb.x1) };
    });
    const gap = size * 0.1;
    const total = glyphs.reduce((sum, g) => sum + g.gw, 0) + gap * Math.max(0, glyphs.length - 1);
    let x = centerX - total / 2;
    ctx.save();
    ctx.globalAlpha = 0.94;
    glyphs.forEach((g) => {
      const path = font.getPath(g.ch, x - g.bb.x1, centerY - (g.bb.y1 + g.bb.y2) / 2, size);
      path.fill = `rgb(${ink.r},${ink.g},${ink.b})`;
      path.draw(ctx);
      x += g.gw + gap;
    });
    ctx.restore();
  }

  // English brush letters above, the conventional Chinese characters below.
  function paintCombo(ctx, font, hanziFont, snap, ink, rng) {
    const englishSnap = { ...snap, size: snap.size * 0.74 };
    ctx.save();
    ctx.translate(0, -BASE_H * 0.11);
    const fitted = paintWords(ctx, font, englishSnap, ink, rng);
    ctx.restore();
    const size = Math.min(150, (BASE_W * 0.62) / Math.max(1, [...snap.combo].length));
    paintHanzi(ctx, hanziFont, snap.combo, size, BASE_W * 0.5, BASE_H * 0.7, ink);
    return fitted;
  }

  function withLogical(ctx, target, fn) {
    const scale = target.width / BASE_W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    fn(scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function paintScene(target, snap, font, sealFont, opts) {
    const ctx = target.getContext("2d");
    const paperRng = mulberry32(hashString(seedKey(snap) + "|paper"));
    const transparent = !!(opts && opts.transparent);
    const watermark = !opts || opts.watermark !== false;
    withLogical(ctx, target, () => {
      if (transparent) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.setTransform(target.width / BASE_W, 0, 0, target.width / BASE_W, 0, 0);
      } else {
        paintPaper(ctx, snap, paperRng, BASE_W, BASE_H);
      }
      if (!snap.text || !font) {
        ctx.save();
        ctx.fillStyle = snap.paper === "night" ? "rgba(230,210,180,0.55)" : "rgba(90,74,52,0.55)";
        ctx.font = "36px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(snap.unsupported ? "Those characters cannot be drawn" : "Type a name or short word", BASE_W / 2, BASE_H / 2);
        ctx.restore();
      }
    });
    if (!snap.text || !font) return;

    const layer = document.createElement("canvas");
    layer.width = target.width;
    layer.height = target.height;
    const inkRng = mulberry32(hashString(seedKey(snap) + "|ink"));
    const lctx = layer.getContext("2d");
    let fitted = baseSize(snap);
    const hanziFont = opts && opts.hanziFont;
    withLogical(lctx, layer, () => {
      fitted = (snap.combo && hanziFont)
        ? paintCombo(lctx, font, hanziFont, snap, inkColor(snap), inkRng)
        : paintWords(lctx, font, snap, inkColor(snap), inkRng);
    });
    if (watermark) cutInkWatermark(layer, target, transparent);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    withLogical(ctx, target, () => {
      if (snap.seal) {
        const size = Math.min(68, fitted * 0.38);
        drawSeal(ctx, sealFont, BASE_W * 0.82, BASE_H * 0.88, size, snap.paper === "night");
      }
      if (watermark) drawPreviewMark(ctx, BASE_W, BASE_H, snap.paper === "night");
    });
  }

  function paintMessage(target, snap, message) {
    const ctx = target.getContext("2d");
    withLogical(ctx, target, () => {
      paintPaper(ctx, snap, mulberry32(hashString(seedKey(snap) + "|paper")), BASE_W, BASE_H);
      ctx.fillStyle = "#7a1f16";
      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(message, BASE_W / 2, BASE_H / 2);
    });
  }

  function preparePreview() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(FREE_W, Math.round(BASE_W * dpr));
    const h = Math.min(FREE_H, Math.round(BASE_H * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  async function drawPreview() {
    const gen = ++previewGen;
    const snap = snapshot();
    syncControls(snap, snap.text);
    updatePayUi();
    preparePreview();
    if (!snap.text) {
      updateComboHint("");
      paintScene(canvas, snap, null, null, { watermark: !cleanNow(snap) });
      if (ui.loading && gen === previewGen && exportCount === 0) ui.loading.classList.add("hide");
      return;
    }
    const waiting = !fontReady[snap.style] || !fontReady.seal;
    if (waiting) {
      previewWaiting += 1;
      showLoading("Loading brush…");
    }
    try {
      const [font, sealFont] = await Promise.all([loadFont(snap.style), loadFont("seal").catch(() => null)]);
      if (gen !== previewGen) return;
      const filtered = filterGlyphs(font, snap.text);
      syncControls({ unsupported: snap.unsupported || filtered.dropped, changed: snap.changed }, filtered.text);
      updateComboHint(filtered.text);
      const combo = comboFor(filtered.text);
      let hanziFont = null;
      if (combo) {
        hanziFont = await loadFont(HANZI_FONT).catch(() => null);
        if (gen !== previewGen) return;
        if (hanziFont && ![...combo].every((ch) => {
          const glyph = hanziFont.charToGlyph(ch);
          return glyph && glyph.name !== ".notdef";
        })) hanziFont = null;
      }
      const scene = {
        ...snap,
        text: filtered.text,
        unsupported: snap.unsupported || filtered.dropped,
        combo: hanziFont ? combo : "",
      };
      paintScene(canvas, scene, font, sealFont, { watermark: !cleanNow(snap), hanziFont });
    } catch (err) {
      if (gen !== previewGen) return;
      console.error(err);
      paintMessage(canvas, snap, "Font failed to load");
    } finally {
      if (waiting) previewWaiting = Math.max(0, previewWaiting - 1);
      if (gen === previewGen) hideLoadingIfIdle();
    }
  }

  function fileStem(text) {
    const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug ? `moying-${slug}` : "moying-mark";
  }

  function isMobileShare() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  }

  function saveBlob(blob, filename, mime) {
    const file = new File([blob], filename, { type: mime || blob.type });
    const send = async () => {
      try {
        if (isMobileShare() && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Moying" });
          return;
        }
      } catch (_) { /* download instead */ }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    send();
  }

  function canvasBlob(target, mime, quality) {
    return new Promise((resolve, reject) => {
      target.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("empty image"))), mime, quality);
    });
  }

  async function renderExport(snap, transparent, clean) {
    const [font, sealFont] = await Promise.all([loadFont(snap.style), loadFont("seal").catch(() => null)]);
    const filtered = filterGlyphs(font, snap.text);
    if (!filtered.text) return null;
    const combo = comboFor(filtered.text);
    let hanziFont = null;
    if (combo) {
      hanziFont = await loadFont(HANZI_FONT).catch(() => null);
      if (hanziFont && ![...combo].every((ch) => {
        const glyph = hanziFont.charToGlyph(ch);
        return glyph && glyph.name !== ".notdef";
      })) hanziFont = null;
    }
    const out = document.createElement("canvas");
    out.width = clean ? CLEAN_HD_W : FREE_W;
    out.height = clean ? CLEAN_HD_H : FREE_H;
    paintScene(out, { ...snap, text: filtered.text, combo: hanziFont ? combo : "" }, font, sealFont, {
      transparent: !!transparent,
      watermark: !clean,
      hanziFont,
    });
    return { canvas: out, text: filtered.text };
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // SVG embeds the same painted canvas as PNG. There is no outline layer, so
  // deleting elements cannot produce a clean vector. Unpaid files include the
  // ink nicks and the preview label; a paid design omits both.
  async function exportSvg(snap, clean) {
    const rendered = await renderExport(snap, false, clean);
    if (!rendered) return;
    const blob = await canvasBlob(rendered.canvas, "image/png");
    const b64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    const w = rendered.canvas.width;
    const h = rendered.canvas.height;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<image width="${w}" height="${h}" href="data:image/png;base64,${b64}"/>\n</svg>\n`;
    saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${fileStem(rendered.text)}.svg`, "image/svg+xml");
    return true;
  }

  // Real PDF of the same painted image (300 dpi). No text layer.
  function buildPdf(jpegBytes, imgW, imgH) {
    const pageW = (imgW / 300) * 72;
    const pageH = (imgH / 300) * 72;
    const enc = new TextEncoder();
    const chunks = [];
    let length = 0;
    function push(part) {
      const bytes = typeof part === "string" ? enc.encode(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    }
    const offsets = [];
    function startObj(n) {
      offsets[n] = length;
      push(`${n} 0 obj\n`);
    }
    function endObj() { push("\nendobj\n"); }

    push("%PDF-1.4\n");
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    startObj(1); push("<< /Type /Catalog /Pages 2 0 R >>"); endObj();
    startObj(2); push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); endObj();
    startObj(3);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`);
    endObj();
    const content = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    startObj(4);
    push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    endObj();
    startObj(5);
    push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    push(jpegBytes);
    push("\nendstream");
    endObj();
    const xrefPos = length;
    push("xref\n0 6\n");
    push("0000000000 65535 f \n");
    for (let i = 1; i <= 5; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
    const out = new Uint8Array(length);
    let o = 0;
    chunks.forEach((c) => { out.set(c, o); o += c.length; });
    return out;
  }

  async function exportPdf(snap, clean) {
    const rendered = await renderExport(snap, false, clean);
    if (!rendered) return;
    const jpeg = await canvasBlob(rendered.canvas, "image/jpeg", 0.92);
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const pdf = buildPdf(bytes, rendered.canvas.width, rendered.canvas.height);
    saveBlob(new Blob([pdf], { type: "application/pdf" }), `${fileStem(rendered.text)}.pdf`, "application/pdf");
    return true;
  }

  async function exportRaster(snap, mime, ext, quality, transparent, clean) {
    const rendered = await renderExport(snap, transparent, clean);
    if (!rendered) return;
    const blob = await canvasBlob(rendered.canvas, mime, quality);
    const name = transparent ? `${fileStem(rendered.text)}-transparent.${ext}` : `${fileStem(rendered.text)}.${ext}`;
    saveBlob(blob, name, blob.type || mime);
    return true;
  }

  async function exportCurrent() {
    if (exporting) return;
    const snap = snapshot();
    if (!snap.text) return;
    exporting = true;
    exportCount += 1;
    showLoading("Exporting…");
    try {
      const fmt = snap.fmt || "png";
      const clean = cleanNow(snap);
      let saved = false;
      if (fmt === "png") saved = await exportRaster(snap, "image/png", "png", 1, false, clean);
      else if (fmt === "jpg") saved = await exportRaster(snap, "image/jpeg", "jpg", 0.92, false, clean);
      else if (fmt === "webp") saved = await exportRaster(snap, "image/webp", "webp", 0.92, false, clean);
      else if (fmt === "alpha") saved = await exportRaster(snap, "image/png", "png", 1, true, clean);
      else if (fmt === "svg") saved = await exportSvg(snap, clean);
      else if (fmt === "pdf") saved = await exportPdf(snap, clean);
      const eventName = {
        png: "export-png",
        jpg: "export-jpg",
        webp: "export-webp",
        alpha: "export-transparent",
        svg: "export-svg",
        pdf: "export-pdf",
      }[fmt];
      if (saved && eventName) track(eventName);
    } catch (err) {
      console.error(err);
      alert("Could not finish the export. Please try again.");
    } finally {
      exporting = false;
      exportCount = Math.max(0, exportCount - 1);
      hideLoadingIfIdle();
    }
  }

  const q = new URLSearchParams(location.search);
  const unlockParam = q.get("unlock");
  if (isToken(unlockParam)) {
    rememberToken(unlockParam);
    expectReturn = true;
    q.delete("unlock");
    const next = q.toString();
    history.replaceState(null, "", next ? `${location.pathname}?${next}` : location.pathname);
  }
  // Pin links use ?name=. Keep ?text= when name is absent.
  const queryText = q.has("name") ? q.get("name") : (q.has("text") ? q.get("text") : null);
  if (queryText != null) {
    // On the generator this fills the input; a landing page has no input, so it
    // overrides the name baked into <body data-text>.
    if (ui.text) ui.text.value = clampText(queryText);
    else document.body.dataset.text = clampText(queryText);
  }
  if (q.get("style") && FONTS[q.get("style")] && q.get("style") !== "seal") {
    state.style = q.get("style");
    document.querySelectorAll('[data-name="style"] button').forEach((b) => {
      const on = b.dataset.v === state.style;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  // Landing pages pick a brush style with <body data-style="cao">.
  if (document.body.dataset.style && FONTS[document.body.dataset.style]) state.style = document.body.dataset.style;
  document.querySelectorAll(".seg button").forEach((b) => {
    if (!b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
  });
  preparePreview();
  // Draw once the name table is known so a matching name paints its combo on
  // the first pass instead of flashing the English-only version.
  loadNames().then((map) => {
    namesMap = map;
    drawPreview();
    if (isToken(currentToken())) refreshUnlock(expectReturn ? 90 : 15);
  });
  loadPrice();
})();
