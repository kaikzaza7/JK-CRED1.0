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
 v_token text=current_setting('jk_test.token');v_snapshot jsonb;v_initial bigint;v_balance bigint;v_rows jsonb;
 v_kind text;v_entry uuid;v_again uuid;v_contribution uuid;v_withdrawal uuid;v_loan uuid;v_client uuid;v_item uuid;v_receipt uuid;v_payout uuid;
 v_request uuid;v_loan_request uuid=gen_random_uuid();v_payout_request uuid=gen_random_uuid();v_bad_request uuid=gen_random_uuid();v_split jsonb;v_failed boolean;
 v_today date=(now() at time zone 'America/Sao_Paulo')::date;v_deposit_args jsonb;v_loan_args jsonb;v_payout_args jsonb;
begin
 if current_user<>'anon' then raise exception 'Teste deve usar o papel da API';end if;
 v_snapshot=public.jk_gateway(v_token,'jk_cash_snapshot','{}');v_initial=(v_snapshot->'account'->>'balance_cents')::bigint;
 v_kind=case when jsonb_array_length(v_snapshot->'entries')=0 then 'opening' else 'contribution' end;
 v_deposit_args=jsonb_build_object('p_kind',v_kind,'p_amount_cents',100000,'p_partner_id',1,'p_notes','Caixa temporário para teste','p_request_id',gen_random_uuid());
 v_entry=(public.jk_gateway(v_token,'jk_cash_record',v_deposit_args)#>>'{}')::uuid;
 v_again=(public.jk_gateway(v_token,'jk_cash_record',v_deposit_args)#>>'{}')::uuid;
 if v_entry<>v_again then raise exception 'Entrada duplicada no caixa';end if;
 v_snapshot=public.jk_gateway(v_token,'jk_cash_snapshot','{}');
 if (v_snapshot->'account'->>'balance_cents')::bigint<>v_initial+100000 then raise exception 'Saldo inicial incorreto';end if;
 v_failed=false;begin perform public.jk_gateway(v_token,'jk_cash_record',v_deposit_args||jsonb_build_object('p_amount_cents',50000));exception when others then v_failed=true;end;if not v_failed then raise exception 'Idempotência aceitou valores diferentes';end if;
 v_failed=false;begin perform public.jk_gateway(v_token,'jk_cash_record',jsonb_build_object('p_kind','opening','p_amount_cents',100,'p_request_id',gen_random_uuid()));exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou segundo saldo inicial';end if;
 v_contribution=(public.jk_gateway(v_token,'jk_cash_record',jsonb_build_object('p_kind','contribution','p_amount_cents',5000,'p_partner_id',2,'p_request_id',gen_random_uuid()))#>>'{}')::uuid;
 v_failed=false;begin perform public.jk_gateway(v_token,'jk_cash_record',jsonb_build_object('p_kind','withdrawal','p_amount_cents',v_initial+105001,'p_request_id',gen_random_uuid()));exception when others then
  if position('Saldo de caixa insuficiente' in sqlerrm)=0 then raise;end if;v_failed=true;
 end;if not v_failed then raise exception 'Aceitou saída maior que o saldo';end if;
 v_loan_args=jsonb_build_object('p_client',current_setting('jk_test.client')::jsonb,'p_loan',jsonb_build_object('principal_cents',20000,'rate_bps',3000,'fee_cents',1000,'released_on',v_today,'dates',jsonb_build_array(v_today+7,v_today+22)),'p_request_id',v_loan_request);
 v_loan=(public.jk_gateway(v_token,'jk_create_adhesion',v_loan_args)#>>'{}')::uuid;
 v_again=(public.jk_gateway(v_token,'jk_create_adhesion',v_loan_args)#>>'{}')::uuid;if v_again<>v_loan then raise exception 'Adesão duplicada';end if;
 v_snapshot=public.jk_gateway(v_token,'jk_cash_snapshot','{}');
 if (v_snapshot->'account'->>'balance_cents')::bigint<>v_initial+85000 then raise exception 'Liberação não debitou somente o principal';end if;
 if (select count(*) from jsonb_array_elements(v_snapshot->'entries') as e where e->>'loan_id'=v_loan::text and e->>'kind'='loan_disbursement')<>1 then raise exception 'Débito de contrato repetido';end if;
 select (e->>'id')::uuid into v_item from jsonb_array_elements(public.jk_gateway(v_token,'load_table','{"table":"jk_installments","from":0}')) as e where e->>'loan_id'=v_loan::text and e->>'number'='1';
 select (e->>'client_id')::uuid into v_client from jsonb_array_elements(public.jk_gateway(v_token,'load_table','{"table":"jk_loans","from":0}')) as e where e->>'id'=v_loan::text;
 v_request=gen_random_uuid();
 v_receipt=(public.jk_gateway(v_token,'jk_record_payment',jsonb_build_object('p_installment_id',v_item,'p_amount_cents',3333,'p_paid_on',v_today,'p_method','pix','p_request_id',v_request))#>>'{}')::uuid;
 perform public.jk_gateway(v_token,'jk_record_payment',jsonb_build_object('p_installment_id',v_item,'p_amount_cents',3333,'p_paid_on',v_today,'p_method','pix','p_request_id',v_request));
 v_snapshot=public.jk_gateway(v_token,'jk_cash_snapshot','{}');
 if (v_snapshot->'account'->>'balance_cents')::bigint<>v_initial+88333 then raise exception 'Pagamento parcial não entrou corretamente no caixa';end if;
 select e into v_split from jsonb_array_elements(public.jk_gateway(v_token,'load_table','{"table":"jk_society_splits","from":0}')) as e where e->>'receipt_id'=v_receipt::text;
 perform public.jk_gateway(v_token,'jk_society_adjust_split',jsonb_build_object('p_receipt_id',v_receipt,'p_base_cents',3333,'p_share1_bps',8000,'p_expected_version',(v_split->>'version')::bigint));
 v_payout_args=jsonb_build_object('p_partner_id',1,'p_amount_cents',1000,'p_paid_on',v_today,'p_method','pix','p_request_id',v_payout_request);
 v_payout=(public.jk_gateway(v_token,'jk_society_record_payout',v_payout_args)#>>'{}')::uuid;
 perform public.jk_gateway(v_token,'jk_society_record_payout',v_payout_args);
 if (public.jk_gateway(v_token,'jk_cash_snapshot','{}')->'account'->>'balance_cents')::bigint<>v_initial+87333 then raise exception 'Repasse não debitou caixa ou duplicou a baixa';end if;
 perform public.jk_gateway(v_token,'jk_reverse_payment',jsonb_build_object('p_id',v_receipt,'p_reason','Estorno temporário de teste'));
 if (public.jk_gateway(v_token,'jk_cash_snapshot','{}')->'account'->>'balance_cents')::bigint<>v_initial+84000 then raise exception 'Estorno de pagamento não retirou valor do caixa';end if;
 perform public.jk_gateway(v_token,'jk_change_loan',jsonb_build_object('p_id',v_loan,'p_action','cancel','p_reason','Contrato temporário de teste'));
 if (public.jk_gateway(v_token,'jk_cash_snapshot','{}')->'account'->>'balance_cents')::bigint<>v_initial+104000 then raise exception 'Cancelamento não devolveu principal';end if;
 perform public.jk_gateway(v_token,'jk_society_reverse_payout',jsonb_build_object('p_id',v_payout,'p_reason','Repasse temporário de teste'));
 v_withdrawal=(public.jk_gateway(v_token,'jk_cash_record',jsonb_build_object('p_kind','withdrawal','p_amount_cents',500,'p_request_id',gen_random_uuid()))#>>'{}')::uuid;
 if (public.jk_gateway(v_token,'jk_cash_snapshot','{}')->'account'->>'balance_cents')::bigint<>v_initial+104500 then raise exception 'Saída manual incorreta';end if;
 perform public.jk_gateway(v_token,'jk_cash_reverse',jsonb_build_object('p_id',v_withdrawal));
 perform public.jk_gateway(v_token,'jk_cash_reverse',jsonb_build_object('p_id',v_withdrawal));
 if (public.jk_gateway(v_token,'jk_cash_snapshot','{}')->'account'->>'balance_cents')::bigint<>v_initial+105000 then raise exception 'Estorno manual não é idempotente';end if;
 perform public.jk_gateway(v_token,'jk_cash_reverse',jsonb_build_object('p_id',v_contribution));
 perform public.jk_gateway(v_token,'jk_cash_reverse',jsonb_build_object('p_id',v_entry));
 if (public.jk_gateway(v_token,'jk_cash_snapshot','{}')->'account'->>'balance_cents')::bigint<>v_initial then raise exception 'Estornos de aportes não restauraram saldo';end if;
 -- Rejected contracts leave no partially saved loan or cash movement.
 v_failed=false;begin perform public.jk_gateway(v_token,'jk_create_adhesion',jsonb_build_object('p_client_id',v_client,'p_loan',jsonb_build_object('principal_cents',greatest(v_initial+1,20000),'rate_bps',3000,'fee_cents',0,'released_on',v_today,'dates',jsonb_build_array(v_today+7)),'p_request_id',v_bad_request));exception when others then
  if position('Saldo de caixa insuficiente' in sqlerrm)=0 then raise;end if;v_failed=true;
 end;if not v_failed then raise exception 'Liberou empréstimo sem saldo';end if;
 if exists(select 1 from jsonb_array_elements(public.jk_gateway(v_token,'load_table','{"table":"jk_loans","from":0}')) as e where e->>'request_id'=v_bad_request::text) then raise exception 'Falha deixou contrato parcial';end if;
 -- Corrections may expose a deficit; normal outflows must then be blocked.
 v_entry=(public.jk_gateway(v_token,'jk_cash_record',jsonb_build_object('p_kind','contribution','p_amount_cents',1000,'p_request_id',gen_random_uuid()))#>>'{}')::uuid;
 v_loan=(public.jk_gateway(v_token,'jk_create_adhesion',jsonb_build_object('p_client_id',v_client,'p_loan',jsonb_build_object('principal_cents',1000,'rate_bps',0,'fee_cents',0,'released_on',v_today,'dates',jsonb_build_array(v_today+7)),'p_request_id',gen_random_uuid()))#>>'{}')::uuid;
 if v_initial>0 then v_withdrawal=(public.jk_gateway(v_token,'jk_cash_record',jsonb_build_object('p_kind','withdrawal','p_amount_cents',v_initial,'p_request_id',gen_random_uuid()))#>>'{}')::uuid;end if;
 perform public.jk_gateway(v_token,'jk_cash_reverse',jsonb_build_object('p_id',v_entry));
 if (public.jk_gateway(v_token,'jk_cash_snapshot','{}')->'account'->>'balance_cents')::bigint<>-1000 then raise exception 'Estorno escondeu déficit do caixa';end if;
 v_failed=false;begin perform public.jk_gateway(v_token,'jk_cash_record',jsonb_build_object('p_kind','withdrawal','p_amount_cents',1,'p_request_id',gen_random_uuid()));exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou saída com caixa negativo';end if;
 perform public.jk_gateway(v_token,'jk_change_loan',jsonb_build_object('p_id',v_loan,'p_action','cancel','p_reason','Contrato temporário de teste'));
 if v_initial>0 then perform public.jk_gateway(v_token,'jk_cash_reverse',jsonb_build_object('p_id',v_withdrawal));end if;
 v_snapshot=public.jk_gateway(v_token,'jk_cash_snapshot','{}');
 if (select sum((e->>'amount_cents')::bigint) from jsonb_array_elements(v_snapshot->'entries') as e)<>(v_snapshot->'account'->>'balance_cents')::bigint then raise exception 'Extrato e saldo de caixa divergiram';end if;
 v_failed=false;begin perform public.jk_gateway('invalid','jk_cash_snapshot','{}');exception when insufficient_privilege then v_failed=true;end;if not v_failed then raise exception 'Caixa exposto sem token';end if;
 v_failed=false;begin update public.jk_cash_account set balance_cents=999999 where id;exception when insufficient_privilege then v_failed=true;end;if not v_failed then raise exception 'Escrita direta liberada para anon';end if;
end $$;
reset role;
do $$begin perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);end $$;
set local role authenticated;
do $$begin
 if exists(select 1 from public.jk_cash_account) or exists(select 1 from public.jk_cash_entries) then raise exception 'RLS expôs caixa para não administrador';end if;
end $$;
reset role;
rollback;
select 'passed: real anon gateway, initial balance and contributions, atomic principal debit, partial receipts, partner payouts, idempotency, all reversals, cancellation, insufficient funds, deficits, statement reconciliation and RLS' as cash_checks;
