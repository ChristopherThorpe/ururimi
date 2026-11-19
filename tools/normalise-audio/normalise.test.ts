/**
 * Tests for the recording normaliser. They generate short audio (a tone with
 * silence around it) with ffmpeg itself, so they need ffmpeg and skip, with a
 * message saying why, where it is not installed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkFfmpeg, measureLoudness, normaliseRecording, PLAYBACK } from "./normalise.js";

const ffmpeg = process.env.FFMPEG || "ffmpeg";
const status = await checkFfmpeg();
const skipNote = status.ok ? "" : ` (skipped: ${status.reason})`;
if (!status.ok) console.warn(`normalise-audio tests skipped: ${status.reason}`);

const hasOpus =
  status.ok && /\blibopus\b/.test(execFileSync(ffmpeg, ["-hide_banner", "-encoders"]).toString());

/** A 1 s tone, 0.5 s of silence before it and 0.7 s after: 2.2 s in all. */
const TONE_SECONDS = 1;
const LEAD_SILENCE = 0.5;
const TAIL_SILENCE = 0.7;

let dir: string;
let counter = 0;

function path(name: string): string {
  return join(dir, name);
}

/** Make a test recording. `gainDb` sets how loud the tone is; `noise` adds a quiet room tone. */
function makeRecording(
  name: string,
  codecArgs: string[],
  { gainDb = -26, noise = false, tone = TONE_SECONDS } = {},
): string {
  const out = path(name);
  const total = LEAD_SILENCE + tone + TAIL_SILENCE;
  const tonePart = `sine=f=440:d=${tone},volume=${gainDb}dB,adelay=${LEAD_SILENCE * 1000}|${LEAD_SILENCE * 1000},apad=pad_dur=${TAIL_SILENCE}`;
  const inputs = noise
    ? [
        "-f",
        "lavfi",
        "-i",
        tonePart,
        "-f",
        "lavfi",
        "-i",
        `anoisesrc=d=${total}:a=0.001:seed=1`,
        "-filter_complex",
        "[0][1]amix=inputs=2:duration=longest:normalize=0",
      ]
    : ["-f", "lavfi", "-i", tonePart];
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...inputs, ...codecArgs, out]);
  return out;
}

