-- Pega este script completo en Supabase → SQL Editor → New query → Run

create table if not exists registros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  nombre_marca text not null,
  canal_contacto text not null default 'whatsapp'
    check (canal_contacto in ('whatsapp', 'llamada', 'correo', 'instagram', 'otro')),
  etapa text not null default 'interesado'
    check (etapa in ('interesado', 'pago', 'etapa1', 'etapa2', 'etapa3', 'etapa4')),
  pago_estado boolean not null default false,
  necesita_factura boolean not null default false,
  ultima_reunion date,
  ultimo_pago date,
  ultimo_contacto date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table registros enable row level security;

create policy "Los usuarios ven solo sus registros"
  on registros for select
  using (auth.uid() = user_id);

create policy "Los usuarios crean solo sus registros"
  on registros for insert
  with check (auth.uid() = user_id);

create policy "Los usuarios actualizan solo sus registros"
  on registros for update
  using (auth.uid() = user_id);

create policy "Los usuarios borran solo sus registros"
  on registros for delete
  using (auth.uid() = user_id);

-- Mantiene updated_at al día en cada edición
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger registros_set_updated_at
  before update on registros
  for each row
  execute function set_updated_at();

-- Habilita Realtime para esta tabla (sincronización entre dispositivos)
alter publication supabase_realtime add table registros;
