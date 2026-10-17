import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { resetActionsScenario, setActionsScenario } from "./handlers/actions";

let started: Promise<unknown> | undefined;

/** Starts the MSW service worker once; later calls reuse the same promise. */
export function enableMocking(): Promise<unknown> {
  if (!started) {
    // Lets E2E tests switch scenarios (errors, delays) in the page's own
    // realm. Only exists while mocking is enabled.
    Object.assign(window, {
      __mock: { setActionsScenario, resetActionsScenario },
    });
    started = setupWorker(...handlers).start({
      onUnhandledRequest: "bypass",
      quiet: true,
    });
  }
  return started;
}
