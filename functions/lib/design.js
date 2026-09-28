const STYLES = new Set(["gong", "kai", "xing", "cao", "kuang"]);
const DIRS = new Set(["h", "v"]);
const PAPERS = new Set(["xuan", "aged", "night"]);
const INKS = new Set(["black", "cinnabar"]);

function intIn(value, min, max) {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

// The browser sends the already-folded word it will draw. Keep this object
// shape in sync with designPayload() in app.js.
export function canonicalDesign(input) {
  if (!input || typeof input !== "object") return null;
  const text = typeof input.text === "string" ? input.text : "";
  if (!text || text.length > 16) return null;
  if (!/^[\x20-\x7e]+$/.test(text)) return null;
  if (text !== text.trim() || /\s{2,}/.test(text)) return null;
  if (!STYLES.has(input.style) || !DIRS.has(input.dir)) return null;
  if (!PAPERS.has(input.paper) || !INKS.has(input.ink)) return null;
  const size = intIn(input.size, 90, 260);
  const track = intIn(input.track, 0, 80);
  const dry = intIn(input.dry, 0, 80);
  if (size == null || track == null || dry == null) return null;
  if (typeof input.seal !== "boolean") return null;
  return {
    text,
    style: input.style,
    dir: input.dir,
    paper: input.paper,
    ink: input.ink,
    size,
    track,
    dry,
    seal: input.seal,
  };
}
