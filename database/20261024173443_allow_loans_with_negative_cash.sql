-- Loan registration is administrative bookkeeping: always debit the principal,
-- including zero or negative starting cash. Other outflow checks remain intact.
create or replace function jk_private.cash_source_changed() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_entry public.jk_cash_entries;
begin
 perform jk_private.require_admin();
 if TG_TABLE_NAME='jk_loans' then
  if TG_OP='INSERT' and new.status<>'cancelled' then
   perform jk_private.cash_post('loan_disbursement',-new.principal_cents,'Liberação do contrato '||new.protocol,p_loan_id=>new.id,p_require_funds=>false);
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
