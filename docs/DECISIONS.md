# Architecture Decisions

## ADR-001

Use Next.js App Router.

Reason:
Official direction of the framework.

---

## ADR-002

Use Prisma + SQLite for development.

Reason:
Zero infrastructure while keeping a production-grade ORM.

---

## ADR-003

LLMs are providers, not application logic.

Reason:
The application should work independently of any specific AI vendor.

---

## ADR-004

One component = one file.

Reason:
Small components are easier to test, reuse and refactor.

---

## ADR-005

Provider abstraction.

The application communicates with:

askLLM(request)

instead of directly with OpenAI, Anthropic or Google SDKs.

Reason:
Supports future providers with minimal code changes.