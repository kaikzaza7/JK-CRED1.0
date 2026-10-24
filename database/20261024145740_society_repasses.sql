begin;
-- Two fixed partner profiles. A percentage change only affects new receipts.
create table public.jk_society_partners(
 id smallint primary key check(id in (1,2)), name text not null unique check(length(trim(name)) between 2 and 80),
 share_bps integer not null check(share_bps between 0 and 10000), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.jk_society_partners(id,name,share_bps) values(1,'Juan Kelvin',5000),(2,'Kaik Andrade',5000);
create table public.jk_society_settings(
 id boolean primary key default true check(id), version bigint not null default 1 check(version>0),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
insert into public.jk_society_settings(id) values(true);
create table public.jk_society_splits(
 id uuid primary key default gen_random_uuid(), receipt_id uuid not null unique references public.jk_receipts(id),
 base_cents bigint not null check(base_cents>=0), share1_bps integer not null check(share1_bps between 0 and 10000),
 partner1_cents bigint generated always as (round(base_cents::numeric*share1_bps/10000)::bigint) stored,
 partner2_cents bigint generated always as (base_cents-round(base_cents::numeric*share1_bps/10000)::bigint) stored,
 rule_version bigint not null, version bigint not null default 1 check(version>0),
 created_by uuid not null references auth.users(id), updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), adjustment_reason text not null default ''
);
create index jk_society_splits_creator_idx on public.jk_society_splits(created_by);
create index jk_society_splits_updater_idx on public.jk_society_splits(updated_by);
create table public.jk_society_payouts(
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique, partner_id smallint not null references public.jk_society_partners(id),
 amount_cents bigint not null check(amount_cents between 1 and 10000000000000), paid_on date not null,
 method text not null check(method in ('pix','transferencia','dinheiro','outro')), reference text not null default '' check(length(reference)<=160), notes text not null default '' check(length(notes)<=2000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text,
 check((voided_at is null and voided_by is null and void_reason is null) or (voided_at is not null and voided_by is not null and length(trim(void_reason))>=3))
);
create index jk_society_payouts_partner_idx on public.jk_society_payouts(partner_id,paid_on desc);
create index jk_society_payouts_creator_idx on public.jk_society_payouts(created_by);
create index jk_society_payouts_voider_idx on public.jk_society_payouts(voided_by);
create index jk_society_settings_updater_idx on public.jk_society_settings(updated_by);

do $$ declare t text; begin
 foreach t in array array['jk_society_partners','jk_society_settings','jk_society_splits','jk_society_payouts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy admin_read on public.%I for select to authenticated using ((select jk_private.is_admin()))',t);
 end loop;
end $$;

create function jk_private.society_check_partners() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (select count(*) from public.jk_society_partners)<>2 or (select sum(share_bps) from public.jk_society_partners)<>10000 then
  raise exception 'A sociedade deve ter dois sócios e a soma das porcentagens deve ser 100%%.';
 end if;
 return null;
end $$;
create constraint trigger jk_society_partner_total after insert or update or delete on public.jk_society_partners deferrable initially deferred for each row execute function jk_private.society_check_partners();

create function jk_private.society_allocate_receipt(p_receipt_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_receipt public.jk_receipts; v_rule bigint; v_bps integer; v_id uuid;
begin
 perform jk_private.require_admin();
 select version into v_rule from public.jk_society_settings where id for update;
 select share_bps into v_bps from public.jk_society_partners where id=1;
 select * into v_receipt from public.jk_receipts where id=p_receipt_id;
 if not found or v_receipt.voided_at is not null then return null; end if;
 insert into public.jk_society_splits(receipt_id,base_cents,share1_bps,rule_version,created_by)
 values(v_receipt.id,v_receipt.amount_cents,v_bps,v_rule,auth.uid()) on conflict(receipt_id) do nothing returning id into v_id;
 if v_id is not null then
  insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Divisão societária registrada',v_id,jsonb_build_object('receipt_id',v_receipt.id,'base_cents',v_receipt.amount_cents,'share1_bps',v_bps,'rule_version',v_rule));
 else
  select id into v_id from public.jk_society_splits where receipt_id=p_receipt_id;
 end if;
 return v_id;
end $$;

create function jk_private.society_receipt_changed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  perform jk_private.society_allocate_receipt(new.id);
 elsif old.voided_at is distinct from new.voided_at then
  perform jk_private.require_admin();
  perform 1 from public.jk_society_settings where id for update;
 end if;
 return new;
end $$;
create trigger jk_society_receipt_insert after insert on public.jk_receipts for each row execute function jk_private.society_receipt_changed();
create trigger jk_society_receipt_void after update of voided_at on public.jk_receipts for each row execute function jk_private.society_receipt_changed();

create function jk_private.society_configure(p_share1_bps integer,p_expected_version bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare v_version bigint; v_receipt uuid;
begin
 perform jk_private.require_admin();
 select version into v_version from public.jk_society_settings where id for update;
 if p_expected_version is null or p_expected_version<>v_version then raise exception 'A divisão foi alterada em outra sessão. Atualize os dados e tente novamente.'; end if;
 if p_share1_bps is null or p_share1_bps not between 0 and 10000 then raise exception 'As porcentagens devem estar entre 0 e 100 e somar 100%%.'; end if;
 update public.jk_society_partners set share_bps=case when id=1 then p_share1_bps else 10000-p_share1_bps end,updated_at=now();
 update public.jk_society_settings set version=version+1,updated_at=now(),updated_by=auth.uid() where id returning version into v_version;
 for v_receipt in select r.id from public.jk_receipts r left join public.jk_society_splits s on s.receipt_id=r.id where r.voided_at is null and s.id is null order by r.created_at,r.id loop
  perform jk_private.society_allocate_receipt(v_receipt);
 end loop;
 insert into public.jk_events(actor_id,action,details) values(auth.uid(),'Participações societárias atualizadas',jsonb_build_object('share1_bps',p_share1_bps,'share2_bps',10000-p_share1_bps,'version',v_version));
 return v_version;
end $$;

create function jk_private.society_adjust_split(p_receipt_id uuid,p_base_cents bigint,p_share1_bps integer,p_reason text,p_expected_version bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare v_receipt public.jk_receipts; v_split public.jk_society_splits; v_before jsonb;
begin
 perform jk_private.require_admin();
 perform 1 from public.jk_society_settings where id for update;
 select * into v_receipt from public.jk_receipts where id=p_receipt_id;
 if not found or v_receipt.voided_at is not null then raise exception 'Recebimento não encontrado ou estornado.'; end if;
 select * into v_split from public.jk_society_splits where receipt_id=p_receipt_id for update;
 if not found then raise exception 'A divisão deste recebimento ainda não foi gerada. Atualize a regra societária.'; end if;
 if p_expected_version is null or p_expected_version<>v_split.version then raise exception 'Esta divisão foi alterada em outra sessão. Atualize e tente novamente.'; end if;
 if p_base_cents is null or p_base_cents<0 or p_base_cents>v_receipt.amount_cents then raise exception 'O valor destinado aos sócios deve ficar entre zero e o valor recebido.'; end if;
 if p_share1_bps is null or p_share1_bps not between 0 and 10000 then raise exception 'A soma das porcentagens deve ser 100%%.'; end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>2000 then raise exception 'Informe um motivo de 3 a 2000 caracteres.'; end if;
 v_before=jsonb_build_object('base_cents',v_split.base_cents,'share1_bps',v_split.share1_bps,'partner1_cents',v_split.partner1_cents,'partner2_cents',v_split.partner2_cents,'version',v_split.version);
 update public.jk_society_splits set base_cents=p_base_cents,share1_bps=p_share1_bps,version=version+1,updated_at=now(),updated_by=auth.uid(),adjustment_reason=trim(p_reason) where id=v_split.id;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Divisão societária ajustada',v_split.id,jsonb_build_object('receipt_id',p_receipt_id,'reason',trim(p_reason),'before',v_before,'after',jsonb_build_object('base_cents',p_base_cents,'share1_bps',p_share1_bps,'version',v_split.version+1)));
 return v_split.id;
end $$;

create function jk_private.society_balance(p_partner_id smallint) returns bigint language sql security invoker set search_path='' as $$
 select coalesce((select sum(case when p_partner_id=1 then s.partner1_cents else s.partner2_cents end) from public.jk_society_splits s join public.jk_receipts r on r.id=s.receipt_id where r.voided_at is null),0)::bigint
 -coalesce((select sum(p.amount_cents) from public.jk_society_payouts p where p.partner_id=p_partner_id and p.voided_at is null),0)::bigint;
$$;
create function jk_private.society_record_payout(p_partner_id smallint,p_amount_cents bigint,p_paid_on date,p_method text,p_reference text,p_notes text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_balance bigint; v_existing public.jk_society_payouts; v_id uuid;
begin
 perform jk_private.require_admin();
 perform 1 from public.jk_society_settings where id for update;
 if p_request_id is null then raise exception 'Identificador do repasse obrigatório.'; end if;
 select * into v_existing from public.jk_society_payouts where request_id=p_request_id;
 if found then
  if v_existing.partner_id<>p_partner_id or v_existing.amount_cents<>p_amount_cents or v_existing.paid_on<>p_paid_on or v_existing.method<>p_method then raise exception 'Esta operação já foi registrada com outros dados.'; end if;
  return v_existing.id;
 end if;
 if p_partner_id is null or p_partner_id not in (1,2) then raise exception 'Selecione Juan Kelvin ou Kaik Andrade.'; end if;
 if p_amount_cents is null or p_amount_cents not between 1 and 10000000000000 then raise exception 'Informe um valor de repasse válido.'; end if;
 if p_paid_on is null or p_paid_on>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data do repasse não pode ser futura.'; end if;
 if p_method is null or p_method not in ('pix','transferencia','dinheiro','outro') then raise exception 'Selecione a forma do repasse.'; end if;
 if length(coalesce(p_reference,''))>160 or length(coalesce(p_notes,''))>2000 then raise exception 'Referência ou observação muito longa.'; end if;
 v_balance=jk_private.society_balance(p_partner_id);
 if p_amount_cents>v_balance then raise exception 'O repasse não pode superar o saldo disponível do sócio. Atualize os dados e confira os recebimentos.'; end if;
 insert into public.jk_society_payouts(request_id,partner_id,amount_cents,paid_on,method,reference,notes,created_by) values(p_request_id,p_partner_id,p_amount_cents,p_paid_on,p_method,trim(coalesce(p_reference,'')),trim(coalesce(p_notes,'')),auth.uid()) returning id into v_id;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Repasse ao sócio registrado',v_id,jsonb_build_object('partner_id',p_partner_id,'amount_cents',p_amount_cents));
 return v_id;
end $$;
create function jk_private.society_reverse_payout(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform jk_private.require_admin();
 perform 1 from public.jk_society_settings where id for update;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>2000 then raise exception 'Informe o motivo do estorno, de 3 a 2000 caracteres.'; end if;
 update public.jk_society_payouts set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=p_id and voided_at is null;
 if not found then raise exception 'Repasse não encontrado ou já estornado.'; end if;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Repasse ao sócio estornado',p_id,jsonb_build_object('reason',trim(p_reason)));
end $$;

-- All mutation functions remain private and are reachable only through the token-checked gateway.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='jk_private' and p.proname like 'society_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;

create or replace function jk_private.gateway(p_token text,p_action text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_result jsonb; v_table text; v_from integer;
begin
 select actor_id into v_actor from jk_private.server_config where id and token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex');
 if v_actor is null or not exists(select 1 from public.admin_users where user_id=v_actor) then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 perform jk_private.require_admin();
 case p_action
 when 'load_table' then
 v_table=p_args->>'table'; v_from=coalesce((p_args->>'from')::integer,0);
 if v_table not in ('jk_clients','jk_loans','jk_installments','jk_receipts','jk_preferences','jk_events','jk_society_partners','jk_society_settings','jk_society_splits','jk_society_payouts') or v_from<0 then raise exception 'Consulta inválida.'; end if;
 execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from (select * from public.%I order by id limit 500 offset $1) t',v_table) into v_result using v_from;
 return v_result;
 when 'jk_save_client' then return to_jsonb(jk_private.save_client(p_args->'p_data',(p_args->>'p_id')::uuid));
 when 'jk_create_adhesion' then return to_jsonb(jk_private.create_adhesion(p_args->'p_client',(p_args->>'p_client_id')::uuid,p_args->'p_loan',(p_args->>'p_request_id')::uuid));
 when 'jk_record_payment' then return to_jsonb(jk_private.record_payment((p_args->>'p_installment_id')::uuid,(p_args->>'p_amount_cents')::bigint,(p_args->>'p_paid_on')::date,p_args->>'p_method',p_args->>'p_notes',(p_args->>'p_request_id')::uuid));
 when 'jk_reverse_payment' then perform jk_private.reverse_payment((p_args->>'p_id')::uuid,p_args->>'p_reason'); return 'true'::jsonb;
 when 'jk_change_loan' then perform jk_private.change_loan((p_args->>'p_id')::uuid,p_args->>'p_action',p_args->'p_dates',p_args->>'p_reason'); return 'true'::jsonb;
 when 'jk_save_preferences' then perform jk_private.save_preferences(p_args->'p_data'); return 'true'::jsonb;
 when 'jk_society_configure' then return to_jsonb(jk_private.society_configure((p_args->>'p_share1_bps')::integer,(p_args->>'p_expected_version')::bigint));
 when 'jk_society_adjust_split' then return to_jsonb(jk_private.society_adjust_split((p_args->>'p_receipt_id')::uuid,(p_args->>'p_base_cents')::bigint,(p_args->>'p_share1_bps')::integer,p_args->>'p_reason',(p_args->>'p_expected_version')::bigint));
 when 'jk_society_record_payout' then return to_jsonb(jk_private.society_record_payout((p_args->>'p_partner_id')::smallint,(p_args->>'p_amount_cents')::bigint,(p_args->>'p_paid_on')::date,p_args->>'p_method',p_args->>'p_reference',p_args->>'p_notes',(p_args->>'p_request_id')::uuid));
 when 'jk_society_reverse_payout' then perform jk_private.society_reverse_payout((p_args->>'p_id')::uuid,p_args->>'p_reason'); return 'true'::jsonb;
 else raise exception 'Operação inválida.';
 end case;
end $$;

-- Cover receipts that predate the feature without changing the original receipt rows.
do $$ declare v_actor uuid; v_receipt uuid; begin
 if exists(select 1 from public.jk_receipts where voided_at is null) then
  select actor_id into v_actor from jk_private.server_config where id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  for v_receipt in select r.id from public.jk_receipts r left join public.jk_society_splits s on s.receipt_id=r.id where r.voided_at is null and s.id is null order by r.created_at,r.id loop
   perform jk_private.society_allocate_receipt(v_receipt);
  end loop;
 end if;
end $$;
commit;
