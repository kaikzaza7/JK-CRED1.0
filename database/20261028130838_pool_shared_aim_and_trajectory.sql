begin;
-- Additive: keep the current game, scores and player seats intact.
alter table jk_private.pool_room add column aim jsonb, add column aim_revision bigint not null default 0;
create or replace function jk_private.pool_gateway(p_token text,p_action text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid; v_room jk_private.pool_room; v_player jk_private.pool_players; v_mine smallint;
 v_hash text; v_chosen smallint; v_count integer; v_online integer; v_now timestamptz=clock_timestamp();v_game jsonb;
begin
 select actor_id into v_actor from jk_private.server_config where id and token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex');
 if v_actor is null then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 perform jk_private.require_admin();
 if p_action not in ('snapshot','enter','leave','reset','commit','aim') or p_action is null then raise exception 'Operação inválida.';end if;
 if coalesce(p_args->>'player_token','')<>'' and p_args->>'player_token' !~ '^[a-f0-9]{64}$' then raise exception 'Identificação inválida.';end if;
 v_hash=encode(extensions.digest(coalesce(p_args->>'player_token',''),'sha256'),'hex');
 -- A single lock order makes joining and simultaneous shots atomic.
 select * into v_room from jk_private.pool_room where id for update;
 select id into v_mine from jk_private.pool_players where token_hash=v_hash;
 if v_mine is not null then update jk_private.pool_players set last_seen=v_now where id=v_mine;end if;
 if p_action<>'snapshot' and coalesce(p_args->>'player_token','')='' then raise exception 'Entre na mesa para jogar.';end if;
 if p_action='enter' then
  v_chosen=(p_args->>'partner_id')::smallint;
  if v_chosen is null or v_chosen not in (1,2) then raise exception 'Escolha um dos sócios.';end if;
  if v_mine is not null and v_mine<>v_chosen then raise exception 'Saia da mesa antes de trocar de perfil.';end if;
  select * into v_player from jk_private.pool_players where id=v_chosen;
  if v_player.token_hash is not null and v_player.token_hash<>v_hash and v_player.last_seen>v_now-interval '2 minutes' then raise exception 'Esse sócio já está jogando em outro aparelho. Escolha o outro perfil ou aguarde a desconexão.';end if;
  update jk_private.pool_players set token_hash=v_hash,last_seen=v_now where id=v_chosen;
  if v_room.game is null then
   v_game=p_args->'initial';
   if jsonb_array_length(v_game->'balls')<>16 or v_game->>'status'<>'playing' then raise exception 'Mesa inicial inválida.';end if;
   update jk_private.pool_room set game=v_game,version=version+1,aim=null,aim_revision=aim_revision+1,updated_at=v_now where id;
  elsif v_player.token_hash is distinct from v_hash then
   update jk_private.pool_room set version=version+1,aim=null,aim_revision=aim_revision+1,reset_votes=array_remove(reset_votes,v_chosen),updated_at=v_now where id;
  end if;
  v_mine=v_chosen;
 elsif p_action='aim' then
  if v_mine is null then raise exception 'Entre na mesa para mirar.';end if;
  if v_room.game is null or v_room.game->>'status'<>'playing' or (v_room.game->>'turn')::integer<>v_mine then raise exception 'Somente o jogador da vez pode mover o taco.';end if;
  if v_room.version is distinct from (p_args->>'version')::bigint or v_room.busy_until>v_now then raise exception 'A mesa mudou. Atualize a mira.';end if;
  if p_args->>'source_id' is null or p_args->>'source_id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or p_args->>'seq' is null or (p_args->>'seq')::bigint not between 1 and 9007199254740991
   or p_args->>'angle' is null or (p_args->>'angle')::double precision not between -6.283185307179586 and 6.283185307179586
   or p_args->>'power' is null or (p_args->>'power')::double precision not between 0.05 and 1 then raise exception 'Mira inválida.';end if;
  -- Aiming has its own revision: moving the cue never changes the shot version.
  -- Older packets from a drag cannot overwrite the latest direction.
  if v_room.aim->>'source_id' is distinct from p_args->>'source_id' or coalesce((v_room.aim->>'seq')::bigint,0)<(p_args->>'seq')::bigint then
   update jk_private.pool_room set aim=jsonb_build_object('player',v_mine,'version',version,'angle',(p_args->>'angle')::double precision,'power',(p_args->>'power')::double precision,'source_id',p_args->>'source_id','seq',(p_args->>'seq')::bigint,'updated_at',v_now),aim_revision=aim_revision+1 where id;
  end if;
 elsif p_action='leave' then
  if v_mine is not null then
   update jk_private.pool_players set token_hash=null,last_seen=null where id=v_mine;
   update jk_private.pool_room set version=version+1,aim=null,aim_revision=aim_revision+1,reset_votes=array_remove(reset_votes,v_mine),updated_at=v_now where id;
  end if;v_mine=null;
 elsif p_action in ('reset','commit') then
  if v_mine is null then raise exception 'Entre na mesa para jogar.';end if;
  select count(*) into v_online from jk_private.pool_players where token_hash is not null and last_seen>v_now-interval '90 seconds';
  if p_action='commit' and v_room.shot->>'move_id'=p_args->'shot'->>'move_id' and (v_room.shot->>'player')::integer=v_mine then null;
  else
   if v_room.busy_until>v_now then raise exception 'Aguarde as bolas pararem.';end if;
   if p_action='reset' then
    if not v_mine=any(v_room.reset_votes) then update jk_private.pool_room set reset_votes=array_append(reset_votes,v_mine),version=version+1,aim=null,aim_revision=aim_revision+1,updated_at=v_now where id;end if;
    select * into v_room from jk_private.pool_room where id;
    if array_length(v_room.reset_votes,1)=2 and v_online=2 then
     v_game=p_args->'initial';
     if jsonb_array_length(v_game->'balls')<>16 then raise exception 'Mesa inicial inválida.';end if;
     v_game=jsonb_set(v_game,'{turn}',to_jsonb(case when (v_room.round+1)%2=1 then 1 else 2 end));
     update jk_private.pool_room set game=v_game,shot=null,busy_until=v_now,round=round+1,reset_votes='{}',version=version+1,aim=null,aim_revision=aim_revision+1,updated_at=v_now where id;
    end if;
   else
    if v_online<>2 then raise exception 'Aguarde o outro sócio entrar na mesa.';end if;
    if v_room.version<>(p_args->>'version')::bigint or p_args->>'version' is null then raise exception 'A mesa foi atualizada. Confira a sua vez e tente novamente.';end if;
    if v_room.game->>'status'<>'playing' or (v_room.game->>'turn')::integer<>v_mine then raise exception 'Aguarde a sua vez.';end if;
    v_game=p_args->'result';
    if jsonb_array_length(v_game->'balls')<>16 or (v_game->>'turn')::integer not in (1,2)
     or (v_game->'scores'->>0)::integer not between 0 and 15 or (v_game->'scores'->>1)::integer not between 0 and 15
     or (p_args->'shot'->>'duration')::integer not between 300 and 10000
     or v_game->>'status' not in ('playing','finished') then raise exception 'Resultado inválido.';end if;
    select count(*) into v_count from jsonb_array_elements(v_game->'balls') b where (b->>'id')::integer<>0 and (b->>'potted')::boolean;
    if v_count<>(v_game->'scores'->>0)::integer+(v_game->'scores'->>1)::integer then raise exception 'Placar inválido.';end if;
    update jk_private.pool_room set game=v_game,shot=(p_args->'shot')||jsonb_build_object('started_at',v_now),
     busy_until=v_now+((p_args->'shot'->>'duration')::integer*interval '1 millisecond'),reset_votes='{}',version=version+1,aim=null,aim_revision=aim_revision+1,updated_at=v_now where id;
   end if;
  end if;
 end if;
 select * into v_room from jk_private.pool_room where id;
 return jsonb_build_object('aim',v_room.aim,'aim_revision',v_room.aim_revision,'version',v_room.version,'game',v_room.game,'shot',v_room.shot,'busy_until',v_room.busy_until,'round',v_room.round,'reset_votes',v_room.reset_votes,'viewer_id',v_mine,'server_now',clock_timestamp(),
  'players',(select jsonb_agg(jsonb_build_object('id',p.id,'name',s.name,'occupied',p.token_hash is not null,'online',p.token_hash is not null and coalesce(p.last_seen>v_now-interval '90 seconds',false)) order by p.id) from jk_private.pool_players p join public.jk_society_partners s on s.id=p.id));
end $$;
commit;
