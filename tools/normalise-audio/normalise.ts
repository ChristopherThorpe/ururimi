/**
 * Turn a raw speaker recording into a playback file.
 *
 * The recording can be whatever a phone produced (WebM/Opus from Chrome on
 * Android, MP4/AAC from Safari on iPhone, WAV, ...). The playback file is
 * mono AAC-LC in an MP4 container (`.m4a`), with leading and trailing silence
 * trimmed and loudness set to a common level. The input is only read, never
 * modified. The format is recorded in docs/adr/0005-playback-audio-format.md.
 *
 * Nothing here knows about any language; it works on audio alone. It wraps
 * ffmpeg (and ffprobe), which must be installed.
 *
 * Repeatability: every encoder setting is fixed and ffmpeg is told to write no
 * timestamps or encoder tags, so the same input run through the same ffmpeg
 * build gives byte-identical output. Different ffmpeg builds may encode the
 * same audio to slightly different bytes; the sound is equivalent, and
 * `ffmpegVersion` in the result says which build wrote the file.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, extname, join, basename, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** What every playback file looks like. Changing it needs a new decision record. */
export const PLAYBACK = {
  extension: ".m4a",
  mimeType: "audio/mp4",
  codec: "aac",
  profile: "LC",
  sampleRate: 48000,
  channels: 1,
  bitrate: "64k",
} as const;

export interface NormaliseOptions {
  /** Integrated loudness to aim for, in LUFS (EBU R128). Default -16. */
  targetLufs: number;
  /** Highest true peak allowed, in dBTP. Default -1.5. */
  truePeakDb: number;
  /** Anything quieter than this (dBFS, RMS) at either end counts as silence. Default -50. */
  silenceDb: number;
  /** Silence kept before the first sound, in seconds. Default 0.05. */
  leadSeconds: number;
  /** Silence kept after the last sound, in seconds. Default 0.15. */
  tailSeconds: number;
}

export const DEFAULT_OPTIONS: NormaliseOptions = {
  targetLufs: -16,
  truePeakDb: -1.5,
  silenceDb: -50,
  leadSeconds: 0.05,
  tailSeconds: 0.15,
};

export interface NormaliseResult {
  output: string;
  /** SHA-256 of the input, which is checked again after the work to prove it was not touched. */
  inputSha256: string;
  /** Loudness of the trimmed input before gain, in LUFS. */
  measuredLufs: number;
  /** "linear" means pure gain; "dynamic" means the limiter had to act on peaks. */
  normalisationType: string;
  durationSeconds: number;
  ffmpegVersion: string;
}

export interface FfmpegStatus {
  ok: boolean;
  /** Why ffmpeg cannot be used, when `ok` is false. */
  reason?: string;
  version?: string;
}

/** Where to find the programs: FFMPEG and FFPROBE override the names looked up on PATH. */
function ffmpegBin(): string {
  return process.env.FFMPEG || "ffmpeg";
}
function ffprobeBin(): string {
  return process.env.FFPROBE || "ffprobe";
}

