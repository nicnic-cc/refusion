# Contributing to refusion

refusion is my personal fork of [Fusion](https://github.com/0x2E/fusion), built around my own reading habits. I'm not accepting pull requests, but you're welcome to fork it and shape it to your own needs.

You can leave notes as [issues](https://github.com/nicnic-cc/refusion/issues). I read them when I can, but I can't promise a reply or a fix. If a bug also happens in upstream Fusion, it's best reported in the [Fusion issues](https://github.com/0x2E/fusion/issues).

## 1. Reporting problems

- Search existing issues first to avoid duplicates.
- For bugs, include reproducible steps, expected behavior, and actual behavior.
- For features, explain the concrete use case and user value.

## 2. Local setup

Requirements (versions are pinned in-repo, not here):

- Go: [`backend/go.mod`](./backend/go.mod)
- Node.js: [`frontend/package.json`](./frontend/package.json) (`engines`)
- pnpm

Install dependencies:

```shell
# frontend
cd frontend && pnpm install
```

Backend uses Go modules and installs dependencies automatically via `go` tooling.

## 3. Validation checklist (for local changes)

### Backend

```shell
cd backend
go test ./...
goimports -w .
go build -o /dev/null ./cmd/fusion
```

### Frontend

```shell
cd frontend
pnpm typecheck
pnpm test
pnpm run check:i18n
pnpm build
```

`pnpm lint` currently cannot start: `typescript-eslint` does not support
TypeScript 7 yet (typescript-eslint/typescript-eslint#10940). Re-add it to
the checklist once upstream support lands.

If your change is scoped, you can run a smaller test subset first, but run
the relevant final checks before committing.

## 4. Code style guidelines

- Prefer readable, self-explanatory naming.
- Avoid over-engineering.
- Add comments only for non-obvious logic or decisions.
- Keep docs and API behavior aligned when changing contracts.
