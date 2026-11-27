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
              check (categoria in ('celulares','servicio','forros','vidrios','cables','cargadores','audifonos','otros')),
  subtipo     text
              check (
                subtipo is null
                or (categoria = 'celulares' and subtipo in ('samsung','xiaomi','motorola','apple','tecno','infinix','honor','otras'))
    or (categoria = 'servicio'  and subtipo in ('pantallas','tapas','tarjetas','camaras','pines','botones','baterias','otros'))
                or (categoria = 'servicio'  and subtipo in ('pantallas','tapas','tarjetas','camaras','pines','botones','baterias','otros'))
                or (categoria = 'forros'    and subtipo in ('silicona','lujo'))
                or (categoria = 'vidrios'   and subtipo in ('sencillo','blindado','titanio','antiespia','curvo','camara'))
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

-- Cada vez que se marca un estado (aunque sea el mismo, p. ej. "no hay"
-- otra vez en una compra nueva), el servidor anota quién y cuándo.
-- La app solo puede actualizar "estado", así que todo UPDATE es una marca.
create or replace function public.poner_estado()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.estado_por := coalesce(
    (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email')),
    'Desconocido'
  );
  new.estado_en := now();
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


-- ─────────────────────────────────────────────────────────────
-- 8. CATEGORÍAS CELULARES (por marca) Y SERVICIO TÉCNICO (por repuesto)
--    Para bases creadas antes de existir esta categoría: se
--    reemplazan las reglas CHECK de categoría y subtipo.
-- ─────────────────────────────────────────────────────────────
alter table public.faltantes drop constraint if exists faltantes_categoria_check;
alter table public.faltantes add constraint faltantes_categoria_check
  check (categoria in ('celulares','servicio','forros','vidrios','cables','cargadores','audifonos','otros'));

alter table public.faltantes drop constraint if exists faltantes_check;
alter table public.faltantes drop constraint if exists faltantes_subtipo_check;
alter table public.faltantes add constraint faltantes_subtipo_check check (
    subtipo is null
    or (categoria = 'celulares' and subtipo in ('samsung','xiaomi','motorola','apple','tecno','infinix','honor','otras'))
    or (categoria = 'servicio'  and subtipo in ('pantallas','tapas','tarjetas','camaras','pines','botones','baterias','otros'))
    or (categoria = 'forros'    and subtipo in ('silicona','lujo'))
    or (categoria = 'vidrios'   and subtipo in ('sencillo','blindado','titanio','antiespia','curvo','camara'))
    or (categoria = 'audifonos' and subtipo in ('cable','inalambricos'))
);


-- ─────────────────────────────────────────────────────────────
-- 9. FACTURAS DE COMPRA (historial permanente)
--    Al terminar una salida de compras se guarda una "factura" con lo
--    comprado y lo no conseguido. Es INMUTABLE: nadie puede editarla ni
--    borrarla desde la app (solo leer). Se crea únicamente con la función
--    cerrar_compra(), que en UNA transacción:
--      1) guarda la factura,
--      2) quita de faltantes lo comprado,
--      3) deja lo no conseguido en la lista, marcado "no_conseguido".
-- ─────────────────────────────────────────────────────────────
create table if not exists public.compras (
  id                   uuid primary key default gen_random_uuid(),
  creada_en            timestamptz not null default now(),
  hecha_por            text not null,
  items                jsonb not null,
  total_comprados      int not null default 0,
  total_no_conseguidos int not null default 0
);
create index if not exists compras_creada_en_idx on public.compras (creada_en desc);

alter table public.compras enable row level security;
revoke all on public.compras from anon, authenticated;
grant select on public.compras to authenticated;

drop policy if exists "leer compras" on public.compras;
create policy "leer compras" on public.compras
  for select to authenticated
  using ( (select public.es_permitido()) );

create or replace function public.cerrar_compra(comprados uuid[], no_conseguidos uuid[])
returns public.compras
language plpgsql security definer
set search_path = ''
as $$
declare
  yo text;
  factura public.compras;
