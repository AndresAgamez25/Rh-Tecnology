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
    or (categoria = 'cargadores' and subtipo in ('cabezote','completo'))
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


-- ═════════════════════════════════════════════════════════════
-- 11. SERVICIO TÉCNICO
--    ordenes        → un celular recibido (número interno: el cliente no lo ve)
--    orden_eventos  → historial del arreglo (solo se agrega; nunca se edita/borra)
--    orden_pagos    → abonos y pagos con su método
--    orden_fotos    → fotos (se borran solas al mes; el texto queda)
--    Todo se escribe con funciones (RPC) que validan las reglas y anotan
--    quién hizo qué. Las órdenes ENTREGADAS no se pueden modificar ni borrar.
-- ═════════════════════════════════════════════════════════════
create table if not exists public.ordenes (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint generated always as identity unique,
  codigo               text not null unique default replace(gen_random_uuid()::text, '-', ''),
  estado               text not null default 'activo' check (estado in ('activo','por_entregar','entregado')),
  resultado            text check (resultado in ('reparado','no_reparado')),
  cliente              text not null check (char_length(cliente) between 1 and 80),
  telefono             text not null default '' check (char_length(telefono) <= 20),
  equipo               text not null default '' check (char_length(equipo) <= 80),
  imei                 text not null default '' check (char_length(imei) <= 30),
  problema             text not null default '' check (char_length(problema) <= 500),
  claves               jsonb not null default '[]'::jsonb check (jsonb_typeof(claves) = 'array'),
  llego_con            text[] not null default '{}',
  llego_con_otro       text not null default '' check (char_length(llego_con_otro) <= 200),
  estado_recibido      text[] not null default '{}',
  estado_recibido_otro text not null default '' check (char_length(estado_recibido_otro) <= 200),
  tecnico              text not null default 'Osman' check (char_length(tecnico) between 1 and 40),
  precio               integer not null default 0 check (precio between 0 and 50000000),
  -- Trabajos con su precio: [{"descripcion":"Pantalla","precio":180000}, …]. precio = suma − descuento
  trabajos             jsonb not null default '[]'::jsonb check (jsonb_typeof(trabajos) = 'array'),
  descuento            integer not null default 0 check (descuento between 0 and 50000000),
  resumen              text not null default '' check (char_length(resumen) <= 1000),
  creado_en            timestamptz not null default now(),
  creado_por           text not null default '',
  listo_en             timestamptz,
  entregado_en         timestamptz,
  entregado_por        text
);
create index if not exists ordenes_estado_idx on public.ordenes (estado, creado_en desc);
-- (para bases creadas antes de que existieran los trabajos con precio)
alter table public.ordenes add column if not exists trabajos jsonb not null default '[]'::jsonb
  check (jsonb_typeof(trabajos) = 'array');
alter table public.ordenes add column if not exists descuento integer not null default 0
  check (descuento between 0 and 50000000);

create table if not exists public.orden_eventos (
  id         bigint generated always as identity primary key,
  orden_id   uuid not null references public.ordenes(id),
  creado_en  timestamptz not null default now(),
  autor      text not null,
  tipo       text not null check (tipo in ('recibido','trabajo','precio','foto','listo','devuelto','pago',
                                           'entregado','nota','edicion','whatsapp','formateo','clave','reabierto')),
  texto      text not null default '' check (char_length(texto) <= 1000),
  datos      jsonb not null default '{}'::jsonb
);
create index if not exists orden_eventos_orden_idx on public.orden_eventos (orden_id, id);

create table if not exists public.orden_pagos (
  id         bigint generated always as identity primary key,
  orden_id   uuid not null references public.ordenes(id),
  creado_en  timestamptz not null default now(),
  cobro      text not null,
  monto      integer not null check (monto > 0 and monto <= 50000000),
  metodo     text not null check (metodo in ('efectivo','qr','transferencia')),
  tipo       text not null check (tipo in ('abono','pago'))
);
create index if not exists orden_pagos_fecha_idx on public.orden_pagos (creado_en desc);

create table if not exists public.orden_fotos (
  id               uuid primary key default gen_random_uuid(),
  orden_id         uuid not null references public.ordenes(id),
  ruta             text not null unique,
  etiqueta         text not null default '' check (char_length(etiqueta) <= 80),
  momento          text not null default 'trabajo' check (momento in ('recibido','trabajo','resultado')),
  visible_cliente  boolean not null default true,
  creado_en        timestamptz not null default now(),
  autor            text not null,
  borrada_en       timestamptz
);
create index if not exists orden_fotos_orden_idx on public.orden_fotos (orden_id);

-- Solo lectura desde la app; todo cambio pasa por las funciones de abajo
do $$
declare t text;
begin
  foreach t in array array['ordenes','orden_eventos','orden_pagos','orden_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "leer %s" on public.%I', t, t);
    execute format('create policy "leer %s" on public.%I for select to authenticated using ((select public.es_permitido()))', t, t);
  end loop;
end $$;

-- Las órdenes NUNCA se borran, y las ENTREGADAS no se modifican
create or replace function public.proteger_ordenes()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las órdenes de servicio técnico no se pueden borrar' using errcode = '42501';
  end if;
  if old.estado = 'entregado' then
    raise exception 'Las órdenes entregadas no se pueden modificar' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists ordenes_proteger on public.ordenes;
create trigger ordenes_proteger before update or delete on public.ordenes
  for each row execute function public.proteger_ordenes();

-- Eventos y pagos: solo se agregan
create or replace function public.solo_agregar()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'El historial y los pagos no se pueden modificar ni borrar' using errcode = '42501';
end;
$$;
drop trigger if exists orden_eventos_solo_agregar on public.orden_eventos;
create trigger orden_eventos_solo_agregar before update or delete on public.orden_eventos
  for each row execute function public.solo_agregar();
drop trigger if exists orden_pagos_solo_agregar on public.orden_pagos;
create trigger orden_pagos_solo_agregar before update or delete on public.orden_pagos
  for each row execute function public.solo_agregar();

-- ── Ayudantes ────────────────────────────────────────────────
create or replace function public.pesos(n integer)
returns text language sql immutable set search_path = ''
as $$ select '$' || replace(to_char(coalesce(n, 0), 'FM999,999,999'), ',', '.'); $$;

create or replace function public.requiere_permiso()
returns text language plpgsql stable security definer set search_path = ''
as $$
declare yo text;
begin
  yo := (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email'));
  if yo is null then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return yo;
end;
$$;

create or replace function public.orden_para_cambiar(p_id uuid)
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare o public.ordenes;
begin
  select * into o from public.ordenes where id = p_id for update;
  if o.id is null then raise exception 'La orden no existe' using errcode = 'P0002'; end if;
  if o.estado = 'entregado' then
    raise exception 'Las órdenes entregadas no se pueden modificar' using errcode = '42501';
  end if;
  return o;
end;
$$;

create or replace function public.evento(p_orden uuid, p_autor text, p_tipo text, p_texto text, p_datos jsonb default '{}')
returns void language sql security definer set search_path = ''
as $$
  insert into public.orden_eventos (orden_id, autor, tipo, texto, datos)
  values (p_orden, p_autor, p_tipo, left(coalesce(p_texto, ''), 1000), coalesce(p_datos, '{}'));
$$;

create or replace function public.lista_texto(j jsonb)
returns text[] language sql immutable set search_path = ''
as $$ select coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(j, '[]')) x limit 20), '{}'); $$;

