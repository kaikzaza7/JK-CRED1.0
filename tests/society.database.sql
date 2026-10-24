begin;
do $$
declare
 v_actor uuid; v_client uuid; v_loan uuid; v_item uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid; v_req uuid; v_p1 uuid; v_p2 uuid; v_again uuid; v_version bigint; v_balance bigint; v_initial bigint; v_failed boolean;
 v_raw text; v_cpf text; v_sum integer; v_d1 integer; v_d2 integer; i integer; v_today date=(now() at time zone 'America/Sao_Paulo')::date;
begin
 select actor_id into v_actor from jk_private.server_config where id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 v_initial=jk_private.society_balance(1::smallint);
 loop
  v_raw=lpad(trunc(random()*999999999)::bigint::text,9,'0');v_sum=0;
  for i in 1..9 loop v_sum=v_sum+substr(v_raw,i,1)::integer*(11-i);end loop;
  v_d1=(v_sum*10)%11;if v_d1=10 then v_d1=0;end if;
  v_sum=0;for i in 1..10 loop v_sum=v_sum+substr(v_raw||v_d1::text,i,1)::integer*(12-i);end loop;
  v_d2=(v_sum*10)%11;if v_d2=10 then v_d2=0;end if;
  v_cpf=v_raw||v_d1::text||v_d2::text;
  exit when public.is_valid_cpf(v_cpf) and not exists(select 1 from public.jk_clients where cpf=v_cpf);
 end loop;
 v_client=jk_private.save_client(jsonb_build_object('name','TESTE TEMPORÁRIO SOCIETÁRIO','cpf',v_cpf,'phone','+5579999990001'),null);
 v_loan=jk_private.create_adhesion(null,v_client,jsonb_build_object('principal_cents',20000,'rate_bps',3000,'fee_cents',1000,'released_on',v_today-1,'dates',jsonb_build_array(v_today+7,v_today+22,v_today+37)),gen_random_uuid());
 select id into v_item from public.jk_installments where loan_id=v_loan and number=1;
 v_req=gen_random_uuid();v_r1=jk_private.record_payment(v_item,3333,v_today,'pix','TEMPORÁRIO',v_req);
 v_again=jk_private.record_payment(v_item,3333,v_today,'pix','TEMPORÁRIO',v_req);
 if v_again<>v_r1 or (select count(*) from public.jk_society_splits where receipt_id=v_r1)<>1 then raise exception 'Idempotência do recebimento falhou';end if;
 if not exists(select 1 from public.jk_society_splits where receipt_id=v_r1 and base_cents=3333 and partner1_cents+partner2_cents=3333) then raise exception 'Conservação de centavos falhou';end if;
 select version into v_version from public.jk_society_settings where id;
 v_version=jk_private.society_configure(6000,v_version);
 if (select sum(share_bps) from public.jk_society_partners)<>10000 then raise exception 'Percentuais não somam 100';end if;
 if (select share1_bps from public.jk_society_splits where receipt_id=v_r1)<>5000 then raise exception 'Alteração da regra reescreveu histórico';end if;
 v_r2=jk_private.record_payment(v_item,6000,v_today,'pix','TEMPORÁRIO',gen_random_uuid());
 if not exists(select 1 from public.jk_society_splits where receipt_id=v_r2 and share1_bps=6000 and partner1_cents=3600 and partner2_cents=2400) then raise exception 'Nova regra não aplicada ao recebimento';end if;
 perform jk_private.society_adjust_split(v_r1,2000,5000,'Ajuste temporário para teste',1);
 if not exists(select 1 from public.jk_society_splits where receipt_id=v_r1 and base_cents=2000 and partner1_cents=1000 and partner2_cents=1000 and version=2) then raise exception 'Ajuste individual falhou';end if;
 v_failed=false;begin perform jk_private.society_adjust_split(v_r1,5000,5000,'Teste inválido',2);exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou base acima do recebimento';end if;
 v_failed=false;begin perform jk_private.society_adjust_split(v_r1,2000,5000,'Teste inválido',1);exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou versão antiga do ajuste';end if;
 v_failed=false;begin perform jk_private.society_configure(10001,v_version);exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou porcentagem inválida';end if;
 v_failed=false;begin perform jk_private.society_configure(5000,v_version-1);exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou regra antiga';end if;
 v_balance=jk_private.society_balance(1::smallint);
 v_failed=false;begin perform jk_private.society_record_payout(1::smallint,v_balance+1,v_today,'pix','','',gen_random_uuid());exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou repasse maior que o saldo';end if;
 v_failed=false;begin perform jk_private.society_record_payout(1::smallint,1,v_today+1,'pix','','',gen_random_uuid());exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou repasse futuro';end if;
 v_req=gen_random_uuid();v_p1=jk_private.society_record_payout(1::smallint,1000,v_today,'pix','TEMPORÁRIO','',v_req);
 v_again=jk_private.society_record_payout(1::smallint,1000,v_today,'pix','TEMPORÁRIO','',v_req);
 if v_again<>v_p1 or (select count(*) from public.jk_society_payouts where request_id=v_req)<>1 then raise exception 'Idempotência do repasse falhou';end if;
 v_failed=false;begin perform jk_private.society_record_payout(1::smallint,1001,v_today,'pix','','',v_req);exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou identificador com outros dados';end if;
 v_balance=jk_private.society_balance(1::smallint);
 v_p2=jk_private.society_record_payout(1::smallint,v_balance,v_today,'transferencia','TEMPORÁRIO','',gen_random_uuid());
 if jk_private.society_balance(1::smallint)<>0 then raise exception 'Baixa de saldo falhou';end if;
 perform jk_private.reverse_payment(v_r2,'Estorno temporário de teste');
 if jk_private.society_balance(1::smallint)<>-3600 then raise exception 'Estorno do cliente não gerou compensação correta';end if;
 if not exists(select 1 from public.jk_society_splits where receipt_id=v_r2) then raise exception 'Estorno apagou histórico';end if;
 v_failed=false;begin perform jk_private.society_record_payout(1::smallint,1,v_today,'pix','','',gen_random_uuid());exception when others then v_failed=true;end;if not v_failed then raise exception 'Aceitou repasse com saldo negativo';end if;
 perform jk_private.society_reverse_payout(v_p2,'Devolução temporária de teste');
 perform jk_private.society_reverse_payout(v_p1,'Devolução temporária de teste');
 if jk_private.society_balance(1::smallint)<>v_initial+1000 then raise exception 'Estorno dos repasses não devolveu saldo';end if;
 v_r3=jk_private.record_payment(v_item,6000,v_today,'dinheiro','TEMPORÁRIO',gen_random_uuid());
 if jk_private.society_balance(1::smallint)<>v_initial+4600 then raise exception 'Novo recebimento após estorno incorreto';end if;
 if not exists(select 1 from public.jk_society_partners where id=1 and name='Juan Kelvin') or not exists(select 1 from public.jk_society_partners where id=2 and name='Kaik Andrade') then raise exception 'Perfis fixos incorretos';end if;
end $$;
-- A signed-in person without administrator membership cannot read the new tables.
do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);end $$;
set local role authenticated;
do $$ declare v_failed boolean=false; begin
 if (select count(*) from public.jk_society_partners)<>0 or (select count(*) from public.jk_society_payouts)<>0 or (select count(*) from public.jk_society_splits)<>0 then raise exception 'RLS expôs dados societários';end if;
 begin perform jk_private.society_configure(5000,1);exception when insufficient_privilege then v_failed=true;end;
 if not v_failed then raise exception 'Função privada acessível fora do gateway';end if;
end $$;
reset role;
rollback;
select 'passed: rounding, automatic allocation, partial receipts, rule snapshots, individual adjustments, idempotency, balance limits, reversals, compensation and RLS' as society_checks;
