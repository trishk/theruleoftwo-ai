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

---

## ADR-006

Google-only authentication for the initial multi-user version.

Reason:
Avoid storing and managing user passwords ourselves while keeping authentication simple and secure.

---

## ADR-007

Chat-level membership with owner and member roles.

Reason:
Invitations and permissions should be scoped to individual conversations rather than globally across the application.

---

## ADR-008

API credentials are managed through Settings.

Reason:
Provider credentials should be separated from chat functionality and centrally managed by the user.

The application should support:
- Persistent key storage
- Zero-storage session mode

---

## ADR-009

LLM responses receive conversation context.

Reason:
Providers should reason based on the conversation, not only the latest user message.

Context construction should remain provider-independent and be handled by application logic before calling askLLM().

---

## ADR-010

Track provider usage per LLM response.

Store:
- provider
- model
- input tokens
- output tokens
- latency
- estimated cost

Reason:
Enable owner-only cost transparency and the future "Cost of a Decision" metric.

---

## ADR-011

Invite links are scoped per chat.

Reason:
A user should join only the conversation they were explicitly invited to, rather than receiving general access to another user's workspace.