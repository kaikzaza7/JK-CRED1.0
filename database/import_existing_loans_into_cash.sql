-- Administrative opt-in only: run after an explicit request to include the
-- existing loan principal in cash, allowing the opening position to be negative.
-- No automatic migration or public RPC invokes this operation.
-- Existing cash movements and cancelled loans are preserved. Reruns are no-ops.
do $$
declare v_actor uuid;v_started timestamptz;v_loan record;v_count integer=0;v_total bigint=0;v_before bigint;
begin
 select actor_id into v_actor from jk_private.server_config where id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 perform jk_private.require_admin();
 select started_at into v_started from public.jk_cash_account where id;
 if v_started is null then raise exception 'Fundo de caixa não encontrado.';end if;
 -- Acquire all eligible loan locks before cash, matching normal loan mutations.
 perform 1 from public.jk_loans l where l.status<>'cancelled' and l.created_at<v_started
  and not exists(select 1 from public.jk_cash_entries e where e.loan_id=l.id and e.kind='loan_disbursement')
  order by l.id for update of l;
 select balance_cents into v_before from public.jk_cash_account where id for update;
 for v_loan in select l.id,l.protocol,l.principal_cents from public.jk_loans l
  where l.status<>'cancelled' and l.created_at<v_started
  and not exists(select 1 from public.jk_cash_entries e where e.loan_id=l.id and e.kind='loan_disbursement')
  order by l.created_at,l.id
 loop
  perform jk_private.cash_post('loan_disbursement',-v_loan.principal_cents,
   'Empréstimo anterior incluído no caixa: '||v_loan.protocol,p_loan_id=>v_loan.id,p_require_funds=>false);
  v_count=v_count+1;v_total=v_total+v_loan.principal_cents;
 end loop;
 if v_count>0 then
  insert into public.jk_events(actor_id,action,details) values(v_actor,'Empréstimos anteriores incluídos no caixa',
   jsonb_build_object('loan_count',v_count,'principal_cents',v_total,'balance_before_cents',v_before,'balance_after_cents',v_before-v_total,'administrator_requested',true));
 end if;
 if (select balance_cents from public.jk_cash_account where id)<>(select coalesce(sum(amount_cents),0) from public.jk_cash_entries) then
  raise exception 'Saldo e extrato do caixa divergiram.';
 end if;
end $$;
