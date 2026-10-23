-- JK CRED internal panel. Additive migration: existing customer application is preserved.
begin;
create schema if not exists jk_private;
revoke all on schema jk_private from public;
grant usage on schema jk_private to authenticated;
create or replace function jk_private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.admin_users where user_id=auth.uid());
$$;
revoke all on function jk_private.is_admin() from public,anon;
grant execute on function jk_private.is_admin() to authenticated;
create table public.jk_clients(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 3 and 160),
 cpf text not null unique check(public.is_valid_cpf(cpf)), phone text not null check(phone ~ '^\+55[1-9][0-9][0-9]{8,9}$'),
 email text not null default '', birth_date date check(birth_date <= current_date), cep text not null default '' check(cep='' or cep ~ '^[0-9]{8}$'),
 street text not null default '', number text not null default '', complement text not null default '', district text not null default '', city text not null default '', state text not null default '' check(state='' or state ~ '^[A-Z]{2}$'),
 notes text not null default '', archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.jk_loans(
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.jk_clients(id), request_id uuid not null unique,
 protocol text not null unique default ('JK-'||to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 principal_cents bigint not null check(principal_cents between 1 and 10000000000), rate_bps integer not null check(rate_bps between 0 and 100000),
 interest_cents bigint not null check(interest_cents>=0), fee_cents bigint not null check(fee_cents>=0), count integer not null check(count between 1 and 120),
 total_cents bigint not null check(total_cents>0), released_on date not null, status text not null default 'active' check(status in ('active','cancelled')),
 notes text not null default '', created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(total_cents=principal_cents+interest_cents+fee_cents*(count-1))
);
create index jk_loans_client_idx on public.jk_loans(client_id);
create table public.jk_installments(
 id uuid primary key default gen_random_uuid(), loan_id uuid not null references public.jk_loans(id), number integer not null check(number>0), due_on date not null,
 amount_cents bigint not null check(amount_cents>0), unique(loan_id,number)
);
create index jk_installments_due_idx on public.jk_installments(due_on);
create table public.jk_receipts(
 id uuid primary key default gen_random_uuid(), installment_id uuid not null references public.jk_installments(id), request_id uuid not null unique,
 amount_cents bigint not null check(amount_cents>0), paid_on date not null, method text not null check(method in ('pix','dinheiro','transferencia','outro')),
 notes text not null default '', created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text
);
create index jk_receipts_installment_idx on public.jk_receipts(installment_id);
create index jk_receipts_paid_idx on public.jk_receipts(paid_on) where voided_at is null;
create table public.jk_events(
 id bigint generated always as identity primary key, actor_id uuid references auth.users(id), action text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index jk_events_time_idx on public.jk_events(created_at desc);
create table public.jk_preferences(
 id boolean primary key default true check(id), default_rate_bps integer not null default 3000 check(default_rate_bps between 0 and 100000),
 default_fee_cents bigint not null default 1000 check(default_fee_cents between 0 and 100000000), due_window integer not null default 7 check(due_window between 1 and 90),
 message_template text not null default '', updated_at timestamptz not null default now()
);
insert into public.jk_preferences(id) values(true);
-- Existing profiles are copied as contacts, without changing accounts or legacy tables.
insert into public.jk_clients(id,name,cpf,phone,email,cep,street,number,complement,district,city,state)
 select id,full_name,trim(cpf),'+55'||phone,email,trim(cep),street,number,coalesce(complement,''),district,city,trim(state) from public.profiles
 on conflict(cpf) do nothing;
do $$ declare t text; begin
 foreach t in array array['jk_clients','jk_loans','jk_installments','jk_receipts','jk_events','jk_preferences'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy admin_read on public.%I for select to authenticated using ((select jk_private.is_admin()))',t);
 end loop;
end $$;
create or replace function jk_private.require_admin() returns void language plpgsql security invoker set search_path='' as $$
 begin if not jk_private.is_admin() then raise exception 'Acesso exclusivo para administradores.' using errcode='42501'; end if; end;
$$;
create or replace function jk_private.save_client(p_data jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform jk_private.require_admin();
 if p_id is null then
 insert into public.jk_clients(name,cpf,phone,email,birth_date,cep,street,number,complement,district,city,state,notes)
 values(trim(p_data->>'name'),regexp_replace(p_data->>'cpf','\D','','g'),p_data->>'phone',coalesce(p_data->>'email',''),nullif(p_data->>'birth_date','')::date,coalesce(p_data->>'cep',''),coalesce(p_data->>'street',''),coalesce(p_data->>'number',''),coalesce(p_data->>'complement',''),coalesce(p_data->>'district',''),coalesce(p_data->>'city',''),upper(coalesce(p_data->>'state','')),coalesce(p_data->>'notes','')) returning id into v_id;
 else
 update public.jk_clients set name=trim(p_data->>'name'),cpf=regexp_replace(p_data->>'cpf','\D','','g'),phone=p_data->>'phone',email=coalesce(p_data->>'email',''),birth_date=nullif(p_data->>'birth_date','')::date,cep=coalesce(p_data->>'cep',''),street=coalesce(p_data->>'street',''),number=coalesce(p_data->>'number',''),complement=coalesce(p_data->>'complement',''),district=coalesce(p_data->>'district',''),city=coalesce(p_data->>'city',''),state=upper(coalesce(p_data->>'state','')),notes=coalesce(p_data->>'notes',''),archived=coalesce((p_data->>'archived')::boolean,false),updated_at=now() where id=p_id returning id into v_id;
 if v_id is null then raise exception 'Cliente não encontrado.'; end if;
 end if;
 insert into public.jk_events(actor_id,action,entity_id) values(auth.uid(),case when p_id is null then 'Cliente cadastrado' else 'Cliente atualizado' end,v_id);
 return v_id;
end $$;
create or replace function jk_private.create_adhesion(p_client jsonb,p_client_id uuid,p_loan jsonb,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_client uuid; v_id uuid; v_principal bigint; v_rate integer; v_fee bigint; v_count integer; v_interest bigint; v_total bigint; v_base bigint; v_dates jsonb; v_release date; v_date date; v_prev date; i integer;
begin
 perform jk_private.require_admin();
 if p_request_id is null then raise exception 'Identificador da operação obrigatório.'; end if;
 select id into v_id from public.jk_loans where request_id=p_request_id;
 if v_id is not null then return v_id; end if;
 v_client=p_client_id;
 if v_client is null then v_client=jk_private.save_client(p_client,null); end if;
 if not exists(select 1 from public.jk_clients where id=v_client and not archived) then raise exception 'Selecione um cliente ativo.'; end if;
 v_principal=(p_loan->>'principal_cents')::bigint; v_rate=(p_loan->>'rate_bps')::integer; v_fee=(p_loan->>'fee_cents')::bigint;
 v_dates=p_loan->'dates'; v_count=jsonb_array_length(v_dates); v_release=(p_loan->>'released_on')::date;
 if v_count not between 1 and 120 or v_principal not between 1 and 10000000000 or v_rate not between 0 and 100000 or v_fee not between 0 and 100000000 then raise exception 'Valores fora dos limites permitidos.'; end if;
 if v_release>current_date then raise exception 'A liberação não pode ser futura.'; end if;
 v_interest=round(v_principal::numeric*v_rate/10000); v_total=v_principal+v_interest+v_fee*(v_count-1); v_base=v_total/v_count;
 if v_base<1 then raise exception 'Valor insuficiente para a quantidade de parcelas.'; end if;
 insert into public.jk_loans(client_id,request_id,principal_cents,rate_bps,interest_cents,fee_cents,count,total_cents,released_on,notes,created_by)
 values(v_client,p_request_id,v_principal,v_rate,v_interest,v_fee,v_count,v_total,v_release,coalesce(p_loan->>'notes',''),auth.uid()) returning id into v_id;
 v_prev=v_release;
 for i in 0..v_count-1 loop
 v_date=(v_dates->>i)::date;
 if v_date is null or (i=0 and v_date<v_release) or (i>0 and v_date<=v_prev) then raise exception 'As datas devem estar em ordem crescente, a partir da liberação.'; end if;
 insert into public.jk_installments(loan_id,number,due_on,amount_cents) values(v_id,i+1,v_date,case when i=v_count-1 then v_total-v_base*(v_count-1) else v_base end);
 v_prev=v_date;
 end loop;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Adesão registrada',v_id,jsonb_build_object('total_cents',v_total));
 return v_id;
end $$;
create or replace function jk_private.record_payment(p_installment_id uuid,p_amount_cents bigint,p_paid_on date,p_method text,p_notes text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_item public.jk_installments; v_paid bigint; v_id uuid; v_status text;
begin
 perform jk_private.require_admin();
 select id into v_id from public.jk_receipts where request_id=p_request_id; if v_id is not null then return v_id; end if;
 select i.* into v_item from public.jk_installments i where id=p_installment_id for update;
 if not found then raise exception 'Parcela não encontrada.'; end if;
 select status into v_status from public.jk_loans where id=v_item.loan_id for update;
 if v_status<>'active' then raise exception 'Contrato cancelado.'; end if;
 select coalesce(sum(amount_cents),0) into v_paid from public.jk_receipts where installment_id=p_installment_id and voided_at is null;
 if p_amount_cents is null or p_amount_cents<=0 or p_amount_cents>v_item.amount_cents-v_paid then raise exception 'O pagamento deve ser positivo e não pode superar o saldo da parcela.'; end if;
 if p_paid_on is null or p_paid_on>current_date then raise exception 'Data de pagamento inválida.'; end if;
 if p_paid_on<(select released_on from public.jk_loans where id=v_item.loan_id) then raise exception 'Pagamento anterior à liberação.'; end if;
 insert into public.jk_receipts(installment_id,request_id,amount_cents,paid_on,method,notes,created_by) values(p_installment_id,p_request_id,p_amount_cents,p_paid_on,p_method,coalesce(p_notes,''),auth.uid()) returning id into v_id;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Pagamento registrado',v_id,jsonb_build_object('amount_cents',p_amount_cents)); return v_id;
end $$;
create or replace function jk_private.reverse_payment(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_installment uuid;
begin
 perform jk_private.require_admin();
 if length(trim(p_reason))<3 then raise exception 'Informe o motivo do estorno.'; end if;
 select installment_id into v_installment from public.jk_receipts where id=p_id;
 perform 1 from public.jk_installments where id=v_installment for update;
 update public.jk_receipts set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=p_id and voided_at is null;
 if not found then raise exception 'Pagamento inexistente ou já estornado.'; end if;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Pagamento estornado',p_id,jsonb_build_object('reason',p_reason));
end $$;
create or replace function jk_private.change_loan(p_id uuid,p_action text,p_dates jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_loan public.jk_loans; i integer; v_date date; v_prev date;
begin
 perform jk_private.require_admin();
 select * into v_loan from public.jk_loans where id=p_id for update;
 if not found or v_loan.status<>'active' then raise exception 'Contrato não encontrado ou cancelado.'; end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Informe o motivo.'; end if;
 if p_action='cancel' then
 if exists(select 1 from public.jk_receipts r join public.jk_installments i on i.id=r.installment_id where i.loan_id=p_id and r.voided_at is null) then raise exception 'Estorne os pagamentos antes de cancelar.'; end if;
 update public.jk_loans set status='cancelled' where id=p_id;
 elsif p_action='reschedule' then
 if jsonb_array_length(p_dates)<>v_loan.count then raise exception 'Quantidade de datas inválida.'; end if;
 v_prev=v_loan.released_on;
 for i in 0..v_loan.count-1 loop
 v_date=(p_dates->>i)::date;
 if v_date is null or (i=0 and v_date<v_prev) or (i>0 and v_date<=v_prev) then raise exception 'Datas inválidas ou fora de ordem.'; end if;
 update public.jk_installments set due_on=v_date where loan_id=p_id and number=i+1; v_prev=v_date;
 end loop;
 else raise exception 'Operação inválida.'; end if;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),case when p_action='cancel' then 'Contrato cancelado' else 'Vencimentos alterados' end,p_id,jsonb_build_object('reason',p_reason));
end $$;
create or replace function jk_private.save_preferences(p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform jk_private.require_admin();
 update public.jk_preferences set default_rate_bps=(p_data->>'default_rate_bps')::integer,default_fee_cents=(p_data->>'default_fee_cents')::bigint,due_window=(p_data->>'due_window')::integer,message_template=coalesce(p_data->>'message_template',''),updated_at=now() where id;
 insert into public.jk_events(actor_id,action) values(auth.uid(),'Preferências atualizadas');
end $$;
-- Expose only invoker wrappers. Every private write checks current admin membership.
create function public.jk_admin_access() returns boolean language sql security invoker set search_path='' as $$ select jk_private.is_admin(); $$;
create function public.jk_save_client(p_data jsonb,p_id uuid default null) returns uuid language sql security invoker set search_path='' as $$ select jk_private.save_client(p_data,p_id); $$;
create function public.jk_create_adhesion(p_client jsonb,p_client_id uuid,p_loan jsonb,p_request_id uuid) returns uuid language sql security invoker set search_path='' as $$ select jk_private.create_adhesion(p_client,p_client_id,p_loan,p_request_id); $$;
create function public.jk_record_payment(p_installment_id uuid,p_amount_cents bigint,p_paid_on date,p_method text,p_notes text,p_request_id uuid) returns uuid language sql security invoker set search_path='' as $$ select jk_private.record_payment(p_installment_id,p_amount_cents,p_paid_on,p_method,p_notes,p_request_id); $$;
create function public.jk_reverse_payment(p_id uuid,p_reason text) returns void language sql security invoker set search_path='' as $$ select jk_private.reverse_payment(p_id,p_reason); $$;
create function public.jk_change_loan(p_id uuid,p_action text,p_dates jsonb,p_reason text) returns void language sql security invoker set search_path='' as $$ select jk_private.change_loan(p_id,p_action,p_dates,p_reason); $$;
create function public.jk_save_preferences(p_data jsonb) returns void language sql security invoker set search_path='' as $$ select jk_private.save_preferences(p_data); $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='jk_private' or (n.nspname='public' and p.proname like 'jk\_%' escape '\') loop
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
commit;
