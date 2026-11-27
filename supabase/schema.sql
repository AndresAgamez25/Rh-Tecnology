-- ═════════════════════════════════════════════════════════════
-- RH TECHNOLOGY · Faltantes — Esquema de base de datos (Supabase)
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
-- archivo → Run. Se puede ejecutar varias veces sin romper nada.
-- ═════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1. LISTA DE CORREOS PERMITIDOS (solo 3 personas)
--    Aunque alguien consiguiera crear una cuenta, si su correo no
--    está aquí, no puede leer ni escribir nada.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.usuarios_permitidos (
  email  text primary key check (email = lower(email)),
  nombre text not null check (char_length(nombre) between 1 and 40)
);

-- ✏️ CAMBIA estos correos y nombres por los reales (en minúsculas).
--    El nombre es el que aparece en cada tarjeta ("agregado por").
insert into public.usuarios_permitidos (email, nombre) values
  ('tu-correo@ejemplo.com',     'Tu nombre'),
  ('jefe1@ejemplo.com',         'Jefe 1'),
  ('jefe2@ejemplo.com',         'Jefe 2')
on conflict (email) do update set nombre = excluded.nombre;

-- RLS activado y SIN políticas = nadie puede leer esta tabla desde la app.
alter table public.usuarios_permitidos enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 2. FUNCIONES DE APOYO
--    "security definer" = se ejecutan con permisos del dueño, así
--    pueden consultar usuarios_permitidos aunque la app no pueda.
-- ─────────────────────────────────────────────────────────────

-- ¿El usuario que hace la petición está en la lista?
create or replace function public.es_permitido()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.usuarios_permitidos
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

-- Devuelve el nombre del usuario actual (o nada si no está permitido).
-- La app lo usa justo después del login.
create or replace function public.mi_perfil()
returns table (nombre text)
language sql stable security definer
set search_path = ''
as $$
  select nombre from public.usuarios_permitidos
  where email = lower(auth.jwt() ->> 'email');
$$;

revoke all on function public.es_permitido() from public, anon;
revoke all on function public.mi_perfil()    from public, anon;
grant execute on function public.es_permitido() to authenticated;
grant execute on function public.mi_perfil()    to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. TABLA DE FALTANTES
--    Los CHECK validan los datos en el servidor: aunque alguien
--    manipule la app, no puede guardar categorías inventadas.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.faltantes (
  id          uuid primary key default gen_random_uuid(),
  categoria   text not null
              check (categoria in ('forros','vidrios','cables','cargadores','audifonos','otros')),
  subtipo     text
              check (
                subtipo is null
                or (categoria = 'forros'    and subtipo in ('silicona','lujo'))
                or (categoria = 'vidrios'   and subtipo in ('sencillo','blindado','titanio','antiespia','curvo'))
                or (categoria = 'audifonos' and subtipo in ('cable','inalambricos'))
              ),
  modelo      text not null default '' check (char_length(modelo)  <= 120),
  detalle     text not null default '' check (char_length(detalle) <= 200),
  quedan      text not null default '' check (char_length(quedan)  <= 120),
  creado_en   timestamptz not null default now(),
  creado_por  text not null default ''
);

create index if not exists faltantes_creado_en_idx on public.faltantes (creado_en desc);


-- ─────────────────────────────────────────────────────────────
-- 4. "creado_por" LO PONE EL SERVIDOR, no la app.
--    Así nadie puede hacerse pasar por otra persona.
-- ─────────────────────────────────────────────────────────────
create or replace function public.poner_autor()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.creado_por := coalesce(
    (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email')),
    'Desconocido'
  );
  new.creado_en := now();
  return new;
end;
$$;

drop trigger if exists faltantes_poner_autor on public.faltantes;
create trigger faltantes_poner_autor
  before insert on public.faltantes
  for each row execute function public.poner_autor();


-- ─────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY (RLS)
--    Solo usuarios con sesión iniciada Y en la lista permitida
--    pueden ver, agregar y quitar. No hay política de UPDATE:
--    la app nunca edita, solo agrega y quita.
-- ─────────────────────────────────────────────────────────────
alter table public.faltantes enable row level security;

drop policy if exists "leer faltantes"   on public.faltantes;
drop policy if exists "agregar faltantes" on public.faltantes;
drop policy if exists "quitar faltantes"  on public.faltantes;

create policy "leer faltantes" on public.faltantes
  for select to authenticated
  using ( (select public.es_permitido()) );

create policy "agregar faltantes" on public.faltantes
  for insert to authenticated
  with check ( (select public.es_permitido()) );

create policy "quitar faltantes" on public.faltantes
  for delete to authenticated
  using ( (select public.es_permitido()) );

-- Permisos EXPLÍCITOS (no dependemos de los automáticos de Supabase,
-- que no siempre se aplican igual):
--   anónimo (sin sesión) → nada
--   con sesión           → leer, agregar y quitar (RLS decide QUÉ filas);
--                          el UPDATE solo de la columna estado (sección 7)
--   Sin TRUNCATE: vaciaría la tabla saltándose RLS.
revoke all on public.faltantes from anon, authenticated;
grant select, insert, delete on public.faltantes to authenticated;
revoke all on public.usuarios_permitidos from anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6. TIEMPO REAL
--    Agrega la tabla a la publicación de Realtime. Supabase
--    respeta RLS: solo los usuarios permitidos reciben los cambios.
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'faltantes'
  ) then
    alter publication supabase_realtime add table public.faltantes;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 7. MODO COMPRAS: estado de cada producto
--    pendiente      → falta (estado normal)
--    comprado       → un jefe lo compró; está "en camino" hasta que llegue
--    no_conseguido  → lo buscaron y no lo encontraron; sigue en la lista
-- ─────────────────────────────────────────────────────────────
alter table public.faltantes
  add column if not exists estado text not null default 'pendiente'
    check (estado in ('pendiente','comprado','no_conseguido'));
alter table public.faltantes add column if not exists estado_por text not null default '';
alter table public.faltantes add column if not exists estado_en  timestamptz;

-- Al insertar, el estado siempre empieza limpio (nadie puede falsearlo)
create or replace function public.poner_autor()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.creado_por := coalesce(
    (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email')),
    'Desconocido'
  );
  new.creado_en  := now();
  new.estado     := 'pendiente';
  new.estado_por := '';
  new.estado_en  := null;
  return new;
end;
$$;

-- Al cambiar el estado, el servidor anota quién y cuándo
create or replace function public.poner_estado()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    new.estado_por := coalesce(
      (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email')),
      'Desconocido'
    );
    new.estado_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists faltantes_poner_estado on public.faltantes;
create trigger faltantes_poner_estado
  before update on public.faltantes
  for each row execute function public.poner_estado();

-- La app SOLO puede cambiar la columna "estado" (permiso por columna)
revoke update on public.faltantes from authenticated;
grant  update (estado) on public.faltantes to authenticated;

drop policy if exists "marcar estado" on public.faltantes;
create policy "marcar estado" on public.faltantes
  for update to authenticated
  using ( (select public.es_permitido()) )
  with check ( (select public.es_permitido()) );
