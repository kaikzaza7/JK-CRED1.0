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
 v_token text=current_setting('jk_test.token'); v_rows jsonb; v_settings jsonb;
 v_version bigint; v_loan uuid; v_item uuid; v_receipt uuid; v_split jsonb;
 v_payout uuid; v_request uuid=gen_random_uuid(); v_failed boolean;
 v_today date=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if current_user<>'anon' then raise exception 'Teste precisa usar o papel real da API';end if;
 v_settings=public.jk_gateway(v_token,'load_table','{"table":"jk_society_settings","from":0}')->0;
 v_version=(v_settings->>'version')::bigint;
 v_version=(public.jk_gateway(v_token,'jk_society_configure',jsonb_build_object('p_share1_bps',9000,'p_expected_version',v_version))#>>'{}')::bigint;
 -- Reproduced the original permission-denied error here before the fix.
 set constraints all immediate;
 v_rows=public.jk_gateway(v_token,'load_table','{"table":"jk_society_partners","from":0}');
 if v_rows->0->>'share_bps'<>'9000' or v_rows->1->>'share_bps'<>'1000' then raise exception 'Gateway não salvou 90/10';end if;
 if (public.jk_gateway(v_token,'load_table','{"table":"jk_society_settings","from":0}')->0->>'version')::bigint<>v_version then raise exception 'Regra não persistiu na releitura';end if;
 v_failed=false;
 begin perform public.jk_gateway(v_token,'jk_society_configure',jsonb_build_object('p_share1_bps',5000,'p_expected_version',v_version-1));exception when others then v_failed=true;end;
 if not v_failed then raise exception 'Gateway aceitou versão antiga';end if;
 perform public.jk_gateway(v_token,'jk_cash_record',jsonb_build_object('p_kind','contribution','p_amount_cents',1000000,'p_notes','Fundo temporário de teste','p_request_id',gen_random_uuid()));
 v_loan=(public.jk_gateway(v_token,'jk_create_adhesion',jsonb_build_object('p_client',current_setting('jk_test.client')::jsonb,'p_loan',jsonb_build_object('principal_cents',20000,'rate_bps',3000,'fee_cents',1000,'released_on',v_today,'dates',jsonb_build_array(v_today+7,v_today+22)),'p_request_id',gen_random_uuid()))#>>'{}')::uuid;
 select (row->>'id')::uuid into v_item from jsonb_array_elements(public.jk_gateway(v_token,'load_table','{"table":"jk_installments","from":0}')) as row where row->>'loan_id'=v_loan::text and row->>'number'='1';
 if v_item is null then raise exception 'Parcela do contrato de teste não foi encontrada';end if;
 v_receipt=(public.jk_gateway(v_token,'jk_record_payment',jsonb_build_object('p_installment_id',v_item,'p_amount_cents',3000,'p_paid_on',v_today,'p_method','pix','p_notes','TESTE ROLLBACK','p_request_id',gen_random_uuid()))#>>'{}')::uuid;
 select row into v_split from jsonb_array_elements(public.jk_gateway(v_token,'load_table','{"table":"jk_society_splits","from":0}')) as row where row->>'receipt_id'=v_receipt::text;
 if v_split is null or v_split->>'partner1_cents'<>'2700' or v_split->>'partner2_cents'<>'300' then raise exception 'Divisão automática via gateway incorreta';end if;
 perform public.jk_gateway(v_token,'jk_society_adjust_split',jsonb_build_object('p_receipt_id',v_receipt,'p_base_cents',2000,'p_share1_bps',6000,'p_expected_version',(v_split->>'version')::bigint));
 select row into v_split from jsonb_array_elements(public.jk_gateway(v_token,'load_table','{"table":"jk_society_splits","from":0}')) as row where row->>'receipt_id'=v_receipt::text;
 if v_split->>'partner1_cents'<>'1200' or v_split->>'partner2_cents'<>'800' or v_split->>'adjustment_reason'<>'' then raise exception 'Ajuste sem motivo via gateway incorreto';end if;
 v_payout=(public.jk_gateway(v_token,'jk_society_record_payout',jsonb_build_object('p_partner_id',1,'p_amount_cents',1000,'p_paid_on',v_today,'p_method','pix','p_reference','ROLLBACK','p_notes','','p_request_id',v_request))#>>'{}')::uuid;
 if (public.jk_gateway(v_token,'jk_society_record_payout',jsonb_build_object('p_partner_id',1,'p_amount_cents',1000,'p_paid_on',v_today,'p_method','pix','p_reference','ROLLBACK','p_notes','','p_request_id',v_request))#>>'{}')::uuid<>v_payout then raise exception 'Idempotência do repasse via gateway falhou';end if;
 perform public.jk_gateway(v_token,'jk_society_reverse_payout',jsonb_build_object('p_id',v_payout,'p_reason','Devolução temporária de teste'));
 perform public.jk_gateway(v_token,'jk_reverse_payment',jsonb_build_object('p_id',v_receipt,'p_reason','Recebimento temporário de teste'));
 set constraints all immediate;
 v_failed=false;
 begin update public.jk_society_partners set share_bps=5000 where id=1;exception when insufficient_privilege then v_failed=true;end;
 if not v_failed then raise exception 'Escrita direta anon foi liberada indevidamente';end if;
 v_failed=false;
 begin perform public.jk_gateway('invalid-test-token','load_table','{"table":"jk_society_partners"}');exception when insufficient_privilege then v_failed=true;end;
 if not v_failed then raise exception 'Gateway aceitou token inválido';end if;
end $$;
reset role;
do $$
declare v_failed boolean=false;
begin
 begin update public.jk_society_partners set share_bps=1 where id=1;exception when others then
  if position('a soma das porcentagens deve ser 100%' in sqlerrm)=0 then raise;end if;
  v_failed=true;
 end;
 if not v_failed then raise exception 'Validação imediata aceitou soma diferente de 100';end if;
end $$;
rollback;
select 'passed: actual anon gateway role, percentage save and reread, immediate constraint validation, receipt allocation, split adjustment without reason, payouts, idempotency, reversals, direct-write denial and invalid-token denial' as society_gateway_checks;
