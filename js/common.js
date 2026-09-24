/* =====================================================================
   Utilidades compartidas + acceso a Supabase
   ===================================================================== */
(function () {
  "use strict";

  const C = window.CONFIG;

  /* ---------- Utilidades ---------- */
  const U = {
    esc(s) {
      return String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },

    // Convierte un link de Drive (/view, /edit, ?id=) a /preview para el iframe
    drivePreview(url) {
      const s = String(url || "");
      const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
    },

    // localStorage a prueba de fallos (modo privado, almacenamiento bloqueado)
    store: {
      get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
      remove(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } },
    },

    fmtTime(iso) {
      try { return new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }); }
      catch (e) { return ""; }
    },

    fmtDateTime(iso) {
      const d = new Date(iso);
      if (isNaN(d)) return "";
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    fmtNum(n, digits = 1) {
      return Number(n || 0).toLocaleString("es-EC", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    },

    pad(n) { return String(n).padStart(2, "0"); },

    // Promedios por proyecto, ordenados de mayor a menor.
    // Desempate: criterios en el orden de la rúbrica (Impacto Económico primero).
    // Solo cuenta a los jurados que están en config.js
    validScores(rows) {
      const ids = new Set(C.JURADOS.map((j) => j.id));
      return rows.filter((r) => ids.has(r.jurado_id));
    },

    computeRanking(allRows) {
      const rows = U.validScores(allRows);
      const keys = C.CRITERIOS.map((c) => c.key);
      const list = C.PROYECTOS.map((p) => {
        const rs = rows.filter((r) => Number(r.proyecto_id) === p.id);
        const n = rs.length;
        const avg = (k) => (n ? rs.reduce((a, r) => a + Number(r[k] || 0), 0) / n : 0);
        const crit = {};
        keys.forEach((k) => { crit[k] = avg(k); });
        return { proyecto: p, votos: n, total: avg("total"), crit };
      });
      list.sort((a, b) =>
        (b.total - a.total) ||
        keys.reduce((acc, k) => acc || (b.crit[k] - a.crit[k]), 0) ||
        (a.proyecto.id - b.proyecto.id));
      list.forEach((it, i) => {
        it.pos = i + 1;
        const same = (o) => o && Math.abs(o.total - it.total) < 0.005;
        it.empate = same(list[i - 1]) || same(list[i + 1]);
      });
      return list;
    },
  };

  /* ---------- Supabase ---------- */
  const configured =
    typeof C.SUPABASE_URL === "string" && /^https:\/\/.+/.test(C.SUPABASE_URL) && !C.SUPABASE_URL.includes("TU-PROYECTO") &&
    typeof C.SUPABASE_ANON_KEY === "string" && C.SUPABASE_ANON_KEY.length > 20;

  let client = null;
  if (configured && window.supabase && window.supabase.createClient) {
    client = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  function withTimeout(promise, ms) {
    let t;
    const timeout = new Promise((_, reject) => {
      t = setTimeout(() => reject(Object.assign(new Error("Tiempo de espera agotado"), { code: "timeout" })), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function run(query, ms = 12000) {
    if (!client) throw Object.assign(new Error("Supabase no está configurado"), { code: "no-config" });
    const { data, error } = await withTimeout(query, ms);
    if (error) throw error;
    return data;
  }

  const DB = {
    ready: !!client,
    configured,

    getSettings() {
      return run(client.from("settings").select("*").eq("id", 1).single());
    },

    updateSettings(patch) {
      return run(client.from("settings").update(patch).eq("id", 1).select().single());
    },

    getScores(juradoId) {
      if (!client) return run(null);
      let q = client.from("scores").select("*");
      if (juradoId) q = q.eq("jurado_id", juradoId);
      return run(q.order("proyecto_id").order("jurado_id"));
    },

    upsertScore(row) {
      return run(client.from("scores").upsert(row, { onConflict: "jurado_id,proyecto_id" }).select().single());
    },

    // onStatus recibe true cuando la conexión en tiempo real está activa
    subscribe(tables, onChange, onStatus) {
      if (!client) return null;
      const ch = client.channel("rt-" + Math.random().toString(36).slice(2));
      tables.forEach((t) => {
        ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (payload) => onChange(t, payload));
      });
      ch.subscribe((status) => { if (onStatus) onStatus(status === "SUBSCRIBED"); });
      return ch;
    },
  };

  window.U = U;
  window.DB = DB;
})();
