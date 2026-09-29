-- 雲端存檔（第 7 週，企畫書 Q21）
-- 每位玩家、每個劇本一筆存檔；列層級權限（RLS）確保只能讀寫自己的資料。
-- 在 Supabase 專案的 SQL Editor 貼上執行一次即可；重複執行不會出錯。

create table if not exists public.saves (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scenario_id text not null,
  save_version integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scenario_id),
  -- 存檔（含迷霧）約 0.4 MB，設上限避免濫用
  constraint saves_size check (pg_column_size(data) < 2000000)
);

alter table public.saves enable row level security;

drop policy if exists "saves_select_own" on public.saves;
drop policy if exists "saves_insert_own" on public.saves;
drop policy if exists "saves_update_own" on public.saves;
drop policy if exists "saves_delete_own" on public.saves;

create policy "saves_select_own" on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "saves_insert_own" on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saves_update_own" on public.saves
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saves_delete_own" on public.saves
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 未登入（anon）完全不能存取
revoke all on public.saves from anon;
grant select, insert, update, delete on public.saves to authenticated;
