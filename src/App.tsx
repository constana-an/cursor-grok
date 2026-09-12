import { Suspense, lazy } from "react";
import { AppShell } from "./shell";
import Prototype from "./Prototype";

/**
 * The shipped app fills the phone.
 *
 * This used to wrap `Prototype` in `MobileRuntime`, which draws a simulated
 * iPhone — bezel, status bar, home indicator, model picker. That is a preview
 * harness for a laptop browser; on an actual iPhone it renders a phone inside
 * the phone. The harness still exists in `src/mobile/` and is reachable at
 * `?preview=1` for design work, loaded on demand so its device artwork stays
 * out of the bundle every real visitor downloads.
 */
const DesignPreview = lazy(() => import("./DesignPreview"));

export default function App() {
  const previewing = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("preview");

  if (previewing) {
    return <Suspense fallback={null}><DesignPreview /></Suspense>;
  }

  return (
    <AppShell>
      <Prototype />
    </AppShell>
  );
}
