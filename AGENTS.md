<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Security and repository safety

- Never read, open, print, copy, summarize, modify, or delete private `.env` or `.env.*` files, credential stores, real databases, or secret stores. The only exception is `.env.example`, which may be inspected structurally and must contain only empty values and comments, never real values.
- Never enumerate or dump environment variables, including with `env`, `printenv`, `set`, or `Get-ChildItem Env:`.
- Tests must use obviously false credentials and temporary or dedicated databases. E2E must never use `dev.db` or a development/production Supabase project.
- Never put passwords, tokens, keys, cookies, authentication files, private keys, or secret values in URLs, shell arguments, prompts, logs, snapshots, temporary files, commits, or responses.
- Do not call external providers or use real credentials in tests without explicit authorization.
- Do not inspect suspicious Git history with commands that print blob contents. Use metadata-only commands or an approved scanner that redacts values.
- Do not access external dashboards or secret stores, and do not validate, rotate, or revoke credentials, unless the user explicitly authorizes the specific administrative operation.
- Derive required configuration names from source code, schemas, and documentation—not from private environment files.
- Do not install or upgrade dependencies, change network/egress configuration, or access external services without explicit approval.
- Preserve existing user changes and do not modify unrelated files.
- Do not commit, push, merge, or run destructive Git commands without explicit approval.


