CREATE TABLE IF NOT EXISTS public.distribution_counts (
  day date NOT NULL,
  route_group text NOT NULL,
  event text NOT NULL,
  source_group text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (day, route_group, event, source_group)
);