-- Trabajos: deja solo {descripcion, precio} válidos (máx. 30, descripción 1–120, precio ≥ 0)
create or replace function public.limpiar_trabajos(t jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('descripcion', x.d, 'precio', x.p) order by x.n), '[]'::jsonb)
  from (
    select left(trim(e ->> 'descripcion'), 120) d,
           least(greatest(coalesce(round((e ->> 'precio')::numeric)::integer, 0), 0), 50000000) p, n
    from jsonb_array_elements(case when jsonb_typeof(t) = 'array' then t else '[]'::jsonb end) with ordinality as a(e, n)
    where jsonb_typeof(e) = 'object' and char_length(trim(coalesce(e ->> 'descripcion', ''))) > 0
    order by n limit 30
  ) x;
$$;

create or replace function public.suma_trabajos(t jsonb)
returns integer language sql immutable set search_path = ''
as $$ select coalesce(sum((e ->> 'precio')::integer), 0)::integer from jsonb_array_elements(coalesce(t, '[]')) e; $$;

-- "Pantalla $180.000 + Tapa $40.000"
create or replace function public.texto_trabajos(t jsonb)
returns text language sql immutable set search_path = ''
as $$
  select coalesce(string_agg((e ->> 'descripcion') || ' ' || public.pesos((e ->> 'precio')::integer), ' + ' order by n), '')
  from jsonb_array_elements(coalesce(t, '[]')) with ordinality as a(e, n);
$$;

-- ── Recibir equipo ───────────────────────────────────────────
create or replace function public.crear_orden(d jsonb)
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare
  yo text := public.requiere_permiso();
  o public.ordenes;
  abono integer := greatest(coalesce((d ->> 'abono')::integer, 0), 0);
  metodo text := coalesce(nullif(d ->> 'metodo_abono', ''), 'efectivo');
  trab jsonb := public.limpiar_trabajos(d -> 'trabajos');
  descu integer := greatest(coalesce((d ->> 'descuento')::integer, 0), 0);
  total integer;
begin
  -- Con trabajos, el precio es la suma menos el descuento; sin trabajos, el precio que llegue
  if jsonb_array_length(trab) > 0 then
    descu := least(descu, public.suma_trabajos(trab));
    total := public.suma_trabajos(trab) - descu;
  else
    descu := 0;
    total := greatest(coalesce((d ->> 'precio')::integer, 0), 0);
  end if;
  insert into public.ordenes (cliente, telefono, equipo, imei, problema, claves, llego_con, llego_con_otro,
                              estado_recibido, estado_recibido_otro, tecnico, precio, trabajos, descuento, creado_por)
  values (trim(d ->> 'cliente'), left(coalesce(d ->> 'telefono', ''), 20), left(coalesce(d ->> 'equipo', ''), 80),
          left(coalesce(d ->> 'imei', ''), 30), left(coalesce(d ->> 'problema', ''), 500),
          coalesce(d -> 'claves', '[]'), public.lista_texto(d -> 'llego_con'), left(coalesce(d ->> 'llego_con_otro', ''), 200),
          public.lista_texto(d -> 'estado_recibido'), left(coalesce(d ->> 'estado_recibido_otro', ''), 200),
          coalesce(nullif(d ->> 'tecnico', ''), 'Osman'), total, trab, descu, yo)
  returning * into o;

  perform public.evento(o.id, yo, 'recibido',
    'Llegó: ' || coalesce(nullif(o.problema, ''), 'sin descripción') || '. Cotizado ' || public.pesos(o.precio)
      || case when jsonb_array_length(trab) > 0 then ' (' || public.texto_trabajos(trab)
           || case when descu > 0 then ' − descuento ' || public.pesos(descu) else '' end || ')' else '' end || '.',
    jsonb_build_object('precio', o.precio, 'trabajos', trab, 'descuento', descu));
  if abono > 0 then
    insert into public.orden_pagos (orden_id, cobro, monto, metodo, tipo) values (o.id, yo, abono, metodo, 'abono');
    perform public.evento(o.id, yo, 'pago', 'Abonó ' || public.pesos(abono) || ' (' || metodo || ').',
      jsonb_build_object('monto', abono, 'metodo', metodo));
  end if;
  perform public.anotar('servicio', yo || ' recibió ' || coalesce(nullif(o.equipo, ''), 'un equipo') || ' de ' || o.cliente);
  return o;
end;
$$;

-- ── Editar datos (cliente, equipo, claves, técnico…) ─────────
create or replace function public.actualizar_orden(p_id uuid, d jsonb)
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare
  yo text := public.requiere_permiso();
  o public.ordenes := public.orden_para_cambiar(p_id);
  n public.ordenes;
  cambios text[] := '{}';
begin
  update public.ordenes set
    cliente = coalesce(nullif(trim(d ->> 'cliente'), ''), cliente),
    telefono = left(coalesce(d ->> 'telefono', telefono), 20),
    equipo = left(coalesce(d ->> 'equipo', equipo), 80),
    imei = left(coalesce(d ->> 'imei', imei), 30),
    problema = left(coalesce(d ->> 'problema', problema), 500),
    claves = coalesce(d -> 'claves', claves),
    llego_con = case when d ? 'llego_con' then public.lista_texto(d -> 'llego_con') else llego_con end,
    llego_con_otro = left(coalesce(d ->> 'llego_con_otro', llego_con_otro), 200),
    estado_recibido = case when d ? 'estado_recibido' then public.lista_texto(d -> 'estado_recibido') else estado_recibido end,
    estado_recibido_otro = left(coalesce(d ->> 'estado_recibido_otro', estado_recibido_otro), 200),
    tecnico = coalesce(nullif(d ->> 'tecnico', ''), tecnico)
  where id = p_id returning * into n;

  if n.tecnico is distinct from o.tecnico then
    perform public.evento(p_id, yo, 'edicion', 'Técnico: ' || o.tecnico || ' → ' || n.tecnico || '.');
  end if;
  if n.claves is distinct from o.claves then
    perform public.evento(p_id, yo, 'clave', coalesce(nullif(d ->> 'nota_clave', ''), 'Se actualizaron las claves.'));
  end if;
  if n.cliente is distinct from o.cliente then cambios := array_append(cambios, 'cliente'::text); end if;
  if n.telefono is distinct from o.telefono then cambios := array_append(cambios, 'teléfono'::text); end if;
  if n.equipo is distinct from o.equipo then cambios := array_append(cambios, 'equipo'::text); end if;
  if n.imei is distinct from o.imei then cambios := array_append(cambios, 'IMEI'::text); end if;
  if n.problema is distinct from o.problema then cambios := array_append(cambios, 'problema'::text); end if;
  if n.llego_con is distinct from o.llego_con or n.llego_con_otro is distinct from o.llego_con_otro then cambios := array_append(cambios, 'llegó con'::text); end if;
  if n.estado_recibido is distinct from o.estado_recibido or n.estado_recibido_otro is distinct from o.estado_recibido_otro then cambios := array_append(cambios, 'estado al recibir'::text); end if;
  if array_length(cambios, 1) > 0 then
    perform public.evento(p_id, yo, 'edicion', 'Se editó: ' || array_to_string(cambios, ', ') || '.');
  end if;
  return n;
end;
$$;

