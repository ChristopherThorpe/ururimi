/**
 * Make a playback file from a raw recording. The recording is left untouched.
 *
 *   pnpm audio:normalise <recording> <playback.m4a> [options]
 *
 * Options:
 *   --lufs <n>        loudness to aim for (default -16)
 *   --silence-db <n>  level below which the ends count as silence (default -50)
 *   --lead <s>        silence kept before the first sound, seconds (default 0.05)
 *   --tail <s>        silence kept after the last sound, seconds (default 0.15)
 *
 * Needs ffmpeg and ffprobe on PATH (or set FFMPEG and FFPROBE). Keep the
 * recording somewhere that is not referenced by a pack, so it is never shipped.
 */
import { DEFAULT_OPTIONS, normaliseRecording, type NormaliseOptions } from "./normalise.js";

const FLAGS: Record<string, keyof NormaliseOptions> = {
  "--lufs": "targetLufs",
  "--silence-db": "silenceDb",
  "--lead": "leadSeconds",
  "--tail": "tailSeconds",
};

function usage(message?: string): never {
  if (message) console.error(`${message}\n`);
  console.error("Usage: pnpm audio:normalise <recording> <playback.m4a> [options]");
  console.error(`Options: ${Object.keys(FLAGS).join(" <n>  ")} <n>`);
  console.error(`Defaults: ${JSON.stringify(DEFAULT_OPTIONS)}`);
  process.exit(2);
}

const positional: string[] = [];
const overrides: Partial<NormaliseOptions> = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  const key = FLAGS[arg];
  if (key) {
    const value = Number(args[++i]);
    if (!Number.isFinite(value)) usage(`${arg} needs a number`);
    overrides[key] = value;
  } else if (arg.startsWith("--")) {
    usage(`unknown option ${arg}`);
  } else {
    positional.push(arg);
  }
}
const [input, output] = positional;
if (!input || !output || positional.length > 2) usage();

try {
  const result = await normaliseRecording(input, output, overrides);
  console.log(`wrote ${result.output}`);
  console.log(`  input sha256: ${result.inputSha256}`);
  console.log(
    `  loudness before: ${result.measuredLufs.toFixed(1)} LUFS (${result.normalisationType})`,
  );
  console.log(`  duration: ${result.durationSeconds.toFixed(2)} s`);
  console.log(`  ${result.ffmpegVersion}`);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
