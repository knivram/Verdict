import type {
  GeminiSetupMessage,
  GeminiAudioMessage,
  GeminiToolResponse,
  GeminiServerMessage,
  FunctionDeclaration,
} from "./types";

const GEMINI_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const MODEL = "gemini-2.5-flash-preview-native-audio-dialog";

const SYSTEM_PROMPT = `You are a real-time fact-checker listening to audio. You will only listen. You are NOT allowed to respond to the user. Except by calling the check_fact function.

When you hear a VERIFIABLE FACTUAL CLAIM, call the check_fact function immediately.

Verifiable claims include:
- Statistics ("unemployment is 3.5%")
- Historical facts ("the Berlin Wall fell in 1989")
- Scientific claims ("the Earth is 4.5 billion years old")
- Specific attributions ("Einstein said E=mc²")

Do NOT flag:
- Opinions or subjective statements
- Future predictions
- Vague statements without specific facts

Be aggressive about detecting claims - when in doubt, flag it.`;

const CHECK_FACT_TOOL: FunctionDeclaration = {
  name: "check_fact",
  description:
    "Call this when you hear a verifiable factual claim that can be fact-checked.",
  parameters: {
    type: "object",
    properties: {
      claim: {
        type: "string",
        description: "The exact factual claim as stated",
      },
      searchQuery: {
        type: "string",
        description: "Optimized search query for fact-checking this claim",
      },
      confidence: {
        type: "number",
        description: "0-1, how verifiable/specific this claim is",
      },
    },
    required: ["claim", "searchQuery", "confidence"],
  },
};

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private setupComplete: boolean = false;
  private pendingToolCalls: Map<string, string> = new Map();

  // Event handlers
  onTranscript: (text: string) => void = () => {};
  onToolCall: (name: string, args: Record<string, unknown>) => void = () => {};
  onError: (error: Error) => void = () => {};
  onClose: () => void = () => {};

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${GEMINI_WS_URL}?key=${this.apiKey}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("[Gemini] WebSocket connected");
        this.sendSetupMessage();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string, resolve);
      };

      this.ws.onerror = (error) => {
        console.error("[Gemini] WebSocket error:", error);
        this.onError(new Error("WebSocket error"));
        reject(error);
      };

      this.ws.onclose = () => {
        console.log("[Gemini] WebSocket closed");
        this.onClose();
      };
    });
  }

  private sendSetupMessage(): void {
    const setupMessage: GeminiSetupMessage = {
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ["TEXT"],
        },
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        tools: [
          {
            functionDeclarations: [CHECK_FACT_TOOL],
          },
        ],
      },
    };

    this.send(setupMessage);
    console.log("[Gemini] Setup message sent");
  }

  private handleMessage(data: string, onSetupComplete?: () => void): void {
    try {
      const message: GeminiServerMessage = JSON.parse(data);

      // Handle setup complete
      if (message.setupComplete) {
        console.log("[Gemini] Setup complete");
        this.setupComplete = true;
        onSetupComplete?.();
        return;
      }

      // Handle transcript
      if (message.serverContent?.modelTurn?.parts) {
        for (const part of message.serverContent.modelTurn.parts) {
          if (part.text) {
            this.onTranscript(part.text);
          }
        }
      }

      // Handle tool calls
      if (message.toolCall?.functionCalls) {
        for (const call of message.toolCall.functionCalls) {
          const callId = call.id || crypto.randomUUID();
          this.pendingToolCalls.set(callId, call.name);
          this.onToolCall(call.name, call.args);

          // Send tool response
          this.sendToolResponse(call.name, { success: true });
        }
      }
    } catch (error) {
      console.error("[Gemini] Failed to parse message:", error);
    }
  }

  private send(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  async sendAudio(chunk: Buffer): Promise<void> {
    if (!this.setupComplete) {
      throw new Error("Session setup not complete");
    }

    const base64Data = chunk.toString("base64");

    const audioMessage: GeminiAudioMessage = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data,
          },
        ],
      },
    };

    this.send(audioMessage);
  }

  private sendToolResponse(name: string, response: Record<string, unknown>): void {
    const toolResponse: GeminiToolResponse = {
      toolResponse: {
        functionResponses: [
          {
            name,
            response,
          },
        ],
      },
    };

    this.send(toolResponse);
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws) {
        resolve();
        return;
      }

      // Give time for any final messages to be processed
      setTimeout(() => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        resolve();
      }, 1000);
    });
  }
}
