/* ==========================================================================
   timer.js — drift-free Pomodoro state machine
   Time left is always derived from wall-clock deltas (Date.now), never from
   accumulated setInterval ticks, so background throttling can't desync it.
   Exposes: window.Timer  (event hooks: onTick, onComplete, onModeChange, onStateChange)
   ========================================================================== */
(function (window) {
  "use strict";

  var MODES = ["focus", "short", "long"];

  var LABELS = {
    focus: "Focus",
    short: "Short break",
    long: "Long break"
  };

  var Timer = {
    mode: "focus",
    running: false,
    completedFocus: 0,      // focus sessions since the last long break
    remainingMs: 0,
    durationMs: 0,

    _endAt: 0,              // wall-clock target
    _raf: null,
    _lastShown: -1,
    _settings: null,

    onTick: null,
    onComplete: null,
    onModeChange: null,
    onStateChange: null,

    /* ---------- setup ---------- */

    init: function (settings) {
      this._settings = settings;
      this.setMode("focus", true);
      return this;
    },

    label: function (mode) { return LABELS[mode || this.mode]; },

    minutesFor: function (mode) {
      var s = this._settings || { focus: 25, short: 5, long: 15 };
      var v = s[mode || this.mode];
      return Math.max(1, Math.min(600, Number(v) || 1));
    },

    /* ---------- transitions ---------- */

    setMode: function (mode, silent) {
      if (MODES.indexOf(mode) === -1) return;
      this.pause(true);
      this.mode = mode;
      this.durationMs = this.minutesFor(mode) * 60000;
      this.remainingMs = this.durationMs;
      this._lastShown = -1;
      if (!silent && this.onModeChange) this.onModeChange(mode);
      if (this.onTick) this.onTick(this.remainingMs, this.progress());
      if (this.onStateChange) this.onStateChange(this);
    },

    /* Re-read durations after a settings edit; only resets an idle timer. */
    refreshDurations: function () {
      var wanted = this.minutesFor(this.mode) * 60000;
      if (this.running) { this.durationMs = Math.max(this.durationMs, wanted); return; }
      if (wanted !== this.durationMs) {
        this.durationMs = wanted;
        this.remainingMs = wanted;
        this._lastShown = -1;
        if (this.onTick) this.onTick(this.remainingMs, this.progress());
      }
    },

    start: function () {
      if (this.running) return;
      if (this.remainingMs <= 0) this.remainingMs = this.durationMs;
      this._endAt = Date.now() + this.remainingMs;
      this.running = true;
      this._loop();
      if (this.onStateChange) this.onStateChange(this);
    },

    pause: function (silent) {
      if (!this.running) return;
      this.remainingMs = Math.max(0, this._endAt - Date.now());
      this.running = false;
      if (this._raf) { window.cancelAnimationFrame(this._raf); this._raf = null; }
      if (!silent && this.onStateChange) this.onStateChange(this);
    },

    toggle: function () {
      if (this.running) this.pause(); else this.start();
      return this.running;
    },

    reset: function () {
      this.pause(true);
      this.remainingMs = this.durationMs;
      this._lastShown = -1;
      if (this.onTick) this.onTick(this.remainingMs, this.progress());
      if (this.onStateChange) this.onStateChange(this);
    },

    /* Manual skip — counts as finishing the session but flagged as skipped. */
    skip: function () {
      this._finish(true);
    },

    /* ---------- the loop ---------- */

    _loop: function () {
      var self = this;
      function frame() {
        if (!self.running) return;
        var left = self._endAt - Date.now();

        if (left <= 0) {
          self.remainingMs = 0;
          self._emitTick(0);
          self._finish(false);
          return;
        }

        self.remainingMs = left;
        self._emitTick(left);
        self._raf = window.requestAnimationFrame(frame);
      }
      this._raf = window.requestAnimationFrame(frame);
    },

    /* Only notify when the displayed second actually changes (cheap DOM work),
       but always feed fresh progress for a smooth ring. */
    _emitTick: function (left) {
      var sec = Math.ceil(left / 1000);
      var changed = sec !== this._lastShown;
      this._lastShown = sec;
      if (this.onTick) this.onTick(left, this.progress(), changed);
    },

    progress: function () {
      if (!this.durationMs) return 0;
      var done = (this.durationMs - this.remainingMs) / this.durationMs;
      return Math.max(0, Math.min(1, done));
    },

    elapsedMinutes: function () {
      return (this.durationMs - Math.max(0, this.remainingMs)) / 60000;
    },

    /* ---------- completion / cycling ---------- */

    _finish: function (skipped) {
      var finishedMode = this.mode;
      var elapsed = this.elapsedMinutes();
      var plannedMinutes = this.durationMs / 60000;

      this.pause(true);

      var interval = Math.max(2, Number(this._settings && this._settings.interval) || 4);
      var nextMode;

      if (finishedMode === "focus") {
        if (!skipped) this.completedFocus += 1;
        nextMode = (this.completedFocus > 0 && this.completedFocus % interval === 0) ? "long" : "short";
      } else {
        nextMode = "focus";
      }

      var info = {
        finishedMode: finishedMode,
        nextMode: nextMode,
        skipped: !!skipped,
        minutes: skipped ? elapsed : plannedMinutes,
        completedFocus: this.completedFocus,
        interval: interval
      };

      // move to the next session first so the UI never shows 00:00 in limbo
      this.setMode(nextMode, true);
      if (this.onModeChange) this.onModeChange(nextMode);
      if (this.onComplete) this.onComplete(info);
      if (this.onStateChange) this.onStateChange(this);
    },

    /* ---------- cycle helpers ---------- */

    pipsState: function () {
      var interval = Math.max(2, Number(this._settings && this._settings.interval) || 4);
      var done = this.completedFocus % interval;
      // a completed full set momentarily reads 0; show it full instead
      if (done === 0 && this.completedFocus > 0 && this.mode === "long") done = interval;
      return { total: interval, done: done };
    },

    resetCycle: function () { this.completedFocus = 0; },

    /* ---------- formatting ---------- */

    format: function (ms) {
      var total = Math.max(0, Math.ceil((ms == null ? this.remainingMs : ms) / 1000));
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      function pad(n) { return n < 10 ? "0" + n : String(n); }
      return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : pad(m) + ":" + pad(s);
    },

    /* Re-sync after the tab was hidden/asleep; returns true if it completed. */
    sync: function () {
      if (!this.running) return false;
      var left = this._endAt - Date.now();
      if (left <= 0) {
        this.remainingMs = 0;
        this._emitTick(0);
        this._finish(false);
        return true;
      }
      this.remainingMs = left;
      this._emitTick(left);
      return false;
    }
  };

  window.Timer = Timer;
})(window);
