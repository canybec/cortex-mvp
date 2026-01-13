# Cortex MVP

**ADHD Prosthetic - Voice Interaction MVP**

A high-performance, low-latency voice interaction application built with SvelteKit and Azure OpenAI Realtime API.

## Features

- **"Big Button" UI** - Minimalist interface with a single massive button
- **Voice-first Interaction** - Tap to speak, interrupt anytime
- **Real-time Audio Streaming** - <300ms latency via WebSocket
- **Visual Feedback** - Pulsing visualizer based on audio volume
- **Concise Responses** - AI configured to keep responses under 2 sentences

## Tech Stack

- **Frontend**: SvelteKit (TypeScript) + Tailwind CSS
- **Audio**: Web Audio API (AudioWorklet) - 24kHz/16-bit PCM
- **AI**: Azure OpenAI Realtime API (gpt-4o-realtime-preview)
- **Hosting**: Netlify

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Client    │────▶│  /api/get-token │────▶│ Azure OpenAI     │
│  (Browser)  │     │  (SvelteKit)    │     │ Realtime API     │
└─────────────┘     └─────────────────┘     └──────────────────┘
       │                                            │
       └────────────── WebSocket ───────────────────┘
                   (Direct connection)
```

The "Relay" pattern ensures API keys are never exposed to the client.

## Setup

### 1. Clone and Install

```bash
cd cortex-mvp
npm install
```

### 2. Configure Azure OpenAI

Copy `.env.example` to `.env` and fill in your Azure credentials:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `AZURE_OPENAI_ENDPOINT` | Your Azure OpenAI endpoint (e.g., `https://your-resource.openai.azure.com/`) |
| `AZURE_OPENAI_API_KEY` | API key from Azure Portal |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name (default: `gpt-4o-realtime-preview`) |

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:5173

### 4. Build for Production

```bash
npm run build
```

## Usage

1. **Tap the button** (or press Space) to connect
2. **Start speaking** - the UI will pulse blue while listening
3. **AI responds** - the UI pulses green while speaking
4. **Interrupt anytime** by tapping or pressing Space

## Project Structure

```
cortex-mvp/
├── src/
│   ├── lib/
│   │   ├── audio/
│   │   │   └── audioManager.ts      # Mic capture & playback
│   │   └── realtime/
│   │       └── realtimeStore.svelte.ts  # WebSocket state management
│   ├── routes/
│   │   ├── +page.svelte             # Big Button UI
│   │   └── api/get-token/
│   │       └── +server.ts           # Token relay endpoint
│   ├── app.css                      # Tailwind + animations
│   └── app.html
├── static/
│   └── audio-processor.js           # AudioWorklet processor
├── .env.example
├── netlify.toml
└── package.json
```

## Audio Format

The app uses the exact format required by Azure OpenAI Realtime API:

- **Sample Rate**: 24,000 Hz
- **Channels**: Mono (1)
- **Bit Depth**: 16-bit signed integer (PCM16)

The AudioWorklet handles downsampling from browser's native rate (usually 44.1kHz or 48kHz).

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Toggle listening / Interrupt |

## System Prompt

Cortex is configured as a concise executive assistant:

> "You are Cortex, a sharp and concise executive assistant designed for people with ADHD. Keep ALL responses under 2 sentences unless explicitly asked for more detail."

## Deploy to Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

Set environment variables in Netlify Dashboard under Site Settings > Environment Variables.

## License

MIT
