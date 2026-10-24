begin;
-- Private outbox: no financial data or push endpoints are readable through REST.
create table jk_private.push_devices(
 id uuid primary key, subscription jsonb not null, name text not null check(length(name) between 1 and 80),
 categories jsonb not null default '{"due":true,"cash":true,"loans":true,"payments":true,"society":true}',
 active boolean not null default true, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default now()
);
create unique index push_endpoint_idx on jk_private.push_devices ((subscription->>'endpoint'));
create table jk_private.push_events(
 id bigint generated always as identity primary key, event_key text not null unique, category text not null,
 title text not null, body text not null, url text not null, installment_id uuid references public.jk_installments(id), due_on date,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default (clock_timestamp()+interval '24 hours')
);
create table jk_private.push_deliveries(
 event_id bigint references jk_private.push_events(id) on delete cascade, device_id uuid references jk_private.push_devices(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','expired')), attempts integer not null default 0,
 lease uuid, retry_at timestamptz not null default now(), sent_at timestamptz, last_error text,
 primary key(event_id,device_id)
);
create index push_retry_idx on jk_private.push_deliveries(status,retry_at);
alter table jk_private.push_devices enable row level security;
alter table jk_private.push_events enable row level security;
alter table jk_private.push_deliveries enable row level security;
revoke all on jk_private.push_devices,jk_private.push_events,jk_private.push_deliveries from public,anon,authenticated;
revoke all on sequence jk_private.push_events_id_seq from public,anon,authenticated;
create function jk_private.push_money(p_cents bigint) returns text language sql immutable set search_path='' as $$
 select 'R$ '||replace(to_char(p_cents::numeric/100,'FM999999999999990D00'),'.',',');
$$;
create function jk_private.push_cash_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_name text; v_client text; v_number integer; v_count integer; v_protocol text; v_category text; v_title text; v_body text; v_url text;
begin
 perform jk_private.require_admin();
 select name into v_name from public.jk_society_partners where id=new.partner_id;
 if new.loan_id is not null then
 select c.name,l.protocol,l.count into v_client,v_protocol,v_count from public.jk_loans l join public.jk_clients c on c.id=l.client_id where l.id=new.loan_id;
 elsif new.receipt_id is not null then
 select c.name,l.protocol,i.number,l.count into v_client,v_protocol,v_number,v_count from public.jk_receipts r join public.jk_installments i on i.id=r.installment_id join public.jk_loans l on l.id=i.loan_id join public.jk_clients c on c.id=l.client_id where r.id=new.receipt_id;
 elsif new.payout_id is not null then
 select p.name into v_name from public.jk_society_payouts s join public.jk_society_partners p on p.id=s.partner_id where s.id=new.payout_id;
 end if;
 case new.kind
 when 'loan_disbursement' then v_category='loans';v_title=v_client||' teve um empréstimo registrado';v_body='Valor liberado: '||jk_private.push_money(-new.amount_cents)||'. Contrato '||v_protocol||'.';v_url='/#/loans';
 when 'customer_payment' then v_category='payments';v_title=v_client||' teve um pagamento registrado';v_body=jk_private.push_money(new.amount_cents)||' recebidos na parcela '||v_number||'/'||v_count||'. Contrato '||v_protocol||'.';v_url='/#/receipts';
 when 'partner_payout' then v_category='society';v_title='Repasse para '||v_name||' registrado';v_body='Valor: '||jk_private.push_money(-new.amount_cents)||'. Confira o extrato societário.';v_url='/#/society';
 when 'contribution' then v_category='cash';v_title=case when v_name is null then 'Aporte no caixa sem sócio identificado' else v_name||' adicionou saldo ao fundo de caixa' end;v_body='Entrada de '||jk_private.push_money(new.amount_cents)||'.';v_url='/#/cash';
 when 'withdrawal' then v_category='cash';v_title=case when v_name is null then 'Saída de caixa sem sócio identificado' else 'Retirada de '||v_name||' registrada' end;v_body='Saída de '||jk_private.push_money(-new.amount_cents)||'.';v_url='/#/cash';
 when 'opening' then v_category='cash';v_title='Saldo inicial do fundo de caixa registrado';v_body='Valor: '||jk_private.push_money(new.amount_cents)||'.';v_url='/#/cash';
 when 'reversal' then v_category=case when v_client is not null then 'payments' when new.payout_id is not null then 'society' else 'cash' end;v_title=case when v_client is not null then 'Estorno registrado para '||v_client when v_name is not null then 'Estorno registrado para '||v_name else 'Estorno de caixa registrado' end;v_body='Ajuste no caixa: '||jk_private.push_money(new.amount_cents)||'. Confira a movimentação original.';v_url='/#/cash';
 else return new;
 end case;
 insert into jk_private.push_events(event_key,category,title,body,url) values('cash:'||new.id,v_category,v_title,v_body,v_url) on conflict(event_key) do nothing;
 return new;
end $$;
create trigger zz_push_cash after insert on public.jk_cash_entries for each row execute function jk_private.push_cash_event();
-- Only current balances are reminded. Day milestones avoid repetitive daily debt alerts.
create function jk_private.push_reminders() returns void language plpgsql security invoker set search_path='' as $$
declare r record; v_day date=(now() at time zone 'America/Sao_Paulo')::date; v_days integer; v_title text;
begin
 perform jk_private.require_admin();
 for r in select i.*,c.name,l.count,l.protocol,i.amount_cents-coalesce((select sum(p.amount_cents) from public.jk_receipts p where p.installment_id=i.id and p.voided_at is null),0) as balance
 from public.jk_installments i join public.jk_loans l on l.id=i.loan_id join public.jk_clients c on c.id=l.client_id
 where l.status='active' and i.due_on in (v_day+2,v_day+1,v_day,v_day-1,v_day-3,v_day-7)
 loop
 if r.balance<=0 then continue;end if;
 v_days=r.due_on-v_day;
 v_title=r.name||case when v_days=2 then ' vence a parcela em 2 dias' when v_days=1 then ' vence a parcela amanhã' when v_days=0 then ' vence a parcela hoje' when v_days=-1 then ' está com a parcela atrasada há 1 dia' else ' está com a parcela atrasada há '||(-v_days)||' dias' end;
 insert into jk_private.push_events(event_key,category,title,body,url,installment_id,due_on,expires_at)
 values('due:'||r.id||':'||r.due_on||':'||v_day,'due',v_title,'Parcela '||r.number||'/'||r.count||' • Saldo: '||jk_private.push_money(r.balance::bigint)||' • Vencimento: '||to_char(r.due_on,'DD/MM/YYYY')||' • Contrato '||r.protocol||'.','/#/calendar?date='||r.due_on,r.id,r.due_on,(v_day+1)::timestamp at time zone 'America/Sao_Paulo') on conflict(event_key) do update set title=excluded.title,body=excluded.body,url=excluded.url;
 end loop;
end $$;
-- A separate secret-authenticated RPC keeps the established financial gateway untouched.
create function jk_private.push_gateway(p_token text,p_action text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_id uuid; v_result jsonb; v_lease uuid; v_device jk_private.push_devices; v_event bigint;
begin
 select actor_id into v_actor from jk_private.server_config where id and token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex');
 if v_actor is null then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 perform jk_private.require_admin();
 case p_action
 when 'status' then
 select jsonb_build_object('active',active,'name',name,'categories',categories) into v_result from jk_private.push_devices where id=(p_args->>'device_id')::uuid;
 return coalesce(v_result,'null');
 when 'subscribe' then
 v_id=(p_args->>'device_id')::uuid;
 if v_id is null or length(coalesce(p_args->>'name','')) not between 1 and 80 or jsonb_typeof(p_args->'subscription')<>'object' then raise exception 'Aparelho inválido.';end if;
 -- Reinstalling/renewing the same endpoint must not create two notifications.
 delete from jk_private.push_devices where subscription->>'endpoint'=p_args->'subscription'->>'endpoint' and id<>v_id;
 insert into jk_private.push_devices(id,name,subscription) values(v_id,p_args->>'name',p_args->'subscription')
 on conflict(id) do update set name=excluded.name,subscription=excluded.subscription,active=true,updated_at=now();return 'true';
 when 'preferences' then
 if exists(select 1 from jsonb_each(p_args->'categories') e where e.key not in ('due','cash','loans','payments','society') or jsonb_typeof(e.value)<>'boolean') then raise exception 'Preferências inválidas.';end if;
 update jk_private.push_devices set categories=categories||(p_args->'categories'),updated_at=now() where id=(p_args->>'device_id')::uuid;return 'true';
 when 'unsubscribe' then
 update jk_private.push_devices set active=false,updated_at=now() where id=(p_args->>'device_id')::uuid;return 'true';
 when 'history' then
 select coalesce(jsonb_agg(t),'[]') into v_result from (select id,title,body,url,created_at,category from jk_private.push_events order by id desc limit 60)t;return v_result;
 when 'test' then
 select * into v_device from jk_private.push_devices where id=(p_args->>'device_id')::uuid and active;
 if not found then raise exception 'Ative as notificações neste aparelho primeiro.';end if;
 insert into jk_private.push_events(event_key,category,title,body,url) values('test:'||gen_random_uuid(),'test','JK CRED • Notificações ativadas','Este aparelho está pronto para receber os alertas da administração.','/#/settings') returning id into v_event;
 insert into jk_private.push_deliveries(event_id,device_id) values(v_event,v_device.id);
 return 'true';
 when 'prepare' then
 perform jk_private.push_reminders();
 -- Queue only events created after subscription; old financial records are never replayed.
 insert into jk_private.push_deliveries(event_id,device_id)
 select e.id,d.id from jk_private.push_events e cross join jk_private.push_devices d
 where d.active and e.created_at>=d.created_at and e.expires_at>now() and coalesce((d.categories->>e.category)::boolean,false) and e.category<>'test'
 on conflict do nothing;
 return 'true';
 when 'claim' then
 v_lease=gen_random_uuid();
 with batch as (
 select q.event_id,q.device_id from jk_private.push_deliveries q join jk_private.push_devices d on d.id=q.device_id join jk_private.push_events e on e.id=q.event_id
 where d.active and (e.category='test' or coalesce((d.categories->>e.category)::boolean,false)) and e.expires_at>now() and q.status in ('pending','sending') and q.retry_at<=now() and q.attempts<5
 and (e.installment_id is null or exists(select 1 from public.jk_installments i join public.jk_loans l on l.id=i.loan_id where i.id=e.installment_id and l.status='active' and i.due_on=e.due_on and i.amount_cents>coalesce((select sum(r.amount_cents) from public.jk_receipts r where r.installment_id=i.id and r.voided_at is null),0)))
 order by e.id limit 40 for update of q skip locked
 ), claimed as (
 update jk_private.push_deliveries q set status='sending',attempts=attempts+1,lease=v_lease,retry_at=now()+interval '3 minutes' from batch b where q.event_id=b.event_id and q.device_id=b.device_id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('event_id',q.event_id,'device_id',q.device_id,'lease',q.lease,'subscription',d.subscription,'payload',jsonb_build_object('title',e.title,'body',e.body,'url',e.url,'tag','jk-'||e.id))),'[]') into v_result from claimed q join jk_private.push_devices d on d.id=q.device_id join jk_private.push_events e on e.id=q.event_id;
 return v_result;
 when 'ack' then
 update jk_private.push_deliveries set status=case when coalesce((p_args->>'ok')::boolean,false) then 'sent' when coalesce((p_args->>'gone')::boolean,false) then 'expired' else 'pending' end,
 sent_at=case when coalesce((p_args->>'ok')::boolean,false) then now() else null end,last_error=left(p_args->>'error',80),retry_at=now()+interval '5 minutes'
 where event_id=(p_args->>'event_id')::bigint and device_id=(p_args->>'device_id')::uuid and lease=(p_args->>'lease')::uuid;
 if coalesce((p_args->>'gone')::boolean,false) then update jk_private.push_devices set active=false where id=(p_args->>'device_id')::uuid;end if;return 'true';
 else raise exception 'Operação inválida.';
 end case;
end $$;
create function public.jk_push_gateway(p_token text,p_action text,p_args jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select jk_private.push_gateway(p_token,p_action,p_args);$$;
revoke all on function jk_private.push_money(bigint),jk_private.push_cash_event(),jk_private.push_reminders(),jk_private.push_gateway(text,text,jsonb),public.jk_push_gateway(text,text,jsonb) from public,anon,authenticated;
grant execute on function jk_private.push_gateway(text,text,jsonb),public.jk_push_gateway(text,text,jsonb) to anon,authenticated;
commit;
