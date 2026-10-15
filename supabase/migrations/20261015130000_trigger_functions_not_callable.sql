-- Trigger functions are not part of the API.
--
-- Postgres grants EXECUTE on new functions to PUBLIC, and Supabase's
-- security advisor flagged `handle_new_user` — SECURITY DEFINER, so it runs
-- with its owner's rights — as callable by `anon` and `authenticated`.
-- Postgres refuses to run a trigger function outside a trigger, so the grant
-- was not exploitable, but it is a privilege nobody needs: both functions
-- below are only ever invoked by their triggers, which do not check EXECUTE.
-- `delete_my_account` stays callable by signed-in users on purpose; it is
-- the Account page's delete button and removes only the caller.

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.user_records_stamp() from public, anon, authenticated;
