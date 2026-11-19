/**
 * The app's own words, in the languages a learner may already know.
 *
 * These are only for the bootstrap phase: instructions will move into the
 * target language as the learner masters them. Nothing in the target
 * language belongs here; that lives in the language pack.
 */
const en = {
  loading: "Loading…",
  loadError: "The lesson could not be loaded.",
  retry: "Try again",
  empty: "This lesson has nothing ready yet.",
  instruction: "Listen, then choose the matching picture.",
  listen: "Listen",
  wrong: "Not that one. Listen again and choose another.",
  correct: "Correct",
  next: "Next",
  finished: "Lesson complete",
  restart: "Start again",
  instructionsIn: "Instructions in",
  progress: "Exercise {current} of {total}",
  unreviewedNotice: "Preview content: not yet checked by a native speaker.",
  syntheticNotice: "Placeholder computer voice; a native speaker's recording will replace it.",
};

export type Strings = typeof en;

const fr: Strings = {
  loading: "Chargement…",
  loadError: "La leçon n’a pas pu être chargée.",
  retry: "Réessayer",
  empty: "Cette leçon n’a encore rien de prêt.",
  instruction: "Écoutez, puis choisissez l’image correspondante.",
  listen: "Écouter",
  wrong: "Ce n’est pas celle-ci. Réécoutez et choisissez-en une autre.",
  correct: "Correct",
  next: "Suivant",
  finished: "Leçon terminée",
  restart: "Recommencer",
  instructionsIn: "Instructions en",
  progress: "Exercice {current} sur {total}",
  unreviewedNotice: "Contenu provisoire : pas encore vérifié par un locuteur natif.",
  syntheticNotice:
    "Voix de synthèse provisoire ; l’enregistrement d’un locuteur natif la remplacera.",
};

export const LOCALES = {
  en: { name: "English", strings: en },
  fr: { name: "Français", strings: fr },
} as const;

export type LocaleId = keyof typeof LOCALES;

const STORAGE_KEY = "ururimi.locale";

function isLocaleId(value: unknown): value is LocaleId {
  return typeof value === "string" && value in LOCALES;
}

/** The locales this app can speak that the pack also has glosses for. */
export function availableLocales(supportLocales: readonly string[]): LocaleId[] {
  return supportLocales.filter(isLocaleId);
}

/** Pick a starting locale: the saved choice, else the browser's, else the first. */
export function initialLocale(available: readonly LocaleId[]): LocaleId {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private windows); fall through.
  }
  if (isLocaleId(saved) && available.includes(saved)) return saved;
  for (const language of navigator.languages) {
    const base = language.split("-")[0];
    if (isLocaleId(base) && available.includes(base)) return base;
  }
  return available[0] ?? "en";
}

export function saveLocale(locale: LocaleId): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not being able to remember the choice is harmless.
  }
}

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
