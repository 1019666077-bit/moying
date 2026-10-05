// Structured AI report for the paid tattoo-check product.
// Verdicts are restricted: never OK / safe to ink / approved / all clear.

export const VERDICT_PROBLEMS = "Problems found";
export const VERDICT_UNCERTAIN = "Uncertain — ask a native speaker";

const ALLOWED_VERDICTS = new Set([VERDICT_PROBLEMS, VERDICT_UNCERTAIN]);

// Any of these in a model verdict (or as the only signal) forces Uncertain.
const FORBIDDEN_OK_RE = /\b(?:ok(?:ay)?\s+to\s+ink|safe\s+to\s+(?:ink|tattoo)|approved|no\s+problems|all\s+clear|go\s+ahead|looks?\s+good|no\s+issues|clear\s+to\s+ink|green\s+light|ready\s+to\s+ink)\b/i;

const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const MAX_TEXT = 200;
const MAX_INTENT = 500;

export function hasChinese(text) {
  return typeof text === "string" && CJK_RE.test(text);
}

export function normalizeTattooInput(body) {
  if (!body || typeof body !== "object") return null;
  const chineseText = typeof body.chineseText === "string" ? body.chineseText.trim() : "";
  if (!chineseText || chineseText.length > MAX_TEXT || !hasChinese(chineseText)) return null;
  let intendedMeaning = typeof body.intendedMeaning === "string" ? body.intendedMeaning.trim() : "";
  if (intendedMeaning.length > MAX_INTENT) intendedMeaning = intendedMeaning.slice(0, MAX_INTENT);
  return { chineseText, intendedMeaning };
}

export function looksLikeOkVerdict(value) {
  return FORBIDDEN_OK_RE.test(String(value || ""));
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizeIssue(raw) {
  if (!raw || typeof raw !== "object") return null;
  const problem = cleanText(raw.problem || raw.issue || raw.title, 400);
  const nativeReading = cleanText(
    raw.nativeReading || raw.howAChineseReaderMayReadThis || raw.reading || raw.explanation,
    600,
  );
  if (!problem && !nativeReading) return null;
  return {
    problem: problem || "Possible issue",
    nativeReading: nativeReading || "A Chinese reader may find this unclear or misleading.",
  };
}

function sanitizeAlternative(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = cleanText(raw.text || raw.alternative || raw.suggestion, 80);
  if (!text || !hasChinese(text)) return null;
  let note = cleanText(raw.note || raw.reason || raw.comment, 300);
  // Never let alternatives carry an “OK to ink” label.
  if (!note || looksLikeOkVerdict(note)) {
    note = "Optional wording to discuss with a native speaker — not approval to ink.";
  }
  return { text, note };
}

function coerceVerdict(rawVerdict, issues) {
  const trimmed = cleanText(rawVerdict, 120);
  if (looksLikeOkVerdict(trimmed)) return VERDICT_UNCERTAIN;
  if (ALLOWED_VERDICTS.has(trimmed)) {
    if (trimmed === VERDICT_PROBLEMS && issues.length === 0) return VERDICT_UNCERTAIN;
    return trimmed;
  }
  // Common model drift: "uncertain", "problems", etc.
  const lower = trimmed.toLowerCase();
  if (lower.includes("problem") && issues.length > 0) return VERDICT_PROBLEMS;
  return VERDICT_UNCERTAIN;
}

/**
 * Parse and harden a model JSON payload into a safe report.
 * Always returns one of the two allowed verdicts. Never “OK to ink”.
 */
export function parseTattooReport(raw, { chineseText = "", intendedMeaning = "" } = {}) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      data = null;
    }
  }
  if (!data || typeof data !== "object") {
    return fallbackUncertain(chineseText, intendedMeaning, "The checker could not produce a structured report.");
  }

  const issues = Array.isArray(data.issues)
    ? data.issues.map(sanitizeIssue).filter(Boolean).slice(0, 12)
    : [];
  const alternatives = Array.isArray(data.alternatives)
    ? data.alternatives.map(sanitizeAlternative).filter(Boolean).slice(0, 5)
    : [];

  let verdict = coerceVerdict(data.verdict, issues);
  let summary = cleanText(data.summary || data.note || data.explanation, 800);

  if (looksLikeOkVerdict(summary)) {
    verdict = VERDICT_UNCERTAIN;
    summary = "Absence of listed issues is not permission to ink. Ask a native speaker before any permanent use.";
  }
  if (!summary) {
    summary = verdict === VERDICT_PROBLEMS
      ? "Issues were found that a Chinese reader may notice. Review each item below and confirm with a native speaker before inking."
      : "Nothing glaring stood out to the automated checker, but that does not mean this is safe to ink. Always ask a native speaker.";
  }

  // Final hard gate: if anything still smells like approval, force uncertain.
  const blob = `${verdict} ${summary} ${issues.map((i) => `${i.problem} ${i.nativeReading}`).join(" ")}`;
  if (looksLikeOkVerdict(blob) && verdict === VERDICT_PROBLEMS) {
    // Keep problems but strip OK language from summary.
    summary = summary.replace(FORBIDDEN_OK_RE, "needs a native speaker review");
  } else if (looksLikeOkVerdict(verdict) || (verdict !== VERDICT_PROBLEMS && looksLikeOkVerdict(summary) && issues.length === 0)) {
    verdict = VERDICT_UNCERTAIN;
  }

  if (!ALLOWED_VERDICTS.has(verdict)) verdict = VERDICT_UNCERTAIN;

  return {
    verdict,
    summary,
    issues,
    alternatives,
    chineseText,
    intendedMeaning: intendedMeaning || "",
    disclaimer:
      "Informational only. No guarantee of accuracy. Moying is not liable for tattoo outcomes. Always consult a native speaker before inking.",
  };
}

