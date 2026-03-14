// AutoRondas 9-9
(() => {
  // === Configuración ===
  const PACIENTES_POR_RONDA = 11;
  const CLICK_NAV_WINDOW = 4000;
  const CLICK_INTERVAL = 500;
  const URL_WATCH_INTERVAL = 400;
  const PANEL_WATCH_INTERVAL = 2000;

  // Palabras clave para detectar botones
  const POS_COMENZAR = ["comenzar"];
  const POS_RETOMAR = ["retomar"];
  const NEG = ["historia", "historial", "clinica", "clínica", "ver", "detalle", "detalles", "abrir"];

  // === Estado ===
  let autoClickInterval = null;
  let urlWatchInterval = null;
  let panelWatchInterval = null;
  let waitingForNavigation = false;
  let lastHref = location.href;
  let pacientesEnRonda = 0;
  let rondas = 0;
  let lastClickTime = 0;
  let estado = "pausado";
  let rondaCompletadaEnCurso = false;
  let skipNextCount = false;

  // === Persistencia de pacientes vistos ===
  const SEEN_KEY = "seenPatients";
  const SEEN_MAX = 800;
  const SEEN_TTL_MS = 14 * 24 * 3600 * 1000;
  let seenPatients = {};

  function loadSeen(cb) {
    try {
      chrome.storage.local.get(SEEN_KEY, (data) => {
        const raw = data?.[SEEN_KEY];
        seenPatients = (raw && typeof raw === "object") ? raw : {};
        pruneSeen();
        cb?.();
      });
    } catch (e) {
      cb?.();
    }
  }

  function saveSeen() {
    try { chrome.storage.local.set({ [SEEN_KEY]: seenPatients }); } catch (e) {}
  }

  function markSeen(key) {
    seenPatients[key] = Date.now();
    pruneSeen();
    saveSeen();
  }

  function isSeen(key) {
    return !!seenPatients[key];
  }

  function pruneSeen() {
    const now = Date.now();
    const entries = Object.entries(seenPatients)
      .filter(([_, ts]) => typeof ts === "number" && now - ts <= SEEN_TTL_MS)
      .sort((a, b) => a[1] - b[1]);
    const start = Math.max(0, entries.length - SEEN_MAX);
    seenPatients = Object.fromEntries(entries.slice(start));
  }

  // === Persistencia general ===
  const POS_KEY = "panelPos";

  function loadState(cb) {
    try {
      chrome.storage.local.get(
        ["pacientesEnRonda", "rondas", "estado", "rondaCompletadaEnCurso", POS_KEY],
        (data) => {
          if (typeof data.pacientesEnRonda === "number") pacientesEnRonda = data.pacientesEnRonda;
          if (typeof data.rondas === "number") rondas = data.rondas;
          if (typeof data.estado === "string") estado = data.estado;
          if (typeof data.rondaCompletadaEnCurso === "boolean") rondaCompletadaEnCurso = data.rondaCompletadaEnCurso;
          const pos = data?.[POS_KEY];
          if (pos && panel) applyPanelPos(pos);
          updateUI();
          if (estado === "iniciado") startAutoClick();
          cb?.();
        }
      );
    } catch (e) {
      cb?.();
    }
  }

  function persist() {
    try {
      chrome.storage.local.set({ pacientesEnRonda, rondas, estado, rondaCompletadaEnCurso });
    } catch (e) {}
  }

  function persistPanelPos() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    try {
      chrome.storage.local.set({ [POS_KEY]: { left: rect.left, top: rect.top } });
    } catch (e) {}
  }

  function applyPanelPos(pos) {
    panel.style.right = "auto";
    panel.style.left = pos.left + "px";
    panel.style.top = pos.top + "px";
  }

  // === Audio ===
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { audioCtx = new AC(); } catch (e) {}
    }
  }

  function beep(freq = 780, ms = 140, gain = 1.0, type = "square") {
    try {
      ensureAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
      osc.start(now);
      osc.stop(now + ms / 1000);
    } catch (e) {}
  }

  function successSound() {
    beep(820, 130, 1.0);
    setTimeout(() => beep(820, 130, 1.0), 150);
    setTimeout(() => beep(820, 130, 1.0), 300);
  }

  function roundSound() {
    [0.8, 1.0, 1.2, 1.4, 1.6].forEach((g, i) => {
      setTimeout(() => beep(760, 150, g), i * 180);
    });
  }

  // === UI ===
  let estadoSpan, pacientesSpan, rondasSpan, panel;

  function waitForBody(cb) {
    if (document.body) return cb();
    new MutationObserver((_, obs) => {
      if (document.body) {
        obs.disconnect();
        cb();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function mountPanel() {
    const prev = document.getElementById("autorondas-panel");
    if (prev) prev.remove();

    panel = document.createElement("div");
    panel.id = "autorondas-panel";
    panel.style.cssText = `
      position: fixed; top: 14px; right: 14px;
      background: #fff; border: 2px solid #333; border-radius: 10px;
      padding: 10px; z-index: 2147483647; font-family: Arial, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,.2); min-width: 260px; cursor: grab;
    `;
    panel.innerHTML = `
      <div id="at-header" style="font-weight:700;margin-bottom:6px;user-select:none;touch-action:none">AutoRondas 9-9</div>
      <div style="margin-bottom:6px">Estado: <span id="at-estado" style="color:red">🔴 Pausado</span></div>
      <div style="margin-bottom:4px">Pacientes (ronda): <span id="at-pac">0</span> / ${PACIENTES_POR_RONDA}</div>
      <div style="margin-bottom:4px">Rondas: <span id="at-rondas">0</span></div>
      <div style="display:flex; gap:6px; flex-wrap:wrap">
        <button id="at-start">▶️ Iniciar</button>
        <button id="at-stop">⏸️ Pausar</button>
        <button id="at-minus" title="Restar 1 paciente">➖ -1</button>
        <button id="at-reset" title="Reiniciar todo">🗑️ Reset</button>
      </div>
    `;
    document.body.appendChild(panel);

    setupDraggable();
    setupButtonListeners();
    updateUI();

    try {
      chrome.storage.local.get(POS_KEY, (data) => {
        const pos = data?.[POS_KEY];
        if (pos) applyPanelPos(pos);
      });
    } catch (e) {}
  }

  function setupDraggable() {
    const header = panel.querySelector("#at-header") || panel;
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0, pointerId = null;

    header.addEventListener("pointerdown", (e) => {
      pointerId = e.pointerId;
      dragging = true;
      panel.style.cursor = "grabbing";
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.right = "auto";
      panel.style.left = `${startLeft}px`;
      panel.style.top = `${startTop}px`;
      header.setPointerCapture(pointerId);
      e.preventDefault();
    }, { passive: false });

    header.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      panel.style.left = `${startLeft + e.clientX - startX}px`;
      panel.style.top = `${startTop + e.clientY - startY}px`;
    }, { passive: false });

    const endDrag = (e) => {
      if (e.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      panel.style.cursor = "grab";
      try { header.releasePointerCapture(e.pointerId); } catch (_) {}
      persistPanelPos();
    };
    header.addEventListener("pointerup", endDrag, { passive: true });
    header.addEventListener("pointercancel", endDrag, { passive: true });
  }

  function setupButtonListeners() {
    estadoSpan = document.getElementById("at-estado");
    pacientesSpan = document.getElementById("at-pac");
    rondasSpan = document.getElementById("at-rondas");

    document.getElementById("at-start").addEventListener("click", () => {
      ensureAudio();
      if (audioCtx?.state === "suspended") audioCtx.resume();
      startAutoClick();
    });

    document.getElementById("at-stop").addEventListener("click", stopAutoClick);

    document.getElementById("at-reset").addEventListener("click", () => {
      pacientesEnRonda = 0;
      rondas = 0;
      rondaCompletadaEnCurso = false;
      seenPatients = {};
      saveSeen();
      updateUI();
      persist();
    });

    document.getElementById("at-minus").addEventListener("click", () => {
      if (rondaCompletadaEnCurso) return;
      if (pacientesEnRonda > 0) {
        pacientesEnRonda -= 1;
        updateUI();
        persist();
      }
    });
  }

  waitForBody(() => {
    mountPanel();
    if (!panelWatchInterval) {
      panelWatchInterval = setInterval(() => {
        if (!document.getElementById("autorondas-panel") && document.body) mountPanel();
      }, PANEL_WATCH_INTERVAL);
    }
    loadSeen(() => loadState());
  });

  function updateUI() {
    if (pacientesSpan) pacientesSpan.textContent = String(pacientesEnRonda);
    if (rondasSpan) rondasSpan.textContent = String(rondas);
    if (estadoSpan) {
      if (estado === "iniciado") {
        estadoSpan.textContent = "🟢 Iniciado";
        estadoSpan.style.color = "green";
      } else {
        estadoSpan.textContent = "🔴 Pausado";
        estadoSpan.style.color = "red";
      }
    }
  }

  // === Utilidades de detección ===
  function isVisible(el) {
    if (el.hidden || (el.offsetParent === null && el.tagName !== "BODY")) return false;
    if (!el.offsetWidth || !el.offsetHeight) return false;
    const s = window.getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  }

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }

  function containsAny(text, arr) {
    const t = norm(text || "");
    return arr.some(k => t.includes(k));
  }

  function isRetomarEl(el) {
    const text = (el.textContent || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "");
    return containsAny(text, POS_RETOMAR);
  }

  // === Selección y clic ===
  function getComenzarRetomarButtons() {
    const nodes = document.querySelectorAll('button, a, [role="button"]');
    const results = [];

    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const rawText = el.textContent || "";
      const lowerText = rawText.toLowerCase();

      if (lowerText.indexOf("comenzar") === -1 && lowerText.indexOf("retomar") === -1) continue;
      if (!isVisible(el)) continue;

      const fullText = rawText + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "");
      if (containsAny(fullText, NEG)) continue;

      results.push(el);
    }

    if (results.length > 1) {
      results.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    }
    return results;
  }

  function pickTargetButton(list) {
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[1];
    return list[list.length - 1];
  }

  function dispatchClick(el) {
    try { el.scrollIntoView({ block: "center", inline: "center" }); } catch (_) {}
    try { el.focus({ preventScroll: true }); } catch (_) {}
    try { el.click(); } catch (_) {}

    try {
      const r = el.getBoundingClientRect();
      const cx = Math.floor(r.left + r.width / 2);
      const cy = Math.floor(r.top + r.height / 2);
      const target = document.elementFromPoint(cx, cy) || el;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
      target.dispatchEvent(new MouseEvent("pointerdown", opts));
      target.dispatchEvent(new MouseEvent("mousedown", opts));
      target.dispatchEvent(new MouseEvent("mouseup", opts));
      target.dispatchEvent(new MouseEvent("click", opts));
    } catch (_) {}
  }

  function onClickTimeout() {
    if (waitingForNavigation && (Date.now() - lastClickTime) > CLICK_NAV_WINDOW) {
      waitingForNavigation = false;
      lastClickTime = 0;
      skipNextCount = false;
    }
  }

  function clickCandidate() {
    if (!/\/appointments\b/.test(location.pathname)) return;
    if (waitingForNavigation || rondaCompletadaEnCurso) return;

    const btns = getComenzarRetomarButtons();
    if (!btns.length) return;

    const target = pickTargetButton(btns);
    skipNextCount = isRetomarEl(target);
    lastClickTime = Date.now();
    waitingForNavigation = true;
    dispatchClick(target);
    setTimeout(onClickTimeout, CLICK_NAV_WINDOW + 150);
  }

  // === Detección de URL / Paciente ===
  const CAND_KEYS = ["patientUid", "appointmentUid", "appointmentId", "turnoId", "consultaId", "uid", "id"];

  function getUniqueVisitKey(href) {
    try {
      const u = new URL(href, location.origin);
      for (const k of CAND_KEYS) {
        const v = u.searchParams.get(k);
        if (v) return k + ":" + v;
      }
      return "url:" + u.pathname + u.search;
    } catch {
      return "url:" + href;
    }
  }

  function isPatientPage(href) {
    return /\/doctor\b/.test(href) || CAND_KEYS.some(k => new RegExp("[?&]" + k + "=").test(href));
  }

  function onUrlChange() {
    if (location.href === lastHref) return;
    const prevHref = lastHref;
    const newHref = location.href;
    lastHref = newHref;

    if (isPatientPage(newHref)) {
      const key = getUniqueVisitKey(newHref);
      waitingForNavigation = false;
      lastClickTime = 0;

      if (skipNextCount) {
        markSeen(key);
        skipNextCount = false;
        updateUI();
        persist();
      } else if (!isSeen(key)) {
        markSeen(key);
        if (!rondaCompletadaEnCurso) pacientesEnRonda += 1;

        if (pacientesEnRonda >= PACIENTES_POR_RONDA) {
          pacientesEnRonda = PACIENTES_POR_RONDA;
          rondas += 1;
          rondaCompletadaEnCurso = true;
          roundSound();
          stopAutoClick();
        } else {
          successSound();
        }
        updateUI();
        persist();
      }
    }

    if (isPatientPage(prevHref) && !isPatientPage(newHref)) {
      if (rondaCompletadaEnCurso) {
        pacientesEnRonda = 0;
        rondaCompletadaEnCurso = false;
      }
      updateUI();
      persist();
    }
  }

  // === Hooks de navegación ===
  (() => {
    const _push = history.pushState;
    const _replace = history.replaceState;
    history.pushState = function () {
      _push.apply(this, arguments);
      setTimeout(onUrlChange, 0);
    };
    history.replaceState = function () {
      _replace.apply(this, arguments);
      setTimeout(onUrlChange, 0);
    };
    window.addEventListener("popstate", onUrlChange);
  })();

  // === Control de intervalos ===
  function startUrlWatcher() {
    if (urlWatchInterval) return;
    urlWatchInterval = setInterval(onUrlChange, URL_WATCH_INTERVAL);
  }

  function startAutoClick() {
    if (autoClickInterval) return;
    estado = "iniciado";
    updateUI();
    persist();
    startUrlWatcher();
    autoClickInterval = setInterval(clickCandidate, CLICK_INTERVAL);
  }

  function stopAutoClick() {
    if (autoClickInterval) clearInterval(autoClickInterval);
    autoClickInterval = null;
    estado = "pausado";
    updateUI();
    persist();
  }

  startUrlWatcher();
})();
