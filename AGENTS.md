<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Security and repository safety

- Never read, open, print, copy, summarize, modify, or delete `.env` or `.env.*` files. The only exception is `.env.example`, which must contain placeholders only.
- Never enumerate or dump environment variables, including with `env`, `printenv`, `set`, or `Get-ChildItem Env:`.
- Never expose credentials, tokens, cookies, authentication files, private keys, or secret values in prompts, logs, tests, commits, or responses.
- Derive required configuration names from source code, schemas, and documentation—not from private environment files.
- Do not install or upgrade dependencies, change network/egress configuration, or access external services without explicit approval.
- Preserve existing user changes and do not modify unrelated files.
- Do not commit, push, merge, or run destructive Git commands without explicit approval.


