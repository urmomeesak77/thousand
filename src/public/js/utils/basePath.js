// Base path the app is served under, derived from the <base href> the server
// injects into index.html. '/thousand/' → '/thousand'; a root deploy → ''.
// Lets the WebSocket and REST URLs work whether the app is mounted at the
// origin root or behind a reverse-proxy subpath, without any build step.
export const BASE_PATH = (() => {
  try {
    return new URL(document.baseURI).pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
})();
