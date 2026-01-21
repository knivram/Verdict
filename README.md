# Verdict

Real-time fact-checking for live audio streams.

Verdict watches a live stream, detects verifiable claims, and surfaces research to prove or disprove them — all in real-time.

## How it works

```
Audio Stream → Gemini Live API → Claim Detection → Perplexity Research → Verdict
```

1. **Stream ingestion** — Audio feeds into Gemini's Live API via WebSocket
2. **Claim detection** — The model identifies verifiable factual claims and triggers a function call
3. **Research** — Claims are sent to Perplexity for fast web research
4. **Verdict** — Results stream to the frontend, anchored to the transcript timeline

## Stack

- **Runtime**: Bun
- **Claim detection**: Gemini 2.5 Flash (Live API)
- **Research**: Perplexity API
- **Frontend**: React + WebSocket

## Getting started

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Add your GOOGLE_API_KEY and PERPLEXITY_API_KEY

# Run the server
bun run dev
```

## Environment variables

```
GOOGLE_API_KEY=       # Gemini API key
PERPLEXITY_API_KEY=   # Perplexity API key
PORT=3000             # Server port (optional)
```

## Architecture

```
┌──────────────┐      ┌─────────────────────────────────────────────┐
│              │      │  Verdict Server                             │
│  Audio       │ WSS  │                                             │
│  Source      │─────▶│  ┌─────────────┐     ┌──────────────────┐  │
│              │      │  │ Gemini Live │────▶│ Claim Queue      │  │
└──────────────┘      │  │ Session     │     │ (dedup + priority)│  │
                      │  └─────────────┘     └────────┬─────────┘  │
                      │                               │            │
                      │                               ▼            │
┌──────────────┐      │                      ┌──────────────────┐  │
│              │ WSS  │                      │ Research Workers │  │
│  Frontend    │◀─────│                      │ (Perplexity)     │  │
│              │      │                      └──────────────────┘  │
└──────────────┘      └─────────────────────────────────────────────┘
```

## Claim extraction

Gemini is prompted to call `check_fact` when it hears a verifiable claim:

```typescript
{
  name: "check_fact",
  description: "Called when a verifiable factual claim is detected",
  parameters: {
    claim: string,        // The claim as stated
    searchQuery: string,  // Optimized for research
    confidence: number,   // 0-1, how likely this is checkable
    timestamp: number     // Position in stream
  }
}
```

## Configuration

Context window is tuned for low latency:

```typescript
contextWindowCompression: {
  triggerTokens: 16000,   // ~10 min of audio
  slidingWindow: {
    targetTokens: 8000    // Keep ~5 min of context
  }
}
```

## Limitations

- Gemini Live API sessions max out at 10 minutes per connection (use session resumption for longer streams)
- Research latency varies (typically 2-5 seconds)
- Not all claims are verifiable — model uses judgment

## License

MIT
