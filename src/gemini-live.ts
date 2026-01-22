import { GoogleGenAI, Modality, Type, type LiveServerMessage, type Session } from "@google/genai";

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

const CHECK_FACT_TOOL = {
  name: "check_fact",
  description:
    "Call this when you hear a verifiable factual claim that can be fact-checked.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      claim: {
        type: Type.STRING,
        description: "The exact factual claim as stated",
      },
      searchQuery: {
        type: Type.STRING,
        description: "Optimized search query for fact-checking this claim",
      },
      confidence: {
        type: Type.NUMBER,
        description: "0-1, how verifiable/specific this claim is",
      },
    },
    required: ["claim", "searchQuery", "confidence"],
  },
};

export class GeminiLiveSession {
  private ai: GoogleGenAI;
  private session: Session | null = null;

  // Event handlers
  onTranscript: (text: string) => void = () => {};
  onToolCall: (name: string, args: Record<string, unknown>) => void = () => {};
  onError: (error: Error) => void = () => {};
  onClose: () => void = () => {};

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect(): Promise<void> {
    this.session = await this.ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.TEXT],
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: [CHECK_FACT_TOOL] }],
      },
      callbacks: {
        onopen: () => {
          console.log("[Gemini] Connected");
        },
        onmessage: (message: LiveServerMessage) => {
          this.handleMessage(message);
        },
        onerror: (e: ErrorEvent) => {
          console.error("[Gemini] Error:", e.message);
          this.onError(new Error(e.message));
        },
        onclose: () => {
          console.log("[Gemini] Connection closed");
          this.onClose();
        },
      },
    });
  }

  private handleMessage(message: LiveServerMessage): void {
    // Handle setup complete
    if (message.setupComplete) {
      console.log("[Gemini] Setup complete");
      return;
    }

    // Handle transcript from model
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
        this.onToolCall(call.name!, call.args as Record<string, unknown>);

        // Send tool response to acknowledge the call
        this.session?.sendToolResponse({
          functionResponses: [
            {
              name: call.name!,
              response: { success: true },
            },
          ],
        });
      }
    }
  }

  async sendAudio(chunk: Buffer): Promise<void> {
    if (!this.session) {
      throw new Error("Session not connected");
    }

    // Convert Buffer to base64 and create inline data object for the SDK
    const base64Data = chunk.toString("base64");

    this.session.sendRealtimeInput({
      media: {
        mimeType: "audio/pcm;rate=16000",
        data: base64Data,
      },
    });
  }

  close(): void {
    this.session?.close();
    this.session = null;
  }
}
