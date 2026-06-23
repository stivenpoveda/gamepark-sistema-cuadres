-- MODULO ADMIN BANCOS / ROL TESORERIA
-- Ejecuta este script completo en el SQL Editor de Supabase.

create extension if not exists pgcrypto;

do $$
declare
  role_constraint_name text;
begin
  select con.conname
  into role_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'usuarios'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%rol%';

  if role_constraint_name is not null then
    execute format('alter table usuarios drop constraint %I', role_constraint_name);
  end if;
end $$;

alter table usuarios
add constraint usuarios_rol_check
check (rol in ('superadmin', 'superadministrador', 'admin_pdv', 'contabilidad', 'tesoreria'));

create table if not exists categorias_financieras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('ingreso', 'egreso', 'ambos')),
  descripcion text null,
  activa boolean not null default true,
  es_sistema boolean not null default false,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cuentas_financieras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  banco text not null,
  titular text null,
  numero_cuenta text null,
  tipo_cuenta text null,
  tipo_entidad text not null default 'bancaria' check (tipo_entidad in ('bancaria', 'caja', 'fondo', 'efectivo', 'billetera')),
  saldo_inicial numeric(14,2) not null default 0,
  estado text not null default 'activa' check (estado in ('activa', 'inactiva')),
  descripcion text null,
  created_by text null,
  updated_by text null,
  deleted_by text null,
  deleted_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table cuentas_financieras add column if not exists titular text null;

