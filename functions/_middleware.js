// The repository root is also the deploy root, so build notes, the audit report,
// tooling and pin lists would otherwise be served as plain files at their own URLs
// (and indexed). Answer 404 for them, exactly like any other missing URL, and let
// every real page, asset and API route fall through to normal handling.
const BLOCKED_PATHS = new Set([
  "/DEPLOY.md",
  "/SEO_REPORT.md",
  "/README.md",
  "/CLAUDE.md",
  "/package.json",
  "/package-lock.json",
  "/.dev.vars",
  "/.dev.vars.example",
  "/pins/batch1.csv",
]);

const BLOCKED_PREFIXES = ["/scripts/", "/tools/", "/functions/", "/research/"];

function isInternal(pathname) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (BLOCKED_PATHS.has(path)) return true;
  return BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export async function onRequest(context) {
  try {
    const { pathname } = new URL(context.request.url);
    if (isInternal(pathname)) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-robots-tag": "noindex, nofollow",
        },
      });
    }
  } catch (err) {
    // Never let this guard take the site down: fall through to normal serving.
    console.error("internal-file guard failed", err && err.message);
  }
  return context.next();
}
