/* =====================================================================
   CONFIGURACIÓN DEL CONCURSO — este es el único archivo que necesitas editar
   ===================================================================== */

window.CONFIG = {

  /* ---------- Evento ---------- */
  EVENTO: {
    titulo: "Concurso de Automatización con IA",
    organizacion: "Bogati Sabor Adictivo",
  },

  /* ---------- Supabase ----------
     Supabase > Project Settings > API
     Copia "Project URL" y la clave "anon public" (NUNCA la service_role). */
  SUPABASE_URL: "https://lxkaqhojdrchglooygyq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4a2FxaG9qZHJjaGdsb295Z3lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxOTEwNjEsImV4cCI6MjEwNTc2NzA2MX0.Bqh06dhaiD8A6No_q7UMRhOTXTA8ECO9fU5JKF7LkL8",

  /* ---------- PIN maestro del panel admin (/admin) ----------
     Cámbialo antes de compartir el link. */
  ADMIN_PIN: "731946",

  /* ---------- Jurados ----------
     - id: identificador fijo (no lo cambies después de que empiecen a calificar)
     - nombre: cómo aparece en pantalla y en el CSV
     - pin: 4 dígitos, distinto para cada jurado
     Puedes agregar o quitar jurados copiando una línea. */
  JURADOS: [
    { id: "j1", nombre: "Santiago Castro",   pin: "4821" },
    { id: "j2", nombre: "Steeven Yanez",     pin: "3907" },
    { id: "j3", nombre: "Juan Pablo Aranda", pin: "6154" },
    { id: "j4", nombre: "Yadyra Ramirez",    pin: "2768" },
    { id: "j5", nombre: "Ronald Morillo",    pin: "9035" },
    { id: "j6", nombre: "Henry Jarrín",      pin: "5392" },
  ],

  /* ---------- Proyectos finalistas ----------
     Pega el link de Drive tal cual (/view); la app lo convierte a /preview.
     El documento debe estar compartido como "Cualquier persona con el enlace". */
  PROYECTOS: [
    {
      id: 1,
      nombre: "Sistema de Operaciones Bogati y Pedido Sugerido con IA e Inspector Virtual",
      integrantes: ["Enrique Carrasco", "Karina Yanchapanta"],
      driveUrl: "https://drive.google.com/file/d/1vfGGa_VJOVpVpEPqGGIpw_Zup4pUxGm0/view?usp=sharing",
    },
    {
      id: 2,
      nombre: "KAIRÓS",
      integrantes: ["Teresa Paredes", "Daniela Atencio"],
      driveUrl: "https://drive.google.com/file/d/1SJM_v039ShbPtTJLdOMbL1vTJ_uG1XCR/view?usp=sharing",
    },
    {
      id: 3,
      nombre: "Radar de Facturación",
      integrantes: ["Jeannette Salazar", "Steven Pérez"],
      driveUrl: "https://drive.google.com/file/d/1u7Bfdm0ylYaEiWl2QyuuA5UQaeY4wjvd/view?usp=sharing",
    },
    {
      id: 4,
      nombre: "Bogati Pulso",
      integrantes: ["Evelyn Armendáriz"],
      driveUrl: "https://drive.google.com/file/d/1xTr3CSEfC42y2c7whkjUVcEdJqLo3IS8/view?usp=sharing",
    },
    {
      id: 5,
      nombre: "JEDI TH – Bogati TH",
      integrantes: ["Edison Monje", "Joel Allaica", "Jonathan Abad"],
      driveUrl: "https://drive.google.com/file/d/16tIvM6HMh1y1UtKNzi0evsAUqE97c9a8/view?usp=sharing",
    },
  ],

  /* ---------- Rúbrica oficial ----------
     IMPORTANTE: las "key" y los "max" deben coincidir con sql/schema.sql.
     Puedes editar libremente "nombre", "corto" (etiqueta del ranking) y "descripcion". */
  CRITERIOS: [
    { key: "impacto_economico", nombre: "Impacto Económico",                      corto: "Impacto económico", max: 30, descripcion: "Ahorro real en dólares para Bogati" },
    { key: "mejora_proceso",    nombre: "Mejora y Simplificación del Proceso",    corto: "Proceso", max: 30, descripcion: "Rediseño, no solo automatización" },
    { key: "calidad_vida",      nombre: "Calidad de Vida del Colaborador",        corto: "Calidad de vida", max: 20, descripcion: "Menos rutina, más estrategia y servicio" },
    { key: "escalabilidad",     nombre: "Escalabilidad a la Red Bogati",          corto: "Escalabilidad", max: 10, descripcion: "Que sirva a los más de 200 locales" },
    { key: "creatividad_ia",    nombre: "Creatividad y Uso Inteligente de la IA", corto: "Creatividad e IA", max: 10, descripcion: "Ideas frescas y bien aplicadas" },
  ],
};
