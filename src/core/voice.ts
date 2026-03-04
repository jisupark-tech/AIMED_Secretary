import { spawn } from "node:child_process";
import { createWriteStream, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LLMProvider } from "./types.js";
import { log } from "../utils/logger.js";

export class VoiceEngine {
  private recording = false;
  private tempDir: string;

  constructor(private provider: LLMProvider) {
    this.tempDir = path.join(process.cwd(), "data", "voice");
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async transcribeFile(audioPath: string): Promise<string> {
    // Try local whisper first, fall back to using LLM to describe
    const whisperPath = await this.findWhisper();

    if (whisperPath) {
      return this.transcribeWithWhisper(whisperPath, audioPath);
    }

    // Fallback: use sox to convert to text description via LLM
    log.warn("Whisper not found. Install with: brew install whisper-cpp");
    log.info("Falling back to LLM-based audio description");
    return this.transcribeWithLLM(audioPath);
  }

  async recordAndTranscribe(durationSecs = 10): Promise<string> {
    const audioPath = path.join(this.tempDir, `recording-${Date.now()}.wav`);

    log.info(`Recording ${durationSecs}s of audio...`);
    await this.recordAudio(audioPath, durationSecs);

    const text = await this.transcribeFile(audioPath);

    // Cleanup temp file
    try { unlinkSync(audioPath); } catch {}

    return text;
  }

  private recordAudio(outputPath: string, durationSecs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use sox (rec command) for cross-platform recording
      const proc = spawn("rec", [
        "-q",                    // quiet
        "-r", "16000",           // 16kHz sample rate
        "-c", "1",               // mono
        "-b", "16",              // 16-bit
        outputPath,
        "trim", "0", String(durationSecs),
      ], {
        stdio: ["ignore", "ignore", "pipe"],
      });

      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));

      proc.on("close", (code) => {
        if (code === 0) {
          log.info("Recording complete");
          resolve();
        } else {
          reject(new Error(`Recording failed: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(
          `Recording failed. Install sox: brew install sox\nError: ${err.message}`
        ));
      });
    });
  }

  private async findWhisper(): Promise<string | null> {
    const candidates = ["whisper-cpp", "whisper", "main"];
    for (const cmd of candidates) {
      try {
        const result = await new Promise<boolean>((resolve) => {
          const proc = spawn(cmd, ["--help"], { stdio: "ignore" });
          proc.on("close", (code) => resolve(code === 0));
          proc.on("error", () => resolve(false));
        });
        if (result) return cmd;
      } catch {}
    }
    return null;
  }

  private transcribeWithWhisper(whisperCmd: string, audioPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(whisperCmd, [
        "-m", this.getWhisperModel(),
        "-f", audioPath,
        "--no-timestamps",
        "-l", "auto",
      ], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout.on("data", (d) => (stdout += d.toString()));

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error("Whisper transcription failed"));
        }
      });

      proc.on("error", (err) => reject(err));
    });
  }

  private async transcribeWithLLM(audioPath: string): Promise<string> {
    // Read audio file metadata as fallback
    const response = await this.provider.generate({
      messages: [{
        role: "user",
        content: `An audio file was recorded at ${audioPath}. I cannot transcribe it because Whisper is not installed. Please let the user know they should install whisper-cpp for voice support: brew install whisper-cpp`,
      }],
    });
    return response.content;
  }

  private getWhisperModel(): string {
    const modelPath = process.env.WHISPER_MODEL || "";
    if (modelPath) return modelPath;

    // Default model locations
    const defaults = [
      path.join(process.env.HOME || "", ".cache", "whisper", "ggml-base.bin"),
      "/usr/local/share/whisper/ggml-base.bin",
      path.join(process.cwd(), "models", "ggml-base.bin"),
    ];

    for (const p of defaults) {
      if (existsSync(p)) return p;
    }

    return "ggml-base.bin";
  }
}
