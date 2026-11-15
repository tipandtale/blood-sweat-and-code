(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    sweat: document.getElementById("sweat"),
    blood: document.getElementById("blood"),
    code: document.getElementById("code"),
    goalNum: document.getElementById("goalNum"),
    goalNote: document.getElementById("goalNote"),
    greet: document.getElementById("greet"),
    barInner: document.getElementById("barInner"),
    sound: document.getElementById("sound"),
    effects: document.getElementById("effects"),
    calm: document.getElementById("calm"),
    celebrate: document.getElementById("celebrate"),
    resetToday: document.getElementById("resetToday"),
    notice: document.getElementById("soundNotice"),
    fwCanvas: document.getElementById("fwCanvas")
  };

  // WebAudio engine: plays the mp3 clips as-is (decoded in memory), with a per-clip level so none is too loud
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let actx = null;
  const buffers = { blip: null, blip2: null, boom: null, boom2: null, fireworks: null };
  let audioUnlocked = false;
  // Level-matching without touching the files: typing clips sit lower than delete/celebration clips
  const CLIP_GAIN = { blip: 0.67, blip2: 0.32, boom: 0.40, boom2: 0.60, fireworks: 1.18 };
  async function fetchArrayBuffer(url) {
    const res = await fetch(url);
    return await res.arrayBuffer();
  }
  async function preloadSounds(uris) {
    if (!uris) return;
    try {
      actx = actx || new AudioCtx();
      const entries = Object.entries(uris);
      for (const [k, u] of entries) {
        const ab = await fetchArrayBuffer(u);
        buffers[k] = await actx.decodeAudioData(ab);
      }
    } catch { }
  }
  async function unlockAudio() {
    if (audioUnlocked) return;
    try {
      actx = actx || new AudioCtx();
      if (actx.state === 'suspended') await actx.resume();
      audioUnlocked = true;
      els.notice.classList.add("hidden");
    } catch { }
  }
  function playWav(kind, opts = {}) {
    try {
      if (!audioUnlocked || !buffers[kind]) return;
      if (actx && actx.state === 'suspended') {
        actx.resume().catch(() => { });
      }
      const src = actx.createBufferSource();
      src.buffer = buffers[kind];
      if (opts.playbackRate && typeof opts.playbackRate === 'number') {
        src.playbackRate.value = Math.max(0.5, Math.min(3.0, opts.playbackRate));
      }
      const gain = actx.createGain();
      gain.gain.value = CLIP_GAIN[kind] ?? 0.5;
      src.connect(gain).connect(actx.destination);
      src.start();
    } catch { }
  }

  // 7x6 pixel heart used by some fireworks particles
  const HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];

  // Fireworks particles on canvas
  const fw = {
    running: false,
    particles: [],
    start() {
      const canvas = els.fwCanvas;
      canvas.classList.remove("hidden");
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      this.particles = [];
      // BTS palette: mostly purples, with the orange/yellow/blue of the "7" mixed in
      const accents = ["#ff8000", "#ffc010", "#4f6ef0", "#ffffff"];
      for (let i = 0; i < 80; i++) {
        const accent = Math.random() < 0.12;
        this.particles.push({
          x: canvas.width / 2,
          y: canvas.height - 10,
          vx: (Math.random() - 0.5) * 6,
          vy: -Math.random() * 8 - 4,
          life: 60 + Math.random() * 30,
          color: accent
            ? accents[Math.floor(Math.random() * accents.length)]
            : `hsl(${262 + Math.random() * 30}, ${65 + Math.random() * 20}%, ${74 + Math.random() * 14}%)`,
          heart: Math.random() < 0.35
        });
      }
      this.running = true;
      this.loop();
      setTimeout(() => this.stop(), 1500);
    },
    stop() {
      this.running = false;
      els.fwCanvas.classList.add("hidden");
    },
    loop() {
      if (!this.running) return;
      const ctx = els.fwCanvas.getContext("2d");
      ctx.clearRect(0, 0, els.fwCanvas.width, els.fwCanvas.height);
      this.particles.forEach(p => {
        p.vy += 0.15;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        ctx.fillStyle = p.color;
        if (p.heart) {
          const u = Math.max(1, Math.round(window.devicePixelRatio * 1.5));
          HEART.forEach((row, ry) => {
            for (let rx = 0; rx < row.length; rx++) {
              if (row[rx] === "X") ctx.fillRect(Math.round(p.x) + rx * u, Math.round(p.y) + ry * u, u, u);
            }
          });
        } else {
          ctx.fillRect(p.x, p.y, 3, 3);
        }
      });
      this.particles = this.particles.filter(p => p.life > 0 && p.y < els.fwCanvas.height);
      requestAnimationFrame(() => this.loop());
    }
  };

  ["sound", "effects", "calm"].forEach(key => {
    els[key].addEventListener("change", () => {
      vscode.postMessage({ type: "toggle", key, value: els[key].checked });
    });
  });
  els.resetToday.addEventListener("click", () => vscode.postMessage({ type: "resetToday" }));
  els.celebrate.addEventListener("click", () => vscode.postMessage({ type: "celebrate" }));
  els.notice.addEventListener("click", () => unlockAudio());

  const fmt = n => Number(n).toLocaleString();

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? "still up?" : h < 12 ? "good morning." : h < 18 ? "good afternoon." : "good evening.";
  }
  els.greet.textContent = greeting();

  function setStats(stats) {
    els.sweat.textContent = fmt(stats.sweat);
    els.blood.textContent = fmt(stats.blood);
    els.code.textContent = fmt(stats.code);
    els.goalNum.textContent = `${fmt(Math.min(stats.code, stats.goal))} / ${fmt(stats.goal)}`;
    const pct = Math.max(0, Math.min(100, (stats.code / Math.max(1, stats.goal)) * 100));
    els.barInner.style.width = `${pct}%`;
    els.goalNote.textContent =
      stats.code >= stats.goal ? "done for today." :
      stats.code === 0 ? "nothing yet. no rush." :
      pct < 50 ? "getting there." : "almost.";
  }

  function setUi(ui) {
    els.sound.checked = ui.sound;
    els.effects.checked = ui.effects;
    els.calm.checked = ui.calm;
  }

  function configureAudio(soundUris) {
    preloadSounds(soundUris);
    audioUnlocked = false;
    els.notice.classList.remove("hidden");
    document.addEventListener("click", unlockAudio, { once: true });
    document.addEventListener("keydown", unlockAudio, { once: true });
  }

  window.addEventListener("message", e => {
    const msg = e.data;
    switch (msg.type) {
      case "init":
        setUi(msg.ui);
        setStats(msg.stats);
        configureAudio(msg.soundUris);
        break;
      case "state":
        setStats(msg.stats);
        break;
      case "ui":
        setUi(msg.ui);
        break;
      case "blip":
        if (msg.enabled) playWav(msg.variant === 2 ? 'blip2' : 'blip', { playbackRate: msg.pitch ?? 1.0 });
        break;
      case "boom":
        if (msg.enabled) playWav(msg.variant === 2 ? 'boom2' : 'boom');
        break;
      case "fireworks":
        if (msg.enabled) playWav('fireworks');
        fw.start();
        break;
    }
  });

  // Wait for DOM to be ready before sending ready message
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      vscode.postMessage({ type: "ready" });
    });
  } else {
    vscode.postMessage({ type: "ready" });
  }
})();