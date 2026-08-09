# TheRuleOfTwo.ai - Architecture

## Vision

TheRuleOfTwo.ai is a group chat where people invite AI perspectives to make better decisions together.

The application is provider-agnostic. LLMs are implementation details, not the center of the architecture.

---

## Technology Stack

### Frontend

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

- Next.js Server Actions

### Database

Development
- Prisma
- SQLite

Future
- PostgreSQL

---

## Core Principles

- One component = one file
- One responsibility per component
- Keep pages thin
- Business logic belongs in services
- Provider agnostic architecture
- Small, focused commits

---

## Folder Structure

```
app/
components/
lib/
prisma/
docs/
```

```
components/
    chat/
    ui/
    common/
    layout/
```

```
lib/
    db/
    llm/
```

---

## Planned Architecture

### Authentication

Authentication will use Google sign-in for the initial multi-user version.

The application will not manage user passwords.

Authenticated users will provide the identity layer required for chat ownership, membership and invitations.

---

### Chat Access

Chats are the primary collaboration boundary.

A chat has:

- one owner
- zero or more members
- human participants
- AI participants

Access to conversations is scoped per chat.

Invite links grant membership to a specific chat.

---

### LLM Context

LLM providers should not construct conversation context themselves.

Application logic will build the relevant conversation context before calling:

askLLM(request)

This keeps context handling provider-independent.

Conceptually:

user message
→ resolve mentioned AI participants
→ build conversation context
→ call provider abstraction
→ persist AI response

---

### AI Provider Credentials

Provider credentials are managed separately from conversations through Settings.

The architecture should support:

- persistent credentials
- zero-storage session credentials

Provider-specific credential handling should remain isolated from chat components.

---

### Usage Tracking

Each LLM response can record usage metadata:

- provider
- model
- input tokens
- output tokens
- latency
- estimated cost

Usage data belongs to the AI response and can later be aggregated at conversation or decision level.

---

## Expected Structure

As the application grows, business logic should remain separated into focused modules.

```text
app/
components/
lib/
    db/
    llm/
    auth/
    chat/
    usage/
prisma/
docs/