begin
  yo := (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email'));
  if yo is null then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  comprados := coalesce(comprados, '{}');
  no_conseguidos := coalesce(no_conseguidos, '{}');

  insert into public.compras (hecha_por, items, total_comprados, total_no_conseguidos)
  select yo,
         jsonb_agg(jsonb_build_object(
           'categoria', f.categoria, 'subtipo', f.subtipo, 'modelo', f.modelo,
           'detalle', f.detalle, 'quedan', f.quedan, 'creado_por', f.creado_por,
           'resultado', case when f.id = any(comprados) then 'comprado' else 'no_conseguido' end
         ) order by (f.id = any(comprados)) desc, f.categoria, f.subtipo, f.modelo),
         count(*) filter (where f.id = any(comprados)),
         count(*) filter (where not f.id = any(comprados))
  from public.faltantes f
  where f.id = any(comprados) or f.id = any(no_conseguidos)
  having count(*) > 0
  returning * into factura;

  if factura.id is null then
    raise exception 'No hay productos revisados para guardar' using errcode = '22023';
  end if;

  delete from public.faltantes where id = any(comprados);
  update public.faltantes set estado = 'no_conseguido' where id = any(no_conseguidos);
  return factura;
end;
$$;

revoke all on function public.cerrar_compra(uuid[], uuid[]) from public, anon;
grant execute on function public.cerrar_compra(uuid[], uuid[]) to authenticated;

-- Las facturas nuevas llegan en tiempo real a todos los celulares
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'compras'
  ) then
    alter publication supabase_realtime add table public.compras;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 10. HISTORIAL DE ACTIVIDAD + BORRAR FACTURAS
--    Cada cambio queda escrito en texto ("Andrés agregó…", "Osman
--    terminó una compra…", "Patricia borró la factura…"). Lo escribe la
--    BASE DE DATOS (triggers y funciones), no la app: así nada se escapa
--    y nadie puede editarlo ni borrarlo. Se guardan las últimas 2000 líneas.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.actividad (
  id         bigint generated always as identity primary key,
  creado_en  timestamptz not null default now(),
  quien      text not null,
  accion     text not null,          -- agregar | quitar | vaciar | compra | borrar_factura
  texto      text not null
);
create index if not exists actividad_creado_en_idx on public.actividad (creado_en desc);

alter table public.actividad enable row level security;
revoke all on public.actividad from anon, authenticated;
grant select on public.actividad to authenticated;
drop policy if exists "leer actividad" on public.actividad;
create policy "leer actividad" on public.actividad
  for select to authenticated using ( (select public.es_permitido()) );

-- Nombre de quien hace el cambio
create or replace function public.quien_soy()
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email')),
    'Sistema');
$$;

-- "Forro silicona · Redmi A7 Pro", "Celular · Redmi 13C (128 GB · 6 GB RAM)"
create or replace function public.describir(categoria text, subtipo text, modelo text, detalle text)
returns text language sql immutable set search_path = ''
as $$
  select concat_ws(' · ',
    nullif(concat_ws(' ',
      case categoria
        when 'celulares' then 'Celular' when 'servicio' then 'Repuesto' when 'forros' then 'Forro'
        when 'vidrios' then 'Vidrio' when 'cables' then 'Cable' when 'cargadores' then 'Cargador'
        when 'audifonos' then 'Audífonos' else null end,
      case when categoria = 'celulares' then null else
        case subtipo
          when 'antiespia' then 'antiespía' when 'inalambricos' then 'inalámbricos'
          when 'camara' then 'de cámara' when 'camaras' then 'cámara' when 'pines' then 'pin de carga'
          when 'baterias' then 'batería' when 'pantallas' then 'pantalla' when 'tapas' then 'tapa'
          when 'tarjetas' then 'tarjeta' when 'botones' then 'botones' when 'otros' then null
          else subtipo end
      end), ''),
    nullif(modelo, '') || coalesce(' (' || nullif(detalle, '') || ')', ''));
$$;