-- ── Historial: trabajo, nota, autorización de formateo, aviso de WhatsApp ──
create or replace function public.agregar_evento(p_id uuid, p_tipo text, p_texto text)
returns void language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); o public.ordenes;
begin
  select * into o from public.ordenes where id = p_id;
  if o.id is null then raise exception 'La orden no existe' using errcode = 'P0002'; end if;
  if p_tipo not in ('trabajo','nota','formateo','whatsapp') then
    raise exception 'Tipo no permitido' using errcode = '22023';
  end if;
  -- En una orden entregada solo se pueden agregar NOTAS (y avisos de WhatsApp)
  if o.estado = 'entregado' and p_tipo not in ('nota','whatsapp') then
    raise exception 'Las órdenes entregadas no se pueden modificar' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_texto, ''))) < 2 then
    raise exception 'Escribe qué se hizo' using errcode = '22023';
  end if;
  perform public.evento(p_id, yo, p_tipo, trim(p_texto));
end;
$$;

-- ── Cambiar precio (motivo obligatorio) ──────────────────────
create or replace function public.cambiar_precio(p_id uuid, p_nuevo integer, p_motivo text)
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); o public.ordenes := public.orden_para_cambiar(p_id); n public.ordenes;
begin
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué cambia el precio' using errcode = '22023';
  end if;
  if p_nuevo is null or p_nuevo < 0 then raise exception 'Precio inválido' using errcode = '22023'; end if;
  update public.ordenes set precio = p_nuevo where id = p_id returning * into n;
  perform public.evento(p_id, yo, 'precio',
    'Precio ' || public.pesos(o.precio) || ' → ' || public.pesos(p_nuevo) || '. Motivo: ' || trim(p_motivo),
    jsonb_build_object('antes', o.precio, 'despues', p_nuevo));
  return n;
end;
$$;

-- ── Trabajos con precio y descuento (el total se calcula aquí) ──
-- Sirve en "Activos" y en "Por entregar" (p. ej. un descuento al recoger).
create or replace function public.guardar_trabajos(p_id uuid, p_trabajos jsonb, p_descuento integer, p_motivo text)
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare
  yo text := public.requiere_permiso();
  o public.ordenes := public.orden_para_cambiar(p_id);
  n public.ordenes;
  trab jsonb := public.limpiar_trabajos(p_trabajos);
  descu integer;
  partes text[] := '{}';
  e jsonb;
  antes jsonb;
begin
  if o.resultado = 'no_reparado' then
    raise exception 'Este equipo se devolvió sin reparar: vuélvelo al taller para cambiar trabajos' using errcode = '22023';
  end if;
  descu := least(greatest(coalesce(p_descuento, 0), 0), public.suma_trabajos(trab));

  -- Qué cambió (comparando por descripción), para el historial
  for e in select * from jsonb_array_elements(trab) loop
    select x into antes from jsonb_array_elements(o.trabajos) x where lower(x ->> 'descripcion') = lower(e ->> 'descripcion') limit 1;
    if antes is null then
      partes := partes || ('+ ' || (e ->> 'descripcion') || ' ' || public.pesos((e ->> 'precio')::integer));
    elsif (antes ->> 'precio')::integer <> (e ->> 'precio')::integer then
      partes := partes || ((e ->> 'descripcion') || ' ' || public.pesos((antes ->> 'precio')::integer)
                           || ' → ' || public.pesos((e ->> 'precio')::integer));
    end if;
  end loop;
  for e in select * from jsonb_array_elements(o.trabajos) loop
    if not exists (select 1 from jsonb_array_elements(trab) x where lower(x ->> 'descripcion') = lower(e ->> 'descripcion')) then
      partes := partes || ('− ' || (e ->> 'descripcion'));
    end if;
  end loop;
  if descu <> o.descuento then
    partes := partes || ('Descuento ' || public.pesos(descu));
  end if;

  update public.ordenes set trabajos = trab, descuento = descu, precio = public.suma_trabajos(trab) - descu
  where id = p_id returning * into n;

  if array_length(partes, 1) > 0 or n.precio <> o.precio then
    perform public.evento(p_id, yo, 'precio',
      array_to_string(partes, ' · ')
        || case when n.precio <> o.precio then '. Total ' || public.pesos(o.precio) || ' → ' || public.pesos(n.precio) else '' end
        || case when char_length(trim(coalesce(p_motivo, ''))) > 0 then '. Motivo: ' || trim(p_motivo) else '' end || '.',
      jsonb_build_object('antes', o.precio, 'despues', n.precio, 'trabajos', trab, 'descuento', descu));
  end if;
  return n;
end;
$$;

-- ── Abono adicional ──────────────────────────────────────────
create or replace function public.registrar_abono(p_id uuid, p_monto integer, p_metodo text)
returns void language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); o public.ordenes := public.orden_para_cambiar(p_id);
begin
  insert into public.orden_pagos (orden_id, cobro, monto, metodo, tipo) values (p_id, yo, p_monto, p_metodo, 'abono');
  perform public.evento(p_id, yo, 'pago', 'Abonó ' || public.pesos(p_monto) || ' (' || p_metodo || ').',
    jsonb_build_object('monto', p_monto, 'metodo', p_metodo));
end;
$$;

-- ── Fotos ────────────────────────────────────────────────────
create or replace function public.agregar_foto(p_orden uuid, p_ruta text, p_etiqueta text, p_momento text)
returns public.orden_fotos language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); o public.ordenes := public.orden_para_cambiar(p_orden); f public.orden_fotos;
begin
  if p_ruta not like p_orden::text || '/%' then raise exception 'Ruta inválida' using errcode = '22023'; end if;
  insert into public.orden_fotos (orden_id, ruta, etiqueta, momento, visible_cliente, autor)
  values (p_orden, p_ruta, left(coalesce(p_etiqueta, ''), 80), coalesce(nullif(p_momento, ''), 'trabajo'),
          coalesce(nullif(p_momento, ''), 'trabajo') <> 'recibido', yo)
  returning * into f;
  perform public.evento(p_orden, yo, 'foto', '📷 ' || coalesce(nullif(f.etiqueta, ''), 'Foto'), jsonb_build_object('foto', f.id));
  return f;
end;
$$;

-- Marca como borradas las fotos vencidas (la app borra el archivo y luego llama esto)
create or replace function public.marcar_fotos_borradas(p_ids uuid[])
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  perform public.requiere_permiso();
  update public.orden_fotos set borrada_en = now()
  where id = any(p_ids) and borrada_en is null and creado_en < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── Listo / devolver sin reparar / reabrir ───────────────────
create or replace function public.marcar_listo(p_id uuid, p_resumen text, p_fotos uuid[])
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); o public.ordenes := public.orden_para_cambiar(p_id); n public.ordenes;
begin
  if o.estado <> 'activo' then raise exception 'La orden ya está lista' using errcode = '22023'; end if;
  update public.orden_fotos set visible_cliente = (id = any(coalesce(p_fotos, '{}'))) where orden_id = p_id;
  update public.ordenes set estado = 'por_entregar', resultado = 'reparado', listo_en = now(),
         resumen = left(coalesce(p_resumen, ''), 1000)
  where id = p_id returning * into n;
  perform public.evento(p_id, yo, 'listo', 'Listo para entregar ✓');
  perform public.anotar('servicio', yo || ' marcó listo ' || coalesce(nullif(n.equipo, ''), 'un equipo') || ' de ' || n.cliente);
  return n;
end;
$$;

