-- Reject unknown/expired state before making an outbound Steam verification request.
create function public.connection_pending(p_hash text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.connection_challenges where state_hash = p_hash and expires_at > now())
$$;
revoke all on function public.connection_pending(text) from public, anon, authenticated;
grant execute on function public.connection_pending(text) to service_role;
