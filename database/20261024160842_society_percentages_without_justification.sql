-- Keep the explicit partner scope required by the API's safeupdate protection.
-- Changing a division requires no written justification; audit snapshots are preserved.
create or replace function jk_private.society_configure(p_share1_bps integer,p_expected_version bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare v_version bigint; v_receipt uuid;
begin
 perform jk_private.require_admin();
 select version into v_version from public.jk_society_settings where id for update;
 if p_expected_version is null or p_expected_version<>v_version then raise exception 'A divisão foi alterada em outra sessão. Atualize os dados e tente novamente.'; end if;
 if p_share1_bps is null or p_share1_bps not between 0 and 10000 then raise exception 'As porcentagens devem estar entre 0 e 100 e somar 100%%.'; end if;
 update public.jk_society_partners set share_bps=case when id=1 then p_share1_bps else 10000-p_share1_bps end,updated_at=now() where id in (1,2);
 update public.jk_society_settings set version=version+1,updated_at=now(),updated_by=auth.uid() where id returning version into v_version;
 for v_receipt in select r.id from public.jk_receipts r left join public.jk_society_splits s on s.receipt_id=r.id where r.voided_at is null and s.id is null order by r.created_at,r.id loop
  perform jk_private.society_allocate_receipt(v_receipt);
 end loop;
 insert into public.jk_events(actor_id,action,details) values(auth.uid(),'Participações societárias atualizadas',jsonb_build_object('share1_bps',p_share1_bps,'share2_bps',10000-p_share1_bps,'version',v_version));
 return v_version;
end $$;

create or replace function jk_private.society_adjust_split(p_receipt_id uuid,p_base_cents bigint,p_share1_bps integer,p_reason text,p_expected_version bigint) returns uuid language plpgsql security definer set search_path='' as $$
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
 -- Optional for older clients; adjustments no longer need a written justification.
 if length(coalesce(p_reason,''))>2000 then raise exception 'O motivo deve ter até 2000 caracteres.'; end if;
 v_before=jsonb_build_object('base_cents',v_split.base_cents,'share1_bps',v_split.share1_bps,'partner1_cents',v_split.partner1_cents,'partner2_cents',v_split.partner2_cents,'version',v_split.version);
 update public.jk_society_splits set base_cents=p_base_cents,share1_bps=p_share1_bps,version=version+1,updated_at=now(),updated_by=auth.uid(),adjustment_reason=trim(coalesce(p_reason,'')) where id=v_split.id;
 insert into public.jk_events(actor_id,action,entity_id,details) values(auth.uid(),'Divisão societária ajustada',v_split.id,jsonb_build_object('receipt_id',p_receipt_id,'reason',trim(coalesce(p_reason,'')),'before',v_before,'after',jsonb_build_object('base_cents',p_base_cents,'share1_bps',p_share1_bps,'version',v_split.version+1)));
 return v_split.id;
end $$;

revoke execute on function jk_private.society_configure(integer,bigint) from public,anon,authenticated;
revoke execute on function jk_private.society_adjust_split(uuid,bigint,integer,text,bigint) from public,anon,authenticated;
