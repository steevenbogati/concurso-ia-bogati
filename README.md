# Plataforma de calificación — Concurso de Automatización con IA · Bogati

Web app estática (HTML + CSS + JS, sin build) con Supabase como base de datos.

```
index.html        Jurado: ingreso, proyectos y calificación
admin.html        Panel admin, ranking para Zoom y CSV  (se abre en /admin)
admin/index.html  Redirección de respaldo a admin.html
config.js         ÚNICO archivo a editar: Supabase, PIN admin, jurados, proyectos, rúbrica
css/styles.css
js/common.js      Conexión a Supabase y utilidades
js/app.js         Lógica del jurado
js/admin.js       Lógica del panel y ranking
sql/schema.sql    Tablas, restricciones, RLS y Realtime
```

---

## 1. Crear la base de datos en Supabase (10 min)

1. Entra a <https://supabase.com> → **Sign in** → **New project**.
   - Name: `concurso-ia-bogati`
   - Database password: genera una y guárdala (no la usa la app).
   - Region: **East US (North Virginia)** (la más cercana a Ecuador).
   - Plan: Free.
2. Espera a que el proyecto termine de crearse (1–2 min).
3. Menú izquierdo → **SQL Editor** → **New query**.
4. Abre `sql/schema.sql`, copia **todo** el contenido, pégalo y presiona **Run**.
   Debe decir *Success. No rows returned*.
5. Verifica: menú **Table Editor** → deben existir `scores` (vacía) y `settings` (1 fila, `scoring_open = false`).
6. Menú **Project Settings → API** (o **Data API / API Keys**). Copia:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public** key (o **Publishable key**, empieza con `sb_publishable_`). **Nunca** uses `service_role` / `secret`.
7. Pega ambos en `config.js`:
   ```js
   SUPABASE_URL: "https://xxxx.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```

> Realtime ya queda activado por el SQL. Si el panel admin muestra "Reconectando…" permanentemente, ve a **Database → Publications → supabase_realtime** y confirma que `scores` y `settings` están marcadas.

## 2. Revisar config.js

- `ADMIN_PIN`: PIN del panel admin (actual: `731946`). Cámbialo si quieres.
- `JURADOS`: nombre de cada jurado (ingresan eligiendo su nombre, sin PIN). No cambies los `id` una vez que empiecen a calificar.
- `PROYECTOS`: links de Drive tal cual (`/view`). Cada archivo debe estar compartido como **"Cualquier persona con el enlace – Lector"**.

## 3. Publicar en GitHub Pages (10 min)

**Opción A — desde el navegador (sin instalar nada)**

1. En GitHub, abre tu repositorio (o crea uno nuevo: **New repository** → nombre `concurso-ia-bogati` → **Public** → *Create*).
   GitHub Pages gratis requiere repositorio **público**.
2. **Add file → Upload files** → arrastra **el contenido** de esta carpeta (`index.html`, `admin.html`, `config.js`, `.nojekyll`, y las carpetas `css`, `js`, `sql`, `admin`). No subas la carpeta contenedora, sino lo que está dentro.
   > `.nojekyll` es un archivo oculto: en Windows actívalo en Explorador → Vista → Mostrar → Elementos ocultos.
3. **Commit changes**.
4. **Settings → Pages** → *Build and deployment* → Source: **Deploy from a branch** → Branch: **main** / **(root)** → **Save**.
5. Espera 1–2 min y recarga esa página: aparece *Your site is live at* `https://USUARIO.github.io/concurso-ia-bogati/`.

**Opción B — con git**

```bash
cd "Plataforma Concurso IA Bogati"
git init -b main
git add .
git commit -m "Plataforma de calificación"
git remote add origin https://github.com/USUARIO/concurso-ia-bogati.git
git push -u origin main
```
Luego el paso 4 de la opción A.

**Links finales**

- Jurados: `https://USUARIO.github.io/concurso-ia-bogati/`
- Admin: `https://USUARIO.github.io/concurso-ia-bogati/admin`

**Si cambias config.js después de publicar:** súbelo de nuevo y, para forzar que todos vean la versión nueva, sube el número `?v=2` (a `?v=3`, etc.) en las etiquetas `<script>`/`<link>` de `index.html` y `admin.html`. GitHub Pages tarda 1–10 min en reflejar cambios.

---

## 4. Cómo funciona el día del evento

