/**
 * The licences a language pack may declare for its text, images and audio.
 *
 * Every asset in a pack names one of these. `commercialUse: false` marks
 * assets that must be replaced before the project could ever be used
 * commercially; `pnpm content:check --commercial` fails while any remain.
 */
export const LICENSES = {
  "CC0-1.0": { name: "CC0 1.0 Universal", commercialUse: true },
  "CC-BY-4.0": { name: "Creative Commons Attribution 4.0", commercialUse: true },
  "CC-BY-SA-4.0": { name: "Creative Commons Attribution-ShareAlike 4.0", commercialUse: true },
  "CC-BY-NC-4.0": { name: "Creative Commons Attribution-NonCommercial 4.0", commercialUse: false },
  "public-domain": { name: "Public domain", commercialUse: true },
} as const;

export type LicenseId = keyof typeof LICENSES;

export const LICENSE_IDS = Object.keys(LICENSES) as [LicenseId, ...LicenseId[]];

export function allowsCommercialUse(license: LicenseId): boolean {
  return LICENSES[license].commercialUse;
}
