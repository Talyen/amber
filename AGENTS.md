# Working on Amber

- Run the scripts and checks needed to complete an authorized task yourself. Use the repository's existing commands and connected credentials. Hand work back to the user only when progress requires access they must grant, a decision outside the agreed scope, or approval for a destructive operation.
- A request to release Amber includes applying the reviewed schema changes that the release needs, checking the result, and verifying production after deployment. Confirm the linked Vercel project is `talyen-s-projects/amber` and use its production environment for database changes.
- Put production schema changes in reviewed, versioned SQL with an idempotent apply and a verification step. Add them to `pnpm db:migrate` and run `pnpm db:migrate:production` for a production release. Use `db:push` for disposable development databases. Use the targeted migration for production.
- Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before release. Git pushes do not auto-deploy Amber. On an authorized release, use `pnpm release`, then check the production alias and runtime logs.
