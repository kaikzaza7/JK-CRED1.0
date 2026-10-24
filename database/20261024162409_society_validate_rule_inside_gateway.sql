-- The configure RPC updates both partners in one SQL statement.
-- Validate its final 100% total while that statement still runs inside the
-- authorized gateway. A deferred invoker trigger would run as the API's anon
-- role after the gateway returns, when direct table access is correctly denied.
-- Keep the existing invoker function, RLS, table privileges and RPC guards.
drop trigger jk_society_partner_total on public.jk_society_partners;
create constraint trigger jk_society_partner_total
 after insert or update or delete on public.jk_society_partners
 not deferrable initially immediate
 for each row execute function jk_private.society_check_partners();