create or replace function public.devolver_sin_reparar(p_id uuid, p_motivo text, p_cobro integer)
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); o public.ordenes := public.orden_para_cambiar(p_id); n public.ordenes;
begin
  if o.estado <> 'activo' then raise exception 'La orden ya está lista' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué no se reparó' using errcode = '22023';
  end if;
  update public.ordenes set estado = 'por_entregar', resultado = 'no_reparado', listo_en = now(),
         precio = greatest(coalesce(p_cobro, 0), 0), resumen = left(trim(p_motivo), 1000)
  where id = p_id returning * into n;
  perform public.evento(p_id, yo, 'devuelto',
    'No se reparó: ' || trim(p_motivo) || '. Se cobra ' || public.pesos(n.precio) || '.',
    jsonb_build_object('antes', o.precio, 'cobro', n.precio));
  return n;
end;
$$;

create or replace function public.reabrir_orden(p_id uuid, p_motivo text)
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); o public.ordenes := public.orden_para_cambiar(p_id); n public.ordenes;
begin
  if o.estado <> 'por_entregar' then raise exception 'La orden no está por entregar' using errcode = '22023'; end if;
  -- Si venía de "no reparado" y tiene trabajos, el precio vuelve a ser la suma de los trabajos
  update public.ordenes set estado = 'activo', resultado = null, listo_en = null,
         precio = case when o.resultado = 'no_reparado' and jsonb_array_length(o.trabajos) > 0
                       then public.suma_trabajos(o.trabajos) - o.descuento else precio end
  where id = p_id returning * into n;
  perform public.evento(p_id, yo, 'reabierto', 'Volvió al taller: ' || coalesce(nullif(trim(p_motivo), ''), 'sin motivo'));
  return n;
end;
$$;

-- ── Cobrar y entregar (pasa solo a Entregados) ───────────────
create or replace function public.entregar_orden(p_id uuid, p_pagos jsonb)
returns public.ordenes language plpgsql security definer set search_path = ''
as $$
declare
  yo text := public.requiere_permiso();
  o public.ordenes := public.orden_para_cambiar(p_id);
  n public.ordenes;
  p jsonb;
  total integer;
  hoy text := '';
begin
  if o.estado <> 'por_entregar' then raise exception 'Primero marca el equipo como listo' using errcode = '22023'; end if;
  for p in select * from jsonb_array_elements(coalesce(p_pagos, '[]')) loop
    if coalesce((p ->> 'monto')::integer, 0) > 0 then
      insert into public.orden_pagos (orden_id, cobro, monto, metodo, tipo)
      values (p_id, yo, (p ->> 'monto')::integer, p ->> 'metodo', 'pago');
      hoy := hoy || case when hoy = '' then '' else ' + ' end || public.pesos((p ->> 'monto')::integer) || ' (' || (p ->> 'metodo') || ')';
    end if;
  end loop;
  select coalesce(sum(monto), 0) into total from public.orden_pagos where orden_id = p_id;
  if total < o.precio then
    raise exception 'Falta por pagar %', public.pesos(o.precio - total) using errcode = '22023';
  end if;
  if hoy <> '' then
    perform public.evento(p_id, yo, 'pago', 'Pagó ' || hoy || '.');
  end if;
  update public.ordenes set estado = 'entregado', entregado_en = now(), entregado_por = yo
  where id = p_id returning * into n;
  perform public.evento(p_id, yo, 'entregado',
    case when n.resultado = 'no_reparado' then 'Entregado sin reparar.' else 'Entregado al cliente.' end);
  perform public.anotar('servicio', yo || ' entregó ' || coalesce(nullif(n.equipo, ''), 'un equipo') || ' de ' || n.cliente
    || ' (' || public.pesos(n.precio) || ')');
  return n;
end;
$$;

-- ── Página del cliente (la llama SOLO la Edge Function orden-cliente) ──
-- Devuelve lo mínimo: equipo, nombre, lo que se hizo, saldo y fotos elegidas.
-- Nunca claves, IMEI, teléfono ni número de orden. Vence a los 30 días de "listo".
create or replace function public.orden_publica(p_codigo text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'equipo', o.equipo,
    'nombre', split_part(o.cliente, ' ', 1),
    'estado', o.estado,
    'resultado', o.resultado,
    'resumen', o.resumen,
    'precio', o.precio,
    'trabajos', case when o.resultado = 'reparado' then o.trabajos else '[]'::jsonb end,
    'descuento', case when o.resultado = 'reparado' then o.descuento else 0 end,
    'pagado', (select coalesce(sum(monto), 0) from public.orden_pagos where orden_id = o.id),
    'listo_en', o.listo_en,
    'vence', o.listo_en + interval '30 days',
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('ruta', f.ruta, 'etiqueta', f.etiqueta, 'momento', f.momento)
                                         order by f.creado_en)
                       from public.orden_fotos f
                       where f.orden_id = o.id and f.visible_cliente and f.borrada_en is null), '[]'))
  from public.ordenes o
  where o.codigo = p_codigo and o.listo_en is not null and o.listo_en > now() - interval '30 days';
$$;

-- Permisos de las funciones
do $$
declare f text;
begin
  foreach f in array array[
    'crear_orden(jsonb)', 'actualizar_orden(uuid,jsonb)', 'agregar_evento(uuid,text,text)',
    'cambiar_precio(uuid,integer,text)', 'registrar_abono(uuid,integer,text)', 'guardar_trabajos(uuid,jsonb,integer,text)',
    'agregar_foto(uuid,text,text,text)', 'marcar_fotos_borradas(uuid[])',
    'marcar_listo(uuid,text,uuid[])', 'devolver_sin_reparar(uuid,text,integer)',
    'reabrir_orden(uuid,text)', 'entregar_orden(uuid,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['requiere_permiso()', 'orden_para_cambiar(uuid)',
    'evento(uuid,text,text,text,jsonb)', 'orden_publica(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- La página del cliente la consulta la Edge Function con la clave de servicio
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.orden_publica(text) to service_role;
  end if;
end $$;

-- Tiempo real: órdenes y su historial
do $$
declare t text;
begin
  foreach t in array array['ordenes','orden_eventos','orden_pagos','orden_fotos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Fotos en Supabase Storage (privado; solo los usuarios permitidos)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ordenes', 'ordenes', false, 2097152, array['image/jpeg','image/webp','image/png'])
    on conflict (id) do nothing;
    execute 'drop policy if exists "ordenes leer" on storage.objects';
    execute 'drop policy if exists "ordenes subir" on storage.objects';
    execute 'drop policy if exists "ordenes borrar" on storage.objects';
    execute $p$create policy "ordenes leer" on storage.objects for select to authenticated
      using (bucket_id = 'ordenes' and (select public.es_permitido()))$p$;
    execute $p$create policy "ordenes subir" on storage.objects for insert to authenticated
      with check (bucket_id = 'ordenes' and (select public.es_permitido()))$p$;
    execute $p$create policy "ordenes borrar" on storage.objects for delete to authenticated
      using (bucket_id = 'ordenes' and (select public.es_permitido()))$p$;
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════
-- 12. FALTANTES: EDITAR Y SIN REPETIDOS
--    · editar_faltante(): corrige un producto (p. ej. si la voz no se
--      entendió bien). Solo por esta función, que valida y lo anota.
--    · Un producto no se puede repetir: misma categoría, tipo y nombre
--      (sin importar mayúsculas, tildes, espacios ni guiones).
-- ═════════════════════════════════════════════════════════════

-- "Samsung A-15 " y "samsung a15" son el mismo producto
create or replace function public.clave_faltante(p_categoria text, p_subtipo text, p_modelo text, p_detalle text)
returns text language sql immutable set search_path = ''
as $$
  select coalesce(p_categoria, '') || '|' || coalesce(p_subtipo, '') || '|'
    || regexp_replace(translate(lower(coalesce(p_modelo, '') || ' ' || coalesce(p_detalle, '')),
                                'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'), '[^a-z0-9]', '', 'g');
$$;

-- Al agregar: si ya existe, NO se agrega otra vez (se ignora en silencio;
-- la app ya avisa "ya estaba en la lista")
create or replace function public.evitar_faltante_repetido()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(public.clave_faltante(new.categoria, new.subtipo, new.modelo, new.detalle)));
  if exists (select 1 from public.faltantes f
             where public.clave_faltante(f.categoria, f.subtipo, f.modelo, f.detalle)
                 = public.clave_faltante(new.categoria, new.subtipo, new.modelo, new.detalle)) then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists faltantes_sin_repetidos on public.faltantes;
