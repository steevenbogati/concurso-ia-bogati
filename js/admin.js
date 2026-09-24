/* =====================================================================
   Panel de administración: estado, avance, ranking y CSV
   ===================================================================== */
(function () {
  "use strict";

  const C = window.CONFIG;
  const { esc, store, fmtTime, fmtDateTime, fmtNum, pad, computeRanking, bonusByKey } = window.U;
  const DB = window.DB;

  const $root = document.getElementById("admin");
  const $rk = document.getElementById("ranking");
  const $ = (sel) => document.querySelector(sel);

  const SESSION_KEY = "bogati_admin";
  const POLL_MS = 5000;

  const A = {
    settings: null,
    scores: [],
    bonus: [],
    bonusError: false,
    live: false,
    busy: false,
    started: false,
  };

  /* ---------------------------------------------------------------
     Ingreso admin
     --------------------------------------------------------------- */
  function boot() {
    const s = store.get(SESSION_KEY);
    if (s && s.pin === String(C.ADMIN_PIN)) start();
    else renderLogin();
  }

  function renderLogin() {
    $root.innerHTML = `
      <main class="login">
        <div class="login-card">
          <p class="eyebrow eyebrow-accent">${esc(C.EVENTO.organizacion)}</p>
          <h1>Panel de administración</h1>
          <p class="lede">${esc(C.EVENTO.titulo)}</p>
          <div class="rule"></div>
          <form id="admin-login" novalidate>
            <div class="field">
              <label for="apin">PIN maestro</label>
              <input id="apin" type="password" inputmode="numeric" autocomplete="off">
            </div>
            <p class="form-error" id="aerr" role="alert"></p>
            <button class="btn btn-primary btn-block" type="submit">Ingresar</button>
          </form>
        </div>
      </main>`;
    $("#admin-login").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const v = $("#apin").value.trim();
      if (v !== String(C.ADMIN_PIN)) { $("#aerr").textContent = "PIN incorrecto."; $("#apin").select(); return; }
      store.set(SESSION_KEY, { pin: v });
      start();
    });
  }

  function logout() {
    store.remove(SESSION_KEY);
    location.reload();
  }

  /* ---------------------------------------------------------------
     Arranque
     --------------------------------------------------------------- */
  function start() {
    renderShell();
    if (A.started) return;
    A.started = true;

    refreshAll();
    let t = null;
    let tb = null;
    DB.subscribe(["scores", "settings", "bonus"], (table, p) => {
      if (table === "settings" && p.new && p.new.id === 1) { A.settings = p.new; renderState(); return; }
      if (table === "bonus") { clearTimeout(tb); tb = setTimeout(refreshBonus, 300); return; }
      clearTimeout(t);
      t = setTimeout(refreshScores, 300);
    }, (on) => { A.live = on; renderLive(); });

    setInterval(refreshAll, POLL_MS);
    window.addEventListener("online", () => { $("#net-banner").hidden = true; refreshAll(); });
    window.addEventListener("offline", () => { $("#net-banner").hidden = false; });
    document.addEventListener("keydown", onKey);
  }

  async function refreshAll() {
    await Promise.all([refreshSettings(), refreshScores(), refreshBonus()]);
  }

  async function refreshBonus() {
    try { A.bonus = await DB.getBonus(); A.bonusError = false; }
    catch (e) { console.error(e); A.bonusError = true; }
    renderBonus();
  }

  async function refreshSettings() {
    try { A.settings = await DB.getSettings(); renderState(); }
    catch (e) { console.error(e); renderState(e); }
  }

  async function refreshScores() {
    try { A.scores = await DB.getScores(); renderProgress(); }
    catch (e) { console.error(e); }
  }

  /* ---------------------------------------------------------------
     Pantalla principal
     --------------------------------------------------------------- */
  function configWarnings() {
    const w = [];
    if (!DB.configured) w.push("Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en config.js.");
    else if (!DB.ready) w.push("No se pudo cargar la librería de Supabase. Revisa tu conexión a internet y recarga.");
    const ids = C.JURADOS.map((j) => j.id);
    if (new Set(ids).size !== ids.length) w.push("Hay jurados con el mismo id en config.js.");
    return w;
  }

  function renderShell() {
    const warns = configWarnings();
    $root.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="./admin.html">
            <span class="brand-org">${esc(C.EVENTO.organizacion)}</span>
            <span class="brand-title">Panel de administración</span>
          </a>
          <div class="topbar-right">
            <span class="live" id="live">Conectando…</span>
            <button class="link-btn" id="logout" type="button">Salir</button>
          </div>
        </div>
      </header>
      <main class="wrap">
        <section class="intro">
          <p class="eyebrow">${esc(C.EVENTO.titulo)}</p>
          <h1>Control del concurso</h1>
        </section>

        ${warns.map((w) => `<div class="notice notice-warn">${esc(w)}</div>`).join("")}

        <section class="admin-grid">
          <div class="box">
            <p class="eyebrow">Calificación</p>
            <p class="state" id="state-label">—</p>
            <p class="hint" id="state-hint">Los jurados ven el cambio en segundos, sin recargar.</p>
            <div class="box-actions"><button class="btn btn-block" id="toggle" type="button" disabled>—</button></div>
          </div>

          <div class="box">
            <p class="eyebrow">Avance</p>
            <p class="state" id="progress-label">—</p>
            <div class="bar"><span id="progress-bar"></span></div>
            <p class="hint" id="progress-hint"></p>
          </div>

          <div class="box">
            <p class="eyebrow">Ronda de preguntas</p>
            <p class="state" id="bonus-label">—</p>
            <p class="hint">Los jurados suman puntos adicionales al equipo que responde primero.</p>
            <div class="box-actions"><button class="btn btn-block" id="bonus-toggle" type="button" disabled>—</button></div>
          </div>

          <div class="box">
            <p class="eyebrow">Resultados</p>
            <p class="state" id="reveal-label">—</p>
            <div class="btn-row box-actions">
              <button class="btn btn-primary" id="winners-btn" type="button" disabled>Presentar ganadores</button>
              <button class="btn btn-secondary" id="reveal" type="button" disabled>Revelar resultados</button>
              <button class="btn btn-secondary" id="export" type="button">Exportar CSV</button>
            </div>
            <button class="link-btn" id="hide" type="button" hidden>Volver a ocultar resultados</button>
          </div>
        </section>

        <section>
          <h2 class="section-title">Puntajes por jurado</h2>
          <div class="table-wrap"><table class="progress-table" id="table"></table></div>
          <p class="hint" style="margin-top:10px">Total de la rúbrica (sobre 100) que guardó cada jurado. Se actualiza en tiempo real. Evita compartir esta pantalla en Zoom antes de revelar resultados.</p>
        </section>

        <section class="admin-section">
          <h2 class="section-title">Puntos adicionales</h2>
          <div id="bonus-warn"></div>
          <div class="table-wrap"><table class="progress-table" id="bonus-table"></table></div>
          <p class="hint" style="margin-top:10px">El puntaje final de cada equipo es el promedio de la rúbrica más el promedio de estos puntos entre los ${C.JURADOS.length} jurados.</p>
        </section>
      </main>
      <footer class="foot">${esc(C.EVENTO.organizacion)} · ${esc(C.EVENTO.titulo)}</footer>`;

    $("#logout").addEventListener("click", logout);
    $("#toggle").addEventListener("click", toggleScoring);
    $("#reveal").addEventListener("click", onReveal);
    $("#hide").addEventListener("click", hideResults);
    $("#export").addEventListener("click", exportCsv);
    $("#bonus-toggle").addEventListener("click", toggleBonus);
    $("#winners-btn").addEventListener("click", openWinners);

    renderLive();
    renderState();
    renderProgress();
    renderBonus();
  }

  function renderLive() {
    const el = $("#live");
    if (!el) return;
    el.classList.toggle("on", A.live);
    el.textContent = A.live ? "En vivo" : (DB.ready ? "Reconectando…" : "Sin conexión");
  }

  function renderState(err) {
    const label = $("#state-label");
    if (!label) return;
    const s = A.settings;
    const toggle = $("#toggle");
    const reveal = $("#reveal");
    if (!s) {
      label.textContent = err ? "Sin conexión" : "—";
      label.classList.remove("is-open");
      toggle.disabled = true;
      reveal.disabled = true;
      $("#bonus-toggle").disabled = true;
      $("#winners-btn").disabled = true;
      return;
    }
    label.textContent = s.scoring_open ? "ABIERTA" : "CERRADA";
    label.classList.toggle("is-open", s.scoring_open);
    toggle.textContent = s.scoring_open ? "Cerrar calificación" : "Abrir calificación";
    toggle.className = "btn btn-block " + (s.scoring_open ? "" : "btn-primary");
    toggle.disabled = A.busy;

    $("#reveal-label").textContent = s.results_revealed ? "Revelados" : "Ocultos";
    reveal.textContent = s.results_revealed ? "Ver ranking completo" : "Revelar resultados";
    reveal.disabled = A.busy;
    $("#winners-btn").disabled = A.busy;
    $("#hide").hidden = !s.results_revealed;

    const bl = $("#bonus-label");
    const bt = $("#bonus-toggle");
    const hasBonus = "bonus_open" in s;
    bl.textContent = !hasBonus ? "Sin configurar" : (s.bonus_open ? "ABIERTA" : "CERRADA");
    bl.classList.toggle("is-open", !!s.bonus_open);
    bt.textContent = s.bonus_open ? "Cerrar ronda de preguntas" : "Abrir ronda de preguntas";
    bt.className = "btn btn-block " + (s.bonus_open ? "" : "btn-primary");
    bt.disabled = A.busy || !hasBonus;
    renderBonus();
  }

  function renderBonus() {
    const table = $("#bonus-table");
    if (!table) return;
    const warn = $("#bonus-warn");
    const missing = A.bonusError || (A.settings && !("bonus_open" in A.settings));
    warn.innerHTML = missing
      ? `<div class="notice notice-warn"><strong>Falta activar la ronda de preguntas en Supabase.</strong> Ejecuta el archivo sql/02_puntos_adicionales.sql en el SQL Editor y recarga esta página.</div>`
      : "";
    const byKey = bonusByKey(A.bonus);
    const nJ = C.JURADOS.length || 1;
    const head = C.PROYECTOS.map((p, i) =>
      `<th title="${esc(p.nombre)}"><span class="pnum">${pad(i + 1)}</span><span class="pname">${esc(p.nombre)}</span></th>`).join("");
    const body = C.JURADOS.map((j) => {
      const cells = C.PROYECTOS.map((p) => {
        const v = byKey[j.id + "|" + p.id] || 0;
        return `<td class="${v ? "cell-done" : "cell-pending"}">${v ? "+" + v : "—"}</td>`;
      }).join("");
      return `<tr><td>${esc(j.nombre)}</td>${cells}</tr>`;
    }).join("");
    const foot = C.PROYECTOS.map((p) => {
      const sum = C.JURADOS.reduce((a, j) => a + (byKey[j.id + "|" + p.id] || 0), 0);
      return `<td>${sum ? "+" + fmtNum(sum / nJ) : "—"}</td>`;
    }).join("");
    table.innerHTML = `
      <thead><tr><th>Jurado</th>${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Promedio que se suma</td>${foot}</tr></tfoot>`;
  }

  function renderProgress() {
    const table = $("#table");
    if (!table) return;
    const byKey = {};
    A.scores.forEach((r) => { byKey[r.jurado_id + "|" + r.proyecto_id] = r; });

    const expected = C.JURADOS.length * C.PROYECTOS.length;
    const done = C.JURADOS.reduce((a, j) => a + C.PROYECTOS.filter((p) => byKey[j.id + "|" + p.id]).length, 0);
    $("#progress-label").textContent = `${done} de ${expected}`;
    $("#progress-bar").style.width = expected ? `${(done / expected) * 100}%` : "0";
    const juradosDone = C.JURADOS.filter((j) => C.PROYECTOS.every((p) => byKey[j.id + "|" + p.id])).length;
    $("#progress-hint").textContent = `${juradosDone} de ${C.JURADOS.length} jurados han calificado todos los proyectos.`;

    const head = C.PROYECTOS.map((p, i) =>
      `<th title="${esc(p.nombre)}"><span class="pnum">${pad(i + 1)}</span><span class="pname">${esc(p.nombre)}</span></th>`).join("");

    const body = C.JURADOS.map((j) => {
      let n = 0;
      const cells = C.PROYECTOS.map((p) => {
        const r = byKey[j.id + "|" + p.id];
        if (!r) return `<td class="cell-pending">—</td>`;
        n++;
        return `<td class="cell-score" title="Guardado ${esc(fmtTime(r.updated_at))}">${r.total}</td>`;
      }).join("");
      const cls = n === C.PROYECTOS.length ? "cell-done complete" : "cell-done";
      return `<tr><td>${esc(j.nombre)}</td>${cells}<td class="${cls}">${n} / ${C.PROYECTOS.length}</td></tr>`;
    }).join("");

    const foot = C.PROYECTOS.map((p) => {
      const n = C.JURADOS.filter((j) => byKey[j.id + "|" + p.id]).length;
      return `<td>${n} / ${C.JURADOS.length}</td>`;
    }).join("");
    const avgRow = C.PROYECTOS.map((p) => {
      const rs = C.JURADOS.map((j) => byKey[j.id + "|" + p.id]).filter(Boolean);
      return `<td class="cell-avg">${rs.length ? fmtNum(rs.reduce((a, r) => a + Number(r.total), 0) / rs.length) : "—"}</td>`;
    }).join("");

    table.innerHTML = `
      <thead><tr><th>Jurado</th>${head}<th>Avance</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr><td>Promedio rúbrica</td>${avgRow}<td></td></tr>
        <tr><td>Votos por proyecto</td>${foot}<td></td></tr>
      </tfoot>`;
  }

  /* ---------------------------------------------------------------
     Acciones
     --------------------------------------------------------------- */
  async function updateSettings(patch) {
    A.busy = true;
    renderState();
    try {
      A.settings = await DB.updateSettings(patch);
      return true;
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.");
      return false;
    } finally {
      A.busy = false;
      renderState();
    }
  }

  function toggleScoring() {
    if (!A.settings) return;
    const open = !A.settings.scoring_open;
    const msg = open
      ? "¿Abrir la calificación? Los jurados podrán calificar desde este momento."
      : "¿Cerrar la calificación? Los jurados ya no podrán guardar ni editar notas.";
    if (!confirm(msg)) return;
    updateSettings({ scoring_open: open });
  }

  function toggleBonus() {
    if (!A.settings) return;
    const open = !A.settings.bonus_open;
    const msg = open
      ? "¿Abrir la ronda de preguntas? Los jurados podrán sumar puntos adicionales a los equipos."
      : "¿Cerrar la ronda de preguntas? Los jurados ya no podrán sumar ni quitar puntos.";
    if (!confirm(msg)) return;
    updateSettings({ bonus_open: open });
  }

  async function onReveal() {
    if (await ensureRevealed()) await openRanking();
  }

  // Cierra calificación y ronda de preguntas y marca resultados como revelados
  async function ensureRevealed() {
    if (!A.settings) return false;
    if (!A.settings.results_revealed) {
      const expected = C.JURADOS.length * C.PROYECTOS.length;
      const pending = expected - A.scores.filter((r) =>
        C.JURADOS.some((j) => j.id === r.jurado_id) && C.PROYECTOS.some((p) => p.id === r.proyecto_id)).length;
      let msg = "Se cerrarán la calificación y la ronda de preguntas, y se mostrará el ranking.";
      if (pending > 0) msg += `\n\nAtención: faltan ${pending} calificaciones por registrar.`;
      msg += "\n\n¿Revelar resultados?";
      if (!confirm(msg)) return false;
      const patch = { scoring_open: false, results_revealed: true };
      if ("bonus_open" in A.settings) patch.bonus_open = false;
      const ok = await updateSettings(patch);
      if (!ok) return false;
    }
    return true;
  }

  function hideResults() {
    if (!confirm("¿Volver a ocultar los resultados?")) return;
    updateSettings({ results_revealed: false });
  }

  async function exportCsv() {
    const btn = $("#export");
    btn.disabled = true;
    btn.textContent = "Exportando…";
    try {
      const rows = await DB.getScores();
      let bonus = [];
      try { bonus = await DB.getBonus(); } catch (e) { /* sin tabla de puntos adicionales */ }
      const bk = bonusByKey(bonus);
      const projName = (id) => (C.PROYECTOS.find((p) => p.id === Number(id)) || {}).nombre || `Proyecto ${id}`;
      const head = ["Jurado", "N.º proyecto", "Proyecto",
        ...C.CRITERIOS.map((c) => `${c.nombre} (máx. ${c.max})`),
        "Total rúbrica (máx. 100)", "Puntos adicionales", "Comentario", "Última actualización"];
      const lines = rows
        .slice()
        .sort((a, b) => (a.proyecto_id - b.proyecto_id) || String(a.jurado_nombre).localeCompare(b.jurado_nombre, "es"))
        .map((r) => [
          r.jurado_nombre, r.proyecto_id, projName(r.proyecto_id),
          ...C.CRITERIOS.map((c) => r[c.key]),
          r.total, bk[r.jurado_id + "|" + r.proyecto_id] || 0, r.comentario || "", fmtDateTime(r.updated_at),
        ]);
      const ranking = computeRanking(rows, bonus);
      const summary = [
        [],
        ["RESULTADO FINAL"],
        ["Puesto", "Proyecto", "Promedio rúbrica", "Promedio puntos adicionales", "Puntaje final", "Votos"],
        ...ranking.map((it) => [it.pos, it.proyecto.nombre, fmtNum(it.total, 2), fmtNum(it.extra, 2), fmtNum(it.final, 2), it.votos]),
      ];
      const detail = bonus.length ? [
        [],
        ["PUNTOS ADICIONALES (detalle)"],
        ["Jurado", "Proyecto", "Puntos", "Hora"],
        ...bonus.map((b) => [b.jurado_nombre, projName(b.proyecto_id), b.puntos, fmtDateTime(b.created_at)]),
      ] : [];
      const cell = (v) => {
        const s = String(v ?? "");
        return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      // Punto y coma + BOM: Excel en español lo abre en columnas y con tildes correctas
      const csv = "﻿" + [head, ...lines, ...summary, ...detail].map((l) => l.map(cell).join(";")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      const stamp = fmtDateTime(new Date().toISOString()).replace(/[: ]/g, "-");
      a.href = URL.createObjectURL(blob);
      a.download = `calificaciones-bogati-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      console.error(e);
      alert("No se pudo exportar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Exportar CSV";
    }
  }

  /* ---------------------------------------------------------------
     Ranking para Zoom
     --------------------------------------------------------------- */
  const R = { items: [], revealed: 0, open: false };

  async function openRanking() {
    let rows;
    let bonus = [];
    try {
      rows = await DB.getScores();
      try { bonus = await DB.getBonus(); } catch (e) { /* sin tabla de puntos adicionales */ }
    } catch (e) {
      console.error(e);
      alert("No se pudieron cargar las calificaciones. Intenta de nuevo.");
      return;
    }
    R.items = computeRanking(rows, bonus);
    R.hasExtra = R.items.some((it) => it.extra > 0);
    R.revealed = 0;
    R.open = true;

    const nJurados = new Set(window.U.validScores(rows).map((r) => r.jurado_id)).size;
    $rk.innerHTML = `
      <div class="rk">
        <header class="rk-head">
          <p class="rk-org">${esc(C.EVENTO.organizacion)}</p>
          <h1 class="rk-title">Resultados</h1>
          <p class="rk-sub">${esc(C.EVENTO.titulo)} · Promedio de ${nJurados} ${nJurados === 1 ? "jurado" : "jurados"}</p>
        </header>
        <ol class="rk-list" style="--n:${R.items.length}">
          ${R.items.map(rowHtml).join("")}
        </ol>
        <div class="rk-controls">
          <button class="btn btn-primary btn-sm" id="rk-next" type="button"></button>
          <button class="btn btn-ghost btn-sm" id="rk-all" type="button">Mostrar todo</button>
          <button class="btn btn-ghost btn-sm" id="rk-fs" type="button">Pantalla completa</button>
          <button class="btn btn-ghost btn-sm" id="rk-close" type="button">Cerrar</button>
        </div>
      </div>`;
    $rk.hidden = false;
    document.body.classList.add("no-scroll");

    $("#rk-next").addEventListener("click", revealNext);
    $("#rk-all").addEventListener("click", revealAll);
    $("#rk-fs").addEventListener("click", toggleFullscreen);
    $("#rk-close").addEventListener("click", closeRanking);
    updateControls();
  }

  function rowHtml(it, i) {
    const p = it.proyecto;
    const crit = C.CRITERIOS.map((c) => `
      <div class="rk-c">
        <span class="rk-c-label">${esc(c.corto || c.nombre)}</span>
        <span class="rk-c-bar"><i data-w="${c.max ? (it.crit[c.key] / c.max) * 100 : 0}"></i></span>
        <span class="rk-c-val">${fmtNum(it.crit[c.key])}<small> / ${c.max}</small></span>
      </div>`).join("");
    return `
      <li class="rk-row is-hidden${i === 0 ? " is-first" : ""}" data-i="${i}">
        <div class="rk-pos">${it.pos}<small>lugar</small></div>
        <div class="rk-main">
          <h2 class="rk-name">${esc(p.nombre)}${it.empate ? `<span class="rk-empate">Empate en puntaje</span>` : ""}</h2>
          <p class="rk-team">${esc(p.integrantes.join(" · "))}</p>
          <div class="rk-crit" style="--c:${C.CRITERIOS.length}">${crit}</div>
        </div>
        <div class="rk-score">
          <span class="rk-total" data-target="${it.final}">0,0</span>
          ${R.hasExtra
            ? `<small>Rúbrica ${fmtNum(it.total)} · Preguntas +${fmtNum(it.extra)}</small>`
            : `<small>de 100</small>`}
          <span class="rk-votes">${it.votos} ${it.votos === 1 ? "voto" : "votos"}</span>
        </div>
      </li>`;
  }

  function revealIndex(i) {
    const row = $rk.querySelector(`.rk-row[data-i="${i}"]`);
    if (!row || !row.classList.contains("is-hidden")) return;
    row.classList.remove("is-hidden");
    row.querySelectorAll(".rk-c-bar i").forEach((el) => {
      requestAnimationFrame(() => { el.style.width = Math.min(100, Number(el.dataset.w)) + "%"; });
    });
    countUp(row.querySelector(".rk-total"));
  }

  function countUp(el, delay = 250) {
    const target = Number(el.dataset.target) || 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.textContent = fmtNum(target); return; }
    const dur = 1300;
    const t0 = performance.now() + delay;
    const tick = (now) => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtNum(target * eased);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function revealNext() {
    if (R.revealed >= R.items.length) return;
    revealIndex(R.items.length - 1 - R.revealed);
    R.revealed++;
    updateControls();
  }

  function revealAll() {
    const n = R.items.length;
    let delay = 0;
    while (R.revealed < n) {
      const idx = n - 1 - R.revealed;
      setTimeout(() => revealIndex(idx), delay);
      delay += 350;
      R.revealed++;
    }
    updateControls();
  }

  function updateControls() {
    const next = $("#rk-next");
    const all = $("#rk-all");
    if (!next) return;
    const done = R.revealed >= R.items.length;
    next.hidden = done;
    all.hidden = done;
    if (!done) {
      const it = R.items[R.items.length - 1 - R.revealed];
      next.textContent = `Revelar ${it.pos}.º lugar`;
    }
  }

  /* ---------------------------------------------------------------
     Presentación de ganadores (3.º → 2.º → 1.º), con flechas
     --------------------------------------------------------------- */
  const W = { open: false, step: 0, top: [], hasExtra: false, el: null };
  const PLACE = { 1: "Primer lugar", 2: "Segundo lugar", 3: "Tercer lugar" };

  async function openWinners() {
    if (!(await ensureRevealed())) return;
    let rows;
    let bonus = [];
    try {
      rows = await DB.getScores();
      try { bonus = await DB.getBonus(); } catch (e) { /* sin puntos adicionales */ }
    } catch (e) {
      console.error(e);
      alert("No se pudieron cargar las calificaciones. Intenta de nuevo.");
      return;
    }
    const items = computeRanking(rows, bonus);
    W.top = items.slice(0, 3);
    W.hasExtra = items.some((it) => it.extra > 0);
    W.step = 0;
    W.open = true;
    if (R.open) closeRanking();

    if (!W.el) {
      W.el = document.createElement("div");
      W.el.className = "win";
      document.body.appendChild(W.el);
      W.el.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-win]");
        if (!b) return;
        const a = b.dataset.win;
        if (a === "next") winNext();
        else if (a === "prev") winPrev();
        else if (a === "fs") toggleFullscreen();
        else if (a === "close") closeWinners();
      });
    }
    W.el.hidden = false;
    document.body.classList.add("no-scroll");
    renderWinners();
  }

  function winTotalSteps() { return W.top.length + 2; }

  function scoreBlock(it, delay) {
    return `
      <div class="win-score">
        <span class="win-num" data-target="${it.final}" data-delay="${delay}">0,0</span>
        <span class="win-pts">puntos</span>
        ${W.hasExtra ? `<span class="win-break">Rúbrica ${fmtNum(it.total)} · Preguntas +${fmtNum(it.extra)}</span>` : ""}
      </div>`;
  }

  function renderWinners() {
    const n = W.top.length;
    const s = W.step;
    let html;
    if (s === 0) {
      html = `
        <div class="win-slide win-intro">
          <p class="win-org">${esc(C.EVENTO.organizacion)}</p>
          <h1 class="win-hero">Ganadores</h1>
          <span class="win-rule"></span>
          <p class="win-sub">${esc(C.EVENTO.titulo)}</p>
        </div>`;
    } else if (s <= n) {
      const it = W.top[n - s];
      html = `
        <div class="win-slide win-place${it.pos === 1 ? " is-first" : ""}">
          <p class="win-label">${esc(PLACE[it.pos] || it.pos + ".º lugar")}</p>
          <span class="win-rule"></span>
          <h1 class="win-name">${esc(it.proyecto.nombre)}</h1>
          <p class="win-team">${esc(it.proyecto.integrantes.join(" · "))}</p>
          ${scoreBlock(it, 1500)}
          ${it.empate ? `<p class="win-tie">Empate en puntaje</p>` : ""}
        </div>`;
    } else {
      const order = [W.top[1], W.top[0], W.top[2]].filter(Boolean);
      html = `
        <div class="win-slide win-podium-wrap">
          <p class="win-org">${esc(C.EVENTO.titulo)}</p>
          <h1 class="win-title">Felicitaciones</h1>
          <div class="win-podium">
            ${order.map((it) => `
              <div class="win-col win-col-${it.pos}">
                <p class="win-col-name">${esc(it.proyecto.nombre)}</p>
                <p class="win-col-team">${esc(it.proyecto.integrantes.join(" · "))}</p>
                <div class="win-block">
                  <span class="win-block-pos">${it.pos}</span>
                  <span class="win-block-pts">${fmtNum(it.final)}</span>
                </div>
              </div>`).join("")}
          </div>
        </div>`;
    }
    const total = winTotalSteps();
    W.el.innerHTML = `
      ${html}
      <div class="win-dots">${Array.from({ length: total }, (_, i) => `<span class="${i === s ? "on" : ""}"></span>`).join("")}</div>
      <div class="win-controls">
        <button class="btn btn-ghost btn-sm" data-win="prev" type="button"${s === 0 ? " disabled" : ""}>←</button>
        <button class="btn btn-ghost btn-sm" data-win="next" type="button"${s === total - 1 ? " disabled" : ""}>→</button>
        <button class="btn btn-ghost btn-sm" data-win="fs" type="button">Pantalla completa</button>
        <button class="btn btn-ghost btn-sm" data-win="close" type="button">Cerrar</button>
      </div>`;
    W.el.querySelectorAll(".win-num").forEach((el) => countUp(el, Number(el.dataset.delay) || 250));
  }

  function winNext() {
    if (W.step < winTotalSteps() - 1) { W.step++; renderWinners(); }
  }

  function winPrev() {
    if (W.step > 0) { W.step--; renderWinners(); }
  }

  function closeWinners() {
    W.open = false;
    if (W.el) { W.el.hidden = true; W.el.innerHTML = ""; }
    document.body.classList.remove("no-scroll");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  function closeRanking() {
    R.open = false;
    $rk.hidden = true;
    $rk.innerHTML = "";
    document.body.classList.remove("no-scroll");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function onKey(ev) {
    if (W.open) {
      const k = ev.key;
      if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter" || k === "ArrowDown") {
        ev.preventDefault();
        winNext();
      } else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp" || k === "Backspace") {
        ev.preventDefault();
        winPrev();
      } else if (k === "f" || k === "F") {
        toggleFullscreen();
      } else if (k === "Escape" && !document.fullscreenElement) {
        closeWinners();
      }
      return;
    }
    if (!R.open) return;
    if (ev.key === " " || ev.key === "ArrowRight" || ev.key === "Enter" || ev.key === "PageDown") {
      if (ev.target && ev.target.tagName === "BUTTON" && ev.key !== "ArrowRight" && ev.key !== "PageDown") return;
      ev.preventDefault();
      revealNext();
    } else if (ev.key === "f" || ev.key === "F") {
      toggleFullscreen();
    } else if (ev.key === "Escape" && !document.fullscreenElement) {
      closeRanking();
    }
  }

  boot();
})();
