// WAV file header information
export interface WavHeader {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

// Gemini Live API message types

export interface GeminiSetupMessage {
  setup: {
    model: string;
    generationConfig: {
      responseModalities: string[];
    };
    systemInstruction: {
      parts: Array<{ text: string }>;
    };
    tools: Array<{
      functionDeclarations: FunctionDeclaration[];
    }>;
  };
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
}

export interface GeminiAudioMessage {
  realtimeInput: {
    mediaChunks: Array<{
      mimeType: string;
      data: string; // base64 encoded
    }>;
  };
}

export interface GeminiToolResponse {
  toolResponse: {
    functionResponses: Array<{
      name: string;
      response: Record<string, unknown>;
    }>;
  };
}

// Server response types
export interface GeminiServerContent {
  serverContent?: {
    modelTurn?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    turnComplete?: boolean;
  };
}

export interface GeminiToolCall {
  toolCall?: {
    functionCalls?: Array<{
      id?: string;
      name: string;
      args: Record<string, unknown>;
    }>;
  };
}

export interface GeminiSetupComplete {
  setupComplete?: Record<string, unknown>;
}

export type GeminiServerMessage = GeminiServerContent & GeminiToolCall & GeminiSetupComplete;

// Tool call arguments
export interface CheckFactArgs {
  claim: string;
  searchQuery: string;
  confidence: number;
}
