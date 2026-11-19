import type { Strings } from "./locale.js";

/**
 * Where contributors will record and review content. Loaded on demand (see
 * App.tsx) so learners never download it. Nothing here is language-specific.
 */
export default function Studio({ strings }: { strings: Strings }) {
  return (
    <main className="page" data-testid="studio">
      <h2 className="page__title">{strings.studioTitle}</h2>
      <p className="muted">{strings.studioPlaceholder}</p>
    </main>
  );
}
