(() => {
  // Plug the Waffo Pancake checkout URL here after merchant review.
  // Leave it empty: the buy button stays a placeholder and does not charge anyone.
  const WAFFO_PURCHASE_URL = "";

  const BASE_W = 900;
  const BASE_H = 1200;
  // Free watermarked downloads. Paid Clean HD stays 1800×2400 and is not used here.
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
    btnExport: document.getElementById("btnExport"),
  };
  const state = { style: "kai", dir: "h", paper: "xuan", ink: "black", fmt: "png" };
  let previewGen = 0;
  let previewWaiting = 0;
  let exportCount = 0;
  let exporting = false;

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
  ui.size.addEventListener("input", drawPreview);
  ui.track.addEventListener("input", drawPreview);
  ui.dry.addEventListener("input", drawPreview);
  ui.seal.addEventListener("change", drawPreview);
  ui.btnExport.onclick = () => exportCurrent();
  document.getElementById("btnPay").onclick = () => {
    track("buy-click");
    if (WAFFO_PURCHASE_URL) {
      location.href = WAFFO_PURCHASE_URL;
      return;
    }
    alert("Clean HD is $1.99. Payment is not connected yet.");
  };

  function track(name) {
    try {
      const gc = window.goatcounter;
      if (gc && typeof gc.count === "function") gc.count({ path: name, event: true });
    } catch (err) {
      console.error(err);
    }
  }

  function loadFont(key) {
    if (!fontPromises[key]) {
      fontPromises[key] = (async () => {
        const res = await fetch(FONTS[key]);
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
    const parsed = analyze(ui.text.value);
    return {
      text: parsed.text,
      unsupported: parsed.unsupported,
      changed: parsed.changed,
      style: state.style,
      dir: state.dir,
      paper: state.paper,
      ink: state.ink,
      fmt: state.fmt,
      size: Number(ui.size.value),
      track: Number(ui.track.value),
      dry: Number(ui.dry.value),
      seal: ui.seal.checked,
    };
  }

  function syncControls(flags, drawable) {
    const len = graphemes(ui.text.value).length;
    ui.count.textContent = `${len}/${MAX_LEN}`;
    ui.count.classList.toggle("at-limit", len >= MAX_LEN);
    ui.limitHint.hidden = len < MAX_LEN;
    const notes = [];
    if (flags.changed) notes.push("Accents are drawn as plain letters.");
    if (flags.unsupported) notes.push("Some characters cannot be drawn. Use English letters, numbers, and simple punctuation.");
    ui.charHint.hidden = notes.length === 0;
    ui.charHint.textContent = notes.join(" ");
    ui.btnExport.disabled = drawable.length === 0;
  }

  function showLoading(msg) {
    ui.loading.textContent = msg;
    ui.loading.classList.remove("hide");
  }

  function hideLoadingIfIdle() {
    if (exportCount === 0 && previewWaiting === 0) ui.loading.classList.add("hide");
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
    const transparent = !!opts.transparent;
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
    withLogical(lctx, layer, () => {
      fitted = paintWords(lctx, font, snap, inkColor(snap), inkRng);
    });
    cutInkWatermark(layer, target, transparent);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    withLogical(ctx, target, () => {
      if (snap.seal) {
        const size = Math.min(68, fitted * 0.38);
        drawSeal(ctx, sealFont, BASE_W * 0.82, BASE_H * 0.88, size, snap.paper === "night");
      }
      drawPreviewMark(ctx, BASE_W, BASE_H, snap.paper === "night");
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
    preparePreview();
    if (!snap.text) {
      paintScene(canvas, snap, null, null, {});
      if (gen === previewGen && exportCount === 0) ui.loading.classList.add("hide");
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
      paintScene(canvas, { ...snap, text: filtered.text, unsupported: snap.unsupported || filtered.dropped }, font, sealFont, {});
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

  function exportCanvas() {
    const out = document.createElement("canvas");
    out.width = FREE_W;
    out.height = FREE_H;
    return out;
  }

  async function renderExport(snap, transparent) {
    const [font, sealFont] = await Promise.all([loadFont(snap.style), loadFont("seal").catch(() => null)]);
    const filtered = filterGlyphs(font, snap.text);
    if (!filtered.text) return null;
    const out = exportCanvas();
    paintScene(out, { ...snap, text: filtered.text }, font, sealFont, { transparent: !!transparent });
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

  // Free SVG contains only the watermarked bitmap. Outlines are never written,
  // so deleting elements cannot produce a clean vector.
  async function exportSvg(snap) {
    const rendered = await renderExport(snap, false);
    if (!rendered) return;
    const blob = await canvasBlob(rendered.canvas, "image/png");
    const b64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${FREE_W}" height="${FREE_H}" viewBox="0 0 ${FREE_W} ${FREE_H}">\n<image width="${FREE_W}" height="${FREE_H}" href="data:image/png;base64,${b64}"/>\n</svg>\n`;
    saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${fileStem(rendered.text)}.svg`, "image/svg+xml");
    return true;
  }

  // Real PDF: one 900×1200 watermarked JPEG (300 dpi, 3×4 in). No text layer.
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

  async function exportPdf(snap) {
    const rendered = await renderExport(snap, false);
    if (!rendered) return;
    const jpeg = await canvasBlob(rendered.canvas, "image/jpeg", 0.92);
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const pdf = buildPdf(bytes, FREE_W, FREE_H);
    saveBlob(new Blob([pdf], { type: "application/pdf" }), `${fileStem(rendered.text)}.pdf`, "application/pdf");
    return true;
  }

  async function exportRaster(snap, mime, ext, quality, transparent) {
    const rendered = await renderExport(snap, transparent);
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
      let saved = false;
      if (fmt === "png") saved = await exportRaster(snap, "image/png", "png", 1, false);
      else if (fmt === "jpg") saved = await exportRaster(snap, "image/jpeg", "jpg", 0.92, false);
      else if (fmt === "webp") saved = await exportRaster(snap, "image/webp", "webp", 0.92, false);
      else if (fmt === "alpha") saved = await exportRaster(snap, "image/png", "png", 1, true);
      else if (fmt === "svg") saved = await exportSvg(snap);
      else if (fmt === "pdf") saved = await exportPdf(snap);
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
  if (q.has("text")) ui.text.value = clampText(q.get("text"));
  if (q.get("style") && FONTS[q.get("style")] && q.get("style") !== "seal") {
    state.style = q.get("style");
    document.querySelectorAll('[data-name="style"] button').forEach((b) => {
      const on = b.dataset.v === state.style;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  document.querySelectorAll(".seg button").forEach((b) => {
    if (!b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
  });
  preparePreview();
  drawPreview();
})();