| Momento | Acción en /admin |
|---|---|
| Hoy | Calificación **CERRADA**. Envía el link a los jurados. |
| Inicio de la calificación | **Abrir calificación**. Los jurados ven la rúbrica en segundos, sin recargar. |
| Durante | Mira la tabla "Avance por jurado" (no muestra puntajes, es seguro compartir pantalla). |
| Al terminar | **Revelar resultados** → cierra la calificación y abre el ranking. |
| Ranking en Zoom | Comparte la pestaña del navegador. **Pantalla completa** (o tecla `F`). Presiona **Espacio** o **→** para revelar del 5.º al 1.er lugar. `Esc` cierra. |
| Después | **Exportar CSV** (se abre en Excel con columnas y tildes correctas). |

**Ranking:** promedio simple del total de cada proyecto entre los jurados que lo calificaron. Desempate: mayor promedio en Impacto Económico, luego Mejora del Proceso, Calidad de Vida, Escalabilidad y Creatividad.

**Confiabilidad:**
- Cada cambio del jurado se guarda en su dispositivo al instante. Si falla internet o recarga la página, la calificación sigue en pantalla con "Tienes cambios sin guardar".
- Mensajes: "Guardado ✓ · hora" o "Error, intenta de nuevo".
- La base de datos rechaza notas fuera de rango, duplicadas o enviadas con la calificación cerrada. El total lo calcula la base de datos.
- Los proyectos se pueden ver aunque Supabase no responda (los datos están en config.js).

**Límite de seguridad conocido:** los jurados ingresan solo con su nombre, sin PIN. Cualquiera que tenga el link podría entrar como un jurado. Comparte el link solo con el jurado y no lo publiques. El PIN admin está en `config.js`.

---

## 5. Lista de verificación antes del evento

**Hoy (con la calificación cerrada)**

- [ ] `config.js` tiene la URL y la anon key reales de Supabase.
- [ ] Abro `/admin`, ingreso con el PIN maestro y veo **"En vivo"** (punto verde) y **CERRADA**. No aparece ningún aviso rojo.
- [ ] Abro el link de jurados desde el celular y desde la computadora: ingreso eligiendo un nombre, veo las 5 tarjetas y el aviso "La calificación se abrirá el día del evento".
- [ ] Abro los 5 proyectos: **cada documento carga dentro de la página**. Si alguno muestra "Solicitar acceso", corrige el permiso en Drive.
- [ ] "Abrir en pestaña nueva" funciona.
- [ ] Cierro y reabro el navegador: sigo con la sesión iniciada.

**Ensayo completo (idealmente hoy mismo, 15 min)**

- [ ] En `/admin` presiono **Abrir calificación**. En el celular del jurado aparece la rúbrica sin recargar (máx. ~15 s).
- [ ] Escribo 35 en Impacto Económico → se corrige a 30 con el aviso de máximo.
- [ ] Califico un proyecto → "Guardado ✓". En `/admin` aparece el ✓ en la tabla al instante.
- [ ] Edito la nota y guardo de nuevo → sigue habiendo un solo ✓ (no se duplica).
- [ ] Activo modo avión, cambio un valor, presiono Guardar → "Sin conexión…"; los valores siguen en pantalla. Desactivo modo avión, guardo → "Guardado ✓".
- [ ] Con 2–3 jurados de prueba califico todos los proyectos. El contador dice "5 de 5 proyectos calificados".
- [ ] **Revelar resultados** → ranking en pantalla completa; revelo del 5.º al 1.º con Espacio. Lo pruebo compartiendo pantalla en Zoom.
- [ ] **Exportar CSV** y lo abro en Excel.
- [ ] Con la calificación cerrada, el jurado ve "La calificación está cerrada" y no puede guardar.

**Reinicio después del ensayo (obligatorio)**

- [ ] Supabase → SQL Editor → ejecuto:
  ```sql
  truncate table public.scores restart identity;
  update public.settings set scoring_open = false, results_revealed = false where id = 1;
  ```
- [ ] `/admin` muestra **0 de 15** y **CERRADA**, resultados **Ocultos**.

**El día del evento**

- [ ] Computadora con cable o buena Wi-Fi; `/admin` abierto e iniciado **antes** de entrar a Zoom.
- [ ] Ranking probado en la misma pestaña que voy a compartir.
- [ ] Plan B: si un jurado no puede usar la plataforma, anoto sus notas y las ingreso yo desde su sesión (eligiendo su nombre en mi navegador, en una ventana privada).