create trigger faltantes_sin_repetidos before insert on public.faltantes
  for each row execute function public.evitar_faltante_repetido();

-- Al editar el producto NO se marca "comprado/no hay" (eso solo al cambiar estado)
create or replace function public.poner_estado()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (new.categoria, new.subtipo, new.modelo, new.detalle, new.quedan)
     is distinct from (old.categoria, old.subtipo, old.modelo, old.detalle, old.quedan) then
    return new; -- es una corrección del producto, no una marca de compras
  end if;
  new.estado_por := coalesce(
    (select nombre from public.usuarios_permitidos where email = lower(auth.jwt() ->> 'email')),
    'Desconocido'
  );
  new.estado_en := now();
  return new;
end;
$$;

create or replace function public.editar_faltante(p_id uuid, p_categoria text, p_subtipo text,
                                                   p_modelo text, p_detalle text, p_quedan text)
returns setof public.faltantes language plpgsql security definer set search_path = ''
as $$
declare
  yo text := public.requiere_permiso();
  a public.faltantes;
  n public.faltantes;
  v_modelo text := left(trim(coalesce(p_modelo, '')), 120);
  v_detalle text := left(trim(coalesce(p_detalle, '')), 200);
  v_quedan text := left(trim(coalesce(p_quedan, '')), 120);
  v_sub text := nullif(trim(coalesce(p_subtipo, '')), '');
begin
  select * into a from public.faltantes where id = p_id for update;
  if a.id is null then raise exception 'Ese producto ya no está en la lista' using errcode = 'P0002'; end if;
  if v_modelo = '' and v_detalle = '' then raise exception 'Escribe el nombre del producto' using errcode = '22023'; end if;
  if exists (select 1 from public.faltantes f
             where f.id <> p_id
               and public.clave_faltante(f.categoria, f.subtipo, f.modelo, f.detalle)
                 = public.clave_faltante(p_categoria, v_sub, v_modelo, v_detalle)) then
    raise exception 'Ya hay un producto igual en la lista' using errcode = '23505';
  end if;
  update public.faltantes f set categoria = p_categoria, subtipo = v_sub, modelo = v_modelo, detalle = v_detalle, quedan = v_quedan
  where f.id = p_id returning f.* into n;
  perform public.anotar('editar', yo || ' corrigió «' || trim(a.modelo || ' ' || a.detalle) || '» → «' || trim(n.modelo || ' ' || n.detalle) || '»'
    || case when n.quedan <> a.quedan then ' (quedan: ' || coalesce(nullif(n.quedan, ''), '—') || ')' else '' end);
  return next n;
