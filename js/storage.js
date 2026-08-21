/* ==========================================================================
   storage.js — one versioned localStorage blob + daily rollover
   Exposes: window.Store
   ========================================================================== */
(function (window) {
  "use strict";

  var KEY = "focus.pomodoro.v1";

  var DEFAULTS = {
    settings: {
      focus: 25,
      short: 5,
      long: 15,
      interval: 4,        // long break after N focus sessions
      autoBreak: true,
      autoFocus: false,
      chime: true,
      notify: false,
      titleCountdown: true,
      carryOver: true
    },
    theme: null,          // null => follow the OS
    zen: false,
    tasks: [],            // { id, text, done, est, spent, createdAt }
    activeTaskId: null,
    stats: { day: null, sessions: 0, minutes: 0 },
    audio: {
      master: 0.7,
      muted: false,
      tick: false,
      sounds: {}          // id -> { on: bool, vol: number }
    }
  };

  /* ---------- helpers ---------- */

  function todayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  /* Deep-ish merge: fills in anything a saved blob is missing (forward compat). */
  function fill(target, defaults) {
    var out = Array.isArray(defaults) ? (Array.isArray(target) ? target : clone(defaults)) : {};
    if (Array.isArray(defaults)) return out;

    Object.keys(defaults).forEach(function (k) {
      var d = defaults[k];
      var t = target ? target[k] : undefined;
      if (d !== null && typeof d === "object" && !Array.isArray(d)) {
        out[k] = fill(t && typeof t === "object" ? t : {}, d);
      } else if (t === undefined) {
        out[k] = Array.isArray(d) || (d && typeof d === "object") ? clone(d) : d;
      } else {
        out[k] = t;
      }
    });

    // keep any extra keys the caller stored
    if (target && typeof target === "object") {
      Object.keys(target).forEach(function (k) {
        if (!(k in out)) out[k] = target[k];
      });
    }
    return out;
  }

  function available() {
    try {
      var probe = "__probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  var canPersist = available();
  var memory = null; // fallback when storage is blocked (private mode, file:// lockdowns)

  function read() {
    if (!canPersist) return memory ? clone(memory) : clone(DEFAULTS);
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      return fill(JSON.parse(raw), DEFAULTS);
    } catch (e) {
      return clone(DEFAULTS);
    }
  }

  var state = read();
  var saveTimer = null;

  function writeNow() {
    if (!canPersist) { memory = clone(state); return; }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* quota or blocked — degrade silently to in-memory */
      memory = clone(state);
    }
  }

  /* Batched write so drag/slider events don't hammer localStorage. */
  function save() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      writeNow();
    }, 180);
  }

  /* ---------- daily rollover ----------
     Runs once on load (and again if the app is left open past midnight).
     - archives completed tasks
     - resets per-task pomodoro counters
     - resets today's stats
  */
  function rollDay(force) {
    var today = todayKey();
    if (!force && state.stats.day === today) return false;

    var isFirstEver = !state.stats.day;
    state.stats = { day: today, sessions: 0, minutes: 0 };

    if (!isFirstEver) {
      if (state.settings.carryOver) {
        state.tasks = state.tasks.filter(function (t) { return !t.done; });
      } else {
        state.tasks = [];
      }
      state.tasks.forEach(function (t) { t.spent = 0; });
      if (state.activeTaskId && !state.tasks.some(function (t) { return t.id === state.activeTaskId; })) {
        state.activeTaskId = null;
      }
    }

    writeNow();
    return !isFirstEver; // true => an actual rollover happened
  }

  var rolled = rollDay(false);

  /* ---------- public API ---------- */
  var Store = {
    KEY: KEY,
    persistent: canPersist,
    rolledOver: rolled,

    get state() { return state; },
    get settings() { return state.settings; },
    get tasks() { return state.tasks; },
    get stats() { return state.stats; },
    get audio() { return state.audio; },

    save: save,
    flush: writeNow,
    todayKey: todayKey,

    set: function (path, value) {
      var parts = path.split(".");
      var node = state;
      for (var i = 0; i < parts.length - 1; i++) {
        if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = value;
      save();
      return value;
    },

    get: function (path, fallback) {
      var parts = path.split(".");
      var node = state;
      for (var i = 0; i < parts.length; i++) {
        if (node == null) return fallback;
        node = node[parts[i]];
      }
      return node === undefined ? fallback : node;
    },

    addStats: function (minutes) {
      rollDay(false);
      state.stats.sessions += 1;
      state.stats.minutes += Math.max(0, Math.round(minutes));
      save();
      return state.stats;
    },

    /* Called from a visibility/interval check so an all-nighter still rolls over. */
    checkDay: function () { return rollDay(false); },

    reset: function () {
      state = clone(DEFAULTS);
      state.stats.day = todayKey();
      writeNow();
      return state;
    },

    uid: function () {
      return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }
  };

  window.Store = Store;
})(window);
