-- =====================================================================
--  Concurso de Automatización con IA — Bogati Sabor Adictivo S.A.S.
--  Esquema de base de datos para Supabase (PostgreSQL)
--
--  Cómo usarlo:
--    Supabase > SQL Editor > New query > pegar TODO este archivo > Run
--  Es seguro ejecutarlo más de una vez (no borra datos existentes).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. SETTINGS — una sola fila con el estado del concurso
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id               smallint    primary key default 1 check (id = 1),
  scoring_open     boolean     not null default false,   -- calificación ABIERTA / CERRADA
  results_revealed boolean     not null default false,   -- resultados revelados
  updated_at       timestamptz not null default now()
);

insert into public.settings (id) values (1)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 2. SCORES — una fila por (jurado, proyecto)
--    Las columnas de criterio coinciden con las "key" de CRITERIOS en config.js
-- ---------------------------------------------------------------------
create table if not exists public.scores (
  id                 bigint generated always as identity primary key,
  jurado_id          text     not null check (char_length(jurado_id) between 1 and 50),
  jurado_nombre      text     not null check (char_length(jurado_nombre) between 1 and 120),
  proyecto_id        smallint not null check (proyecto_id between 1 and 50),

  impacto_economico  smallint not null check (impacto_economico between 0 and 30),
  mejora_proceso     smallint not null check (mejora_proceso    between 0 and 30),
  calidad_vida       smallint not null check (calidad_vida      between 0 and 20),
  escalabilidad      smallint not null check (escalabilidad     between 0 and 10),
  creatividad_ia     smallint not null check (creatividad_ia    between 0 and 10),

  -- El total lo calcula la base de datos: nunca puede quedar desalineado
  total              integer generated always as (
                       impacto_economico + mejora_proceso + calidad_vida
                       + escalabilidad + creatividad_ia
                     ) stored,

  comentario         text check (comentario is null or char_length(comentario) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Un solo voto por jurado y proyecto (la app usa upsert sobre esta restricción)
  constraint scores_jurado_proyecto_unique unique (jurado_id, proyecto_id)
);

create index if not exists scores_proyecto_idx on public.scores (proyecto_id);


-- ---------------------------------------------------------------------
-- 3. updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists scores_set_updated_at on public.scores;
create trigger scores_set_updated_at
  before update on public.scores
  for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Función auxiliar: ¿está abierta la calificación?
-- ---------------------------------------------------------------------
create or replace function public.scoring_is_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select scoring_open from public.settings where id = 1), false);
$$;

grant execute on function public.scoring_is_open() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Permisos de tabla
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on public.settings from anon, authenticated;
revoke all on public.scores   from anon, authenticated;

grant select, update         on public.settings to anon, authenticated;
grant select, insert, update on public.scores   to anon, authenticated;
-- Sin DELETE para nadie desde la app: una calificación guardada no se puede borrar.


-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.scores   enable row level security;

-- settings: lectura pública, actualización solo de la fila 1 (panel admin)
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to anon, authenticated
  using (true);

drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update to anon, authenticated
  using (id = 1)
  with check (id = 1);

-- scores: lectura para el panel/ranking; escribir SOLO si la calificación está abierta
drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores
  for select to anon, authenticated
  using (true);

drop policy if exists scores_insert on public.scores;
create policy scores_insert on public.scores
  for insert to anon, authenticated
  with check (public.scoring_is_open());

drop policy if exists scores_update on public.scores;
create policy scores_update on public.scores
  for update to anon, authenticated
  using (public.scoring_is_open())
  with check (public.scoring_is_open());


-- ---------------------------------------------------------------------
-- 7. Realtime (para que el panel admin se actualice solo)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settings'
  ) then
    alter publication supabase_realtime add table public.settings;
  end if;
end;
$$;


-- =====================================================================
--  REINICIO ANTES DEL EVENTO (opcional)
--  Después de hacer pruebas, borra las calificaciones de prueba y deja
--  todo cerrado. Quita los "--" de las dos líneas y ejecuta SOLO esas.
-- =====================================================================
-- truncate table public.scores restart identity;
-- update public.settings set scoring_open = false, results_revealed = false where id = 1;
