// WAV file header information
export interface WavHeader {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

// Tool call arguments
export interface CheckFactArgs {
  claim: string;
  searchQuery: string;
  confidence: number;
}
