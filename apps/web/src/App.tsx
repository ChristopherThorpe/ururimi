import { useEffect, useState } from "react";
import { Lesson } from "./Lesson.js";
import {
  availableLocales,
  initialLocale,
  LOCALES,
  saveLocale,
  type LocaleId,
  type Strings,
} from "./locale.js";
import { loadPack, type LoadedPack } from "./pack.js";

type Status =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; loaded: LoadedPack; locales: LocaleId[] };

export function App() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [locale, setLocale] = useState<LocaleId>(() => initialLocale(["en", "fr"]));
  const strings: Strings = LOCALES[locale].strings;

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadPack().then(
      (loaded) => {
        if (cancelled) return;
        const locales = availableLocales(loaded.pack.supportLocales);
        setLocale((current) => (locales.includes(current) ? current : initialLocale(locales)));
        setStatus({ state: "ready", loaded, locales });
      },
      (error: unknown) => {
        if (cancelled) return;
        console.error(error);
        setStatus({ state: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setStatus({ state: "loading" });
    setAttempt((count) => count + 1);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const chooseLocale = (next: LocaleId) => {
    setLocale(next);
    saveLocale(next);
  };

  if (status.state === "loading") {
    return (
      <main className="shell shell--centered">
        <p className="muted">{strings.loading}</p>
      </main>
    );
  }

  if (status.state === "failed") {
    return (
      <main className="shell shell--centered">
        <p role="alert">{strings.loadError}</p>
        <button className="button" onClick={retry}>
          {strings.retry}
        </button>
      </main>
    );
  }

  const { loaded, locales } = status;
  const lesson = loaded.pack.lessons[0];

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="topbar__title" lang={loaded.pack.language.tag}>
          {loaded.pack.language.autonym}
        </h1>
        {locales.length > 1 && (
          <div className="locales" role="group" aria-label={strings.instructionsIn}>
            {locales.map((id) => (
              <button
                key={id}
                className="locales__button"
                lang={id}
                aria-pressed={id === locale}
                onClick={() => chooseLocale(id)}
              >
                {LOCALES[id].name}
              </button>
            ))}
          </div>
        )}
      </header>
      {lesson ? (
        <Lesson key={lesson.id} loaded={loaded} lesson={lesson} locale={locale} strings={strings} />
      ) : (
        <main className="shell--centered">
          <p>{strings.empty}</p>
        </main>
      )}
    </div>
  );
}
