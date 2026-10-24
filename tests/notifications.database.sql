-- Exercise the actual public RPC under the API's anon role, including the
-- point at which deferred constraints would fire after the gateway returns.
-- A random token is installed only inside this rolled-back transaction.
-- The real server token is never read, returned or changed persistently.
begin;
do $$
declare
 v_token text='jk-rollback-test-'||gen_random_uuid()::text;
 v_raw text; v_cpf text; v_sum integer; v_d1 integer; v_d2 integer; i integer;
begin
 perform set_config('jk_test.token',v_token,true);
 update jk_private.server_config set token_hash=encode(extensions.digest(v_token,'sha256'),'hex') where id;
 loop
  v_raw=lpad(trunc(random()*999999999)::bigint::text,9,'0');v_sum=0;
  for i in 1..9 loop v_sum=v_sum+substr(v_raw,i,1)::integer*(11-i);end loop;
  v_d1=(v_sum*10)%11;if v_d1=10 then v_d1=0;end if;
  v_sum=0;for i in 1..10 loop v_sum=v_sum+substr(v_raw||v_d1::text,i,1)::integer*(12-i);end loop;
  v_d2=(v_sum*10)%11;if v_d2=10 then v_d2=0;end if;
  v_cpf=v_raw||v_d1::text||v_d2::text;
  exit when public.is_valid_cpf(v_cpf) and not exists(select 1 from public.jk_clients where cpf=v_cpf);
 end loop;
 perform set_config('jk_test.client',jsonb_build_object('name','TESTE TEMPORÁRIO GATEWAY SOCIETÁRIO','cpf',v_cpf,'phone','+5579999990001')::text,true);
end $$;
set local role anon;
do $$
declare
 token text=current_setting('jk_test.token');device uuid=gen_random_uuid();loan uuid;item uuid;receipt uuid;
 result jsonb;rows jsonb;row jsonb;failed boolean;d date=(now() at time zone 'America/Sao_Paulo')::date;
begin
 failed=false;begin perform public.jk_push_gateway('invalid','history','{}');exception when insufficient_privilege then failed=true;end;if not failed then raise exception 'Token inválido aceito';end if;
 perform public.jk_push_gateway(token,'subscribe',jsonb_build_object('device_id',device,'name','Aparelho temporário','subscription',jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/rollback-'||device,'keys',jsonb_build_object('auth','test','p256dh','test'))));
 if not (public.jk_push_gateway(token,'status',jsonb_build_object('device_id',device))->>'active')::boolean then raise exception 'Ativação falhou';end if;
 loan=(public.jk_gateway(token,'jk_create_adhesion',jsonb_build_object('p_client',current_setting('jk_test.client')::jsonb,'p_loan',jsonb_build_object('principal_cents',60000,'rate_bps',0,'fee_cents',0,'released_on',d-15,'dates',jsonb_build_array(d-7,d-3,d-1,d,d+1,d+2)),'p_request_id',gen_random_uuid()))#>>'{}')::uuid;
 perform public.jk_push_gateway(token,'prepare','{}');perform public.jk_push_gateway(token,'prepare','{}');
 rows=public.jk_push_gateway(token,'history','{}');
 if (select count(*) from jsonb_array_elements(rows) e where e->>'title' like 'TESTE TEMPORÁRIO GATEWAY SOCIETÁRIO vence a parcela%')<>3 then raise exception 'Nome exato ou lembretes incorretos';end if;
 if (select count(*) from jsonb_array_elements(rows) e where e->>'title' like 'TESTE TEMPORÁRIO GATEWAY SOCIETÁRIO está com a parcela atrasada%')<>3 then raise exception 'Atrasos incorretos';end if;
 select (e->>'id')::uuid into item from jsonb_array_elements(public.jk_gateway(token,'load_table','{"table":"jk_installments","from":0}'))e where e->>'loan_id'=loan::text and e->>'number'='6';
 receipt=(public.jk_gateway(token,'jk_record_payment',jsonb_build_object('p_installment_id',item,'p_amount_cents',10000,'p_paid_on',d,'p_method','pix','p_request_id',gen_random_uuid()))#>>'{}')::uuid;
 perform public.jk_push_gateway(token,'prepare','{}');
 rows=public.jk_push_gateway(token,'claim','{}');
 if exists(select 1 from jsonb_array_elements(rows)e where e->'payload'->>'title'='TESTE TEMPORÁRIO GATEWAY SOCIETÁRIO vence a parcela em 2 dias') then raise exception 'Cobrou parcela quitada';end if;
 for row in select value from jsonb_array_elements(rows) loop
 perform public.jk_push_gateway(token,'ack',jsonb_build_object('event_id',row->'event_id','device_id',row->'device_id','lease',row->'lease','ok',true));
 end loop;
 if jsonb_array_length(public.jk_push_gateway(token,'claim','{}'))<>0 then raise exception 'Notificação duplicada';end if;
 perform public.jk_push_gateway(token,'test',jsonb_build_object('device_id',device));
 rows=public.jk_push_gateway(token,'claim','{}');if jsonb_array_length(rows)<>1 then raise exception 'Teste não foi isolado ao aparelho';end if;
 perform public.jk_push_gateway(token,'unsubscribe',jsonb_build_object('device_id',device));
 if jsonb_array_length(public.jk_push_gateway(token,'claim','{}'))<>0 then raise exception 'Aparelho desativado recebeu';end if;
 failed=false;begin perform count(*) from jk_private.push_devices;exception when insufficient_privilege then failed=true;end;if not failed then raise exception 'Tabela exposta ao anon';end if;
end $$;
reset role;
-- Outbox is transactional; no phone is contacted in this test.
rollback;