async function capture(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return run(bin, args, { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
}

/** Check that ffmpeg and ffprobe exist and have what this script needs. */
export async function checkFfmpeg(): Promise<FfmpegStatus> {
  let version: string;
  try {
    const { stdout } = await capture(ffmpegBin(), ["-hide_banner", "-version"]);
    version = stdout.split("\n")[0]?.trim() ?? "unknown";
    await capture(ffprobeBin(), ["-hide_banner", "-version"]);
  } catch {
    return {
      ok: false,
      reason: `ffmpeg and ffprobe were not found (looked for "${ffmpegBin()}" and "${ffprobeBin()}"); install ffmpeg, or set FFMPEG and FFPROBE`,
    };
  }
  const [encoders, filters] = await Promise.all([
    capture(ffmpegBin(), ["-hide_banner", "-encoders"]),
    capture(ffmpegBin(), ["-hide_banner", "-filters"]),
  ]);
  const missing: string[] = [];
  if (!/^\s*A\S*\s+aac\s/m.test(encoders.stdout)) missing.push("the aac encoder");
  for (const filter of ["loudnorm", "silenceremove", "areverse", "aresample"]) {
    if (!new RegExp(`^\\s*\\S+\\s+${filter}\\s`, "m").test(filters.stdout)) {
      missing.push(`the ${filter} filter`);
    }
  }
  if (missing.length > 0) {
    return { ok: false, reason: `this ffmpeg build lacks ${missing.join(", ")}`, version };
  }
  return { ok: true, version };
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Mono, then trim silence from the front, and from the back by reversing. */
function trimFilters(o: NormaliseOptions): string {
  const silence = (keep: number) =>
    `silenceremove=start_periods=1:start_threshold=${o.silenceDb}dB:start_silence=${keep}:detection=peak`;
  return [
    "aformat=channel_layouts=mono",
    silence(o.leadSeconds),
    "areverse",
    silence(o.tailSeconds),
    "areverse",
  ].join(",");
}

interface Measurement {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  target_offset: number;
}

/** First pass: how loud is the trimmed recording? */
async function measure(input: string, o: NormaliseOptions): Promise<Measurement> {
  const filters = `${trimFilters(o)},loudnorm=I=${o.targetLufs}:TP=${o.truePeakDb}:LRA=11:print_format=json`;
  const { stderr } = await capture(ffmpegBin(), [
    "-hide_banner",
    "-nostdin",
    "-nostats",
    "-i",
    input,
    "-vn",
    "-af",
    filters,
    "-f",
    "null",
    "-",
  ]);
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr)?.[0];
  if (!json) throw new Error("could not read the loudness of the recording");
  const raw = JSON.parse(json) as Record<string, string>;
  const value = (key: string) => (raw[key] === undefined ? NaN : Number(raw[key]));
  const measurement: Measurement = {
    input_i: value("input_i"),
    input_tp: value("input_tp"),
    input_lra: value("input_lra"),
    input_thresh: value("input_thresh"),
    target_offset: value("target_offset"),
  };
  if (!Object.values(measurement).every(Number.isFinite)) {
    throw new Error(
      `no sound found: the recording is silent, quieter than ${o.silenceDb} dB (see --silence-db), or has under about half a second of sound to measure`,
    );
  }
  return measurement;
}

/** Duration in seconds, and a check that the file is the playback format. */
export async function probePlayback(file: string): Promise<{ durationSeconds: number }> {
  const { stdout } = await capture(ffprobeBin(), [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_name,profile,sample_rate,channels:format=duration",
    "-of",
    "json",
    file,
  ]);
  const info = JSON.parse(stdout) as {
    streams: { codec_name: string; profile: string; sample_rate: string; channels: number }[];
    format: { duration: string };
  };
  const [stream] = info.streams;
  if (
    info.streams.length !== 1 ||
    stream?.codec_name !== PLAYBACK.codec ||
    stream.profile !== PLAYBACK.profile ||
    Number(stream.sample_rate) !== PLAYBACK.sampleRate ||
    stream.channels !== PLAYBACK.channels
  ) {
    throw new Error(`${file} is not in the playback format`);
  }
  return { durationSeconds: Number(info.format.duration) };
}

/**
 * Write a playback file for `input` at `output`. The output is written under a
 * temporary name and moved into place, so a failure never leaves a broken file.
 */
export async function normaliseRecording(
  input: string,
  output: string,
  overrides: Partial<NormaliseOptions> = {},
): Promise<NormaliseResult> {
  const options = { ...DEFAULT_OPTIONS, ...overrides };
  const inputPath = resolve(input);
  const outputPath = resolve(output);

  if (extname(outputPath).toLowerCase() !== PLAYBACK.extension) {
    throw new Error(`the output file name must end in ${PLAYBACK.extension}`);
  }
  let inputReal: string;
  try {
    inputReal = realpathSync(inputPath);
  } catch {
    throw new Error(`cannot read input: ${input}`);
  }
  let outputReal = outputPath;
  try {
    outputReal = realpathSync(outputPath);
  } catch {
    // The output does not exist yet, which is the usual case.
  }
  if (inputReal === outputReal) throw new Error("the output must not be the input file");

  const status = await checkFfmpeg();
  if (!status.ok) throw new Error(status.reason);

  const before = sha256(inputPath);
  const measured = await measure(inputPath, options);

  mkdirSync(dirname(outputPath), { recursive: true });
  const partial = join(
    dirname(outputPath),
    `.${basename(outputPath)}.partial${PLAYBACK.extension}`,
  );
  const loudnorm = [
    `loudnorm=I=${options.targetLufs}:TP=${options.truePeakDb}:LRA=11`,
    `measured_I=${measured.input_i}:measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}:linear=true:print_format=json`,
  ].join(":");
  try {
    const { stderr } = await capture(ffmpegBin(), [
      "-hide_banner",
      "-nostdin",
      "-nostats",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      // loudnorm works at a high internal rate, so resample after it.
      "-af",
      `${trimFilters(options)},${loudnorm},aresample=${PLAYBACK.sampleRate}`,
      "-ar",
      String(PLAYBACK.sampleRate),
      "-ac",
      String(PLAYBACK.channels),
      "-c:a",
      PLAYBACK.codec,
      "-b:a",
      PLAYBACK.bitrate,
      "-movflags",
      "+faststart",
      "-f",
      "ipod",
      partial,
    ]);
    const type = /"normalization_type"\s*:\s*"(\w+)"/.exec(stderr)?.[1] ?? "unknown";
    const { durationSeconds } = await probePlayback(partial);
    if (!(durationSeconds > 0)) throw new Error("no sound was found in the recording");
    if (sha256(inputPath) !== before) throw new Error("the input file changed during the run");
    renameSync(partial, outputPath);
    return {
      output: outputPath,
      inputSha256: before,
      measuredLufs: measured.input_i,
      normalisationType: type,
      durationSeconds,
      ffmpegVersion: status.version ?? "unknown",
    };
  } finally {
    rmSync(partial, { force: true });
  }
}

/** Integrated loudness of any audio file in LUFS, as ffmpeg measures it (no trimming). */
export async function measureLoudness(file: string): Promise<number> {
  const { stderr } = await capture(ffmpegBin(), [
    "-hide_banner",
    "-nostdin",
    "-nostats",
    "-i",
    file,
    "-vn",
    "-af",
    "loudnorm=print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr)?.[0];
  const value = json ? Number((JSON.parse(json) as Record<string, string>).input_i) : NaN;
  if (!Number.isFinite(value)) throw new Error(`cannot measure the loudness of ${file}`);
  return value;
}
