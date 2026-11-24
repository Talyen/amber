create table if not exists user_valuation_presets (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  ticker text not null references companies(ticker) on delete cascade,
  lens text not null default 'fcf',
  rev_growth double precision not null,
  target_margin double precision not null,
  exit_multiple double precision not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_valuation_presets_user_ticker_idx
  on user_valuation_presets (user_id, ticker);

create index if not exists user_valuation_presets_user_idx
  on user_valuation_presets (user_id);
