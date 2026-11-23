DO $migration$
BEGIN
  CREATE INDEX IF NOT EXISTS user_lower_handle_idx ON public."user" (lower(handle));
  CREATE INDEX IF NOT EXISTS arena_lower_handle_idx ON public.arena_portfolios (lower(handle));

  CREATE OR REPLACE FUNCTION public.enforce_arena_handle_owner() RETURNS trigger
  LANGUAGE plpgsql VOLATILE SET search_path TO pg_catalog, public
  AS $function$
  DECLARE
    owner_id text;
    handle_key text := lower(NEW.handle);
  BEGIN
    IF handle_key IS NULL THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'user' THEN
      owner_id := NEW.id;
      IF NOT EXISTS (
        SELECT 1 FROM public."user" WHERE id = NEW.id AND lower(handle) = handle_key
      ) THEN
        RETURN NEW;
      END IF;
    ELSE
      owner_id := NEW.user_id;
      IF NOT EXISTS (
        SELECT 1 FROM public.arena_portfolios WHERE id = NEW.id AND lower(handle) = handle_key
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    -- Defer the constraint until the user's profile and Arena writes are both visible.
    -- At READ COMMITTED the volatile trigger gets a fresh snapshot after taking the lock.
    PERFORM pg_advisory_xact_lock(hashtextextended('amber:arena-handle:' || handle_key, 0));
    IF EXISTS (
      SELECT 1 FROM public."user"
      WHERE lower(handle) = handle_key AND id IS DISTINCT FROM owner_id
    ) OR EXISTS (
      SELECT 1 FROM public.arena_portfolios
      WHERE lower(handle) = handle_key AND user_id IS DISTINCT FROM owner_id
    ) THEN
      RAISE EXCEPTION 'Arena handle already belongs to another owner'
        USING ERRCODE = '23505', CONSTRAINT = 'amber_handle_owner';
    END IF;
    RETURN NEW;
  END;
  $function$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public."user"'::regclass
      AND tgname = 'amber_user_handle_owner'
  ) THEN
    CREATE CONSTRAINT TRIGGER amber_user_handle_owner
    AFTER INSERT OR UPDATE OF handle ON public."user"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_arena_handle_owner();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.arena_portfolios'::regclass
      AND tgname = 'amber_portfolio_handle_owner'
  ) THEN
    CREATE CONSTRAINT TRIGGER amber_portfolio_handle_owner
    AFTER INSERT OR UPDATE OF handle, user_id ON public.arena_portfolios
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_arena_handle_owner();
  END IF;
END;
$migration$;
