-- Cash control starts at installation. Existing loans/receipts are not replayed:
-- administrators record today's available cash as their opening balance.
create table public.jk_cash_account(
 id boolean primary key default true check(id),
 balance_cents bigint not null default 0 check(balance_cents between -9007199254740991 and 9007199254740991),
 version bigint not null default 1 check(version>0),
 started_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
insert into public.jk_cash_account(id) values(true);
create index jk_cash_account_updater_idx on public.jk_cash_account(updated_by);
create table public.jk_cash_entries(
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
 kind text not null check(kind in ('opening','contribution','withdrawal','loan_disbursement','customer_payment','partner_payout','reversal')),
 amount_cents bigint not null check(amount_cents<>0 and amount_cents between -10000000000000 and 10000000000000),
 occurred_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
 description text not null default '' check(length(description)<=2000),
 partner_id smallint references public.jk_society_partners(id),
 loan_id uuid references public.jk_loans(id), receipt_id uuid references public.jk_receipts(id), payout_id uuid references public.jk_society_payouts(id),
 reversal_of uuid unique references public.jk_cash_entries(id), request_id uuid not null unique,
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
 check(num_nonnulls(loan_id,receipt_id,payout_id)<=1),
 check((kind in ('opening','contribution','customer_payment') and amount_cents>0) or (kind in ('withdrawal','loan_disbursement','partner_payout') and amount_cents<0) or kind='reversal'),
 check((kind='reversal')=(reversal_of is not null)),
 check((kind in ('opening','contribution','withdrawal') and num_nonnulls(loan_id,receipt_id,payout_id)=0) or (kind='loan_disbursement' and loan_id is not null) or (kind='customer_payment' and receipt_id is not null) or (kind='partner_payout' and payout_id is not null) or kind='reversal')
);
create unique index jk_cash_one_opening_idx on public.jk_cash_entries(kind) where kind='opening';
create unique index jk_cash_loan_once_idx on public.jk_cash_entries(loan_id) where kind='loan_disbursement';
create unique index jk_cash_receipt_once_idx on public.jk_cash_entries(receipt_id) where kind='customer_payment';
create unique index jk_cash_payout_once_idx on public.jk_cash_entries(payout_id) where kind='partner_payout';
create index jk_cash_entries_loan_idx on public.jk_cash_entries(loan_id);
create index jk_cash_entries_receipt_idx on public.jk_cash_entries(receipt_id);
create index jk_cash_entries_payout_idx on public.jk_cash_entries(payout_id);
create index jk_cash_entries_partner_idx on public.jk_cash_entries(partner_id);
create index jk_cash_entries_creator_idx on public.jk_cash_entries(created_by);
create index jk_cash_entries_date_idx on public.jk_cash_entries(occurred_on,sequence);
alter table public.jk_cash_account enable row level security;
alter table public.jk_cash_entries enable row level security;
revoke all on public.jk_cash_account,public.jk_cash_entries from public,anon,authenticated;
grant select on public.jk_cash_account,public.jk_cash_entries to authenticated;
create policy admin_read on public.jk_cash_account for select to authenticated using ((select jk_private.is_admin()));
create policy admin_read on public.jk_cash_entries for select to authenticated using ((select jk_private.is_admin()));
revoke all on sequence public.jk_cash_entries_sequence_seq from public,anon,authenticated;

-- Every mutation locks this one account before reading/checking its balance.
-- Receipt/payout triggers run after society triggers, preserving lock order:
-- society settings -> cash account. Cash functions never acquire society locks.
create function jk_private.cash_post(
 p_kind text,p_amount_cents bigint,p_description text default '',p_partner_id smallint default null,
 p_loan_id uuid default null,p_receipt_id uuid default null,p_payout_id uuid default null,
 p_reversal_of uuid default null,p_request_id uuid default null,p_require_funds boolean default false
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_account public.jk_cash_account; v_existing public.jk_cash_entries; v_original public.jk_cash_entries; v_id uuid; v_request uuid=coalesce(p_request_id,gen_random_uuid());
begin
 perform jk_private.require_admin();
 select * into v_account from public.jk_cash_account where id for update;
 if not found then raise exception 'Fundo de caixa indisponível.';end if;
 if p_amount_cents is null or p_amount_cents=0 or p_amount_cents not between -10000000000000 and 10000000000000 then raise exception 'Informe um valor válido para o caixa.';end if;
 if length(coalesce(p_description,''))>2000 then raise exception 'A observação deve ter até 2000 caracteres.';end if;
 select * into v_existing from public.jk_cash_entries where request_id=v_request;
 if found then
  if v_existing.kind<>p_kind or v_existing.amount_cents<>p_amount_cents or v_existing.partner_id is distinct from p_partner_id or v_existing.description<>trim(coalesce(p_description,'')) then raise exception 'Esta operação já foi registrada com outros dados.';end if;
  return v_existing.id;
 end if;
 if p_reversal_of is not null then
  select * into v_original from public.jk_cash_entries where id=p_reversal_of;
  if not found or v_original.kind='reversal' or p_amount_cents<>-v_original.amount_cents then raise exception 'Estorno de caixa inválido.';end if;
  select id into v_id from public.jk_cash_entries where reversal_of=p_reversal_of;
  if v_id is not null then return v_id;end if;
 end if;
 if p_kind='opening' and exists(select 1 from public.jk_cash_entries) then raise exception 'O caixa já foi iniciado. Use Adicionar saldo para registrar um aporte.';end if;
 if p_require_funds and v_account.balance_cents+p_amount_cents<0 then
  raise exception 'Saldo de caixa insuficiente. Disponível: R$ %. Adicione saldo em Fundo de caixa antes de continuar.',replace(to_char(v_account.balance_cents::numeric/100,'FM999999999999990D00'),'.',',');
 end if;
 insert into public.jk_cash_entries(kind,amount_cents,description,partner_id,loan_id,receipt_id,payout_id,reversal_of,request_id,created_by)
 values(p_kind,p_amount_cents,trim(coalesce(p_description,'')),p_partner_id,p_loan_id,p_receipt_id,p_payout_id,p_reversal_of,v_request,auth.uid()) returning id into v_id;
 update public.jk_cash_account set balance_cents=balance_cents+p_amount_cents,version=version+1,updated_at=now(),updated_by=auth.uid() where id;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Movimentação de caixa registrada',v_id,jsonb_build_object('kind',p_kind,'amount_cents',p_amount_cents,'balance_cents',v_account.balance_cents+p_amount_cents,'loan_id',p_loan_id,'receipt_id',p_receipt_id,'payout_id',p_payout_id,'reversal_of',p_reversal_of));
 return v_id;
end $$;
create function jk_private.cash_record(p_kind text,p_amount_cents bigint,p_partner_id smallint,p_notes text,p_request_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
begin
 perform jk_private.require_admin();
 if p_kind not in ('opening','contribution','withdrawal') or p_kind is null then raise exception 'Tipo de movimentação inválido.';end if;
 if p_amount_cents is null or p_amount_cents<=0 or p_request_id is null then raise exception 'Informe um valor positivo e o identificador da operação.';end if;
 if p_partner_id is not null and p_partner_id not in (1,2) then raise exception 'Sócio inválido.';end if;
 return jk_private.cash_post(p_kind,case when p_kind='withdrawal' then -p_amount_cents else p_amount_cents end,p_notes,p_partner_id,p_request_id=>p_request_id,p_require_funds=>p_kind='withdrawal');
end $$;
create function jk_private.cash_reverse(p_id uuid,p_notes text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_entry public.jk_cash_entries;
begin
 perform jk_private.require_admin();
 perform 1 from public.jk_cash_account where id for update;
 select * into v_entry from public.jk_cash_entries where id=p_id;
 if not found or v_entry.kind not in ('opening','contribution','withdrawal') then raise exception 'Somente entradas e saídas manuais podem ser estornadas aqui.';end if;
 return jk_private.cash_post('reversal',-v_entry.amount_cents,coalesce(nullif(trim(p_notes),''),'Estorno de movimentação manual'),v_entry.partner_id,p_reversal_of=>v_entry.id);
end $$;
create function jk_private.cash_source_changed() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_entry public.jk_cash_entries;
begin
 perform jk_private.require_admin();
 if TG_TABLE_NAME='jk_loans' then
  if TG_OP='INSERT' and new.status<>'cancelled' then
   perform jk_private.cash_post('loan_disbursement',-new.principal_cents,'Liberação do contrato '||new.protocol,p_loan_id=>new.id,p_require_funds=>true);
  elsif TG_OP='UPDATE' and old.status<>'cancelled' and new.status='cancelled' then
   select * into v_entry from public.jk_cash_entries where loan_id=new.id and kind='loan_disbursement';
   if found then perform jk_private.cash_post('reversal',-v_entry.amount_cents,'Cancelamento do contrato '||new.protocol,p_loan_id=>new.id,p_reversal_of=>v_entry.id);end if;
  end if;
 elsif TG_TABLE_NAME='jk_receipts' then
  if TG_OP='INSERT' and new.voided_at is null then
   perform jk_private.cash_post('customer_payment',new.amount_cents,'Pagamento recebido do cliente',p_receipt_id=>new.id);
  elsif TG_OP='UPDATE' and old.voided_at is null and new.voided_at is not null then
   select * into v_entry from public.jk_cash_entries where receipt_id=new.id and kind='customer_payment';
   if found then perform jk_private.cash_post('reversal',-v_entry.amount_cents,'Estorno do pagamento do cliente',p_receipt_id=>new.id,p_reversal_of=>v_entry.id);end if;
  end if;
 elsif TG_TABLE_NAME='jk_society_payouts' then
  if TG_OP='INSERT' and new.voided_at is null then
   perform jk_private.cash_post('partner_payout',-new.amount_cents,'Repasse ao sócio',new.partner_id,p_payout_id=>new.id,p_require_funds=>true);
  elsif TG_OP='UPDATE' and old.voided_at is null and new.voided_at is not null then
   select * into v_entry from public.jk_cash_entries where payout_id=new.id and kind='partner_payout';
   if found then perform jk_private.cash_post('reversal',-v_entry.amount_cents,'Estorno do repasse ao sócio',new.partner_id,p_payout_id=>new.id,p_reversal_of=>v_entry.id);end if;
  end if;
 end if;
 return new;
end $$;
create trigger jk_cash_loan_insert after insert on public.jk_loans for each row execute function jk_private.cash_source_changed();
create trigger jk_cash_loan_cancel after update of status on public.jk_loans for each row execute function jk_private.cash_source_changed();
create trigger zz_jk_cash_receipt_insert after insert on public.jk_receipts for each row execute function jk_private.cash_source_changed();
create trigger zz_jk_cash_receipt_void after update of voided_at on public.jk_receipts for each row execute function jk_private.cash_source_changed();
create trigger zz_jk_cash_payout_insert after insert on public.jk_society_payouts for each row execute function jk_private.cash_source_changed();
create trigger zz_jk_cash_payout_void after update of voided_at on public.jk_society_payouts for each row execute function jk_private.cash_source_changed();
revoke execute on function jk_private.cash_post(text,bigint,text,smallint,uuid,uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke execute on function jk_private.cash_record(text,bigint,smallint,text,uuid) from public,anon,authenticated;
revoke execute on function jk_private.cash_reverse(uuid,text) from public,anon,authenticated;
revoke execute on function jk_private.cash_source_changed() from public,anon,authenticated;

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
 if v_table not in ('jk_clients','jk_loans','jk_installments','jk_receipts','jk_preferences','jk_events','jk_society_partners','jk_society_settings','jk_society_splits','jk_society_payouts','jk_cash_account','jk_cash_entries') or v_from<0 then raise exception 'Consulta inválida.'; end if;
 execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from (select * from public.%I order by id limit 500 offset $1) t',v_table) into v_result using v_from;
 return v_result;
 when 'jk_save_client' then return to_jsonb(jk_private.save_client(p_args->'p_data',(p_args->>'p_id')::uuid));
 when 'jk_create_adhesion' then return to_jsonb(jk_private.create_adhesion(p_args->'p_client',(p_args->>'p_client_id')::uuid,p_args->'p_loan',(p_args->>'p_request_id')::uuid));
 when 'jk_record_payment' then return to_jsonb(jk_private.record_payment((p_args->>'p_installment_id')::uuid,(p_args->>'p_amount_cents')::bigint,(p_args->>'p_paid_on')::date,p_args->>'p_method',p_args->>'p_notes',(p_args->>'p_request_id')::uuid));
 when 'jk_reverse_payment' then perform jk_private.reverse_payment((p_args->>'p_id')::uuid,p_args->>'p_reason'); return 'true'::jsonb;
 when 'jk_change_loan' then perform jk_private.change_loan((p_args->>'p_id')::uuid,p_args->>'p_action',p_args->'p_dates',p_args->>'p_reason'); return 'true'::jsonb;
 when 'jk_save_preferences' then perform jk_private.save_preferences(p_args->'p_data'); return 'true'::jsonb;
 when 'jk_cash_snapshot' then
  select jsonb_build_object('account',(select to_jsonb(a) from public.jk_cash_account a where id),'entries',(select coalesce(jsonb_agg(e order by e.sequence),'[]'::jsonb) from public.jk_cash_entries e)) into v_result;
  return v_result;
 when 'jk_cash_record' then return to_jsonb(jk_private.cash_record(p_args->>'p_kind',(p_args->>'p_amount_cents')::bigint,(p_args->>'p_partner_id')::smallint,p_args->>'p_notes',(p_args->>'p_request_id')::uuid));
 when 'jk_cash_reverse' then return to_jsonb(jk_private.cash_reverse((p_args->>'p_id')::uuid,p_args->>'p_notes'));
 when 'jk_society_configure' then return to_jsonb(jk_private.society_configure((p_args->>'p_share1_bps')::integer,(p_args->>'p_expected_version')::bigint));
 when 'jk_society_adjust_split' then return to_jsonb(jk_private.society_adjust_split((p_args->>'p_receipt_id')::uuid,(p_args->>'p_base_cents')::bigint,(p_args->>'p_share1_bps')::integer,p_args->>'p_reason',(p_args->>'p_expected_version')::bigint));
 when 'jk_society_record_payout' then return to_jsonb(jk_private.society_record_payout((p_args->>'p_partner_id')::smallint,(p_args->>'p_amount_cents')::bigint,(p_args->>'p_paid_on')::date,p_args->>'p_method',p_args->>'p_reference',p_args->>'p_notes',(p_args->>'p_request_id')::uuid));
 when 'jk_society_reverse_payout' then perform jk_private.society_reverse_payout((p_args->>'p_id')::uuid,p_args->>'p_reason'); return 'true'::jsonb;
 else raise exception 'Operação inválida.';
 end case;
end $$;

