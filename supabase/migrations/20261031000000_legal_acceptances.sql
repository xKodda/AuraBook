-- AuraBook · Registro de aceptación de documentos legales
-- Aditiva y no destructiva. Guarda qué versión de cada documento aceptó cada usuario y cuándo.
-- Se escribe solo desde el servidor (service_role) al registrarse; el usuario puede leer las suyas.

create table if not exists public.legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null check (document in ('terminos', 'privacidad', 'tratamiento-datos')),
  version text not null check (length(version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  primary key (user_id, document, version)
);

alter table public.legal_acceptances enable row level security;
revoke all on table public.legal_acceptances from anon, authenticated;

create policy self_legal_acceptances on public.legal_acceptances for select to authenticated
  using (user_id = auth.uid());
grant select on table public.legal_acceptances to authenticated;
