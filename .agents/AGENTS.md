# Fork rules (refusion)

Rules for this fork, on top of the root `AGENTS.md` (upstream's).

- This is a long-lived fork of 0x2E/fusion. `upstream` is fetch-only; upstream changes are merged in locally.
- Keep fork changes in new files where possible, and leave upstream files minimal, so upstream merges stay easy.
- Multi-session work is tracked with beads (`bd`, prefix `rf`). Load the `beads` skill and read `BEADS.md` first. Never run `bd init`.
- Fork DB migrations are numbered from 900 (`backend/internal/store/migrations/900_*.sql`): `schema_migrations` keys on the number alone, so a fork `007` would make databases silently skip upstream's `007`.
- Notes on why the code is the way it is: `.agents/notes/` (index and doc rules in its `README.md`). Local setup and checks: `.agents/dev.md`. `docs/` is only for people running refusion.
