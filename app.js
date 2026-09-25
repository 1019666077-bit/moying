(() => {
  const F = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl";
  const FONTS = {
    gong: F + "/mashanzheng/MaShanZheng-Regular.ttf",
    kai: F + "/mashanzheng/MaShanZheng-Regular.ttf",
    xing: F + "/longcang/LongCang-Regular.ttf",
    cao: F + "/liujianmaocao/LiuJianMaoCao-Regular.ttf",
    kuang: F + "/liujianmaocao/LiuJianMaoCao-Regular.ttf",
  };
  const loaded = {};
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  let pen = ctx;
  let lastLayout = null;
  const ui = {
    text: document.getElementById("textInput"),
    size: document.getElementById("size"),
    track: document.getElementById("track"),
    dry: document.getElementById("dry"),
    seal: document.getElementById("sealOn"),
    loading: document.getElementById("loading"),
  };
  const state = { style: "kai", dir: "h", paper: "xuan", ink: "black", fmt: "png" };
  document.querySelectorAll(".seg").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      seg.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      state[seg.dataset.name] = btn.dataset.v;
      if (seg.dataset.name !== "fmt") draw();
    });
  });
  ["text", "size", "track", "dry", "seal"].forEach((k) => {
    ui[k].addEventListener("input", () => draw());
    ui[k].addEventListener("change", () => draw());
  });
  document.getElementById("btnDraw").onclick = () => draw();
  document.getElementById("btnPng").onclick = exportCurrent;
  document.getElementById("btnShare").onclick = exportCurrent;
  document.getElementById("btnPay").onclick = () => {
    alert("Clean HD is $1.99. Payment is not connected yet.");
  };
  function paperColors(kind) {
    if (kind === "aged") return { bg: ["#e4c992", "#c9a56a"], fiber: "#b08950" };
    if (kind === "night") return { bg: ["#1b1713", "#0e0c0a"], fiber: "#3a3228" };
    return { bg: ["#f4ead4", "#e8d7b4"], fiber: "#cbb892" };
  }
  function inkColor() {
    const night = state.paper === "night";
    if (state.ink === "cinnabar") return night ? { r: 232, g: 92, b: 74 } : { r: 152, g: 36, b: 28 };
    return night ? { r: 236, g: 226, b: 206 } : { r: 28, g: 20, b: 14 };
  }
  function paintPaper(w, h) {
    const c = paperColors(state.paper);
    const g = pen.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c.bg[0]); g.addColorStop(1, c.bg[1]);
    pen.fillStyle = g; pen.fillRect(0, 0, w, h);
    pen.save(); pen.globalAlpha = 0.05;
    for (let i = 0; i < 420; i++) {
      pen.fillStyle = Math.random() > 0.55 ? "#fff8e8" : c.fiber;
      pen.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.6, 4 + Math.random() * 10);
    }
    pen.restore();
    pen.save();
    for (let i = 0; i < 18; i++) {
      pen.globalAlpha = 0.04 + Math.random() * 0.05;
      pen.fillStyle = state.paper === "night" ? "#2a241c" : "#6b5340";
      const r = 0.6 + Math.random() * 2.2;
      pen.beginPath(); pen.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2); pen.fill();
    }
    pen.restore();
    const rod = state.paper === "night" ? "rgba(90,70,50,0.45)" : "rgba(90,62,36,0.18)";
    pen.fillStyle = rod; pen.fillRect(0, 0, w, h * 0.028); pen.fillRect(0, h * 0.972, w, h * 0.028);
  }
  function scratchDry(ctx, path, dry) {
    if (dry < 6) return;
    const bb = path.getBoundingBox();
    const w = Math.max(1, bb.x2 - bb.x1);
    const h = Math.max(1, bb.y2 - bb.y1);
    ctx.save();
    ctx.clip(new Path2D(path.toPathData(1)));
    ctx.globalCompositeOperation = "destination-out";
    const rows = 6 + Math.floor(dry / 7);
    for (let i = 0; i < rows; i++) {
      ctx.globalAlpha = 0.18 + (dry / 100) * 0.45;
      const y = bb.y1 + ((i + 0.35) * h) / rows;
      ctx.fillRect(bb.x1 - 2, y, w + 4, 0.7 + (dry / 100) * 1.6);
    }
    ctx.restore();
  }
  function drawSeal(x, y, size, night) {
    pen.save(); pen.translate(x, y); pen.rotate(-0.18);
    pen.strokeStyle = night ? "#e15a4a" : "#b42318";
    pen.fillStyle = night ? "rgba(180,40,30,0.18)" : "rgba(180,35,24,0.12)";
    pen.lineWidth = Math.max(2, size * 0.06);
    pen.strokeRect(-size / 2, -size / 2, size, size); pen.fillRect(-size / 2, -size / 2, size, size);
    pen.fillStyle = night ? "#f07a6a" : "#b42318";
    pen.font = `${size * 0.42}px "Songti SC", serif`; pen.textAlign = "center"; pen.textBaseline = "middle";
    pen.fillText("墨", 0, -size * 0.16); pen.fillText("英", 0, size * 0.22); pen.restore();
  }
  function drawWatermark(w, h, night) {
    const ink = night ? "rgba(232,214,180,0.16)" : "rgba(90,62,36,0.16)";
    const strong = night ? "rgba(232,214,180,0.28)" : "rgba(70,48,28,0.28)";
    pen.save(); pen.translate(w / 2, h / 2); pen.rotate(-0.42);
    pen.textAlign = "center"; pen.textBaseline = "middle"; pen.fillStyle = ink;
    pen.font = "700 92px 'Songti SC', serif";
    for (let y = -h; y <= h; y += 210) for (let x = -w; x <= w; x += 340) pen.fillText("墨英", x, y);
    pen.restore();
    pen.save(); pen.translate(w / 2, h * 0.56); pen.rotate(-0.18); pen.fillStyle = strong;
    pen.font = "700 64px 'Songti SC', serif"; pen.textAlign = "center"; pen.fillText("墨英 · MOYING", 0, 0); pen.restore();
    pen.save(); pen.fillStyle = night ? "rgba(0,0,0,0.45)" : "rgba(244,234,212,0.72)";
    pen.fillRect(0, h - 64, w, 64);
    pen.fillStyle = night ? "rgba(232,214,180,0.9)" : "rgba(70,48,28,0.88)";
    pen.font = "22px sans-serif"; pen.textAlign = "center";
    pen.fillText("PREVIEW  ·  $1.99 remove watermark", w / 2, h - 28); pen.restore();
  }
  function wildOn() { return state.style === "kuang"; }
  function wildJitter(size, i, axis) {
    if (!wildOn()) return 0;
    return Math.sin(i * 2.1 + (axis === "y" ? 1 : 0)) * size * (axis === "y" ? 0.12 : 0.06);
  }
  function wildScale(i) { return wildOn() ? 0.86 + ((i * 37) % 10) / 40 : 1; }
  function wildDry(dry) { return wildOn() ? Math.min(88, dry + 36) : dry; }
  function paintGlyph(font, ch, x, y, size, ink, dry, idx) {
    if (ch === " ") return;
    pen.save();
    if (wildOn()) {
      const cx = x + size * 0.2, cy = y - size * 0.3;
      pen.translate(cx, cy); pen.rotate((-14 + ((idx || 0) * 11) % 28) * Math.PI / 180); pen.translate(-cx, -cy);
    }
    const p = font.getPath(ch, x, y, size);
    p.fill = `rgb(${ink.r},${ink.g},${ink.b})`;
    pen.globalAlpha = state.style === "gong" ? 0.96 : 0.94;
    p.draw(pen);
    const fleck = state.style === "gong" ? dry * 0.25 : state.style === "kuang" ? Math.min(90, dry + 28) : dry;
    scratchDry(pen, p, fleck);
    pen.restore(); return p;
  }
  async function getFont(style) {
    if (loaded[style]) return loaded[style];
    const res = await fetch(FONTS[style]);
    if (!res.ok) throw new Error("font " + res.status);
    loaded[style] = opentype.parse(await res.arrayBuffer());
    return loaded[style];
  }
  async function draw(opts = {}) {
    const target = opts.canvas || canvas; pen = target.getContext("2d");
    const w = target.width, h = target.height;
    if (opts.transparent) pen.clearRect(0, 0, w, h); else paintPaper(w, h);
    const text = (ui.text.value || "").slice(0, 16).replace(/[^\S\n]+/g, " ").trim();
    if (!opts.silent) { ui.loading.textContent = opts.exporting ? "Exporting…" : "Grinding ink…"; ui.loading.classList.remove("hide"); }
    if (!text) {
      pen.save(); pen.fillStyle = state.paper === "night" ? "rgba(230,210,180,0.45)" : "rgba(90,74,52,0.45)";
      pen.font = "36px serif"; pen.textAlign = "center"; pen.textBaseline = "middle";
      pen.fillText("Type a name or short word", w / 2, h / 2); pen.restore();
      lastLayout = null; if (!opts.silent) ui.loading.classList.add("hide"); pen = ctx; return;
    }
    try {
      const font = await getFont(state.style); const dry = Number(ui.dry.value); const ink = inkColor();
      const chars = [...text]; const vertical = state.dir === "v";
      const lines = (!vertical && chars.length > 8) ? [chars.slice(0, Math.ceil(chars.length / 2)), chars.slice(Math.ceil(chars.length / 2))] : [chars];
      let size = Number(ui.size.value) * (state.style === "cao" || state.style === "kuang" ? 1.12 : 1.06);
      const trackRatio = Number(ui.track.value) / 100;
      const trackBias = state.style === "gong" ? 0.14 : 0.06;
      const measure = (arr, fontSize) => arr.map((ch) => {
        const path = font.getPath(ch === " " ? " " : ch, 0, 0, fontSize); const bb = path.getBoundingBox();
        return { ch, bb, gw: Math.max(fontSize * 0.28, bb.x2 - bb.x1), gh: Math.max(fontSize * 0.55, bb.y2 - bb.y1) };
      });
      const gapOf = (fontSize) => fontSize * (0.08 + trackRatio * 0.35 + trackBias);
      const placed = []; let idx = 0;
      if (vertical) {
        let glyphs = measure(chars, size);
        let colH = glyphs.reduce((s, g) => s + g.gh, 0) + gapOf(size) * Math.max(0, glyphs.length - 1);
        if (colH > h * 0.84) { size *= (h * 0.84) / colH; glyphs = measure(chars, size); colH = glyphs.reduce((s, g) => s + g.gh, 0) + gapOf(size) * Math.max(0, glyphs.length - 1); }
        const gap = gapOf(size); let y = (h - colH) / 2 - h * 0.03; const cx = w * 0.5;
        glyphs.forEach((item) => {
          const x = cx - (item.bb.x1 + item.bb.x2) / 2 + wildJitter(size, idx, "x");
          const baseline = y - item.bb.y1 + wildJitter(size, idx, "y");
          paintGlyph(font, item.ch, x, baseline, size * wildScale(idx), ink, wildDry(dry), idx);
          placed.push({ ch: item.ch, x, y: baseline, size: size * wildScale(idx), i: idx }); y += item.gh + gap; idx++;
        });
      } else {
        let measured = lines.map((ln) => measure(ln, size));
        const lineW = (gs) => gs.reduce((s, g) => s + g.gw, 0) + gapOf(size) * Math.max(0, gs.length - 1);
        let widest = Math.max(...measured.map(lineW));
        if (widest > w * 0.88) { size *= (w * 0.88) / widest; measured = lines.map((ln) => measure(ln, size)); widest = Math.max(...measured.map(lineW)); }
        const gap = gapOf(size); const lineGap = size * 0.28;
        const lineHs = measured.map((gs) => Math.max(...gs.map((g) => g.gh), size * 0.6));
        const blockH = lineHs.reduce((s, v) => s + v, 0) + lineGap * Math.max(0, measured.length - 1);
        let y0 = (h - blockH) / 2 - h * 0.04;
        measured.forEach((gs, li) => {
          let x = (w - lineW(gs)) / 2; const midY = y0 + lineHs[li] / 2;
          gs.forEach((item) => {
            const px = x - item.bb.x1 + wildJitter(size, idx, "x");
            const baseline = midY - (item.bb.y1 + item.bb.y2) / 2 + wildJitter(size, idx, "y");
            paintGlyph(font, item.ch, px, baseline, size * wildScale(idx), ink, wildDry(dry), idx);
            placed.push({ ch: item.ch, x: px, y: baseline, size: size * wildScale(idx), i: idx }); x += item.gw + gap; idx++;
          });
          y0 += lineHs[li] + lineGap;
        });
      }
      const seal = ui.seal.checked ? { x: w * 0.82, y: h * 0.88, size: Math.min(68, size * 0.38), night: state.paper === "night" } : null;
      if (seal) drawSeal(seal.x, seal.y, seal.size, seal.night);
      if (!opts.clean) drawWatermark(w, h, state.paper === "night");
      lastLayout = { w, h, text, ink, placed, seal, paper: state.paper, style: state.style, font };
    } catch (err) {
      ctx.fillStyle = "#7a1f16"; ctx.font = "28px serif";
      ctx.fillText("Font failed to load", 40, h / 2); console.error(err);
    }
    if (!opts.silent) ui.loading.classList.add("hide"); pen = ctx;
  }
  function stem() {
    return `moying-${(ui.text.value || "peace").replace(/[^\w\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "piece"}`;
  }
  function saveBlob(blob, filename, mime) {
    const file = new File([blob], filename, { type: mime || blob.type });
    const send = async () => {
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Moying" }); return; } } catch (_) {}
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    }; send();
  }
  function rasterCanvas(scale) { const out = document.createElement("canvas"); out.width = 900 * scale; out.height = 1200 * scale; return out; }
  async function exportRaster(mime, ext, quality, transparent) {
    const out = rasterCanvas(2); await draw({ canvas: out, transparent: !!transparent, silent: false, exporting: true });
    const blob = await new Promise((res) => out.toBlob((b) => res(b), mime, quality));
    saveBlob(blob, transparent ? `${stem()}-alpha.${ext}` : `${stem()}.${ext}`, blob.type || mime);
  }
  function pathToD(path) {
    return path.commands.map((c) => {
      if (c.type === "M") return `M${c.x} ${c.y}`;
      if (c.type === "L") return `L${c.x} ${c.y}`;
      if (c.type === "Q") return `Q${c.x1} ${c.y1} ${c.x} ${c.y}`;
      if (c.type === "C") return `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`;
      if (c.type === "Z") return "Z"; return "";
    }).join(" ");
  }
  function buildSvg() {
    const L = lastLayout; if (!L) return "";
    const paper = paperColors(L.paper); const ink = `rgb(${L.ink.r},${L.ink.g},${L.ink.b})`; const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${L.w}" height="${L.h}" viewBox="0 0 ${L.w} ${L.h}">`);
    parts.push(`<rect width="100%" height="100%" fill="${paper.bg[0]}"/>`);
    L.placed.forEach((g) => {
      const p = L.font.getPath(g.ch, g.x, g.y, g.size);
      const rot = L.style === "kuang" ? (-14 + (g.i * 11) % 28) : 0;
      const cx = g.x + g.size * 0.2, cy = g.y - g.size * 0.3;
      const tf = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : "";
      parts.push(`<path d="${pathToD(p)}" fill="${ink}"${tf}/>`);
    });
    if (L.seal) {
      const s = L.seal.size, x = L.seal.x, y = L.seal.y, col = L.seal.night ? "#e15a4a" : "#b42318";
      parts.push(`<g transform="translate(${x} ${y}) rotate(-7)">`);
      parts.push(`<rect x="${-s/2}" y="${-s/2}" width="${s}" height="${s}" fill="none" stroke="${col}" stroke-width="${Math.max(2,s*0.06)}"/>`);
      parts.push(`<text x="0" y="${-s*0.08}" text-anchor="middle" font-size="${s*0.42}" fill="${col}" font-family="serif">墨</text>`);
      parts.push(`<text x="0" y="${s*0.32}" text-anchor="middle" font-size="${s*0.42}" fill="${col}" font-family="serif">英</text></g>`);
    }
    parts.push(svgWatermark(L.w, L.h, L.paper === "night"));
    parts.push("</svg>"); return parts.join("");
  }
  function svgWatermark(w, h, night) {
    const ink = night ? "rgba(232,214,180,0.16)" : "rgba(90,62,36,0.16)";
    const strong = night ? "rgba(232,214,180,0.28)" : "rgba(70,48,28,0.28)";
    const bar = night ? "rgba(0,0,0,0.45)" : "rgba(244,234,212,0.72)";
    const barText = night ? "rgba(232,214,180,0.9)" : "rgba(70,48,28,0.88)";
    const tiles = [];
    for (let y = -h; y <= h; y += 210) {
      for (let x = -w; x <= w; x += 340) {
        tiles.push(`<text x="${x}" y="${y}" fill="${ink}" font-size="92" font-weight="700" font-family="serif" text-anchor="middle">墨英</text>`);
      }
    }
    return [
      `<g transform="translate(${w / 2} ${h / 2}) rotate(-24)">${tiles.join("")}</g>`,
      `<text x="${w / 2}" y="${h * 0.56}" fill="${strong}" font-size="64" font-weight="700" font-family="serif" text-anchor="middle" transform="rotate(-10 ${w / 2} ${h * 0.56})">墨英 · MOYING</text>`,
      `<rect x="0" y="${h - 64}" width="${w}" height="64" fill="${bar}"/>`,
      `<text x="${w / 2}" y="${h - 22}" fill="${barText}" font-size="22" font-family="sans-serif" text-anchor="middle">PREVIEW  ·  $1.99 remove watermark</text>`,
    ].join("");
  }
  function exportSvg() { saveBlob(new Blob([buildSvg()], { type: "image/svg+xml" }), `${stem()}.svg`, "image/svg+xml"); }
  async function exportPdf() {
    const out = rasterCanvas(1); await draw({ canvas: out, silent: false, exporting: true });
    const jpeg = await new Promise((res) => out.toBlob((b) => res(b), "image/jpeg", 0.92));
    saveBlob(jpeg, `${stem()}.jpg`, "image/jpeg");
  }
  async function exportCurrent() {
    const f = state.fmt || "png";
    if (f === "png") return exportRaster("image/png", "png", 1, false);
    if (f === "jpg") return exportRaster("image/jpeg", "jpg", 0.92, false);
    if (f === "webp") return exportRaster("image/webp", "webp", 0.92, false);
    if (f === "alpha") return exportRaster("image/png", "png", 1, true);
    if (f === "svg") return exportSvg();
    if (f === "pdf") return exportPdf();
  }
  const q = new URLSearchParams(location.search);
  if (q.get("text")) ui.text.value = q.get("text");
  if (q.get("style") && FONTS[q.get("style")]) {
    state.style = q.get("style");
    document.querySelectorAll('[data-name="style"] button').forEach((b) => b.classList.toggle("on", b.dataset.v === state.style));
  }
  draw();
})();
