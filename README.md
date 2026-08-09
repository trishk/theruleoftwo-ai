# TheRuleOfTwo.ai

TheRuleOfTwo.ai is an open-source group chat where people invite multiple AI perspectives to make better decisions together.

Instead of talking to one AI in isolation, users can have conversations with other people and bring AI participants into the discussion when needed.

> Better decisions need more than one perspective.

## Product Principles

- Conversation first
- AI second
- Simple before powerful
- Fast before perfect
- Provider agnostic
- Everything should feel like messaging

## Current Status

The project is under active development.

### Implemented

- Create and manage chats
- Persistent chat messages
- AI @mentions
- Provider-agnostic LLM abstraction
- OpenAI integration
- Responsive chat interface
- Repository security baseline

### In Development

- Google authentication
- User identity
- Claude integration
- Gemini integration
- Conversation-aware AI responses
- Bring Your Own API Keys
- Shared conversations
- Chat invitations
- AI usage and cost tracking

See [docs/ROADMAP.md](docs/ROADMAP.md) for the development roadmap.

## Architecture

The application is designed so that LLM providers remain implementation details rather than becoming application logic.

AI requests go through a provider-independent abstraction:

```text
askLLM(request)
```

This allows OpenAI, Anthropic, Google and future providers to participate in conversations without coupling the application to a specific vendor.

See:

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Architecture Decisions](docs/DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)

## Technology Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma
- SQLite for development

## Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment

Provider API credentials are configured through environment variables during the current development phase.

Do not commit `.env` files or API credentials to the repository.

User-managed provider credentials and zero-storage credential handling are planned as part of the BYO API Keys architecture.

## Project Structure

```text
app/
components/
lib/
prisma/
docs/
```

## Security

Never commit:

- `.env` files
- API keys
- local databases
- secrets or credentials

See the repository `.gitignore` and architecture documentation for the current security approach.

## Contributing

The project is currently in early development.

Architecture and product decisions are documented in `docs/` before major functionality is introduced.

Small, focused changes are preferred.

## License

License to be defined.