function fallbackUncertain(chineseText, intendedMeaning, summary) {
  return {
    verdict: VERDICT_UNCERTAIN,
    summary,
    issues: [],
    alternatives: [],
    chineseText,
    intendedMeaning: intendedMeaning || "",
    disclaimer:
      "Informational only. No guarantee of accuracy. Moying is not liable for tattoo outcomes. Always consult a native speaker before inking.",
  };
}

export function buildTattooPrompt({ chineseText, intendedMeaning }) {
  const intentLine = intendedMeaning
    ? `Intended English meaning (from the buyer): ${JSON.stringify(intendedMeaning)}`
    : "Intended English meaning: (not provided)";

  return `You are checking Chinese text that someone may tattoo. Be cautious. Output ONLY valid JSON with this shape:
{
  "verdict": "Problems found" OR "Uncertain — ask a native speaker",
  "summary": "short plain English",
  "issues": [{ "problem": "...", "nativeReading": "how a Chinese reader may read this" }],
  "alternatives": [{ "text": "optional safer Chinese", "note": "discussion point, not approval" }]
}

HARD RULES:
- verdict MUST be exactly one of: "Problems found" OR "Uncertain — ask a native speaker"
- NEVER say or imply: OK, safe to ink, approved, no problems, all clear, go ahead, green light, ready to ink
- If nothing glaring is wrong, still use "Uncertain — ask a native speaker" and say that absence of listed issues is NOT permission to ink
- Focus on: wrong character for the intent, awkward phrasing, misleading or embarrassing reading for a native speaker of modern Chinese
- alternatives are optional suggestions for discussion only; never label them OK to ink
- Write for a non-Chinese speaker in plain English

Chinese text to check: ${JSON.stringify(chineseText)}
${intentLine}`;
}

export async function generateTattooReport(env, { chineseText, intendedMeaning }) {
  if (!env || !env.DEEPSEEK_API_KEY) {
    return fallbackUncertain(
      chineseText,
      intendedMeaning,
      "The automated checker is not configured. Ask a native speaker before inking.",
    );
  }

  const prompt = buildTattooPrompt({ chineseText, intendedMeaning });
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You check Chinese tattoo text for risks. Never approve inking. Reply with JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    console.error("deepseek tattoo-check failed", response.status);
    return fallbackUncertain(
      chineseText,
      intendedMeaning,
      "The automated checker failed to run. Treat this as uncertain and ask a native speaker before inking.",
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    return fallbackUncertain(
      chineseText,
      intendedMeaning,
      "The automated checker returned an unreadable response. Ask a native speaker before inking.",
    );
  }

  const content = payload
    && payload.choices
    && payload.choices[0]
    && payload.choices[0].message
    && payload.choices[0].message.content;

  return parseTattooReport(content, { chineseText, intendedMeaning });
}

/**
 * Ensure a paid tattoo-check record has a report. Idempotent.
 */
export async function ensureTattooReport(env, record) {
  if (!record || record.kind !== "tattoo-check") return record;
  if (record.status !== "paid") return record;
  if (record.report && record.report.verdict) return record;

  const report = await generateTattooReport(env, {
    chineseText: record.chineseText || "",
    intendedMeaning: record.intendedMeaning || "",
  });
  record.report = report;
  record.reportAt = new Date().toISOString();
  return record;
}