end;
$$;
revoke all on function public.editar_faltante(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.editar_faltante(uuid, text, text, text, text, text) to authenticated;
revoke all on function public.evitar_faltante_repetido() from public, anon, authenticated;


-- ═════════════════════════════════════════════════════════════
-- 13. GARANTÍAS
--    Equipos que un cliente trae por garantía (teléfono, equipo de
--    sonido u otro). La tienda los recibe, los envía al proveedor y
--    espera la respuesta (hasta 30 días hábiles); luego se entregan.
--    garantias          → un equipo en garantía (número interno)
--    garantia_eventos   → historial (solo se agrega, nunca se borra)
--    garantia_fotos     → fotos (archivo en Storage "ordenes", carpeta g/)
--    Estados: recibida → enviada → respuesta → entregada.
--    Las entregadas no se borran ni se modifican (solo notas).
-- ═════════════════════════════════════════════════════════════
create table if not exists public.garantias (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint generated always as identity unique,
  estado               text not null default 'recibida' check (estado in ('recibida','enviada','respuesta','entregada')),
  resultado            text check (resultado in ('reparado','cambio','devolucion','rechazada')),
  cliente              text not null check (char_length(cliente) between 1 and 80),
  cedula               text not null default '' check (char_length(cedula) <= 20),
  telefono             text not null default '' check (char_length(telefono) <= 20),
  tipo                 text not null default 'celular' check (tipo in ('celular','sonido','otro')),
  tipo_otro            text not null default '' check (char_length(tipo_otro) <= 60),
  equipo               text not null default '' check (char_length(equipo) <= 80),
  serial               text not null default '' check (char_length(serial) <= 40),
  fecha_compra         date,
  valor_compra         integer not null default 0 check (valor_compra between 0 and 50000000),
  factura              text not null default '' check (char_length(factura) <= 60),
  falla                text not null default '' check (char_length(falla) <= 500),
  motivo               text not null default '' check (char_length(motivo) <= 500),
  llego_con            text[] not null default '{}',
  llego_con_otro       text not null default '' check (char_length(llego_con_otro) <= 200),
  estado_recibido      text[] not null default '{}',
  estado_recibido_otro text not null default '' check (char_length(estado_recibido_otro) <= 200),
  limite               date not null default (current_date + 42),
  enviado_a            text not null default '' check (char_length(enviado_a) <= 80),
  guia                 text not null default '' check (char_length(guia) <= 80),
  enviado_en           timestamptz,
  respuesta            text not null default '' check (char_length(respuesta) <= 500),
  respuesta_en         timestamptz,
  creado_en            timestamptz not null default now(),
  creado_por           text not null default '',
  entregado_en         timestamptz,
  entregado_por        text
);
create index if not exists garantias_estado_idx on public.garantias (estado, creado_en desc);

create table if not exists public.garantia_eventos (
  id           bigint generated always as identity primary key,
  garantia_id  uuid not null references public.garantias(id),
  creado_en    timestamptz not null default now(),
  autor        text not null,
  tipo         text not null check (tipo in ('recibida','nota','enviada','respuesta','entregada','foto','whatsapp','edicion')),
  texto        text not null default '' check (char_length(texto) <= 1000)
);
create index if not exists garantia_eventos_idx on public.garantia_eventos (garantia_id, id);

create table if not exists public.garantia_fotos (
  id           uuid primary key default gen_random_uuid(),
  garantia_id  uuid not null references public.garantias(id),
  ruta         text not null unique,
  etiqueta     text not null default '' check (char_length(etiqueta) <= 80),
  momento      text not null default 'recibido' check (momento in ('recibido','envio','respuesta')),
  creado_en    timestamptz not null default now(),
  autor        text not null,
  borrada_en   timestamptz
);
create index if not exists garantia_fotos_idx on public.garantia_fotos (garantia_id);

do $$
declare t text;
begin
  foreach t in array array['garantias','garantia_eventos','garantia_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "leer %s" on public.%I', t, t);
    execute format('create policy "leer %s" on public.%I for select to authenticated using ((select public.es_permitido()))', t, t);
  end loop;
end $$;

create or replace function public.proteger_garantias()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las garantías no se pueden borrar' using errcode = '42501';
  end if;
  if old.estado = 'entregada' then
    raise exception 'Las garantías entregadas no se pueden modificar' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists garantias_proteger on public.garantias;
create trigger garantias_proteger before update or delete on public.garantias
  for each row execute function public.proteger_garantias();
drop trigger if exists garantia_eventos_solo_agregar on public.garantia_eventos;
create trigger garantia_eventos_solo_agregar before update or delete on public.garantia_eventos
  for each row execute function public.solo_agregar();

create or replace function public.garantia_para_cambiar(p_id uuid)
returns public.garantias language plpgsql security definer set search_path = ''
as $$
declare g public.garantias;
begin
  select * into g from public.garantias where id = p_id for update;
  if g.id is null then raise exception 'La garantía no existe' using errcode = 'P0002'; end if;
  if g.estado = 'entregada' then
    raise exception 'Las garantías entregadas no se pueden modificar' using errcode = '42501';
  end if;
  return g;
end;
$$;

create or replace function public.evento_garantia(p_id uuid, p_autor text, p_tipo text, p_texto text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.garantia_eventos (garantia_id, autor, tipo, texto)
  values (p_id, p_autor, p_tipo, left(coalesce(p_texto, ''), 1000));
$$;

create or replace function public.tipo_garantia_texto(g public.garantias)
returns text language sql immutable set search_path = ''
as $$
  select coalesce(nullif(g.equipo, ''),
    case g.tipo when 'celular' then 'un celular' when 'sonido' then 'un equipo de sonido'
                else coalesce(nullif(g.tipo_otro, ''), 'un equipo') end);
$$;

-- ── Recibir equipo en garantía ───────────────────────────────
-- "limite" lo calcula la app (30 días hábiles: lunes a viernes sin festivos de Colombia)
create or replace function public.crear_garantia(d jsonb)
returns public.garantias language plpgsql security definer set search_path = ''
as $$
declare
  yo text := public.requiere_permiso();
  g public.garantias;
  lim date := coalesce(nullif(d ->> 'limite', '')::date, current_date + 42);
begin
  if lim < current_date or lim > current_date + 120 then lim := current_date + 42; end if;
  insert into public.garantias (cliente, cedula, telefono, tipo, tipo_otro, equipo, serial, fecha_compra, valor_compra,
                                factura, falla, motivo, llego_con, llego_con_otro, estado_recibido, estado_recibido_otro,
                                limite, creado_por)
  values (trim(d ->> 'cliente'), left(coalesce(d ->> 'cedula', ''), 20), left(coalesce(d ->> 'telefono', ''), 20),
          coalesce(nullif(d ->> 'tipo', ''), 'celular'), left(coalesce(d ->> 'tipo_otro', ''), 60),
          left(coalesce(d ->> 'equipo', ''), 80), left(coalesce(d ->> 'serial', ''), 40),
          nullif(d ->> 'fecha_compra', '')::date, greatest(coalesce((d ->> 'valor_compra')::integer, 0), 0),
          left(coalesce(d ->> 'factura', ''), 60), left(coalesce(d ->> 'falla', ''), 500), left(coalesce(d ->> 'motivo', ''), 500),
          public.lista_texto(d -> 'llego_con'), left(coalesce(d ->> 'llego_con_otro', ''), 200),
          public.lista_texto(d -> 'estado_recibido'), left(coalesce(d ->> 'estado_recibido_otro', ''), 200),
          lim, yo)
  returning * into g;
  perform public.evento_garantia(g.id, yo, 'recibida',
    'Se recibió en garantía: ' || coalesce(nullif(g.falla, ''), 'sin descripción') || '. Respuesta a más tardar el '
    || to_char(g.limite, 'DD/MM/YYYY') || '.');
  perform public.anotar('garantia', yo || ' recibió en garantía ' || public.tipo_garantia_texto(g) || ' de ' || g.cliente);
  return g;
end;
$$;

-- ── Editar datos ─────────────────────────────────────────────
create or replace function public.actualizar_garantia(p_id uuid, d jsonb)
returns public.garantias language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); g public.garantias := public.garantia_para_cambiar(p_id); n public.garantias;
begin
  update public.garantias set
    cliente = coalesce(nullif(trim(d ->> 'cliente'), ''), cliente),
    cedula = left(coalesce(d ->> 'cedula', cedula), 20),
    telefono = left(coalesce(d ->> 'telefono', telefono), 20),
    tipo = coalesce(nullif(d ->> 'tipo', ''), tipo),
    tipo_otro = left(coalesce(d ->> 'tipo_otro', tipo_otro), 60),
    equipo = left(coalesce(d ->> 'equipo', equipo), 80),
    serial = left(coalesce(d ->> 'serial', serial), 40),
    fecha_compra = case when d ? 'fecha_compra' then nullif(d ->> 'fecha_compra', '')::date else fecha_compra end,
    valor_compra = case when d ? 'valor_compra' then greatest(coalesce((d ->> 'valor_compra')::integer, 0), 0) else valor_compra end,
    factura = left(coalesce(d ->> 'factura', factura), 60),
    falla = left(coalesce(d ->> 'falla', falla), 500),
    motivo = left(coalesce(d ->> 'motivo', motivo), 500)
  where id = p_id returning * into n;
  if n is distinct from g then
    perform public.evento_garantia(p_id, yo, 'edicion', 'Se editaron los datos.');
  end if;
  return n;
end;
$$;

-- ── Nota / aviso de WhatsApp (también en entregadas) ─────────
create or replace function public.nota_garantia(p_id uuid, p_tipo text, p_texto text)
returns void language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso();
begin
  if not exists (select 1 from public.garantias where id = p_id) then
    raise exception 'La garantía no existe' using errcode = 'P0002';
  end if;
  if p_tipo not in ('nota','whatsapp') then raise exception 'Tipo no permitido' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_texto, ''))) < 2 then raise exception 'Escribe la nota' using errcode = '22023'; end if;
  perform public.evento_garantia(p_id, yo, p_tipo, trim(p_texto));
end;
$$;

-- ── Enviar al proveedor ──────────────────────────────────────
create or replace function public.enviar_garantia(p_id uuid, p_destino text, p_guia text, p_nota text)
returns public.garantias language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); g public.garantias := public.garantia_para_cambiar(p_id); n public.garantias;
begin
  if g.estado <> 'recibida' then raise exception 'Esta garantía ya fue enviada' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_destino, ''))) < 2 then raise exception 'Escribe a quién se envía' using errcode = '22023'; end if;
  update public.garantias set estado = 'enviada', enviado_a = left(trim(p_destino), 80), guia = left(trim(coalesce(p_guia, '')), 80),
         enviado_en = now()
  where id = p_id returning * into n;
  perform public.evento_garantia(p_id, yo, 'enviada', 'Enviado a ' || n.enviado_a
    || case when n.guia <> '' then ' (guía/recibo: ' || n.guia || ')' else '' end
    || case when char_length(trim(coalesce(p_nota, ''))) > 0 then '. ' || trim(p_nota) else '' end || '.');
  return n;
end;
$$;

