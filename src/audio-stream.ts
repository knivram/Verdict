import { type WavHeader } from "./types";

const TARGET_SAMPLE_RATE = 16000;
const TARGET_BITS_PER_SAMPLE = 16;
const CHUNK_DURATION_MS = 100;

/**
 * Parse WAV file header to extract audio format information
 */
function parseWavHeader(buffer: Buffer): WavHeader {
  // Check RIFF header
  const riff = buffer.toString("ascii", 0, 4);
  if (riff !== "RIFF") {
    throw new Error("Invalid WAV file: missing RIFF header");
  }

  const wave = buffer.toString("ascii", 8, 12);
  if (wave !== "WAVE") {
    throw new Error("Invalid WAV file: missing WAVE format");
  }

  // Find fmt chunk
  let offset = 12;
  let fmtFound = false;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      fmtFound = true;
      const audioFormat = buffer.readUInt16LE(offset + 8);
      if (audioFormat !== 1) {
        throw new Error("Only PCM WAV files are supported");
      }
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    }

    if (chunkId === "data") {
      if (!fmtFound) {
        throw new Error("Invalid WAV file: fmt chunk must precede data chunk");
      }
      return {
        sampleRate,
        numChannels,
        bitsPerSample,
        dataOffset: offset + 8,
        dataSize: chunkSize,
      };
    }

    offset += 8 + chunkSize;
  }

  throw new Error("Invalid WAV file: data chunk not found");
}

/**
 * Convert audio data to mono 16-bit PCM at 16kHz
 */
function convertToTargetFormat(
  data: Buffer,
  header: WavHeader
): Buffer {
  const { sampleRate, numChannels, bitsPerSample } = header;
  const bytesPerSample = bitsPerSample / 8;
  const frameSize = bytesPerSample * numChannels;
  const numFrames = data.length / frameSize;

  // Calculate output size based on resampling ratio
  const resampleRatio = TARGET_SAMPLE_RATE / sampleRate;
  const outputFrames = Math.floor(numFrames * resampleRatio);
  const output = Buffer.alloc(outputFrames * 2); // 16-bit mono = 2 bytes per sample

  for (let i = 0; i < outputFrames; i++) {
    // Simple nearest-neighbor resampling
    const sourceFrame = Math.floor(i / resampleRatio);
    const sourceOffset = sourceFrame * frameSize;

    // Read sample(s) and convert to 16-bit
    let sample = 0;

    if (bitsPerSample === 16) {
      // Average channels for mono conversion
      for (let ch = 0; ch < numChannels; ch++) {
        sample += data.readInt16LE(sourceOffset + ch * 2);
      }
      sample = Math.round(sample / numChannels);
    } else if (bitsPerSample === 8) {
      // 8-bit is unsigned, convert to signed 16-bit
      for (let ch = 0; ch < numChannels; ch++) {
        sample += (data.readUInt8(sourceOffset + ch) - 128) * 256;
      }
      sample = Math.round(sample / numChannels);
    } else if (bitsPerSample === 32) {
      // 32-bit signed, scale down to 16-bit
      for (let ch = 0; ch < numChannels; ch++) {
        sample += data.readInt32LE(sourceOffset + ch * 4) / 65536;
      }
      sample = Math.round(sample / numChannels);
    } else {
      throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
    }

    // Clamp to 16-bit range
    sample = Math.max(-32768, Math.min(32767, sample));
    output.writeInt16LE(sample, i * 2);
  }

  return output;
}

export interface StreamOptions {
  /** Whether to add delays between chunks to simulate real-time streaming */
  simulateRealtime?: boolean;
}

/**
 * Reads a WAV file and yields PCM chunks at realistic intervals.
 * Converts to 16kHz mono 16-bit PCM format required by Gemini.
 */
export async function* streamAudioFile(
  filePath: string,
  options: StreamOptions = {}
): AsyncGenerator<Buffer> {
  const { simulateRealtime = false } = options;

  const file = Bun.file(filePath);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const header = parseWavHeader(buffer);
  console.log(
    `[Audio] Format: ${header.sampleRate}Hz, ${header.numChannels}ch, ${header.bitsPerSample}-bit`
  );

  // Extract audio data
  const audioData = buffer.subarray(
    header.dataOffset,
    header.dataOffset + header.dataSize
  );

  // Convert to target format (16kHz mono 16-bit)
  const pcmData = convertToTargetFormat(audioData, header);
  console.log(
    `[Audio] Converted to ${TARGET_SAMPLE_RATE}Hz mono ${TARGET_BITS_PER_SAMPLE}-bit`
  );

  // Calculate chunk size: 100ms at 16kHz, 16-bit = 3200 bytes
  const samplesPerChunk = (TARGET_SAMPLE_RATE * CHUNK_DURATION_MS) / 1000;
  const bytesPerChunk = samplesPerChunk * 2; // 16-bit = 2 bytes

  const totalChunks = Math.ceil(pcmData.length / bytesPerChunk);
  console.log(
    `[Audio] Streaming ${totalChunks} chunks (${CHUNK_DURATION_MS}ms each)`
  );

  for (let offset = 0; offset < pcmData.length; offset += bytesPerChunk) {
    const chunk = pcmData.subarray(offset, offset + bytesPerChunk);
    yield chunk;

    if (simulateRealtime) {
      await Bun.sleep(CHUNK_DURATION_MS);
    }
  }

  console.log("[Audio] Stream complete");
}
