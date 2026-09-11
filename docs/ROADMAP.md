# Roadmap

## Phase 1 - Personal MVP

- [x] Project setup
- [x] GitHub
- [x] Next.js
- [x] Prisma
- [x] SQLite
- [x] Create chat
- [x] Chat list
- [x] Persist chat messages
- [x] Chat messaging
- [x] Provider abstraction
- [x] ChatGPT integration
- [x] AI @mentions
- [x] Repository security baseline
- [x] Chat UI redesign
- [x] Responsive navigation

### Next Sprint - Authentication & Identity

- [ ] Google-only authentication
- [ ] Login page
- [ ] Session persistence
- [ ] Protected application routes
- [ ] User identity model
- [ ] Logout

### Following

- [ ] Settings page
- [ ] AI provider connections
- [ ] Persistent API keys
- [ ] Zero-storage API key mode

- [ ] Claude integration
- [ ] Gemini integration

- [ ] Conversation context engine
- [ ] Send conversation history to LLMs
- [ ] Context trimming / summarization for long conversations

- [ ] Streaming responses
- [ ] Rename chat from first prompt

---

## Phase 2 - Collaborative MVP

- [ ] Multiple human participants
- [ ] Chat owner / member roles
- [ ] Invite link per chat
- [ ] Shared conversations

---

## Phase 3 - Cost & Advanced Usage

- [ ] Track provider/model usage per AI response
- [ ] Input/output token tracking
- [ ] Latency tracking
- [ ] Estimated response cost
- [ ] Owner-only chat cost visibility
- [ ] Cost of a Decision
- [ ] Advanced usage analytics

---

## Future

- [ ] Document and test encryption-key rotation/versioning
- [ ] Safely audit the historical `dev.db` before open-sourcing
- [ ] Run a dedicated redacting secret scanner across Git history before publication
- [ ] PostgreSQL
- [ ] Production deployment
- [ ] Memory
- [ ] Voice
- [ ] Mobile
# Watch items

- Usage/cost realtime freshness is guaranteed on the happy path while the initiating client remains connected. If it disconnects before fan-out settles, other tabs may update only on the next refresh or relevant event.
