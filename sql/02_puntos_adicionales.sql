-- =====================================================================
--  Ronda de preguntas: puntos adicionales por equipo
--  Ejecutar UNA vez en Supabase > SQL Editor (después de schema.sql).
--  Es seguro ejecutarlo más de una vez. No borra calificaciones.
-- =====================================================================

-- Interruptor de la ronda de preguntas
alter table public.settings
  add column if not exists bonus_open boolean not null default false;

-- Cada vez que un jurado suma puntos a un equipo se guarda una fila
create table if not exists public.bonus (
  id             bigint generated always as identity primary key,
  jurado_id      text     not null check (char_length(jurado_id) between 1 and 50),
  jurado_nombre  text     not null check (char_length(jurado_nombre) between 1 and 120),
  proyecto_id    smallint not null check (proyecto_id between 1 and 50),
  puntos         smallint not null check (puntos between 1 and 100),
  created_at     timestamptz not null default now()
);

create index if not exists bonus_proyecto_idx on public.bonus (proyecto_id);

-- ¿Está abierta la ronda de preguntas?
create or replace function public.bonus_is_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select bonus_open from public.settings where id = 1), false);
$$;

grant execute on function public.bonus_is_open() to anon, authenticated;

-- Permisos: leer, sumar y deshacer (solo con la ronda abierta)
revoke all on public.bonus from anon, authenticated;
grant select, insert, delete on public.bonus to anon, authenticated;

alter table public.bonus enable row level security;

drop policy if exists bonus_select on public.bonus;
create policy bonus_select on public.bonus
  for select to anon, authenticated
  using (true);

drop policy if exists bonus_insert on public.bonus;
create policy bonus_insert on public.bonus
  for insert to anon, authenticated
  with check (public.bonus_is_open());

drop policy if exists bonus_delete on public.bonus;
create policy bonus_delete on public.bonus
  for delete to anon, authenticated
  using (public.bonus_is_open());

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bonus'
  ) then
    alter publication supabase_realtime add table public.bonus;
  end if;
end;
$$;


-- =====================================================================
--  REINICIO DE LA RONDA (opcional, después de ensayar)
--  Quita los "--" y ejecuta SOLO estas líneas.
-- =====================================================================
-- truncate table public.bonus restart identity;
-- update public.settings set bonus_open = false where id = 1;
