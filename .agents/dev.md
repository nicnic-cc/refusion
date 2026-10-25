# Development

Code style and repo rules are in the root `AGENTS.md` and [`AGENTS.md`](AGENTS.md) here.

## Local setup

Requirements (versions are pinned in-repo, not here):

- Go: [`backend/go.mod`](../backend/go.mod)
- Node.js: [`frontend/package.json`](../frontend/package.json) (`engines`)
- pnpm

Install dependencies:

```shell
# frontend
cd frontend && pnpm install
```

Backend uses Go modules and installs dependencies automatically via `go` tooling.

## Checks before committing

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
pnpm lint
pnpm build
```

If your change is scoped, you can run a smaller test subset first, but run
the relevant final checks before committing.

Full CI-equivalent run: `./scripts.sh test`.
