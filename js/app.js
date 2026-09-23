/* =====================================================================
   Vista del jurado: ingreso, proyectos y calificación
   ===================================================================== */
(function () {
  "use strict";

  const C = window.CONFIG;
  const { esc, drivePreview, store, fmtTime, pad } = window.U;
  const DB = window.DB;

  const $app = document.getElementById("app");
  const $ = (sel) => document.querySelector(sel);

  const SESSION_KEY = "bogati_jurado";
  const POLL_MS = 15000;

  const S = {
    jurado: null,
    settings: { scoring_open: false, results_revealed: false },
    settingsState: "loading", // loading | ok | error
    scores: {},   // proyecto_id -> fila guardada en Supabase
    drafts: {},   // proyecto_id -> { values, comentario, touched }
    status: {},   // proyecto_id -> { type, text } del último intento de guardado
    saving: false,
    currentPid: null,
    started: false,
  };

  const draftKey = (pid) => `bogati_draft_${S.jurado.id}_${pid}`;
  const firstName = (n) => String(n).split(" ")[0];

  /* ---------------------------------------------------------------
     Arranque y sesión
     --------------------------------------------------------------- */
  function boot() {
    const saved = store.get(SESSION_KEY);
    const j = saved && C.JURADOS.find((x) => x.id === saved.id);
    if (j) {
      S.jurado = j;
      startSession();
    } else {
      renderLogin();
    }
  }

  function startSession() {
    route();
    if (S.started) { refreshSettings(); refreshMyScores(); return; }
    S.started = true;

    refreshSettings();
    refreshMyScores();

    DB.subscribe(["settings"], (_t, p) => { if (p.new && p.new.id === 1) applySettings(p.new); });
    setInterval(refreshSettings, POLL_MS);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && S.jurado) refreshSettings();
    });
    window.addEventListener("online", () => {
      setNetBanner(false);
      if (S.jurado) { refreshSettings(); refreshMyScores(); }
    });
    window.addEventListener("offline", () => setNetBanner(true));
    if (!navigator.onLine) setNetBanner(true);
  }

  function setNetBanner(show) {
    const b = document.getElementById("net-banner");
    if (b) b.hidden = !show;
  }

  function logout() {
    if (!confirm("¿Cerrar sesión en este dispositivo?")) return;
    store.remove(SESSION_KEY);
    S.jurado = null;
    S.scores = {};
    S.drafts = {};
    S.status = {};
    S.currentPid = null;
    history.replaceState(null, "", location.pathname);
    renderLogin();
  }

  /* ---------------------------------------------------------------
     Datos remotos
     --------------------------------------------------------------- */
  async function refreshSettings() {
    try {
      applySettings(await DB.getSettings());
    } catch (e) {
      if (S.settingsState !== "ok") {
        S.settingsState = "error";
        onStateChange();
      }
    }
  }

  function applySettings(s) {
    const changed =
      S.settingsState !== "ok" ||
      s.scoring_open !== S.settings.scoring_open ||
      s.results_revealed !== S.settings.results_revealed;
    S.settings = { scoring_open: !!s.scoring_open, results_revealed: !!s.results_revealed };
    S.settingsState = "ok";
    if (changed) onStateChange();
  }

  async function refreshMyScores() {
    if (!S.jurado) return;
    const juradoId = S.jurado.id;
    try {
      const rows = await DB.getScores(juradoId);
      if (!S.jurado || S.jurado.id !== juradoId) return;
      S.scores = {};
      rows.forEach((r) => { S.scores[r.proyecto_id] = r; });
      // Los borradores que el jurado no ha tocado se alinean con lo guardado
      let replacedCurrent = false;
      Object.keys(S.drafts).forEach((k) => {
        const pid = Number(k);
        if (!S.drafts[pid].touched) {
          S.drafts[pid] = S.scores[pid] ? draftFromScore(S.scores[pid]) : emptyDraft();
          if (pid === S.currentPid) replacedCurrent = true;
        }
      });
      onStateChange(replacedCurrent);
    } catch (e) {
      /* se reintenta al reconectar */
    }
  }

  function isOpen() {
    return S.settingsState === "ok" && S.settings.scoring_open;
  }

  // Re-pinta solo lo necesario cuando cambia el estado remoto
  function onStateChange(forcePanel) {
    if (!S.jurado) return;
    const view = $app.dataset.view;
    if (view === "list") renderList(true);
    else if (view === "detail") {
      renderPanel(!!forcePanel);
      const pr = $("#progress");
      if (pr) pr.textContent = progressText();
    }
  }

  /* ---------------------------------------------------------------
     Borradores (la calificación nunca se pierde en pantalla)
     --------------------------------------------------------------- */
  function emptyDraft() {
    const values = {};
    C.CRITERIOS.forEach((c) => { values[c.key] = null; });
    return { values, comentario: "", touched: false };
  }

  function draftFromScore(r) {
    const values = {};
    C.CRITERIOS.forEach((c) => { values[c.key] = Number(r[c.key]); });
    return { values, comentario: r.comentario || "", touched: false };
  }

  function ensureDraft(pid) {
    if (S.drafts[pid]) return;
    const local = store.get(draftKey(pid));
    if (local && local.values) {
      const d = emptyDraft();
      C.CRITERIOS.forEach((c) => {
        const v = local.values[c.key];
        d.values[c.key] = v == null ? null : Math.max(0, Math.min(c.max, Math.round(Number(v)) || 0));
      });
      d.comentario = String(local.comentario || "");
      d.touched = true;
      S.drafts[pid] = d;
      return;
    }
    S.drafts[pid] = S.scores[pid] ? draftFromScore(S.scores[pid]) : emptyDraft();
  }

  function isDirty(pid) {
    const d = S.drafts[pid];
    if (!d) return false;
    const saved = S.scores[pid];
    if (!saved) return C.CRITERIOS.some((c) => d.values[c.key] != null) || d.comentario.trim() !== "";
    return (
      C.CRITERIOS.some((c) => d.values[c.key] !== Number(saved[c.key])) ||
      d.comentario.trim() !== (saved.comentario || "").trim()
    );
  }

  function persistDraft(pid) {
    const d = S.drafts[pid];
    if (isDirty(pid)) store.set(draftKey(pid), { values: d.values, comentario: d.comentario });
    else store.remove(draftKey(pid));
  }

  function hasLocalDraft(pid) {
    return !!store.get(draftKey(pid)) && isDirtyForCard(pid);
  }

  function isDirtyForCard(pid) {
    ensureDraft(pid);
    return isDirty(pid);
  }

  function countScored() {
    return C.PROYECTOS.filter((p) => S.scores[p.id]).length;
  }

  function progressText() {
    if (!isOpen() && countScored() === 0) return "";
    return `${countScored()} de ${C.PROYECTOS.length} proyectos calificados`;
  }

  /* ---------------------------------------------------------------
     Rutas
     --------------------------------------------------------------- */
  function parseRoute() {
    const m = location.hash.match(/^#\/proyecto\/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function route() {
    if (!S.jurado) return renderLogin();
    const pid = parseRoute();
    const p = pid && C.PROYECTOS.find((x) => x.id === pid);
    if (p) renderDetail(p);
    else renderList();
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);

  /* ---------------------------------------------------------------
     Ingreso
     --------------------------------------------------------------- */
  function renderLogin() {
    $app.dataset.view = "login";
    const opts = C.JURADOS.map((j) => `<option value="${esc(j.id)}">${esc(j.nombre)}</option>`).join("");
    $app.innerHTML = `
      <main class="login">
        <div class="login-card">
          <p class="eyebrow eyebrow-accent">${esc(C.EVENTO.organizacion)}</p>
          <h1>${esc(C.EVENTO.titulo)}</h1>
          <p class="lede">Ingreso del jurado</p>
          <div class="rule"></div>
          <form id="login-form" novalidate>
            <div class="field">
              <label for="jurado">Tu nombre</label>
              <select id="jurado" autocomplete="off">
                <option value="">Selecciona tu nombre</option>
                ${opts}
              </select>
            </div>
            <p class="form-error" id="login-error" role="alert"></p>
            <button class="btn btn-primary btn-block" type="submit">Ingresar</button>
          </form>
          <p class="fine">Si tienes problemas para ingresar, comunícate con el organizador del concurso.</p>
        </div>
      </main>`;

    $("#login-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const id = $("#jurado").value;
      const err = $("#login-error");
      const j = C.JURADOS.find((x) => x.id === id);
      if (!j) { err.textContent = "Selecciona tu nombre."; return; }
      store.set(SESSION_KEY, { id: j.id });
      S.jurado = j;
      if (location.hash) history.replaceState(null, "", location.pathname);
      startSession();
    });
  }

  /* ---------------------------------------------------------------
     Estructura común
     --------------------------------------------------------------- */
  function headerHtml() {
    return `
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="#/">
            <span class="brand-org">${esc(C.EVENTO.organizacion)}</span>
            <span class="brand-title">${esc(C.EVENTO.titulo)}</span>
          </a>
          <div class="topbar-right">
            <span class="progress" id="progress">${progressText()}</span>
            <span class="who">${esc(S.jurado.nombre)}</span>
            <button class="link-btn" id="logout" type="button">Salir</button>
          </div>
        </div>
      </header>`;
  }

  function footerHtml() {
    return `<footer class="foot">${esc(C.EVENTO.organizacion)} · ${esc(C.EVENTO.titulo)}</footer>`;
  }

  function bindHeader() {
    const b = $("#logout");
    if (b) b.addEventListener("click", logout);
  }

  function noticeHtml() {
    if (S.settingsState === "loading") {
      return `<div class="notice">Verificando el estado de la calificación…</div>`;
    }
    if (S.settingsState === "error") {
      return `<div class="notice notice-warn"><strong>No se pudo conectar con el servidor.</strong> Puedes seguir revisando los proyectos; reintentando automáticamente.</div>`;
    }
    if (S.settings.scoring_open) {
      return `<div class="notice notice-open"><strong>La calificación está abierta.</strong> Abre cada proyecto, califícalo con la rúbrica oficial y guarda. Puedes editar tu nota mientras la calificación siga abierta.</div>`;
    }
    if (S.settings.results_revealed || countScored() > 0) {
      return `<div class="notice"><strong>La calificación está cerrada.</strong> Gracias por tu participación como jurado.</div>`;
    }
    return `<div class="notice"><strong>La calificación se abrirá el día del evento.</strong> Hoy puedes revisar todos los proyectos para conocerlos.</div>`;
  }

  /* ---------------------------------------------------------------
     Lista de proyectos
     --------------------------------------------------------------- */
  function renderList(keepScroll) {
    S.currentPid = null;
    $app.dataset.view = "list";
    const y = window.scrollY;
    const open = isOpen();

    const cards = C.PROYECTOS.map((p, i) => {
      const saved = S.scores[p.id];
      let badge = "";
      if (hasLocalDraft(p.id) && open) badge = `<span class="badge badge-draft">Cambios sin guardar</span>`;
      else if (saved) badge = `<span class="badge badge-ok">Calificado · ${saved.total}</span>`;
      else if (open) badge = `<span class="badge">Pendiente</span>`;
      return `
        <li>
          <a class="card" href="#/proyecto/${p.id}">
            <span class="card-num">${pad(i + 1)}</span>
            <h2 class="card-title">${esc(p.nombre)}</h2>
            <p class="card-team">${esc(p.integrantes.join(" · "))}</p>
            <div class="card-foot">
              ${badge || "<span></span>"}
              <span class="btn btn-secondary btn-sm">Ver proyecto</span>
            </div>
          </a>
        </li>`;
    }).join("");

    $app.innerHTML = headerHtml() + `
      <main class="wrap">
        <section class="intro">
          <p class="eyebrow">Proyectos finalistas</p>
          <h1>Hola, ${esc(firstName(S.jurado.nombre))}</h1>
          <p class="lede">Estos son los ${C.PROYECTOS.length} proyectos finalistas. Abre cada uno para revisar su documento.</p>
        </section>
        ${noticeHtml()}
        <ol class="cards">${cards}</ol>
      </main>` + footerHtml();

    bindHeader();
    if (keepScroll) window.scrollTo(0, y);
  }

  /* ---------------------------------------------------------------
     Detalle de proyecto
     --------------------------------------------------------------- */
  function renderDetail(p) {
    S.currentPid = p.id;
    $app.dataset.view = "detail";
    ensureDraft(p.id);

    const idx = C.PROYECTOS.indexOf(p);
    const prev = C.PROYECTOS[idx - 1];
    const next = C.PROYECTOS[idx + 1];
    const preview = drivePreview(p.driveUrl);

    const pagerLink = (q, cls, label) => q
      ? `<a class="${cls}" href="#/proyecto/${q.id}"><small>${label}</small><span class="t">${esc(q.nombre)}</span></a>`
      : "<span></span>";

    $app.innerHTML = headerHtml() + `
      <main class="wrap wrap-wide">
        <nav class="crumbs">
          <a href="#/">← Todos los proyectos</a>
          <span class="crumbs-right">
            ${prev ? `<a href="#/proyecto/${prev.id}">Anterior</a>` : `<span class="muted">Anterior</span>`}
            <span>Proyecto ${idx + 1} de ${C.PROYECTOS.length}</span>
            ${next ? `<a href="#/proyecto/${next.id}">Siguiente</a>` : `<span class="muted">Siguiente</span>`}
          </span>
        </nav>

        <header class="proj-head">
          <p class="eyebrow eyebrow-accent">Proyecto ${pad(idx + 1)}</p>
          <h1>${esc(p.nombre)}</h1>
          <p class="proj-team">${esc(p.integrantes.join(" · "))}</p>
        </header>

        <div class="detail" id="detail">
          <section class="doc">
            <div class="doc-frame">
              ${preview
                ? `<iframe src="${esc(preview)}" title="Documento del proyecto ${esc(p.nombre)}" allow="autoplay; fullscreen" allowfullscreen></iframe>`
                : `<div class="doc-missing">El documento de este proyecto no está disponible.</div>`}
            </div>
            <div class="doc-actions">
              <a class="btn btn-secondary btn-sm" href="${esc(p.driveUrl)}" target="_blank" rel="noopener">Abrir en pestaña nueva</a>
              <span class="hint">Si el documento no carga, ábrelo en una pestaña nueva.</span>
            </div>
          </section>
          <aside class="panel" id="panel"></aside>
        </div>

        <nav class="pager">
          ${pagerLink(prev, "prev", "← Anterior")}
          ${pagerLink(next, "next", "Siguiente →")}
        </nav>
      </main>` + footerHtml();

    bindHeader();
    renderPanel(true);
  }

  /* ---------------------------------------------------------------
     Panel lateral: aviso o rúbrica
     --------------------------------------------------------------- */
  function renderPanel(force) {
    const panel = $("#panel");
    const detail = $("#detail");
    if (!panel || !detail) return;
    const pid = S.currentPid;
    const open = isOpen();
    detail.classList.toggle("detail--open", open);

    if (open && !force && panel.dataset.mode === "form") { updateFormMeta(); return; }

    if (!open) {
      panel.dataset.mode = "notice";
      const saved = S.scores[pid];
      panel.innerHTML = noticeHtml() + (saved
        ? `<div class="saved-summary"><p class="eyebrow">Tu calificación</p><p class="saved-total">${saved.total}<span> / 100</span></p></div>`
        : "");
      return;
    }

    panel.dataset.mode = "form";
    panel.innerHTML = formHtml(pid);
    bindForm(pid);
    updateFormMeta();
  }

  function critHtml(c, val) {
    const unset = val == null;
    return `
      <div class="crit${unset ? " is-unset" : ""}" data-key="${c.key}">
        <div class="crit-head">
          <label for="n-${c.key}">${esc(c.nombre)}</label>
          <span class="crit-max">máx. ${c.max}</span>
        </div>
        <p class="crit-desc">${esc(c.descripcion)}</p>
        <div class="crit-inputs">
          <input type="range" id="r-${c.key}" min="0" max="${c.max}" step="1" value="${unset ? 0 : val}" aria-label="${esc(c.nombre)}">
          <input type="number" id="n-${c.key}" min="0" max="${c.max}" step="1" inputmode="numeric" value="${unset ? "" : val}" placeholder="—">
        </div>
        <p class="crit-error" id="e-${c.key}" role="alert"></p>
      </div>`;
  }

  function formHtml(pid) {
    const d = S.drafts[pid];
    return `
      <form class="rubric" id="rubric" novalidate>
        <div class="rubric-head">
          <p class="eyebrow">Rúbrica oficial</p>
          <h2>Calificación</h2>
          <p class="rubric-sub">Mueve cada barra o escribe el puntaje (números enteros).</p>
        </div>
        ${C.CRITERIOS.map((c) => critHtml(c, d.values[c.key])).join("")}
        <div class="field field-comment">
          <label for="comentario">Comentario <span class="opt">(opcional)</span></label>
          <textarea id="comentario" rows="3" maxlength="2000" placeholder="Observaciones sobre el proyecto">${esc(d.comentario)}</textarea>
        </div>
        <div class="rubric-total">
          <span class="rubric-total-label">Total</span>
          <strong id="total">—</strong>
          <span class="of">/ 100</span>
        </div>
        <p class="missing" id="missing"></p>
        <button type="submit" class="btn btn-primary btn-block" id="save">Guardar calificación</button>
        <p class="save-status" id="save-status" role="status" aria-live="polite"></p>
      </form>`;
  }

  function bindForm(pid) {
    const d = S.drafts[pid];

    const setVal = (key, v) => {
      d.values[key] = v;
      d.touched = true;
      S.status[pid] = null;
      persistDraft(pid);
      updateFormMeta();
    };

    C.CRITERIOS.forEach((c) => {
      const r = $("#r-" + c.key);
      const n = $("#n-" + c.key);
      const box = r.closest(".crit");
      const err = $("#e-" + c.key);

      r.addEventListener("input", () => {
        n.value = r.value;
        box.classList.remove("is-unset");
        err.textContent = "";
        setVal(c.key, Number(r.value));
      });

      n.addEventListener("input", () => {
        const raw = n.value.trim();
        if (raw === "") {
          box.classList.add("is-unset");
          err.textContent = "";
          setVal(c.key, null);
          return;
        }
        let x = Math.round(Number(raw));
        if (!Number.isFinite(x)) return;
        if (x > c.max) { x = c.max; err.textContent = `El máximo para este criterio es ${c.max}.`; }
        else if (x < 0) { x = 0; err.textContent = "El mínimo es 0."; }
        else err.textContent = "";
        if (String(x) !== raw) n.value = x;
        r.value = x;
        box.classList.remove("is-unset");
        setVal(c.key, x);
      });

      n.addEventListener("blur", () => {
        if (err.textContent) setTimeout(() => { err.textContent = ""; }, 2500);
      });
    });

    $("#comentario").addEventListener("input", (ev) => {
      d.comentario = ev.target.value;
      d.touched = true;
      S.status[pid] = null;
      persistDraft(pid);
      updateFormMeta();
    });

    $("#rubric").addEventListener("submit", (ev) => {
      ev.preventDefault();
      save(pid);
    });
  }

  function updateFormMeta() {
    const pid = S.currentPid;
    const form = $("#rubric");
    if (!form || pid == null) return;
    const d = S.drafts[pid];
    const vals = C.CRITERIOS.map((c) => d.values[c.key]);
    const missing = vals.filter((v) => v == null).length;
    const total = vals.reduce((a, v) => a + (v || 0), 0);

    $("#total").textContent = missing === C.CRITERIOS.length ? "—" : total;
    $("#missing").textContent = missing === 0 ? ""
      : missing === 1 ? "Falta 1 criterio por calificar."
      : `Faltan ${missing} criterios por calificar.`;

    const btn = $("#save");
    btn.disabled = S.saving || missing > 0;
    btn.textContent = S.saving ? "Guardando…" : (S.scores[pid] ? "Guardar cambios" : "Guardar calificación");

    const st = $("#save-status");
    const saved = S.scores[pid];
    const status = S.status[pid];
    st.className = "save-status";
    if (S.saving) {
      st.textContent = "";
    } else if (status) {
      st.textContent = status.text;
      st.classList.add(status.type);
    } else if (isDirty(pid) && saved) {
      st.textContent = "Tienes cambios sin guardar.";
      st.classList.add("warn");
    } else if (isDirty(pid) && d.touched && missing === 0) {
      st.textContent = "Aún no has guardado esta calificación.";
      st.classList.add("warn");
    } else if (saved) {
      st.textContent = `Guardado ✓ · ${fmtTime(saved.updated_at)}`;
      st.classList.add("ok");
    } else {
      st.textContent = "";
    }

    const pr = $("#progress");
    if (pr) pr.textContent = progressText();
  }

  /* ---------------------------------------------------------------
     Guardar
     --------------------------------------------------------------- */
  async function save(pid) {
    if (S.saving) return;
    const d = S.drafts[pid];
    if (C.CRITERIOS.some((c) => d.values[c.key] == null)) return;

    const row = {
      jurado_id: S.jurado.id,
      jurado_nombre: S.jurado.nombre,
      proyecto_id: pid,
      comentario: d.comentario.trim() || null,
    };
    C.CRITERIOS.forEach((c) => {
      row[c.key] = Math.max(0, Math.min(c.max, Math.round(Number(d.values[c.key]) || 0)));
    });

    S.saving = true;
    S.status[pid] = null;
    updateFormMeta();

    try {
      const saved = await DB.upsertScore(row);
      S.scores[pid] = saved;
      S.status[pid] = { type: "ok", text: `Guardado ✓ · ${fmtTime(saved.updated_at)}` };
      // Si el jurado siguió editando mientras se guardaba, se conserva su borrador
      if (isDirty(pid)) { persistDraft(pid); S.status[pid] = null; }
      else { store.remove(draftKey(pid)); d.touched = false; }
    } catch (e) {
      console.error("Error al guardar:", e);
      let text = "Error, intenta de nuevo. Tu calificación sigue en pantalla.";
      const rls = e && (e.code === "42501" || /row-level security/i.test(e.message || ""));
      if (rls) {
        await refreshSettings();
        if (!S.settings.scoring_open) text = "La calificación está cerrada. No se pudo guardar.";
      } else if (!navigator.onLine) {
        text = "Sin conexión a internet. Tu calificación sigue en pantalla; intenta de nuevo cuando vuelva la conexión.";
      } else if (e && e.code === "no-config") {
        text = "La plataforma no está conectada a la base de datos. Avisa al organizador.";
      }
      S.status[pid] = { type: "err", text };
      persistDraft(pid);
    } finally {
      S.saving = false;
      if (S.currentPid === pid) updateFormMeta();
    }
  }

  boot();
})();
