begin;
create table jk_private.server_config(id boolean primary key default true check(id), token_hash text not null, actor_id uuid not null references auth.users(id));
revoke all on jk_private.server_config from public,anon,authenticated;
-- The deployment provisions token_hash with a SHA-256 digest. No raw secret is committed.
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
 if v_table not in ('jk_clients','jk_loans','jk_installments','jk_receipts','jk_preferences','jk_events') or v_from<0 then raise exception 'Consulta inválida.'; end if;
 execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from (select * from public.%I order by id limit 500 offset $1) t',v_table) into v_result using v_from;
 return v_result;
 when 'jk_save_client' then return to_jsonb(jk_private.save_client(p_args->'p_data',(p_args->>'p_id')::uuid));
 when 'jk_create_adhesion' then return to_jsonb(jk_private.create_adhesion(p_args->'p_client',(p_args->>'p_client_id')::uuid,p_args->'p_loan',(p_args->>'p_request_id')::uuid));
 when 'jk_record_payment' then return to_jsonb(jk_private.record_payment((p_args->>'p_installment_id')::uuid,(p_args->>'p_amount_cents')::bigint,(p_args->>'p_paid_on')::date,p_args->>'p_method',p_args->>'p_notes',(p_args->>'p_request_id')::uuid));
 when 'jk_reverse_payment' then perform jk_private.reverse_payment((p_args->>'p_id')::uuid,p_args->>'p_reason'); return 'true'::jsonb;
 when 'jk_change_loan' then perform jk_private.change_loan((p_args->>'p_id')::uuid,p_args->>'p_action',p_args->'p_dates',p_args->>'p_reason'); return 'true'::jsonb;
 when 'jk_save_preferences' then perform jk_private.save_preferences(p_args->'p_data'); return 'true'::jsonb;
 else raise exception 'Operação inválida.';
 end case;
end $$;
create function public.jk_gateway(p_token text,p_action text,p_args jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select jk_private.gateway(p_token,p_action,p_args);$$;
revoke all on function jk_private.gateway(text,text,jsonb) from public;
revoke all on function public.jk_gateway(text,text,jsonb) from public;
grant usage on schema jk_private to anon;
grant execute on function jk_private.gateway(text,text,jsonb) to anon,authenticated;
grant execute on function public.jk_gateway(text,text,jsonb) to anon,authenticated;
commit;