-- ── Respuesta del proveedor ──────────────────────────────────
create or replace function public.responder_garantia(p_id uuid, p_resultado text, p_detalle text)
returns public.garantias language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); g public.garantias := public.garantia_para_cambiar(p_id); n public.garantias;
begin
  if g.estado not in ('recibida','enviada') then raise exception 'Esta garantía ya tiene respuesta' using errcode = '22023'; end if;
  if p_resultado not in ('reparado','cambio','devolucion','rechazada') then
    raise exception 'Elige el resultado' using errcode = '22023';
  end if;
  update public.garantias set estado = 'respuesta', resultado = p_resultado, respuesta = left(trim(coalesce(p_detalle, '')), 500),
         respuesta_en = now()
  where id = p_id returning * into n;
  perform public.evento_garantia(p_id, yo, 'respuesta', 'Respuesta: '
    || case p_resultado when 'reparado' then 'reparado' when 'cambio' then 'cambio de equipo'
                        when 'devolucion' then 'devolución del dinero' else 'garantía rechazada' end
    || case when n.respuesta <> '' then '. ' || n.respuesta else '' end || '.');
  return n;
end;
$$;

-- ── Entregar al cliente (queda guardada para siempre) ────────
create or replace function public.entregar_garantia(p_id uuid, p_nota text)
returns public.garantias language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); g public.garantias := public.garantia_para_cambiar(p_id); n public.garantias;
begin
  if g.estado <> 'respuesta' then raise exception 'Primero registra la respuesta de la garantía' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_nota, ''))) > 0 then
    perform public.evento_garantia(p_id, yo, 'nota', trim(p_nota));
  end if;
  update public.garantias set estado = 'entregada', entregado_en = now(), entregado_por = yo
  where id = p_id returning * into n;
  perform public.evento_garantia(p_id, yo, 'entregada', 'Entregado al cliente.');
  perform public.anotar('garantia', yo || ' entregó la garantía de ' || public.tipo_garantia_texto(n) || ' a ' || n.cliente);
  return n;
end;
$$;

-- ── Fotos ────────────────────────────────────────────────────
create or replace function public.foto_garantia(p_id uuid, p_ruta text, p_etiqueta text, p_momento text)
returns public.garantia_fotos language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); g public.garantias := public.garantia_para_cambiar(p_id); f public.garantia_fotos;
begin
  if p_ruta not like 'g/' || p_id::text || '/%' then raise exception 'Ruta inválida' using errcode = '22023'; end if;
  insert into public.garantia_fotos (garantia_id, ruta, etiqueta, momento, autor)
  values (p_id, p_ruta, left(coalesce(p_etiqueta, ''), 80), coalesce(nullif(p_momento, ''), 'recibido'), yo)
  returning * into f;
  perform public.evento_garantia(p_id, yo, 'foto', '📷 ' || coalesce(nullif(f.etiqueta, ''), 'Foto'));
  return f;
end;
$$;

-- Las fotos se guardan mientras la garantía está abierta y se borran 30 días después de entregada
create or replace function public.marcar_fotos_garantia_borradas(p_ids uuid[])
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  perform public.requiere_permiso();
  update public.garantia_fotos f set borrada_en = now()
  from public.garantias g
  where f.id = any(p_ids) and f.borrada_en is null and g.id = f.garantia_id
    and g.estado = 'entregada' and g.entregado_en < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'crear_garantia(jsonb)', 'actualizar_garantia(uuid,jsonb)', 'nota_garantia(uuid,text,text)',
    'enviar_garantia(uuid,text,text,text)', 'responder_garantia(uuid,text,text)', 'entregar_garantia(uuid,text)',
    'foto_garantia(uuid,text,text,text)', 'marcar_fotos_garantia_borradas(uuid[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['garantia_para_cambiar(uuid)', 'evento_garantia(uuid,text,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- Tiempo real
do $$
declare t text;
begin
  foreach t in array array['garantias','garantia_eventos','garantia_fotos'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ═════════════════════════════════════════════════════════════
-- 14. GARANTÍAS · PRODUCTOS DEL LOCAL (devoluciones al proveedor)
--    Productos que se prueban en la tienda y no funcionan (celular,
--    bafle, cable, control…): se anota qué es, cuánto costó, en qué
--    local se compró y cuándo, y se devuelven al proveedor.
--    Estados: pendiente (en la tienda) → devuelto (lo tiene el proveedor)
--             → resuelto (cambio, reembolso o rechazado).
--    No se borran; los resueltos no se modifican (solo notas).
-- ═════════════════════════════════════════════════════════════
create table if not exists public.devoluciones (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity unique,
  estado        text not null default 'pendiente' check (estado in ('pendiente','devuelto','resuelto')),
  resultado     text check (resultado in ('cambio','reembolso','rechazado')),
  tipo          text not null default 'otro' check (tipo in ('celular','sonido','cable','control','cargador','audifonos','otro')),
  producto      text not null check (char_length(producto) between 1 and 120),
  cantidad      integer not null default 1 check (cantidad between 1 and 1000),
  costo         integer not null default 0 check (costo between 0 and 50000000),
  proveedor     text not null default '' check (char_length(proveedor) <= 80),
  fecha_compra  date,
  factura       text not null default '' check (char_length(factura) <= 60),
  falla         text not null default '' check (char_length(falla) <= 500),
  devuelto_en   timestamptz,
  devuelto_nota text not null default '' check (char_length(devuelto_nota) <= 200),
  respuesta     text not null default '' check (char_length(respuesta) <= 500),
  resuelto_en   timestamptz,
  creado_en     timestamptz not null default now(),
  creado_por    text not null default ''
);
create index if not exists devoluciones_estado_idx on public.devoluciones (estado, creado_en desc);

create table if not exists public.devolucion_eventos (
  id             bigint generated always as identity primary key,
  devolucion_id  uuid not null references public.devoluciones(id),
  creado_en      timestamptz not null default now(),
  autor          text not null,
  tipo           text not null check (tipo in ('registrado','nota','devuelto','resuelto','foto','edicion')),
  texto          text not null default '' check (char_length(texto) <= 1000)
);
create index if not exists devolucion_eventos_idx on public.devolucion_eventos (devolucion_id, id);

create table if not exists public.devolucion_fotos (
  id             uuid primary key default gen_random_uuid(),
  devolucion_id  uuid not null references public.devoluciones(id),
  ruta           text not null unique,
  etiqueta       text not null default '' check (char_length(etiqueta) <= 80),
  creado_en      timestamptz not null default now(),
  autor          text not null,
  borrada_en     timestamptz
);
create index if not exists devolucion_fotos_idx on public.devolucion_fotos (devolucion_id);

do $$
declare t text;
begin
  foreach t in array array['devoluciones','devolucion_eventos','devolucion_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "leer %s" on public.%I', t, t);
    execute format('create policy "leer %s" on public.%I for select to authenticated using ((select public.es_permitido()))', t, t);
  end loop;
end $$;

create or replace function public.proteger_devoluciones()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Las devoluciones no se pueden borrar' using errcode = '42501'; end if;
  if old.estado = 'resuelto' then raise exception 'Las devoluciones resueltas no se pueden modificar' using errcode = '42501'; end if;
  return new;
end;
$$;
drop trigger if exists devoluciones_proteger on public.devoluciones;
create trigger devoluciones_proteger before update or delete on public.devoluciones
  for each row execute function public.proteger_devoluciones();
drop trigger if exists devolucion_eventos_solo_agregar on public.devolucion_eventos;
create trigger devolucion_eventos_solo_agregar before update or delete on public.devolucion_eventos
  for each row execute function public.solo_agregar();

create or replace function public.devolucion_para_cambiar(p_id uuid)
returns public.devoluciones language plpgsql security definer set search_path = ''
as $$
declare d public.devoluciones;
begin
  select * into d from public.devoluciones where id = p_id for update;
  if d.id is null then raise exception 'La devolución no existe' using errcode = 'P0002'; end if;
  if d.estado = 'resuelto' then raise exception 'Las devoluciones resueltas no se pueden modificar' using errcode = '42501'; end if;
  return d;
end;
$$;

create or replace function public.evento_devolucion(p_id uuid, p_autor text, p_tipo text, p_texto text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.devolucion_eventos (devolucion_id, autor, tipo, texto) values (p_id, p_autor, p_tipo, left(coalesce(p_texto, ''), 1000));
$$;

create or replace function public.crear_devolucion(d jsonb)
returns public.devoluciones language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); n public.devoluciones;
begin
  insert into public.devoluciones (tipo, producto, cantidad, costo, proveedor, fecha_compra, factura, falla, creado_por)
  values (coalesce(nullif(d ->> 'tipo', ''), 'otro'), left(trim(d ->> 'producto'), 120),
          greatest(coalesce((d ->> 'cantidad')::integer, 1), 1), greatest(coalesce((d ->> 'costo')::integer, 0), 0),
          left(trim(coalesce(d ->> 'proveedor', '')), 80), nullif(d ->> 'fecha_compra', '')::date,
          left(coalesce(d ->> 'factura', ''), 60), left(coalesce(d ->> 'falla', ''), 500), yo)
  returning * into n;
  perform public.evento_devolucion(n.id, yo, 'registrado', 'Se registró: ' || coalesce(nullif(n.falla, ''), 'no funciona')
    || '. ' || n.cantidad || ' × ' || public.pesos(n.costo) || case when n.proveedor <> '' then ', comprado en ' || n.proveedor else '' end || '.');
  perform public.anotar('garantia', yo || ' registró para devolver: ' || n.producto
    || case when n.cantidad > 1 then ' (×' || n.cantidad || ')' else '' end);
  return n;
end;
$$;

create or replace function public.actualizar_devolucion(p_id uuid, d jsonb)
returns public.devoluciones language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); a public.devoluciones := public.devolucion_para_cambiar(p_id); n public.devoluciones;
begin
  update public.devoluciones set
    tipo = coalesce(nullif(d ->> 'tipo', ''), tipo),
    producto = coalesce(nullif(left(trim(d ->> 'producto'), 120), ''), producto),
    cantidad = case when d ? 'cantidad' then greatest(coalesce((d ->> 'cantidad')::integer, 1), 1) else cantidad end,
    costo = case when d ? 'costo' then greatest(coalesce((d ->> 'costo')::integer, 0), 0) else costo end,
    proveedor = left(coalesce(d ->> 'proveedor', proveedor), 80),
    fecha_compra = case when d ? 'fecha_compra' then nullif(d ->> 'fecha_compra', '')::date else fecha_compra end,
    factura = left(coalesce(d ->> 'factura', factura), 60),
    falla = left(coalesce(d ->> 'falla', falla), 500)
  where id = p_id returning * into n;
  if n is distinct from a then perform public.evento_devolucion(p_id, yo, 'edicion', 'Se editaron los datos.'); end if;
  return n;
end;
$$;

create or replace function public.nota_devolucion(p_id uuid, p_texto text)
returns void language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso();
begin
  if not exists (select 1 from public.devoluciones where id = p_id) then raise exception 'La devolución no existe' using errcode = 'P0002'; end if;
  if char_length(trim(coalesce(p_texto, ''))) < 2 then raise exception 'Escribe la nota' using errcode = '22023'; end if;
  perform public.evento_devolucion(p_id, yo, 'nota', trim(p_texto));
end;
$$;

create or replace function public.marcar_devuelto(p_id uuid, p_nota text)
returns public.devoluciones language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); a public.devoluciones := public.devolucion_para_cambiar(p_id); n public.devoluciones;
begin
  if a.estado <> 'pendiente' then raise exception 'Ya se devolvió' using errcode = '22023'; end if;
  update public.devoluciones set estado = 'devuelto', devuelto_en = now(), devuelto_nota = left(trim(coalesce(p_nota, '')), 200)
  where id = p_id returning * into n;
  perform public.evento_devolucion(p_id, yo, 'devuelto', 'Se devolvió' || case when n.proveedor <> '' then ' a ' || n.proveedor else '' end
    || case when n.devuelto_nota <> '' then '. ' || n.devuelto_nota else '' end || '.');
  return n;
