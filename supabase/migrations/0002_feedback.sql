-- 試玩回饋：玩家在遊戲裡按「回饋」送出的感想，附上當下的遊戲狀況。
-- 只有登入的玩家能新增自己的回饋；玩家看不到任何回饋（包括自己的），
-- 開發者在 Supabase 的 Table Editor 讀取。
-- 在 Supabase 專案的 SQL Editor 貼上執行一次即可；重複執行不會出錯。

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  scenario_id text not null,
  tags text[] not null default '{}',
  message text not null default '',
  context jsonb not null,
  constraint feedback_message_size check (char_length(message) <= 2000),
  constraint feedback_tags_size check (cardinality(tags) <= 10),
  constraint feedback_context_size check (pg_column_size(context) < 20000)
);

alter table public.feedback enable row level security;

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.feedback from anon;
revoke all on public.feedback from authenticated;
grant insert on public.feedback to authenticated;
