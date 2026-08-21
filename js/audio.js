/* ==========================================================================
   audio.js — procedural ambience engine (Web Audio API, zero audio files)
   Every texture is synthesised from noise buffers + filters + LFOs, so there
   are no assets to host, nothing to 404 on GitHub Pages, and it works offline.
   Exposes: window.Ambience
   ========================================================================== */
(function (window) {
  "use strict";

  var AC = window.AudioContext || window.webkitAudioContext;

  /* ---------- catalogue ---------- */
  var SOUNDS = [
    { id: "rain",  name: "Rain",        emoji: "🌧️", vol: 0.55 },
    { id: "waves", name: "Ocean",       emoji: "🌊", vol: 0.5  },
    { id: "brown", name: "Brown noise", emoji: "🟫", vol: 0.4  },
    { id: "white", name: "White noise", emoji: "⬜", vol: 0.28 },
    { id: "fire",  name: "Fireplace",   emoji: "🔥", vol: 0.5  },
    { id: "cafe",  name: "Café hum",    emoji: "☕", vol: 0.45 },
    { id: "wind",  name: "Wind",        emoji: "🍃", vol: 0.45 },
    { id: "night", name: "Night",       emoji: "🌙", vol: 0.4  }
  ];

  var ctx = null;
  var master = null;          // master gain -> destination
  var nodes = {};             // id -> { gain, stop() }
  var state = {};             // id -> { on, vol }
  var masterVol = 0.7;
  var muted = false;
  var noiseBuf = null;
  var tickTimer = null;
  var tickOn = false;
  var unlocked = false;

  SOUNDS.forEach(function (s) { state[s.id] = { on: false, vol: s.vol }; });

  /* ---------- primitives ---------- */

  function ensureCtx() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : masterVol;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    return ctx;
  }

  /* 4s of white noise, reused by every generator (cheap + loops seamlessly enough) */
  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = ctx.sampleRate * 4;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function noiseSource() {
    var src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    return src;
  }

  function gain(v) {
    var g = ctx.createGain();
    g.gain.value = v;
    return g;
  }

  function filter(type, freq, q) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }

  /* Slow random-ish modulation of a param, used for swells/gusts. */
  function lfo(target, freq, depth, offset) {
    var osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    var amp = gain(depth);
    osc.connect(amp).connect(target);
    target.value = offset;
    osc.start();
    return osc;
  }

  function ramp(param, to, secs) {
    var now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + secs);
  }

  /* ---------- generators ----------
     Each returns { out: AudioNode, stop: fn } and connects nothing upstream. */

  function buildRain() {
    var out = gain(1);
    var src = noiseSource();
    var hp = filter("highpass", 480);
    var lp = filter("lowpass", 8200);
    var body = gain(0.5);
    src.connect(hp).connect(lp).connect(body).connect(out);

    // low rumble underneath
    var src2 = noiseSource();
    var lp2 = filter("lowpass", 380);
    var rumble = gain(0.32);
    src2.connect(lp2).connect(rumble).connect(out);

    // gentle intensity swell
    var l = lfo(body.gain, 0.055, 0.16, 0.5);
    src.start(0); src2.start(0);

    return { out: out, stop: function () { try { src.stop(); src2.stop(); l.stop(); } catch (e) {} } };
  }

  function buildWaves() {
    var out = gain(1);
    var src = noiseSource();
    var lp = filter("lowpass", 1100);
    var bp = filter("bandpass", 520, 0.7);
    var swell = gain(0.12);
    src.connect(lp).connect(bp).connect(swell).connect(out);

    // two out-of-phase LFOs => irregular sets of waves
    var l1 = lfo(swell.gain, 0.085, 0.34, 0.36);
    var l2 = lfo(lp.frequency, 0.052, 520, 1100);

    var src2 = noiseSource();
    var lp3 = filter("lowpass", 240);
    var deep = gain(0.24);
    src2.connect(lp3).connect(deep).connect(out);

    src.start(0); src2.start(0);
    return { out: out, stop: function () { try { src.stop(); src2.stop(); l1.stop(); l2.stop(); } catch (e) {} } };
  }

  function buildBrown() {
    var out = gain(1);
    // integrate white noise into brown, offline-generated once
    var len = ctx.sampleRate * 4;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.6;
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    var lp = filter("lowpass", 1400);
    src.connect(lp).connect(gain(0.9)).connect(out);
    src.start(0);
    return { out: out, stop: function () { try { src.stop(); } catch (e) {} } };
  }

  function buildWhite() {
    var out = gain(1);
    var src = noiseSource();
    var lp = filter("lowpass", 11000);
    src.connect(lp).connect(gain(0.42)).connect(out);
    src.start(0);
    return { out: out, stop: function () { try { src.stop(); } catch (e) {} } };
  }

  function buildFire() {
    var out = gain(1);

    // hissing bed
    var src = noiseSource();
    var lp = filter("lowpass", 900);
    var bed = gain(0.3);
    src.connect(lp).connect(bed).connect(out);
    var l = lfo(bed.gain, 0.14, 0.12, 0.3);
    src.start(0);

    // random crackles scheduled ahead of time
    var alive = true;
    var timer = null;
    function crackle() {
      if (!alive) return;
      var burst = ctx.createBufferSource();
      burst.buffer = noise();
      burst.loop = false;
      var offset = Math.random() * 3;
      var bp = filter("bandpass", 900 + Math.random() * 2600, 1.4);
      var g = gain(0);
      burst.connect(bp).connect(g).connect(out);
      var t = ctx.currentTime;
      var peak = 0.22 + Math.random() * 0.5;
      var dur = 0.035 + Math.random() * 0.07;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      try { burst.start(t, offset, dur + 0.02); } catch (e) {}
      timer = window.setTimeout(crackle, 60 + Math.random() * 420);
    }
    crackle();

    return {
      out: out,
      stop: function () {
        alive = false;
        if (timer) window.clearTimeout(timer);
        try { src.stop(); l.stop(); } catch (e) {}
      }
    };
  }

  function buildCafe() {
    var out = gain(1);

    // murmur: band-limited noise around speech frequencies, wobbling
    var src = noiseSource();
    var bp = filter("bandpass", 460, 0.9);
    var lp = filter("lowpass", 2000);
    var murmur = gain(0.34);
    src.connect(bp).connect(lp).connect(murmur).connect(out);
    var l1 = lfo(bp.frequency, 0.18, 180, 460);
    var l2 = lfo(murmur.gain, 0.09, 0.14, 0.34);

    // room tone
    var src2 = noiseSource();
    var lp2 = filter("lowpass", 200);
    src2.connect(lp2).connect(gain(0.22)).connect(out);

    // occasional cup/spoon clink
    var alive = true, timer = null;
    function clink() {
      if (!alive) return;
      var osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 1400 + Math.random() * 1800;
      var g = gain(0);
      osc.connect(g).connect(out);
      var t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.34);
      timer = window.setTimeout(clink, 2600 + Math.random() * 7000);
    }
    timer = window.setTimeout(clink, 1800 + Math.random() * 4000);

    src.start(0); src2.start(0);
    return {
      out: out,
      stop: function () {
        alive = false;
        if (timer) window.clearTimeout(timer);
        try { src.stop(); src2.stop(); l1.stop(); l2.stop(); } catch (e) {}
      }
    };
  }

  function buildWind() {
    var out = gain(1);
    var src = noiseSource();
    var bp = filter("bandpass", 380, 0.55);
    var lp = filter("lowpass", 1500);
    var g = gain(0.3);
    src.connect(bp).connect(lp).connect(g).connect(out);
    var l1 = lfo(bp.frequency, 0.045, 260, 400);   // gusts sweep the band
    var l2 = lfo(g.gain, 0.07, 0.2, 0.32);
    src.start(0);
    return { out: out, stop: function () { try { src.stop(); l1.stop(); l2.stop(); } catch (e) {} } };
  }

  function buildNight() {
    var out = gain(1);

    // airy bed
    var src = noiseSource();
    var hp = filter("highpass", 1800);
    var lp = filter("lowpass", 6000);
    src.connect(hp).connect(lp).connect(gain(0.1)).connect(out);
    src.start(0);

    // cricket chirp cycles
    var alive = true, timer = null;
    function chirp() {
      if (!alive) return;
      var t = ctx.currentTime;
      var reps = 2 + Math.floor(Math.random() * 3);
      for (var i = 0; i < reps; i++) {
        var osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = 3900 + Math.random() * 900;
        var bp = filter("bandpass", 4400, 8);
        var g = gain(0);
        osc.connect(bp).connect(g).connect(out);
        var s = t + i * 0.13;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.035, s + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.075);
        osc.start(s);
        osc.stop(s + 0.1);
      }
      timer = window.setTimeout(chirp, 900 + Math.random() * 2600);
    }
    timer = window.setTimeout(chirp, 600);

    return {
      out: out,
      stop: function () {
        alive = false;
        if (timer) window.clearTimeout(timer);
        try { src.stop(); } catch (e) {}
      }
    };
  }

  var BUILDERS = {
    rain: buildRain, waves: buildWaves, brown: buildBrown, white: buildWhite,
    fire: buildFire, cafe: buildCafe, wind: buildWind, night: buildNight
  };

  /* ---------- voice lifecycle ---------- */

  function start(id) {
    if (!ensureCtx() || !BUILDERS[id] || nodes[id]) return;
    var built = BUILDERS[id]();
    var g = gain(0);
    built.out.connect(g).connect(master);
    nodes[id] = { gain: g, voice: built };
    ramp(g.gain, state[id].vol, 0.8);          // fade in, no click
  }

  function stop(id) {
    var n = nodes[id];
    if (!n) return;
    nodes[id] = null;
    delete nodes[id];
    ramp(n.gain.gain, 0, 0.55);
    window.setTimeout(function () {
      try { n.voice.stop(); n.gain.disconnect(); } catch (e) {}
    }, 700);
  }

  /* ---------- ticking clock ---------- */

  function tickOnce() {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 1650;
    var bp = filter("bandpass", 1800, 6);
    var g = gain(0);
    osc.connect(bp).connect(g).connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  /* ---------- public API ---------- */

  var Ambience = {
    SOUNDS: SOUNDS,
    supported: !!AC,

    /* Must be called from a user gesture at least once (autoplay policy). */
    unlock: function () {
      if (!ensureCtx()) return false;
      if (!unlocked) {
        // a silent blip satisfies iOS/Safari
        var b = ctx.createBufferSource();
        b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        b.connect(ctx.destination);
        try { b.start(0); } catch (e) {}
        unlocked = true;
      }
      return true;
    },

    isOn: function (id) { return !!(state[id] && state[id].on); },
    volOf: function (id) { return state[id] ? state[id].vol : 0.5; },
    anyOn: function () { return Object.keys(state).some(function (k) { return state[k].on; }); },
    isMuted: function () { return muted; },
    masterVolume: function () { return masterVol; },

    toggle: function (id, force) {
      if (!state[id]) return false;
      var next = typeof force === "boolean" ? force : !state[id].on;
      state[id].on = next;
      if (next) { this.unlock(); start(id); } else { stop(id); }
      return next;
    },

    setVol: function (id, v) {
      if (!state[id]) return;
      state[id].vol = Math.max(0, Math.min(1, v));
      if (nodes[id] && !muted) ramp(nodes[id].gain.gain, state[id].vol, 0.12);
    },

    setMaster: function (v) {
      masterVol = Math.max(0, Math.min(1, v));
      if (master) ramp(master.gain, muted ? 0 : masterVol, 0.12);
    },

    setMuted: function (m) {
      muted = !!m;
      if (master) ramp(master.gain, muted ? 0 : masterVol, 0.22);
      return muted;
    },

    toggleMuted: function () { return this.setMuted(!muted); },

    setTicking: function (on) {
      tickOn = !!on;
      if (tickTimer) { window.clearInterval(tickTimer); tickTimer = null; }
      if (tickOn) {
        this.unlock();
        tickTimer = window.setInterval(tickOnce, 1000);
      }
    },

    isTicking: function () { return tickOn; },

    /* Session-end chime: soft three-note arpeggio, ignores the mute flag on
       purpose? No — respect it, but route around the master mute for clarity. */
    chime: function (kind) {
      if (!ensureCtx()) return;
      var notes = kind === "break" ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
      var t0 = ctx.currentTime + 0.02;
      var bus = ctx.createGain();
      bus.gain.value = muted ? 0.0 : 0.9;
      bus.connect(ctx.destination);

      notes.forEach(function (f, i) {
        var osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        var g = ctx.createGain();
        var s = t0 + i * 0.16;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.2, s + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 1.1);
        osc.connect(g).connect(bus);
        osc.start(s);
        osc.stop(s + 1.2);

        // shimmer octave
        var osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = f * 2;
        var g2 = ctx.createGain();
        g2.gain.setValueAtTime(0, s);
        g2.gain.linearRampToValueAtTime(0.06, s + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.0001, s + 0.7);
        osc2.connect(g2).connect(bus);
        osc2.start(s);
        osc2.stop(s + 0.8);
      });

      window.setTimeout(function () { try { bus.disconnect(); } catch (e) {} }, 2200);
    },

    /* Tiny UI click for buttons/checks. */
    blip: function (freq) {
      if (!ctx || muted) return;
      var t = ctx.currentTime;
      var osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq || 880;
      var g = gain(0);
      osc.connect(g).connect(ctx.destination);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.start(t);
      osc.stop(t + 0.16);
    },

    /* Restore a saved mix. */
    hydrate: function (saved) {
      if (!saved) return;
      if (typeof saved.master === "number") masterVol = Math.max(0, Math.min(1, saved.master));
      muted = !!saved.muted;
      if (saved.sounds) {
        Object.keys(saved.sounds).forEach(function (id) {
          if (!state[id]) return;
          var s = saved.sounds[id] || {};
          if (typeof s.vol === "number") state[id].vol = Math.max(0, Math.min(1, s.vol));
          state[id].on = !!s.on;   // playback itself waits for a user gesture
        });
      }
    },

    /* Start everything previously marked "on" (call inside a gesture handler). */
    resumeMix: function () {
      if (!this.unlock()) return;
      Object.keys(state).forEach(function (id) {
        if (state[id].on && !nodes[id]) start(id);
      });
      if (tickOn && !tickTimer) tickTimer = window.setInterval(tickOnce, 1000);
    },

    serialize: function () {
      var sounds = {};
      Object.keys(state).forEach(function (id) {
        sounds[id] = { on: state[id].on, vol: state[id].vol };
      });
      return { master: masterVol, muted: muted, tick: tickOn, sounds: sounds };
    },

    stopAll: function () {
      Object.keys(nodes).forEach(function (id) { stop(id); });
      Object.keys(state).forEach(function (id) { state[id].on = false; });
      this.setTicking(false);
    }
  };

  window.Ambience = Ambience;
})(window);
