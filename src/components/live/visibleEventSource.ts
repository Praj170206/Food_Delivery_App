"use client";

/**
 * An EventSource that reconnects with backoff and pauses while its tab is in the background.
 *
 * Why pause: on plain HTTP/1.1 (e.g. localhost) a browser allows only 6 open connections per
 * site. Someone testing with customer, hotel, rider and admin tabs open at once would otherwise
 * use them all up, and new requests (even page scripts) would just hang. Map-only streams are
 * closed a few seconds after the tab is hidden and reopened the moment it's visible again.
 * (The main notification stream in LiveProvider stays open so hotel alerts still ring.)
 */
export function visibleEventSource(
  url: string,
  setup: (es: EventSource) => void,
  opts: { onDown?: () => void; hideAfterMs?: number } = {}
) {
  let es: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let stopped = false;

  const close = () => {
    es?.close();
    es = null;
    if (retry) clearTimeout(retry);
    retry = null;
  };
  const connect = () => {
    if (stopped || es) return;
    es = new EventSource(url);
    es.addEventListener("mode", () => (attempts = 0));
    setup(es);
    es.onerror = () => {
      close();
      opts.onDown?.();
      if (!stopped && document.visibilityState === "visible") retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempts++));
    };
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hideTimer ??= setTimeout(() => {
        hideTimer = null;
        close();
        opts.onDown?.();
      }, opts.hideAfterMs ?? 5000);
    } else {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
      connect(); // the server sends a fresh snapshot on connect
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  connect();
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisibility);
    if (hideTimer) clearTimeout(hideTimer);
    close();
  };
}