create or replace function public.anotar(accion text, texto text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.actividad (quien, accion, texto) values (public.quien_soy(), accion, texto);
  delete from public.actividad where id <= (select max(id) - 2000 from public.actividad);
$$;
revoke all on function public.anotar(text, text) from public, anon, authenticated;

-- Agregar: una línea por operación ("agregó A, B y C")
create or replace function public.log_agregar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare lista text;
begin
  select string_agg(public.describir(categoria, subtipo, modelo, detalle), ', ' order by creado_en)
    into lista from nuevos;
  if lista is not null then
    perform public.anotar('agregar', public.quien_soy() || ' agregó ' || lista);
  end if;
  return null;
end;
$$;

-- Quitar: "quitó X" (o "vació la lista" si quedó vacía). cerrar_compra lo omite.
create or replace function public.log_quitar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare lista text; n int;
begin
  if current_setting('rh.omitir_log', true) = '1' then return null; end if;
  select count(*), string_agg(public.describir(categoria, subtipo, modelo, detalle), ', ')
    into n, lista from viejos;
  if n = 0 then return null; end if;
  if not exists (select 1 from public.faltantes) and n > 1 then
    perform public.anotar('vaciar', public.quien_soy() || ' vació la lista (' || n || ' productos)');
  else
    perform public.anotar('quitar', public.quien_soy() || ' quitó ' || lista);
  end if;
  return null;
end;
$$;

drop trigger if exists faltantes_log_agregar on public.faltantes;
create trigger faltantes_log_agregar after insert on public.faltantes
  referencing new table as nuevos for each statement execute function public.log_agregar();
drop trigger if exists faltantes_log_quitar on public.faltantes;
create trigger faltantes_log_quitar after delete on public.faltantes
  referencing old table as viejos for each statement execute function public.log_quitar();

-- cerrar_compra (de la sección 9) ahora también anota la compra en el historial
create or replace function public.cerrar_compra(comprados uuid[], no_conseguidos uuid[])
returns public.compras
language plpgsql security definer
set search_path = ''
as $$
declare
  yo text;
  factura public.compras;
  si text;
  no text;
begin
  yo := (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email'));
  if yo is null then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  comprados := coalesce(comprados, '{}');
  no_conseguidos := coalesce(no_conseguidos, '{}');

  insert into public.compras (hecha_por, items, total_comprados, total_no_conseguidos)
  select yo,
         jsonb_agg(jsonb_build_object(
           'categoria', f.categoria, 'subtipo', f.subtipo, 'modelo', f.modelo,
           'detalle', f.detalle, 'quedan', f.quedan, 'creado_por', f.creado_por,
           'resultado', case when f.id = any(comprados) then 'comprado' else 'no_conseguido' end
         ) order by (f.id = any(comprados)) desc, f.categoria, f.subtipo, f.modelo),
         count(*) filter (where f.id = any(comprados)),
         count(*) filter (where not f.id = any(comprados))
  from public.faltantes f
  where f.id = any(comprados) or f.id = any(no_conseguidos)
  having count(*) > 0
  returning * into factura;

  if factura.id is null then
    raise exception 'No hay productos revisados para guardar' using errcode = '22023';
  end if;

  select string_agg(public.describir(f.categoria, f.subtipo, f.modelo, f.detalle), ', ') filter (where f.id = any(comprados)),
         string_agg(public.describir(f.categoria, f.subtipo, f.modelo, f.detalle), ', ') filter (where f.id = any(no_conseguidos))
    into si, no
  from public.faltantes f where f.id = any(comprados) or f.id = any(no_conseguidos);

  perform set_config('rh.omitir_log', '1', true);   -- el "quitar" de lo comprado no se anota aparte
  delete from public.faltantes where id = any(comprados);
  perform set_config('rh.omitir_log', '0', true);
  update public.faltantes set estado = 'no_conseguido' where id = any(no_conseguidos);

  perform public.anotar('compra', yo || ' terminó una compra'
    || coalesce(': compró ' || si, '')
    || coalesce(case when si is null then ': ' else '; ' end || 'no consiguió ' || no, ''));
  return factura;
end;
$$;
revoke all on function public.cerrar_compra(uuid[], uuid[]) from public, anon;
grant execute on function public.cerrar_compra(uuid[], uuid[]) to authenticated;

-- Borrar una factura (para liberar espacio). Queda anotado quién la borró.
create or replace function public.borrar_compra(factura_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare f public.compras;
begin
  if not public.es_permitido() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  delete from public.compras where id = factura_id returning * into f;
  if f.id is null then
    raise exception 'La factura no existe' using errcode = 'P0002';
  end if;
  perform public.anotar('borrar_factura', public.quien_soy() || ' borró la factura del '
    || to_char(f.creada_en at time zone 'America/Bogota', 'DD/MM/YYYY HH12:MI am')
    || ' (de ' || f.hecha_por || ': ' || f.total_comprados || ' comprados, '
    || f.total_no_conseguidos || ' no conseguidos)');
end;
$$;
revoke all on function public.borrar_compra(uuid) from public, anon;
grant execute on function public.borrar_compra(uuid) to authenticated;
