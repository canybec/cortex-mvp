# Project Cortex: Master Architecture Plan

## Vision
**"The Cortex"** - An ADHD Prosthetic Executive Function. Not a productivity app that stores lists, but an **active intervention agent** that acts as an external prefrontal cortex.

> "ADHD is a disorder of performance, not knowledge. The user knows what to do but cannot bridge the gap to doing it."

## The "Blue Ocean" Opportunity
Current AI tools are **passive** - they wait for prompts. Cortex is **proactive** - it intervenes based on context.

---

## Architecture Phases

### Phase 1: MVP - "The Walkie-Talkie" ✅ COMPLETE
**Goal:** < 300ms latency voice interaction. "The Big Button" works instantly.

**Stack:**
- Frontend: SvelteKit + Tailwind CSS (Netlify)
- Backend: Azure Functions for token relay
- AI: Azure OpenAI Realtime API (gpt-4o-realtime-preview)
- Audio: Web Audio API + AudioWorklet (24kHz PCM16)

**Features Built:**
- [x] Big Button UI with reactive orb
- [x] Real-time voice conversation
- [x] Interruptible (walkie-talkie style)
- [x] "Thinking Tier" delegation to GPT-5.2 for complex queries
- [x] Visual state indicators (Listening, Speaking, Thinking)
- [x] Conversation transcript

**Missing from Phase 1:**
- [ ] **Search capability** - AI hallucinates data, needs real search
- [ ] Tool calling for structured data extraction
- [ ] Dashboard to display extracted tasks
- [ ] Persona switching (Dad Mode, Therapist Mode)

---

### Phase 2: "Telepathic" Memory (GraphRAG) 🎯 NEXT
**Goal:** The AI remembers relationships, not just keywords.

**Stack:**
- Azure Cosmos DB (Gremlin API for Graph)
- Azure AI Search with GraphRAG
- Vector embeddings for semantic search

**The Problem with Standard RAG:**
Standard vector search finds keywords but misses relationships:
- User: "I don't want to email her."
- Standard AI: "Who is 'her'?"
- **Cortex (GraphRAG):** "Is this about Sarah and the Alpha report? You're avoiding it because you're anxious."

**Knowledge Graph Structure:**
```
User --(has deadline)--> Project Alpha
Project Alpha --(causes anxiety)--> User
Project Alpha --(involves)--> Sarah
Sarah --(is)--> Boss
```

**Features:**
- [ ] User context graph (people, projects, emotions, history)
- [ ] Relationship-aware retrieval
- [ ] Conversation history with semantic linking
- [ ] "State of the Union" injection before each session

---

### Phase 3: "Active" Intervention (Ears & Mouth)
**Goal:** The app calls YOU when you're failing.

**Stack:**
- Azure Communication Services (ACS) for PSTN calls
- Azure Logic Apps for "Watchdog" triggers
- Screen Time API integration (iOS/Android)

**The "Poltergeist" Logic:**
```
IF Task: "Submit Report" is Status: Overdue
AND Current Time > 10:00 AM
THEN → Trigger phone call

User picks up → Cortex: "You promised to finish the report by 10. It's 10:15. What are you doing?"
```

**Features:**
- [ ] Proactive phone calls (not ignorable notifications)
- [ ] Doomscroll detection → intervention trigger
- [ ] Morning Briefing (automated wake-up call)
- [ ] Evening Interrogation (accountability review)

---

### Phase 4: "Prosthetic" Hands (Integrations)
**Goal:** The AI does the clicking for you.

**Stack:**
- Azure Logic Apps + Custom Connectors
- Tool Calling in Realtime API
- OAuth integrations (Google, Microsoft, Slack)

**Tool Definitions:**
```json
{
  "tools": [
    { "name": "send_slack_message", "parameters": { "channel", "message" } },
    { "name": "create_calendar_event", "parameters": { "title", "time", "attendees" } },
    { "name": "add_task", "parameters": { "title", "due_date", "priority" } },
    { "name": "send_email_draft", "parameters": { "to", "subject", "body" } }
  ]
}
```

**Brain Dump → Execution:**
User: "I need to do laundry, email Bob about the contract, and buy milk, oh and remind me to call Mom."

Cortex parses and routes:
- `laundry` → Home task list + Saturday reminder
- `email Bob` → Draft email + "Send now?"
- `buy milk` → Grocery list + location-aware reminder
- `call Mom` → Reminder for Sunday

**Input Integrations (Read):**
- [ ] Google/Outlook Calendar sync
- [ ] Todoist/Linear/Jira task sync
- [ ] Email inbox summary

**Output Integrations (Write):**
- [ ] Slack/Teams messaging
- [ ] Calendar event creation
- [ ] Email drafting
- [ ] Task creation in external apps

---

## The "Persona" System

### Switchable Modes
Based on user state and responsiveness:

| Mode | Personality | Trigger |
|------|-------------|---------|
| **Dad Mode** | Strict, authoritative, holds accountable | User ignoring tasks, needs discipline |
| **Therapist Mode** | Empathetic, exploratory, unblocking | User seems stuck or anxious |
| **Admin Mode** | Brief, efficient, task-focused | Quick task capture/routing |
| **Chill Mode** | Supportive, gentle, encouraging | User is overwhelmed |

### Adaptive Escalation
If user ignores gentle prompts, Cortex escalates:
1. "Hey, maybe we should start working?" (Nice)
2. "You've been scrolling for 45 minutes. Let's refocus." (Firm)
3. "You are violating your own contract. Start now." (Strict)

---

## Technical Stack Summary

| Component | Azure Service | Purpose |
|-----------|--------------|---------|
| **Frontend Relay** | Azure Functions | Secure API key handling, token minting |
| **The Brain** | Azure OpenAI (Realtime API) | Voice conversation, < 300ms latency |
| **The Memory** | Cosmos DB + AI Search | GraphRAG knowledge graph |
| **The Voice (Outbound)** | Azure Communication Services | Phone calls to user |
| **The Hands** | Azure Logic Apps | Integrations (GCal, Slack, Outlook) |
| **The Eyes** | GPT-4o Vision | Image analysis for physical task breakdown |
| **Search** | Tavily/Brave/Bing API | Real-time information retrieval |

---

## Current Status

**Deployed:** https://cortex-adhd.netlify.app

**Phase 1 Status:** 80% complete
- Voice works great
- Thinking tier works but hallucinates data
- Missing: Search, Tool Calling, Dashboard, Personas

**Immediate Next Steps:**
1. Add search capability (Tavily or Bing API)
2. Implement tool calling for task extraction
3. Begin GraphRAG architecture (Phase 2)

---

## The Competition Gap

| Competitor | What They Do | What They Miss |
|------------|--------------|----------------|
| **Motion** | Auto-schedules tasks | Passive - no execution engine |
| **Tiimo** | Visual timers for neurodivergent | Gentle - easily ignored |
| **Overlord** | Financial penalties | Anxiety-inducing, high churn |
| **Focusmate** | Human body doubling | High friction, social anxiety |

**Cortex's Blue Ocean:** Voice-first, context-aware, proactively intervening without the friction of humans or the stress of financial loss.

---

## Success Metrics

1. **Latency:** < 300ms voice response (achieved)
2. **Retention:** Combat "Novelty Cliff" with persona variety
3. **Intervention Rate:** Successfully interrupts doomscrolling
4. **Task Completion:** Measurable improvement in user follow-through

---

*Last Updated: January 2026*
