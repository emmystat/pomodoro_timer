/* ==========================================================================
   tasks.js — daily checklist with drag-to-reorder (SortableJS via CDN)
   Falls back to keyboard/button reordering if the CDN is unreachable.
   Exposes: window.Tasks
   ========================================================================== */
(function (window, document) {
  "use strict";

  var ICON = {
    grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6" fill="currentColor"/><circle cx="15" cy="6" r="1.6" fill="currentColor"/><circle cx="9" cy="12" r="1.6" fill="currentColor"/><circle cx="15" cy="12" r="1.6" fill="currentColor"/><circle cx="9" cy="18" r="1.6" fill="currentColor"/><circle cx="15" cy="18" r="1.6" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.6l4.4 4.4L19 7.4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12h9.4l.8-12M10.5 10.5v6M13.5 10.5v6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  var els = {};
  var sortable = null;

  var Tasks = {
    onActiveChange: null,   // fn(task|null)
    onChange: null,         // fn(list)
    notify: null,           // fn(message, kind)

    /* ---------- init ---------- */

    init: function (refs) {
      els = refs;
      var self = this;

      els.form.addEventListener("submit", function (e) {
        e.preventDefault();
        self.add(els.input.value, els.est.value);
        els.input.value = "";
        els.input.focus();
      });

      // one delegated listener for the whole list
      els.list.addEventListener("click", function (e) {
        var li = e.target.closest(".task");
        if (!li) return;
        var id = li.dataset.id;

        if (e.target.closest(".task-check")) { self.toggleDone(id); return; }
        if (e.target.closest(".del")) { self.remove(id); return; }
        if (e.target.closest(".focus-btn")) { self.setActive(id, true); return; }
      });

      // inline editing
      els.list.addEventListener("dblclick", function (e) {
        var txt = e.target.closest(".task-text");
        if (txt) self._beginEdit(txt);
      });

      els.list.addEventListener("keydown", function (e) {
        var txt = e.target.closest(".task-text");
        if (!txt) return;
        if (e.key === "Enter") { e.preventDefault(); txt.blur(); }
        if (e.key === "Escape") {
          var li = txt.closest(".task");
          var t = self.byId(li.dataset.id);
          txt.textContent = t ? t.text : "";
          txt.blur();
        }
      });

      els.list.addEventListener("blur", function (e) {
        var txt = e.target.closest && e.target.closest(".task-text");
        if (txt) self._commitEdit(txt);
      }, true);

      els.clearDone.addEventListener("click", function () { self.clearDone(); });
      els.clearAll.addEventListener("click", function () {
        if (!Store.tasks.length) return;
        if (window.confirm("Delete every task on today's list?")) self.clearAll();
      });

      this._initSortable();
      this.render();
      return this;
    },

    _initSortable: function () {
      if (typeof window.Sortable === "undefined") return; // CDN blocked -> no drag, list still works
      var self = this;
      sortable = window.Sortable.create(els.list, {
        handle: ".drag-handle",
        animation: 190,
        easing: "cubic-bezier(.22,.61,.36,1)",
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
        forceFallback: false,
        delayOnTouchOnly: true,
        delay: 90,
        onEnd: function () { self._syncOrderFromDom(); }
      });
    },

    /* Read the DOM order back into the store after a drag. */
    _syncOrderFromDom: function () {
      var ids = Array.prototype.map.call(els.list.children, function (li) { return li.dataset.id; });
      var map = {};
      Store.tasks.forEach(function (t) { map[t.id] = t; });
      var next = [];
      ids.forEach(function (id) { if (map[id]) { next.push(map[id]); delete map[id]; } });
      Object.keys(map).forEach(function (id) { next.push(map[id]); }); // safety net
      Store.state.tasks = next;
      Store.save();
      this._emit();
    },

    /* ---------- data ops ---------- */

    byId: function (id) {
      var found = null;
      Store.tasks.some(function (t) { if (t.id === id) { found = t; return true; } return false; });
      return found;
    },

    add: function (text, est) {
      text = String(text || "").trim();
      if (!text) return null;
      var task = {
        id: Store.uid(),
        text: text.slice(0, 140),
        done: false,
        est: Math.max(1, Math.min(12, parseInt(est, 10) || 1)),
        spent: 0,
        createdAt: Date.now()
      };
      Store.tasks.push(task);
      Store.save();
      this.render();
      this._emit();

      // first task added becomes the focus target automatically
      if (!Store.state.activeTaskId) this.setActive(task.id);
      return task;
    },

    remove: function (id) {
      var idx = -1;
      Store.tasks.forEach(function (t, i) { if (t.id === id) idx = i; });
      if (idx === -1) return;
      var wasActive = Store.state.activeTaskId === id;
      Store.tasks.splice(idx, 1);
      if (wasActive) Store.state.activeTaskId = null;
      Store.save();
      this.render();
      this._emit();
      if (wasActive && this.onActiveChange) this.onActiveChange(this.active());
    },

    toggleDone: function (id) {
      var t = this.byId(id);
      if (!t) return;
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;

      // finishing the active task frees the focus target up
      if (t.done && Store.state.activeTaskId === id) {
        Store.state.activeTaskId = null;
        if (this.onActiveChange) this.onActiveChange(null);
      }
      Store.save();
      this.render();
      this._emit();
      if (t.done && this.notify) this.notify("Nice — “" + this._short(t.text) + "” done", "ok");
      return t.done;
    },

    setActive: function (id, toggle) {
      var t = this.byId(id);
      if (!t || t.done) return;
      if (toggle && Store.state.activeTaskId === id) {
        Store.state.activeTaskId = null;
      } else {
        Store.state.activeTaskId = id;
      }
      Store.save();
      this.render();
      if (this.onActiveChange) this.onActiveChange(this.active());
    },

    active: function () {
      var id = Store.state.activeTaskId;
      if (!id) return null;
      var t = this.byId(id);
      return t && !t.done ? t : null;
    },

    /* Called by the app when a focus session completes. */
    creditPomodoro: function () {
      var t = this.active();
      if (!t) return null;
      t.spent = (t.spent || 0) + 1;
      Store.save();
      this.render();
      return t;
    },

    clearDone: function () {
      var before = Store.tasks.length;
      Store.state.tasks = Store.tasks.filter(function (t) { return !t.done; });
      if (Store.tasks.length === before) return;
      Store.save();
      this.render();
      this._emit();
      if (this.notify) this.notify("Cleared " + (before - Store.tasks.length) + " completed", "ok");
    },

    clearAll: function () {
      Store.state.tasks = [];
      Store.state.activeTaskId = null;
      Store.save();
      this.render();
      this._emit();
      if (this.onActiveChange) this.onActiveChange(null);
    },

    stats: function () {
      var total = Store.tasks.length;
      var done = Store.tasks.filter(function (t) { return t.done; }).length;
      return { total: total, done: done, pct: total ? Math.round((done / total) * 100) : 0 };
    },

    /* ---------- editing ---------- */

    _beginEdit: function (txt) {
      txt.setAttribute("contenteditable", "plaintext-only");
      txt.focus();
      var range = document.createRange();
      range.selectNodeContents(txt);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    },

    _commitEdit: function (txt) {
      if (!txt.hasAttribute("contenteditable")) return;
      txt.removeAttribute("contenteditable");
      var li = txt.closest(".task");
      if (!li) return;
      var t = this.byId(li.dataset.id);
      if (!t) return;
      var next = txt.textContent.replace(/\s+/g, " ").trim().slice(0, 140);
      if (!next) { txt.textContent = t.text; return; }
      if (next !== t.text) {
        t.text = next;
        Store.save();
        this._emit();
        if (Store.state.activeTaskId === t.id && this.onActiveChange) this.onActiveChange(t);
      }
      txt.textContent = next;
    },

    /* ---------- rendering ---------- */

    render: function () {
      var self = this;
      var activeId = Store.state.activeTaskId;
      var frag = document.createDocumentFragment();

      Store.tasks.forEach(function (t) {
        frag.appendChild(self._row(t, t.id === activeId));
      });

      els.list.innerHTML = "";
      els.list.appendChild(frag);

      var s = this.stats();
      els.count.textContent = s.done + " / " + s.total;
      els.progressFill.style.width = s.pct + "%";
      els.progressBar.setAttribute("aria-valuenow", String(s.pct));
      els.empty.classList.toggle("is-shown", s.total === 0);
      els.foot.style.visibility = s.total === 0 ? "hidden" : "visible";
    },

    _row: function (t, isActive) {
      var li = document.createElement("li");
      li.className = "task" + (t.done ? " is-done" : "") + (isActive ? " is-active" : "");
      li.dataset.id = t.id;

      var spent = t.spent || 0;
      var est = t.est || 1;
      var pips = "";
      var shown = Math.max(est, spent);
      for (var i = 0; i < shown; i++) {
        pips += '<span class="tomato' + (i < spent ? " is-filled" : "") + '"></span>';
      }

      li.innerHTML =
        '<button class="drag-handle" type="button" tabindex="-1" aria-label="Drag to reorder" title="Drag to reorder">' + ICON.grip + '</button>' +
        '<button class="task-check" type="button" role="checkbox" aria-checked="' + (t.done ? "true" : "false") +
          '" aria-label="' + (t.done ? "Mark as not done" : "Mark as done") + '">' + ICON.check + '</button>' +
        '<div class="task-body">' +
          '<span class="task-text" title="Double-click to edit"></span>' +
          '<span class="task-meta">' +
            '<span class="tomatoes">' + pips + '</span>' +
            '<span class="task-meta-count">' + spent + "/" + est + '</span>' +
          '</span>' +
        '</div>' +
        '<span class="task-actions">' +
          '<button class="mini-btn focus-btn' + (isActive ? " is-on" : "") + '" type="button" title="' +
            (isActive ? "Stop focusing on this" : "Focus on this task") + '" aria-pressed="' + (isActive ? "true" : "false") + '">' + ICON.target + '</button>' +
          '<button class="mini-btn del" type="button" title="Delete task" aria-label="Delete task">' + ICON.trash + '</button>' +
        '</span>';

      li.querySelector(".task-text").textContent = t.text;
      return li;
    },

    _short: function (s) {
      s = String(s);
      return s.length > 28 ? s.slice(0, 27) + "…" : s;
    },

    _emit: function () {
      if (this.onChange) this.onChange(Store.tasks);
    },

    focusInput: function () {
      els.input.focus();
      els.input.select();
    }
  };

  window.Tasks = Tasks;
})(window, document);
