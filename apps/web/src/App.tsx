import { lazy, Suspense, useEffect, useState } from "react";
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
import { Link, useLocation } from "./router.js";

// Loaded only when /studio is visited, so learners never download it.
const Studio = lazy(() => import("./Studio.js"));

type Status =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; loaded: LoadedPack; locales: LocaleId[] };

export function App() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [locale, setLocale] = useState<LocaleId>(() => initialLocale(["en", "fr"]));
  const strings: Strings = LOCALES[locale].strings;

  const [attempt, setAttempt] = useState(0);
  const { path, pack: requestedPack } = useLocation();

  useEffect(() => {
    let cancelled = false;
    loadPack(requestedPack).then(
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
  }, [attempt, requestedPack]);

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
  const routes = [
    { to: "/", label: strings.navLesson },
    { to: "/studio", label: strings.navStudio },
  ];

  let page;
  if (path === "/studio") {
    page = (
      <Suspense
        fallback={
          <main className="shell--centered">
            <p className="muted">{strings.loading}</p>
          </main>
        }
      >
        <Studio strings={strings} />
      </Suspense>
    );
  } else if (path !== "/") {
    page = (
      <main className="shell--centered">
        <p>{strings.notFound}</p>
        <Link to="/" className="button">
          {strings.backToLesson}
        </Link>
      </main>
    );
  } else if (lesson) {
    page = (
      <Lesson key={lesson.id} loaded={loaded} lesson={lesson} locale={locale} strings={strings} />
    );
  } else {
    page = (
      <main className="shell--centered">
        <p>{strings.empty}</p>
      </main>
    );
  }

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
      <nav className="nav" aria-label={strings.navLabel}>
        {routes.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className="nav__link"
            aria-current={to === path ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {page}
    </div>
  );
}
