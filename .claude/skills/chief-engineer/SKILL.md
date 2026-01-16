# Chief Engineer Skill

Invokes the Chief Engineer agent for Cortex architecture review and planning.

## Usage

```
/chief-engineer [mode]
```

## Modes

| Mode | Description |
|------|-------------|
| `review` | Full architecture audit |
| `perf` | Performance analysis |
| `propose <goal>` | Implementation planning |
| `radar` | Technology developments |
| (none) | Interactive mode |

## Instructions

When this skill is invoked:

1. **Read the Chief Engineer agent definition** from `.claude/agents/chief-engineer.md`
2. **Execute the requested mode** or enter interactive mode if no mode specified
3. **Apply the agent's principles** - Second Brain philosophy, ADHD-informed design
4. **Output structured recommendations** using the formats defined in the agent

## Quick Reference

### Architecture Review (`/chief-engineer review`)
- Voice pipeline health
- Model orchestration efficiency
- Knowledge graph stats
- UI/UX issues
- Performance bottlenecks

### Performance Audit (`/chief-engineer perf`)
- WebSocket stability
- Audio latency
- Thinking tier response times
- Memory usage

### Improvement Proposal (`/chief-engineer propose <goal>`)
- Architecture changes needed
- Files to modify
- Estimated effort
- Potential risks

### Technology Radar (`/chief-engineer radar`)
- New OpenAI Realtime features
- Competing voice APIs
- Knowledge graph advances
- ADHD assistive tech research

## Key Files to Reference

- `.claude/agents/chief-engineer.md` - Full agent definition
- `src/lib/realtime/realtimeStore.svelte.ts` - Core voice pipeline
- `src/lib/graphrag/` - Knowledge graph
- `src/lib/components/` - UI components
