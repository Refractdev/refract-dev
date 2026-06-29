-- Local dev fix: the base schema enables RLS on public.users with SELECT and
-- UPDATE policies but no INSERT policy. The client-side sign-up flow
-- (AuthContext.signUp / ensureProfileForSession) inserts the profile row as the
-- authenticated user, which RLS would otherwise block. Allow users to insert
-- their own profile row.
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
