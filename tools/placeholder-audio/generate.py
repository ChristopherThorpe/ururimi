"""Generate placeholder speech for items that have no human recording yet.

Synthetic clips are a stopgap, never a substitute for a native speaker. They
are written next to the pack's other audio as `<item-id>.tts.wav`; the pack
entry that points at one must declare `kind: "synthetic"`, the voice, and the
voice model's licence. The Kirundi voice used so far (facebook/mms-tts-run)
is CC-BY-NC-4.0, so its clips keep the pack non-commercial until replaced.

Usage:
    python generate.py --pack content/packs/rn --model facebook/mms-tts-run

Only items whose id is passed with --item, or (by default) every item that
has no clip of kind "human", are synthesised. Existing files are kept unless
--force is given.
"""

from __future__ import annotations

import argparse
import json
import sys
import wave
from pathlib import Path


def write_wav(path: Path, samples, sample_rate: int) -> None:
    import numpy as np

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        out.writeframes(pcm.tobytes())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pack", required=True, type=Path, help="pack directory")
    parser.add_argument("--model", required=True, help="Hugging Face VITS model id")
    parser.add_argument("--item", action="append", default=[], help="item id (repeatable)")
    parser.add_argument("--out", default="media/audio", help="output directory inside the pack")
    parser.add_argument("--seed", type=int, default=0, help="makes output repeatable")
    parser.add_argument("--speaking-rate", type=float, default=0.85, help="below 1 is slower")
    parser.add_argument("--force", action="store_true", help="overwrite existing clips")
    args = parser.parse_args()

    import torch
    from transformers import AutoTokenizer, VitsModel

    pack = json.loads((args.pack / "pack.json").read_text(encoding="utf-8"))
    wanted = set(args.item)
    items = [
        item
        for item in pack["items"]
        if (item["id"] in wanted)
        or (not wanted and not any(clip["kind"] == "human" for clip in item["audio"]))
    ]
    missing = wanted - {item["id"] for item in items}
    if missing:
        print(f"unknown item ids: {sorted(missing)}", file=sys.stderr)
        return 1

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = VitsModel.from_pretrained(args.model, use_safetensors=True)
    model.speaking_rate = args.speaking_rate
    model.eval()

    out_dir = args.pack / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    for item in items:
        path = out_dir / f"{item['id']}.tts.wav"
        if path.exists() and not args.force:
            print(f"keep   {path}")
            continue
        inputs = tokenizer(item["text"], return_tensors="pt")
        torch.manual_seed(args.seed)
        with torch.no_grad():
            waveform = model(**inputs).waveform[0]
        write_wav(path, waveform.numpy(), model.config.sampling_rate)
        seconds = waveform.shape[0] / model.config.sampling_rate
        print(f"wrote  {path}  ({seconds:.2f}s)  {item['text']!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
