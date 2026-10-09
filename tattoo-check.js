(() => {
  const TOKEN_RE = /^[a-f0-9]{64}$/;
  const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;
  const REPORT_KEY = "moying-tattoo-report";

  const chineseText = document.getElementById("chineseText");
  const intendedMeaning = document.getElementById("intendedMeaning");
  const textCount = document.getElementById("textCount");
  const intentCount = document.getElementById("intentCount");
  const textHint = document.getElementById("textHint");
  const btnPay = document.getElementById("btnPay");
  const payNote = document.getElementById("payNote");
  const formView = document.getElementById("formView");
  const resultView = document.getElementById("resultView");
  const resultStatus = document.getElementById("resultStatus");
  const reportCard = document.getElementById("reportCard");
  const reportText = document.getElementById("reportText");
  const reportIntentWrap = document.getElementById("reportIntentWrap");
  const reportIntent = document.getElementById("reportIntent");
  const reportVerdict = document.getElementById("reportVerdict");
  const reportSummary = document.getElementById("reportSummary");
  const issuesBlock = document.getElementById("issuesBlock");
  const issuesList = document.getElementById("issuesList");
  const altsBlock = document.getElementById("altsBlock");
  const altsList = document.getElementById("altsList");

  let priceLabel = "$9";
  let payBusy = false;
  let pollTimer = null;

  function isToken(value) {
    return typeof value === "string" && TOKEN_RE.test(value);
  }

  function rememberToken(token) {
    try { localStorage.setItem(REPORT_KEY, token); } catch (_) { /* ignore */ }
  }

  function readRememberedToken() {
    try { return localStorage.getItem(REPORT_KEY) || ""; } catch (_) { return ""; }
  }

  function updateCounts() {
    textCount.textContent = `${chineseText.value.length}/200`;
    intentCount.textContent = `${intendedMeaning.value.length}/500`;
    const hasCjk = CJK_RE.test(chineseText.value);
    textHint.hidden = !chineseText.value.trim() || hasCjk;
  }

  function setPayNote(message) {
    payNote.textContent = message || "";
  }

  function updatePayUi() {
    btnPay.disabled = payBusy;
    btnPay.textContent = payBusy ? "Starting checkout…" : `Check before you ink · ${priceLabel}`;
  }

  async function loadPrice() {
    try {
      const res = await fetch("/api/tattoo-config", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data.priceLabel === "string" && data.priceLabel) {
        priceLabel = data.priceLabel;
        updatePayUi();
      }
    } catch (_) { /* keep fallback */ }
  }

  async function startCheckout() {
    if (payBusy) return;
    const text = chineseText.value.trim();
    if (!text || !CJK_RE.test(text)) {
      textHint.hidden = false;
      setPayNote("Paste Chinese characters to check.");
      return;
    }
    payBusy = true;
    setPayNote("");
    updatePayUi();
    try {
      const response = await fetch("/api/tattoo-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chineseText: text,
          intendedMeaning: intendedMeaning.value.trim(),
        }),
      });
      if (response.status === 404 || response.status === 503) {
        setPayNote("Payments are unavailable right now. Please try again later.");
        return;
      }
      let data = null;
      try { data = await response.json(); } catch (_) { data = null; }
      if (!response.ok || !data || !data.checkoutUrl || !isToken(data.token)) {
        setPayNote(data && data.error === "bad_input"
          ? "That text cannot be checked. Paste Chinese characters (up to 200)."
          : "Could not start checkout. Please try again in a moment.");
        return;
      }
      rememberToken(data.token);
      location.href = data.checkoutUrl;
    } catch (_) {
      setPayNote("Payments are unavailable right now. Please try again later.");
    } finally {
      payBusy = false;
      updatePayUi();
    }
  }

  function showResultMode() {
    formView.hidden = true;
    resultView.hidden = false;
  }

  function renderReport(payload) {
    const report = payload.report;
    if (!report) {
      resultStatus.textContent = "Payment received. Preparing your report…";
      reportCard.hidden = true;
      return;
    }
    resultStatus.textContent = "Your report";
    reportCard.hidden = false;
    reportText.textContent = payload.chineseText || report.chineseText || "";
    if (payload.intendedMeaning || report.intendedMeaning) {
      reportIntentWrap.hidden = false;
      reportIntent.textContent = payload.intendedMeaning || report.intendedMeaning;
    } else {
      reportIntentWrap.hidden = true;
    }
    reportVerdict.textContent = report.verdict || "Uncertain — ask a native speaker";
    reportVerdict.classList.toggle("problems", report.verdict === "Problems found");
    reportSummary.textContent = report.summary || "";

    issuesList.replaceChildren();
    const issues = Array.isArray(report.issues) ? report.issues : [];
    if (issues.length) {
      issuesBlock.hidden = false;
      for (const issue of issues) {
        const li = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = issue.problem || "Issue";
        const reading = document.createElement("p");
        reading.textContent = issue.nativeReading || "";
        li.append(title, reading);
        issuesList.append(li);
      }
    } else {
      issuesBlock.hidden = true;
    }

    altsList.replaceChildren();
    const alts = Array.isArray(report.alternatives) ? report.alternatives : [];
    if (alts.length) {
      altsBlock.hidden = false;
      for (const alt of alts) {
        const li = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = alt.text || "";
        title.lang = "zh";
        const note = document.createElement("p");
        note.textContent = alt.note || "Discuss with a native speaker — not approval to ink.";
        li.append(title, note);
        altsList.append(li);
      }
    } else {
      altsBlock.hidden = true;
    }
  }

  async function pollReport(token, attemptsLeft) {
    if (!isToken(token) || attemptsLeft <= 0) {
      resultStatus.textContent = "Still waiting for payment confirmation. Keep this page open, or reopen your ?report= link.";
      return;
    }
    try {
      const res = await fetch(`/api/tattoo-status?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.status === "paid") {
        renderReport(data);
        if (!data.report) {
          pollTimer = setTimeout(() => pollReport(token, attemptsLeft - 1), 2000);
        }
        return;
      }
      if (data.status === "refunded") {
        resultStatus.textContent = "This order was refunded. The report is no longer available.";
        reportCard.hidden = true;
        return;
      }
      if (data.status === "pending") {
        resultStatus.textContent = "Waiting for payment confirmation…";
        pollTimer = setTimeout(() => pollReport(token, attemptsLeft - 1), 2000);
        return;
      }
      resultStatus.textContent = "No report found for this link.";
    } catch (_) {
      pollTimer = setTimeout(() => pollReport(token, attemptsLeft - 1), 2500);
    }
  }

  function startFromUrl() {
    const q = new URLSearchParams(location.search);
    let token = q.get("report") || "";
    if (!isToken(token)) token = readRememberedToken();
    if (!isToken(token)) return false;
    if (q.get("report") !== token) {
      q.set("report", token);
      history.replaceState(null, "", `${location.pathname}?${q.toString()}`);
    }
    rememberToken(token);
    showResultMode();
    pollReport(token, 45);
    return true;
  }

  chineseText.addEventListener("input", updateCounts);
  intendedMeaning.addEventListener("input", updateCounts);
  btnPay.addEventListener("click", startCheckout);
  updateCounts();
  updatePayUi();
  loadPrice();
  startFromUrl();

  window.addEventListener("beforeunload", () => {
    if (pollTimer) clearTimeout(pollTimer);
  });
})();
