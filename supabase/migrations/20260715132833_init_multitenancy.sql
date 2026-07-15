-- Multi-tenant foundation: organizations, memberships, invitations, customers.
--
-- RLS is the tenant-isolation boundary (ADR 0005, docs/specs/2026-07-15-multi-tenancy.md):
--   * Reads are scoped to Organizations the caller is a Member of.
--   * Writes additionally require the caller's Org Role.
--   * A global Platform Role (superadmin, from auth app_metadata) transcends orgs.
--   * A forged/stale Active-Organization value can never cross tenants, because
--     these policies check membership/role in Postgres regardless of any cookie.
--
-- Posture is deny-by-default: RLS is enabled on every table and only the policies
-- below grant access. The `authenticated` role's table privileges come from
-- Supabase's standard default privileges; row access is governed entirely by RLS.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

create type public.org_role as enum ('owner', 'admin', 'member');
create type public.customer_status as enum ('active', 'blocked', 'pending');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_role not null default 'member',
  token text not null unique,
  status text not null default 'pending',
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  email text not null,
  company text not null,
  status public.customer_status not null default 'active',
  created_at timestamptz not null default now()
);

-- Foreign-key lookup indexes (the unique(organization_id, user_id) already
-- indexes memberships by organization_id).
create index memberships_user_id_idx on public.memberships (user_id);
create index invitations_organization_id_idx on public.invitations (organization_id);
create index customers_organization_id_idx on public.customers (organization_id);

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER helpers
--
-- These run as the function owner, which bypasses RLS. That is deliberate: the
-- membership/role checks below are called *from* the memberships RLS policies,
-- so querying memberships as the caller would recurse infinitely. search_path is
-- pinned to '' and every object is schema-qualified to prevent hijacking.
-- ---------------------------------------------------------------------------

create function public.is_org_member(org uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
  );
$$;

create function public.has_org_role(org uuid, variadic roles public.org_role[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role = any (roles)
  );
$$;

create function public.is_platform_superadmin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin',
    false
  );
$$;

-- Bootstraps an Organization: creates it AND the caller's owner Membership in one
-- transaction, sidestepping the memberships-insert chicken-and-egg (the first
-- membership must exist before the owner/admin insert policy would allow it).
create function public.create_organization(p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.organizations (name)
  values (p_name)
  returning * into v_org;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org.id, v_uid, 'owner');

  return v_org;
end;
$$;

-- Only authenticated callers may execute these (revoke the implicit PUBLIC grant).
revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.has_org_role(uuid, public.org_role[]) from public;
revoke execute on function public.is_platform_superadmin() from public;
revoke execute on function public.create_organization(text) from public;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function public.is_platform_superadmin() to authenticated;
grant execute on function public.create_organization(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.customers enable row level security;

-- organizations: members read; any authenticated user may create (the RPC is the
-- intended path, but a bare insert is allowed); only owners mutate.
create policy "organizations_select_members"
  on public.organizations for select to authenticated
  using (public.is_org_member(id) or public.is_platform_superadmin());

create policy "organizations_insert_authenticated"
  on public.organizations for insert to authenticated
  with check (true);

create policy "organizations_update_owner"
  on public.organizations for update to authenticated
  using (public.has_org_role(id, 'owner') or public.is_platform_superadmin())
  with check (public.has_org_role(id, 'owner') or public.is_platform_superadmin());

create policy "organizations_delete_owner"
  on public.organizations for delete to authenticated
  using (public.has_org_role(id, 'owner') or public.is_platform_superadmin());

-- memberships: members read; owners/admins manage.
create policy "memberships_select_members"
  on public.memberships for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_superadmin());

create policy "memberships_insert_admin"
  on public.memberships for insert to authenticated
  with check (public.has_org_role(organization_id, 'owner', 'admin') or public.is_platform_superadmin());

create policy "memberships_update_admin"
  on public.memberships for update to authenticated
  using (public.has_org_role(organization_id, 'owner', 'admin') or public.is_platform_superadmin())
  with check (public.has_org_role(organization_id, 'owner', 'admin') or public.is_platform_superadmin());

create policy "memberships_delete_admin"
  on public.memberships for delete to authenticated
  using (public.has_org_role(organization_id, 'owner', 'admin') or public.is_platform_superadmin());

-- invitations: owners/admins manage everything.
create policy "invitations_all_admin"
  on public.invitations for all to authenticated
  using (public.has_org_role(organization_id, 'owner', 'admin') or public.is_platform_superadmin())
  with check (public.has_org_role(organization_id, 'owner', 'admin') or public.is_platform_superadmin());

-- customers: members read; owners/admins write.
create policy "customers_select_members"
  on public.customers for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_superadmin());

create policy "customers_insert_admin"
  on public.customers for insert to authenticated
  with check (public.has_org_role(organization_id, 'admin', 'owner') or public.is_platform_superadmin());

create policy "customers_update_admin"
  on public.customers for update to authenticated
  using (public.has_org_role(organization_id, 'admin', 'owner') or public.is_platform_superadmin())
  with check (public.has_org_role(organization_id, 'admin', 'owner') or public.is_platform_superadmin());

create policy "customers_delete_admin"
  on public.customers for delete to authenticated
  using (public.has_org_role(organization_id, 'admin', 'owner') or public.is_platform_superadmin());