end;
$$;

create or replace function public.resolver_devolucion(p_id uuid, p_resultado text, p_detalle text)
returns public.devoluciones language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); a public.devoluciones := public.devolucion_para_cambiar(p_id); n public.devoluciones;
begin
  if p_resultado not in ('cambio','reembolso','rechazado') then raise exception 'Elige cómo se resolvió' using errcode = '22023'; end if;
  update public.devoluciones set estado = 'resuelto', resultado = p_resultado, respuesta = left(trim(coalesce(p_detalle, '')), 500),
         resuelto_en = now(), devuelto_en = coalesce(devuelto_en, now())
  where id = p_id returning * into n;
  perform public.evento_devolucion(p_id, yo, 'resuelto', 'Resuelto: '
    || case p_resultado when 'cambio' then 'el proveedor lo cambió' when 'reembolso' then 'el proveedor devolvió el dinero'
       else 'el proveedor no lo aceptó' end || case when n.respuesta <> '' then '. ' || n.respuesta else '' end || '.');
  perform public.anotar('garantia', yo || ' cerró la devolución de ' || n.producto || ': '
    || case p_resultado when 'cambio' then 'cambio' when 'reembolso' then 'reembolso' else 'rechazado' end);
  return n;
end;
$$;

create or replace function public.foto_devolucion(p_id uuid, p_ruta text, p_etiqueta text)
returns public.devolucion_fotos language plpgsql security definer set search_path = ''
as $$
declare yo text := public.requiere_permiso(); a public.devoluciones := public.devolucion_para_cambiar(p_id); f public.devolucion_fotos;
begin
  if p_ruta not like 'd/' || p_id::text || '/%' then raise exception 'Ruta inválida' using errcode = '22023'; end if;
  insert into public.devolucion_fotos (devolucion_id, ruta, etiqueta, autor) values (p_id, p_ruta, left(coalesce(p_etiqueta, ''), 80), yo)
  returning * into f;
  perform public.evento_devolucion(p_id, yo, 'foto', '📷 ' || coalesce(nullif(f.etiqueta, ''), 'Foto'));
  return f;
end;
$$;

-- Fotos: se borran 30 días después de resuelta
create or replace function public.marcar_fotos_devolucion_borradas(p_ids uuid[])
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  perform public.requiere_permiso();
  update public.devolucion_fotos f set borrada_en = now()
  from public.devoluciones d
  where f.id = any(p_ids) and f.borrada_en is null and d.id = f.devolucion_id
    and d.estado = 'resuelto' and d.resuelto_en < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['crear_devolucion(jsonb)', 'actualizar_devolucion(uuid,jsonb)', 'nota_devolucion(uuid,text)',
    'marcar_devuelto(uuid,text)', 'resolver_devolucion(uuid,text,text)', 'foto_devolucion(uuid,text,text)',
    'marcar_fotos_devolucion_borradas(uuid[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['devolucion_para_cambiar(uuid)', 'evento_devolucion(uuid,text,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['devoluciones','devolucion_eventos','devolucion_fotos'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
