import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

/**
 * A deliberately tiny router over the History API. The app has a handful of
 * screens and no nested layouts, so a library would be more code to carry than
 * this. Routes are matched on the path alone; the query string is only used
 * for the `?pack=` choice, which every link carries along.
 */

const CHANGE = "ururimi:navigate";

export interface Location {
  /** Path without a trailing slash, `/` for the root. */
  path: string;
  /** The language pack asked for in the address, if any. */
  pack: string | null;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener(CHANGE, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(CHANGE, listener);
  };
}

/** One primitive string, so `useSyncExternalStore` sees a stable snapshot. */
const snapshot = () => window.location.pathname + window.location.search;

export function parseLocation(path: string, search: string): Location {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return { path: trimmed || "/", pack: new URLSearchParams(search).get("pack") };
}

/** The current location; re-renders when the learner navigates. */
export function useLocation(): Location {
  const current = useSyncExternalStore(subscribe, snapshot);
  const at = current.indexOf("?");
  return at === -1
    ? parseLocation(current, "")
    : parseLocation(current.slice(0, at), current.slice(at));
}

/** An address for `path` that keeps the current `?pack=` choice. */
export function hrefTo(path: string, pack: string | null): string {
  return pack === null ? path : `${path}?${new URLSearchParams({ pack })}`;
}

export function navigate(href: string): void {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new Event(CHANGE));
  window.scrollTo(0, 0);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string };

/** An ordinary link that moves within the app without reloading the page. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const { pack } = useLocation();
  const href = hrefTo(to, pack);
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const plain =
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      (rest.target === undefined || rest.target === "_self");
    if (event.defaultPrevented || !plain) return; // let the browser open tabs and the like
    event.preventDefault();
    navigate(href);
  };
  return <a {...rest} href={href} onClick={handle} />;
}