create table if not exists movimientos_financieros (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas_financieras(id),
  tipo_movimiento text not null check (tipo_movimiento in ('ingreso', 'egreso', 'transferencia_entrada', 'transferencia_salida', 'cuadre_aprobado')),
  categoria_id uuid null references categorias_financieras(id),
  descripcion text not null,
  fecha_movimiento date not null,
  valor numeric(14,2) not null check (valor > 0),
  pdv_id uuid null references puntos_de_venta(id),
  centro_costo text null,
  soporte_url text null,
  cuenta_contraparte_id uuid null references cuentas_financieras(id),
  transferencia_grupo_id uuid null,
  cuadre_id uuid null references cuadres_diarios(id),
  origen text not null default 'manual' check (origen in ('manual', 'transferencia', 'cuadre_aprobado', 'historico')),
  metadata jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_by text null,
  updated_by text null,
  deleted_by text null,
  deleted_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists movimientos_financieros_historial (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references movimientos_financieros(id),
  accion text not null check (accion in ('insert', 'update', 'soft_delete', 'restore')),
  previous_data jsonb null,
  next_data jsonb null,
  actor_id text null,
  actor_email text null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table cuadres_diarios add column if not exists cuenta_financiera_destino_id uuid null references cuentas_financieras(id);
alter table cuadres_diarios add column if not exists movimiento_financiero_sync_id uuid null references movimientos_financieros(id);

create index if not exists idx_movimientos_financieros_cuenta_fecha on movimientos_financieros(cuenta_id, fecha_movimiento, created_at);
create index if not exists idx_movimientos_financieros_pdv on movimientos_financieros(pdv_id);
create index if not exists idx_movimientos_financieros_categoria on movimientos_financieros(categoria_id);
create index if not exists idx_movimientos_financieros_transferencia on movimientos_financieros(transferencia_grupo_id);
create index if not exists idx_movimientos_financieros_cuadre on movimientos_financieros(cuadre_id);
create index if not exists idx_cuadres_diarios_cuenta_financiera on cuadres_diarios(cuenta_financiera_destino_id);

create or replace function set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_timestamp_categorias_financieras on categorias_financieras;
create trigger set_timestamp_categorias_financieras
before update on categorias_financieras
for each row execute function set_timestamp_updated_at();

drop trigger if exists set_timestamp_cuentas_financieras on cuentas_financieras;
create trigger set_timestamp_cuentas_financieras
before update on cuentas_financieras
for each row execute function set_timestamp_updated_at();

drop trigger if exists set_timestamp_movimientos_financieros on movimientos_financieros;
create trigger set_timestamp_movimientos_financieros
before update on movimientos_financieros
for each row execute function set_timestamp_updated_at();

create or replace function audit_movimientos_financieros()
returns trigger
language plpgsql
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    audit_action := 'insert';
    insert into movimientos_financieros_historial (
      movimiento_id,
      accion,
      previous_data,
      next_data,
      actor_id
    )
    values (
      new.id,
      audit_action,
      null,
      to_jsonb(new),
      new.created_by
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.activo = true and new.activo = false then
      audit_action := 'soft_delete';
    elsif old.activo = false and new.activo = true then
      audit_action := 'restore';
    else
      audit_action := 'update';
    end if;

    insert into movimientos_financieros_historial (
      movimiento_id,
      accion,
      previous_data,
      next_data,
      actor_id
    )
    values (
      new.id,
      audit_action,
      to_jsonb(old),
      to_jsonb(new),
      coalesce(new.updated_by, new.created_by)
    );

    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists tr_audit_movimientos_financieros on movimientos_financieros;
create trigger tr_audit_movimientos_financieros
after insert or update on movimientos_financieros
for each row execute function audit_movimientos_financieros();

insert into categorias_financieras (nombre, tipo, activa, es_sistema)
values
  ('Arriendo', 'egreso', true, true),
  ('Administracion', 'egreso', true, true),
  ('Nomina', 'egreso', true, true),
  ('Servicios Publicos', 'egreso', true, true),
  ('Publicidad', 'egreso', true, true),
  ('Mantenimiento', 'egreso', true, true),
  ('Impuestos', 'egreso', true, true),
  ('Compras', 'egreso', true, true),
  ('Transporte', 'egreso', true, true),
  ('Otros', 'ambos', true, true)
on conflict (nombre) do nothing;

insert into cuentas_financieras (
  nombre,
  banco,
  titular,
  numero_cuenta,
  tipo_cuenta,
  tipo_entidad,
  saldo_inicial,
  estado,
  descripcion
)
values
  ('Bancolombia Corriente 20260566437', 'Bancolombia', 'DIVERSIONES DE COLOMBIA', '20260566437', 'Corriente', 'bancaria', 0, 'activa', 'Cuenta base importada para DIVERSIONES DE COLOMBIA'),
  ('Bancolombia Ahorros 20125684512', 'Bancolombia', 'DIVERSIONES DE COLOMBIA', '20125684512', 'Ahorros', 'bancaria', 0, 'activa', 'Cuenta base importada para DIVERSIONES DE COLOMBIA'),
  ('Bancolombia Ahorros 65663758696', 'Bancolombia', 'DIVERSIONES DE COLOMBIA', '65663758696', 'Ahorros', 'bancaria', 0, 'activa', 'Cuenta base importada para DIVERSIONES DE COLOMBIA'),
  ('Banco Bogota Corriente 223493834', 'Banco Bogota', 'DIVERSIONES DE COLOMBIA', '223493834', 'Corriente', 'bancaria', 0, 'activa', 'Cuenta base importada para DIVERSIONES DE COLOMBIA'),
  ('Banco Bogota Ahorros 657000972', 'Banco Bogota', 'DIVERSIONES DE COLOMBIA', '657000972', 'Ahorros', 'bancaria', 0, 'activa', 'Cuenta base importada para DIVERSIONES DE COLOMBIA'),
  ('Davivienda Corriente 2669997203', 'Davivienda', 'DIVERSIONES DE COLOMBIA', '2669997203', 'Corriente', 'bancaria', 0, 'activa', 'Cuenta base importada para DIVERSIONES DE COLOMBIA'),
  ('Davivienda Ahorros 260012-5575', 'Davivienda', 'DIVERSIONES DE COLOMBIA', '260012-5575', 'Ahorros', 'bancaria', 0, 'activa', 'Cuenta base importada para DIVERSIONES DE COLOMBIA'),
  ('B. occidente Corriente 22584-6112', 'B. occidente', 'DIVERSIONES DE COLOMBIA', '22584-6112', 'Corriente', 'bancaria', 0, 'activa', 'Cuenta base importada para DIVERSIONES DE COLOMBIA'),
  ('Banco Bogota Ahorros 14207-6025', 'Banco Bogota', 'DAVID ARIAS', '14207-6025', 'Ahorros', 'bancaria', 0, 'activa', 'Cuenta base importada para DAVID ARIAS'),
  ('Bancolombia Ahorros 5142201-8682', 'Bancolombia', 'DAVID ARIAS', '5142201-8682', 'Ahorros', 'bancaria', 0, 'activa', 'Cuenta base importada para DAVID ARIAS'),
  ('Davivienda Ahorros 17977000-1354', 'Davivienda', 'DAVID ARIAS', '17977000-1354', 'Ahorros', 'bancaria', 0, 'activa', 'Cuenta base importada para DAVID ARIAS'),
  ('Caja Menor', 'Interno', 'DIVERSIONES DE COLOMBIA', null, 'Caja', 'caja', 0, 'activa', 'Caja menor operativa'),
  ('Efectivo General', 'Interno', 'DIVERSIONES DE COLOMBIA', null, 'Efectivo', 'efectivo', 0, 'activa', 'Fondo general de efectivo')
on conflict (nombre) do nothing;

update cuentas_financieras set titular = 'DIVERSIONES DE COLOMBIA' where nombre in (
  'Bancolombia Corriente 20260566437',
  'Bancolombia Ahorros 20125684512',
  'Bancolombia Ahorros 65663758696',
  'Banco Bogota Corriente 223493834',
  'Banco Bogota Ahorros 657000972',
  'Davivienda Corriente 2669997203',
  'Davivienda Ahorros 260012-5575',
  'B. occidente Corriente 22584-6112',
  'Caja Menor',
  'Efectivo General'
);

update cuentas_financieras set titular = 'DAVID ARIAS' where nombre in (
  'Banco Bogota Ahorros 14207-6025',
  'Bancolombia Ahorros 5142201-8682',
  'Davivienda Ahorros 17977000-1354'
);

delete from cuentas_financieras
where nombre = 'Nequi Empresarial'
  and not exists (
    select 1
    from movimientos_financieros
    where movimientos_financieros.cuenta_id = cuentas_financieras.id
  );

alter table categorias_financieras enable row level security;
alter table cuentas_financieras enable row level security;
alter table movimientos_financieros enable row level security;
alter table movimientos_financieros_historial enable row level security;

drop policy if exists "Admin Bancos pueden ver categorias" on categorias_financieras;
create policy "Admin Bancos pueden ver categorias"
on categorias_financieras for select
using (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden crear categorias" on categorias_financieras;
create policy "Admin Bancos pueden crear categorias"
on categorias_financieras for insert
with check (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden actualizar categorias" on categorias_financieras;
create policy "Admin Bancos pueden actualizar categorias"
on categorias_financieras for update
using (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden ver cuentas" on cuentas_financieras;
create policy "Admin Bancos pueden ver cuentas"
on cuentas_financieras for select
using (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden crear cuentas" on cuentas_financieras;
create policy "Admin Bancos pueden crear cuentas"
on cuentas_financieras for insert
with check (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden actualizar cuentas" on cuentas_financieras;
create policy "Admin Bancos pueden actualizar cuentas"
on cuentas_financieras for update
using (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden ver movimientos" on movimientos_financieros;
create policy "Admin Bancos pueden ver movimientos"
on movimientos_financieros for select
using (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden crear movimientos" on movimientos_financieros;
create policy "Admin Bancos pueden crear movimientos"
on movimientos_financieros for insert
with check (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden actualizar movimientos" on movimientos_financieros;
create policy "Admin Bancos pueden actualizar movimientos"
on movimientos_financieros for update
using (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Admin Bancos pueden ver auditoria financiera" on movimientos_financieros_historial;
create policy "Admin Bancos pueden ver auditoria financiera"
on movimientos_financieros_historial for select
using (
  exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('tesoreria')
  )
);

drop policy if exists "Usuarios pueden ver sus cuadres" on cuadres_diarios;
create policy "Usuarios pueden ver sus cuadres"
on cuadres_diarios for select
using (
  usuario_id::uuid = auth.uid()
  or exists (
    select 1
    from usuarios
    where id::uuid = auth.uid()
      and rol in ('superadmin', 'superadministrador', 'contabilidad', 'tesoreria')
  )
);

drop policy if exists "Usuarios pueden ver sus propios datos" on usuarios;
create policy "Usuarios pueden ver sus propios datos"
on usuarios for select
using (
  id::uuid = auth.uid()
  or exists (
    select 1
    from usuarios as actor
    where actor.id::uuid = auth.uid()
      and actor.rol in ('superadmin', 'superadministrador')
  )
);
