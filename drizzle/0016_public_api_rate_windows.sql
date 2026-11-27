CREATE TABLE IF NOT EXISTS public.api_rate_windows (
  window_start bigint NOT NULL,
  client_key text NOT NULL,
  used integer NOT NULL,
  PRIMARY KEY (window_start, client_key)
);