/** Decode to mono 8 kHz samples in -1..1, to find where the sound starts and stops. */
function samples(file: string): Float32Array {
  const raw = execFileSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** Seconds of near-silence before the first sound and after the last one. */
function edges(file: string): { lead: number; tail: number; total: number } {
  const data = samples(file);
  const peak = data.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
  const loud = (x: number) => Math.abs(x) > peak * 0.1;
  const first = data.findIndex(loud);
  let last = data.length - 1;
  while (last > 0 && !loud(data[last] ?? 0)) last--;
  return { lead: first / 8000, tail: (data.length - 1 - last) / 8000, total: data.length / 8000 };
}

function sha(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const PHONE_FORMATS: { name: string; file: string; args: string[]; needsOpus?: boolean }[] = [
  {
    name: "WebM/Opus (Chrome, Android)",
    file: "chrome.webm",
    args: ["-c:a", "libopus", "-b:a", "32k"],
    needsOpus: true,
  },
  { name: "MP4/AAC (Safari, iPhone)", file: "safari.mp4", args: ["-c:a", "aac", "-b:a", "64k"] },
  { name: "WAV", file: "plain.wav", args: ["-c:a", "pcm_s16le", "-ar", "44100"] },
];

describe(`normalise-audio${skipNote}`, () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "normalise-audio-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const needsFfmpeg = status.ok ? it : it.skip;

  for (const format of PHONE_FORMATS) {
    const test = format.needsOpus && !hasOpus ? it.skip : needsFfmpeg;
    test(`trims and levels a ${format.name} recording`, { timeout: 30_000 }, async () => {
      const input = makeRecording(format.file, format.args);
      const output = path(`out-${counter++}.m4a`);
      const result = await normaliseRecording(input, output);

      // The tone is 1 s; the defaults keep 0.05 s before it and 0.15 s after.
      const { lead, tail, total } = edges(output);
      expect(total).toBeGreaterThan(1.1);
      expect(total).toBeLessThan(1.3);
      expect(lead).toBeGreaterThan(0.02);
      expect(lead).toBeLessThan(0.1);
      expect(tail).toBeGreaterThan(0.1);
      expect(tail).toBeLessThan(0.25);
      expect(result.durationSeconds).toBeCloseTo(total, 1);

      // The tone was recorded about 32 LU below the target.
      expect(result.measuredLufs).toBeLessThan(-40);
      expect(await measureLoudness(output)).toBeCloseTo(-16, 0);
      expect(result.normalisationType).toBe("linear");
    });
  }

  needsFfmpeg(
    "brings quiet and loud recordings to the same loudness",
    { timeout: 30_000 },
    async () => {
      const quiet = await normaliseRecording(
        makeRecording("quiet.wav", ["-c:a", "pcm_s16le"], { gainDb: -28 }),
        path("quiet.m4a"),
      );
      const loud = await normaliseRecording(
        makeRecording("loud.wav", ["-c:a", "pcm_s16le"], { gainDb: 10 }),
        path("loud.m4a"),
      );
      expect(quiet.measuredLufs).toBeLessThan(loud.measuredLufs - 30);
      const a = await measureLoudness(quiet.output);
      const b = await measureLoudness(loud.output);
      expect(Math.abs(a - b)).toBeLessThan(0.5);
      expect(a).toBeCloseTo(-16, 0);
    },
  );

  needsFfmpeg("ignores a quiet noise floor when trimming", { timeout: 30_000 }, async () => {
    const input = makeRecording("noisy.wav", ["-c:a", "pcm_s16le"], { noise: true });
    const { output } = await normaliseRecording(input, path("noisy.m4a"));
    const { total } = edges(output);
    expect(total).toBeGreaterThan(1.1);
    expect(total).toBeLessThan(1.3);
  });

  needsFfmpeg("writes the playback format", { timeout: 30_000 }, async () => {
    const input = makeRecording("format.mp4", ["-c:a", "aac", "-ac", "2"]);
    const { output } = await normaliseRecording(input, path("format.m4a"));
    const probe = JSON.parse(
      execFileSync(process.env.FFPROBE || "ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,profile,sample_rate,channels",
        "-of",
        "json",
        output,
      ]).toString(),
    ) as { streams: Record<string, string | number>[] };
    expect(probe.streams).toEqual([
      {
        codec_name: PLAYBACK.codec,
        profile: PLAYBACK.profile,
        sample_rate: String(PLAYBACK.sampleRate),
        channels: PLAYBACK.channels,
      },
    ]);
  });

  needsFfmpeg("gives byte-identical output for the same input", { timeout: 30_000 }, async () => {
    const input = makeRecording("repeat.mp4", ["-c:a", "aac", "-b:a", "64k"]);
    const first = await normaliseRecording(input, path("repeat-1.m4a"));
    const second = await normaliseRecording(input, path("repeat-2.m4a"));
    expect(sha(first.output)).toBe(sha(second.output));
    expect(first.inputSha256).toBe(second.inputSha256);
  });

  needsFfmpeg(
    "leaves the original untouched and leaves no stray files",
    { timeout: 30_000 },
    async () => {
      const input = makeRecording("keep.webm", hasOpus ? ["-c:a", "libopus"] : ["-c:a", "aac"]);
      const before = sha(input);
      const sub = path("shipped");
      const result = await normaliseRecording(input, join(sub, "keep.m4a"));
      expect(sha(input)).toBe(before);
      expect(result.inputSha256).toBe(before);
      expect(readdirSync(sub)).toEqual(["keep.m4a"]);
    },
  );

  needsFfmpeg("refuses to overwrite the input or to write another extension", async () => {
    const input = makeRecording("guard.m4a", ["-c:a", "aac"]);
    const before = sha(input);
    await expect(normaliseRecording(input, input)).rejects.toThrow(/must not be the input/);
    await expect(normaliseRecording(input, path("guard.mp3"))).rejects.toThrow(/must end in \.m4a/);
    await expect(normaliseRecording(path("missing.wav"), path("x.m4a"))).rejects.toThrow(
      /cannot read input/,
    );
    expect(sha(input)).toBe(before);
  });

  needsFfmpeg("fails clearly on silence, writing nothing", { timeout: 30_000 }, async () => {
    const silent = path("silent.wav");
    execFileSync(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=mono",
      "-t",
      "1",
      silent,
    ]);
    const output = path("silent.m4a");
    await expect(normaliseRecording(silent, output)).rejects.toThrow(/no sound found/);
    expect(existsSync(output)).toBe(false);
    expect(readdirSync(dir).filter((name) => name.includes("partial"))).toEqual([]);
  });

  needsFfmpeg("fails clearly on a file that is not audio", async () => {
    const junk = path("junk.wav");
    writeFileSync(junk, "not audio");
    await expect(normaliseRecording(junk, path("junk.m4a"))).rejects.toThrow();
  });
});
