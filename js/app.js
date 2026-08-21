/* ==========================================================================
   app.js — wires Store + Timer + Tasks + Ambience into the DOM
   ========================================================================== */
(function (window, document) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    body: document.body,
    html: document.documentElement,

    // timer
    tabs: document.querySelectorAll(".mode-tab"),
    time: $("timeDisplay"),
    sub: $("dialSub"),
    ring: $("dialProgress"),
    pips: $("cyclePips"),
    btnStart: $("btnStart"),
    btnStartLabel: $("btnStartLabel"),
    btnReset: $("btnReset"),
    btnSkip: $("btnSkip"),
    nowFocusing: $("nowFocusing"),
    nowFocusingTask: $("nowFocusingTask"),

    // stats
    statSessions: $("statSessions"),
    statMinutes: $("statMinutes"),

    // tasks
    taskForm: $("taskForm"),
    taskInput: $("taskInput"),
    taskEst: $("taskEst"),
    taskList: $("taskList"),
    taskCount: $("taskCount"),
    taskEmpty: $("taskEmpty"),
    taskProgressBar: $("taskProgressBar"),
    taskProgressFill: $("taskProgressFill"),
    taskFoot: document.querySelector(".task-foot"),
    btnClearDone: $("btnClearDone"),
    btnClearAll: $("btnClearAll"),

    // audio
    soundGrid: $("soundGrid"),
    masterVol: $("masterVol"),
    masterVolOut: $("masterVolOut"),
    btnMuteAll: $("btnMuteAll"),
    tickToggle: $("tickToggle"),

    // chrome
    btnTheme: $("btnTheme"),
    btnZen: $("btnZen"),
    btnZenExit: $("btnZenExit"),
    btnHelp: $("btnHelp"),
    btnSettings: $("btnSettings"),
    settingsModal: $("settingsModal"),
    helpModal: $("helpModal"),
    toastStack: $("toastStack"),

    // settings fields
    setFocus: $("setFocus"),
    setShort: $("setShort"),
    setLong: $("setLong"),
    setInterval: $("setInterval"),
    setAutoBreak: $("setAutoBreak"),
    setAutoFocus: $("setAutoFocus"),
    setChime: $("setChime"),
    setNotify: $("setNotify"),
    setTitle: $("setTitle"),
    setCarry: $("setCarry"),
    btnResetData: $("btnResetData")
  };

  var BASE_TITLE = "Focus — Pomodoro, Checklist & Ambience";
  var audioResumed = false;

  /* ====================== toasts ====================== */

  function toast(msg, kind, ms) {
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.innerHTML = '<span class="tdot"></span><span class="ttext"></span>';
    t.querySelector(".ttext").textContent = msg;
    el.toastStack.appendChild(t);
    window.setTimeout(function () {
      t.classList.add("is-out");
      window.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, ms || 2600);
  }

  /* ====================== theme ====================== */

  function prefersDark() {
    return !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyTheme(theme) {
    var t = theme || (prefersDark() ? "dark" : "light");
    el.html.setAttribute("data-theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0e1020" : "#eceefa");
  }

  function toggleTheme() {
    var next = el.html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    Store.set("theme", next);
    applyTheme(next);
  }

  /* ====================== zen ====================== */

  function setZen(on) {
    el.body.classList.toggle("zen", !!on);
    el.btnZenExit.hidden = !on;
    Store.set("zen", !!on);
  }

  /* ====================== timer UI ====================== */

  var SUBTEXT = {
    idle: {
      focus: "Ready when you are",
      short: "Stretch, breathe, look away",
      long: "Take a proper break"
    },
    running: {
      focus: "Deep work in progress",
      short: "Short break",
      long: "Long break"
    },
    paused: "Paused"
  };

  function renderRing(progress) {
    // pathLength is 1000, so offset = portion consumed
    el.ring.setAttribute("stroke-dashoffset", String(Math.round(progress * 1000)));
  }

  function renderTime(ms) {
    el.time.textContent = Timer.format(ms);
  }

  function renderTitle() {
    if (!Store.settings.titleCountdown) {
      document.title = BASE_TITLE;
      return;
    }
    if (Timer.running) {
      document.title = Timer.format(Timer.remainingMs) + " · " + Timer.label() + " — Focus";
    } else if (Timer.remainingMs < Timer.durationMs) {
      document.title = "Paused " + Timer.format(Timer.remainingMs) + " — Focus";
    } else {
      document.title = BASE_TITLE;
    }
  }

  function renderTabs() {
    Array.prototype.forEach.call(el.tabs, function (tab) {
      var on = tab.dataset.mode === Timer.mode;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    el.body.setAttribute("data-mode", Timer.mode);
  }

  function renderPips() {
    var p = Timer.pipsState();
    var html = "";
    for (var i = 0; i < p.total; i++) {
      html += '<span class="pip' + (i < p.done ? " is-done" : "") + '"></span>';
    }
    el.pips.innerHTML = html;
  }

  function renderControls() {
    el.body.classList.toggle("is-running", Timer.running);
    var partial = !Timer.running && Timer.remainingMs > 0 && Timer.remainingMs < Timer.durationMs;
    el.body.classList.toggle("is-paused", partial);

    el.btnStartLabel.textContent = Timer.running ? "Pause" : (partial ? "Resume" : "Start");
    el.btnStart.setAttribute("aria-label", Timer.running ? "Pause timer" : "Start timer");

    el.sub.textContent = Timer.running
      ? SUBTEXT.running[Timer.mode]
      : (partial ? SUBTEXT.paused : SUBTEXT.idle[Timer.mode]);
  }

  function renderStats() {
    var s = Store.stats;
    el.statSessions.textContent = String(s.sessions);
    var m = s.minutes;
    el.statMinutes.textContent = m >= 60
      ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "")
      : m + "m";
  }

  function renderActiveTask(task) {
    if (task) {
      el.nowFocusing.hidden = false;
      el.nowFocusingTask.textContent = task.text;
    } else {
      el.nowFocusing.hidden = true;
      el.nowFocusingTask.textContent = "";
    }
  }

  /* ====================== notifications ====================== */

  function requestNotify() {
    if (!("Notification" in window)) {
      toast("This browser has no notification support", "warn");
      Store.set("settings.notify", false);
      el.setNotify.checked = false;
      return;
    }
    if (Notification.permission === "granted") return;
    Notification.requestPermission().then(function (p) {
      if (p !== "granted") {
        Store.set("settings.notify", false);
        el.setNotify.checked = false;
        toast("Notifications blocked by the browser", "warn");
      }
    });
  }

  function notifyDesktop(title, body) {
    if (!Store.settings.notify) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body: body, silent: true });
    } catch (e) { /* some browsers require a service worker; ignore */ }
  }

  /* ====================== ambience UI ====================== */

  function buildSoundGrid() {
    if (!Ambience.supported) {
      el.soundGrid.innerHTML =
        '<p class="empty-state is-shown" style="grid-column:1/-1">Your browser doesn\'t support the Web Audio API, so ambience is unavailable.</p>';
      el.masterVol.disabled = true;
      el.btnMuteAll.disabled = true;
      el.tickToggle.disabled = true;
      return;
    }

    var frag = document.createDocumentFragment();

    Ambience.SOUNDS.forEach(function (s) {
      var card = document.createElement("div");
      card.className = "sound-card" + (Ambience.isOn(s.id) ? " is-on" : "");
      card.dataset.id = s.id;
      card.innerHTML =
        '<button class="sound-toggle" type="button" aria-pressed="' + (Ambience.isOn(s.id) ? "true" : "false") + '">' +
          '<span class="sound-emoji" aria-hidden="true">' + s.emoji + '</span>' +
          '<span class="sound-name">' + s.name + '</span>' +
        '</button>' +
        '<span class="sound-vol">' +
          '<input type="range" min="0" max="100" value="' + Math.round(Ambience.volOf(s.id) * 100) +
            '" aria-label="' + s.name + ' volume" />' +
        '</span>';
      frag.appendChild(card);
    });

    el.soundGrid.appendChild(frag);

    el.soundGrid.addEventListener("click", function (e) {
      var btn = e.target.closest(".sound-toggle");
      if (!btn) return;
      var card = btn.closest(".sound-card");
      var id = card.dataset.id;
      var on = Ambience.toggle(id);
      card.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on && Ambience.isMuted()) {
        Ambience.setMuted(false);
        syncMuteButton();
        toast("Unmuted so you can hear it", null, 1800);
      }
      persistAudio();
    });

    el.soundGrid.addEventListener("input", function (e) {
      if (e.target.type !== "range") return;
      var card = e.target.closest(".sound-card");
      Ambience.setVol(card.dataset.id, Number(e.target.value) / 100);
      persistAudio();
    });
  }

  function syncMuteButton() {
    var m = Ambience.isMuted();
    el.btnMuteAll.setAttribute("aria-pressed", m ? "true" : "false");
    el.btnMuteAll.textContent = m ? "Muted" : "Mute all";
  }

  function persistAudio() {
    Store.set("audio", Ambience.serialize());
  }

  /* Browsers require a gesture before audio can play; resume the saved mix on
     the very first interaction so a reload feels seamless. */
  function resumeAudioOnce() {
    if (audioResumed) return;
    audioResumed = true;
    Ambience.resumeMix();
  }

  /* ====================== settings ====================== */

  function fillSettings() {
    var s = Store.settings;
    el.setFocus.value = s.focus;
    el.setShort.value = s.short;
    el.setLong.value = s.long;
    el.setInterval.value = s.interval;
    el.setAutoBreak.checked = !!s.autoBreak;
    el.setAutoFocus.checked = !!s.autoFocus;
    el.setChime.checked = !!s.chime;
    el.setNotify.checked = !!s.notify;
    el.setTitle.checked = !!s.titleCountdown;
    el.setCarry.checked = !!s.carryOver;
  }

  function num(input, min, max, fallback) {
    var v = parseInt(input.value, 10);
    if (isNaN(v)) v = fallback;
    v = Math.max(min, Math.min(max, v));
    input.value = v;
    return v;
  }

  function bindSettings() {
    function onDuration() {
      Store.settings.focus = num(el.setFocus, 1, 180, 25);
      Store.settings.short = num(el.setShort, 1, 60, 5);
      Store.settings.long = num(el.setLong, 1, 90, 15);
      Store.settings.interval = num(el.setInterval, 2, 12, 4);
      Store.save();
      Timer.refreshDurations();
      renderPips();
      renderTime(Timer.remainingMs);
      renderRing(Timer.progress());
      renderTitle();
    }

    [el.setFocus, el.setShort, el.setLong, el.setInterval].forEach(function (input) {
      input.addEventListener("change", onDuration);
    });

    el.setAutoBreak.addEventListener("change", function () { Store.set("settings.autoBreak", this.checked); });
    el.setAutoFocus.addEventListener("change", function () { Store.set("settings.autoFocus", this.checked); });
    el.setChime.addEventListener("change", function () { Store.set("settings.chime", this.checked); });
    el.setTitle.addEventListener("change", function () {
      Store.set("settings.titleCountdown", this.checked);
      renderTitle();
    });
    el.setCarry.addEventListener("change", function () { Store.set("settings.carryOver", this.checked); });
    el.setNotify.addEventListener("change", function () {
      Store.set("settings.notify", this.checked);
      if (this.checked) requestNotify();
    });

    el.btnResetData.addEventListener("click", function () {
      if (!window.confirm("Erase all tasks, settings and today's stats?")) return;
      Ambience.stopAll();
      Store.reset();
      Ambience.hydrate(Store.audio);
      closeModal(el.settingsModal);
      window.location.reload();
    });
  }

  /* ====================== modals ====================== */

  var lastFocused = null;

  function openModal(m) {
    lastFocused = document.activeElement;
    m.hidden = false;
    var focusable = m.querySelector("input, button:not([data-close])");
    if (focusable) focusable.focus();
  }

  function closeModal(m) {
    m.hidden = true;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function bindModal(m) {
    m.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeModal(m);
    });
  }

  function anyModalOpen() {
    return !el.settingsModal.hidden || !el.helpModal.hidden;
  }

  /* ====================== session completion ====================== */

  function onSessionComplete(info) {
    if (info.finishedMode === "focus") {
      if (!info.skipped) {
        Store.addStats(info.minutes);
        var t = Tasks.creditPomodoro();
        renderStats();

        if (Store.settings.chime) Ambience.chime("focus");
        var msg = info.nextMode === "long"
          ? "Long break earned — step away for a bit"
          : "Focus session done — take a short break";
        toast(msg, "ok", 4200);
        notifyDesktop("Focus session complete", t ? "Logged to: " + t.text : msg);

        if (t && t.spent >= t.est) {
          toast("“" + t.text + "” hit its estimate", null, 3600);
        }
      } else {
        toast("Session skipped", null, 1800);
      }

      Ambience.setTicking(false);
      if (Store.settings.autoBreak && !info.skipped) Timer.start();

    } else {
      if (!info.skipped) {
        if (Store.settings.chime) Ambience.chime("break");
        toast("Break over — back to it", null, 3600);
        notifyDesktop("Break finished", "Time to focus again.");
      }
      if (Store.settings.autoFocus && !info.skipped) Timer.start();
    }

    renderPips();
    renderTabs();
    renderControls();
    renderTime(Timer.remainingMs);
    renderRing(Timer.progress());
    renderTitle();
  }

  /* ====================== keyboard ====================== */

  function isTyping(e) {
    var t = e.target;
    if (!t) return false;
    var tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  }

  function bindKeys() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!el.settingsModal.hidden) { closeModal(el.settingsModal); return; }
        if (!el.helpModal.hidden) { closeModal(el.helpModal); return; }
        if (el.body.classList.contains("zen")) { setZen(false); return; }
        if (isTyping(e) && e.target.blur) e.target.blur();
        return;
      }

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        if (isTyping(e)) return;
        e.preventDefault();
        el.helpModal.hidden ? openModal(el.helpModal) : closeModal(el.helpModal);
        return;
      }

      if (isTyping(e) || anyModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case " ":
        case "Spacebar":
          e.preventDefault();
          resumeAudioOnce();
          Timer.toggle();
          break;
        case "r": case "R":
          Timer.reset();
          toast("Timer reset", null, 1500);
          break;
        case "s": case "S":
          Timer.skip();
          break;
        case "1": switchMode("focus"); break;
        case "2": switchMode("short"); break;
        case "3": switchMode("long"); break;
        case "n": case "N":
          e.preventDefault();
          Tasks.focusInput();
          break;
        case "m": case "M":
          resumeAudioOnce();
          Ambience.setMuted(!Ambience.isMuted());
          syncMuteButton();
          persistAudio();
          toast(Ambience.isMuted() ? "Ambience muted" : "Ambience on", null, 1500);
          break;
        case "z": case "Z":
          setZen(!el.body.classList.contains("zen"));
          break;
        case "t": case "T":
          toggleTheme();
          break;
      }
    });
  }

  function switchMode(mode) {
    if (Timer.mode === mode && !Timer.running) return;
    if (Timer.running && !window.confirm("Switch session? The current timer will stop.")) return;
    Timer.setMode(mode);
    Ambience.setTicking(false);
    renderTabs();
    renderControls();
    renderTime(Timer.remainingMs);
    renderRing(0);
    renderTitle();
  }

  /* ====================== boot ====================== */

  function boot() {
    /* ---- theme + zen ---- */
    applyTheme(Store.state.theme);
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onScheme = function () { if (!Store.state.theme) applyTheme(null); };
      if (mq.addEventListener) mq.addEventListener("change", onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }
    setZen(Store.state.zen);

    /* ---- timer ---- */
    Timer.init(Store.settings);

    Timer.onTick = function (left, progress, secondChanged) {
      renderRing(progress);
      if (secondChanged !== false) {
        renderTime(left);
        renderTitle();
      }
    };
    Timer.onModeChange = function () { renderTabs(); renderPips(); };
    Timer.onStateChange = function () { renderControls(); renderTitle(); };
    Timer.onComplete = onSessionComplete;

    /* ---- tasks ---- */
    Tasks.notify = toast;
    Tasks.onActiveChange = renderActiveTask;
    Tasks.init({
      form: el.taskForm,
      input: el.taskInput,
      est: el.taskEst,
      list: el.taskList,
      count: el.taskCount,
      empty: el.taskEmpty,
      progressBar: el.taskProgressBar,
      progressFill: el.taskProgressFill,
      foot: el.taskFoot,
      clearDone: el.btnClearDone,
      clearAll: el.btnClearAll
    });
    renderActiveTask(Tasks.active());

    if (typeof window.Sortable === "undefined") {
      toast("Drag-and-drop library didn't load — reordering is off", "warn", 5000);
    }

    /* ---- ambience ---- */
    Ambience.hydrate(Store.audio);
    buildSoundGrid();
    el.masterVol.value = Math.round(Ambience.masterVolume() * 100);
    el.masterVolOut.textContent = el.masterVol.value;
    el.tickToggle.checked = !!Store.audio.tick;
    syncMuteButton();

    el.masterVol.addEventListener("input", function () {
      Ambience.setMaster(Number(this.value) / 100);
      el.masterVolOut.textContent = this.value;
      persistAudio();
    });

    el.btnMuteAll.addEventListener("click", function () {
      resumeAudioOnce();
      Ambience.setMuted(!Ambience.isMuted());
      syncMuteButton();
      persistAudio();
    });

    el.tickToggle.addEventListener("change", function () {
      Store.set("audio.tick", this.checked);
      // ticking only runs during focus sessions
      if (this.checked && Timer.running && Timer.mode === "focus") Ambience.setTicking(true);
      else Ambience.setTicking(false);
      if (this.checked && !(Timer.running && Timer.mode === "focus")) {
        toast("Ticking starts with your next focus session", null, 2600);
      }
    });

    /* ---- controls ---- */
    el.btnStart.addEventListener("click", function () {
      resumeAudioOnce();
      var running = Timer.toggle();
      if (running && Timer.mode === "focus" && Store.audio.tick) Ambience.setTicking(true);
      if (!running) Ambience.setTicking(false);
    });

    el.btnReset.addEventListener("click", function () {
      Timer.reset();
      Ambience.setTicking(false);
    });

    el.btnSkip.addEventListener("click", function () { Timer.skip(); });

    Array.prototype.forEach.call(el.tabs, function (tab) {
      tab.addEventListener("click", function () { switchMode(tab.dataset.mode); });
    });

    /* ---- chrome ---- */
    el.btnTheme.addEventListener("click", toggleTheme);
    el.btnZen.addEventListener("click", function () { setZen(!el.body.classList.contains("zen")); });
    el.btnZenExit.addEventListener("click", function () { setZen(false); });
    el.btnHelp.addEventListener("click", function () { openModal(el.helpModal); });
    el.btnSettings.addEventListener("click", function () { fillSettings(); openModal(el.settingsModal); });
    bindModal(el.settingsModal);
    bindModal(el.helpModal);

    fillSettings();
    bindSettings();
    bindKeys();

    /* ---- first render ---- */
    renderTabs();
    renderPips();
    renderTime(Timer.remainingMs);
    renderRing(0);
    renderControls();
    renderStats();
    renderTitle();

    /* ---- background/foreground correction ---- */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      Timer.sync();
      if (Store.checkDay()) {
        Tasks.render();
        renderStats();
        toast("New day — checklist refreshed", null, 3200);
      }
      renderStats();
    });

    // catch midnight even if the tab stays visible
    window.setInterval(function () {
      if (Store.checkDay()) {
        Tasks.render();
        renderStats();
        renderActiveTask(Tasks.active());
        toast("New day — checklist refreshed", null, 3200);
      }
    }, 60000);

    window.addEventListener("beforeunload", function () {
      Store.set("audio", Ambience.serialize());
      Store.flush();
    });

    // any first interaction unlocks + restores the saved sound mix
    ["pointerdown", "keydown", "touchstart"].forEach(function (evt) {
      window.addEventListener(evt, resumeAudioOnce, { once: true, passive: true });
    });

    if (Store.rolledOver) toast("Fresh day, fresh list", "ok", 3200);
    if (!Store.persistent) toast("Storage is blocked — nothing will be saved", "warn", 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window, document);
