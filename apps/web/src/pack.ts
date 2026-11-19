import { parsePack, type Pack } from "@ururimi/content-schema";

export interface LoadedPack {
  pack: Pack;
  /** Turn a path inside the pack into a URL the browser can fetch. */
  url: (file: string) => string;
}

interface PackIndex {
  defaultPack: string;
  packs: { id: string }[];
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Load the language pack to teach: the one named by `?pack=` when it exists,
 * otherwise the deployment's default.
 */
export async function loadPack(): Promise<LoadedPack> {
  const base = `${import.meta.env.BASE_URL}packs/`;
  const index = (await fetchJson(`${base}index.json`)) as PackIndex;
  const requested = new URLSearchParams(window.location.search).get("pack");
  const id = index.packs.some((entry) => entry.id === requested) ? requested : index.defaultPack;

  const parsed = parsePack(await fetchJson(`${base}${id}/pack.json`));
  if (!parsed.ok) throw new Error(`Invalid pack "${id}": ${parsed.errors.join("; ")}`);
  return { pack: parsed.pack, url: (file) => `${base}${id}/${file}` };
}
