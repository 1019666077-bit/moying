(() => {
  const FONTS = {
    gong: "fonts/MaShanZheng-Regular.ttf",
    kai: "fonts/MaShanZheng-Regular.ttf",
    xing: "fonts/LongCang-Regular.ttf",
    cao: "fonts/LiuJianMaoCao-Regular.ttf",
    kuang: "fonts/LiuJianMaoCao-Regular.ttf",
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

  const state = {
    style: "kai",
    dir: "h",
    paper: "xuan",
    ink: "black",
    fmt: "png",
  };

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
