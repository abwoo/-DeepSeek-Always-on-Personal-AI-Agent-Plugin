// Node-only native test bootstrap. Never loaded into or applied to the signed app.
import { Agent, fetch, install, setGlobalDispatcher } from 'undici';
// Node's bundled fetch can initialize the shared dispatcher before this package.
// Replacing fetch alone retains that older dispatcher (and its macOS QoS bug).
// The public API replaces both current and compatibility dispatcher references.
setGlobalDispatcher(new Agent());
install();
export { fetch };
