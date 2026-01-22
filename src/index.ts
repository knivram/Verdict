import { GeminiLiveSession } from "./gemini-live";
import { streamAudioFile } from "./audio-stream";
import { checkFact } from "./research";
import type { CheckFactArgs } from "./types";

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error("Usage: bun run src/index.ts <audio-file.wav>");
    console.error("Example: bun run src/index.ts test-audio/sample.wav");
    process.exit(1);
  }

  // Check if file exists
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Get API key from environment
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("Error: GOOGLE_API_KEY environment variable is required");
    console.error("Set it in your .env file or export it in your shell");
    process.exit(1);
  }

  console.log(`\nVerdict v0.1 - Real-time Fact Checker`);
  console.log(`Processing: ${filePath}\n`);

  // Create Gemini session
  const session = new GeminiLiveSession(apiKey);

  // Set up event handlers
  session.onTranscript = (text) => {
    console.log(`[Transcript] ${text}`);
  };

  session.onToolCall = async (name, args) => {
    if (name === "check_fact") {
      const { claim, searchQuery, confidence } = args as unknown as CheckFactArgs;
      await checkFact(claim, searchQuery, confidence);
    }
  };

  session.onError = (error) => {
    console.error(`[Error] ${error.message}`);
  };

  try {
    // Connect to Gemini
    console.log("[Status] Connecting to Gemini Live API...");
    await session.connect();
    console.log("[Status] Connected, streaming audio...\n");

    // Stream audio file
    for await (const chunk of streamAudioFile(filePath, { simulateRealtime: true })) {
      await session.sendAudio(chunk);
    }

    // Wait for final responses
    console.log("\n[Status] Audio stream complete, waiting for final responses...");
    await Bun.sleep(3000);

    // Close session
    await session.close();
    console.log("[Status] Session closed");
  } catch (error) {
    console.error("[Fatal Error]", error);
    process.exit(1);
  }
}

main();
