import type { PropsWithChildren } from "react";
import { KeyboardProvider } from "./Keyboard";

/**
 * The app shell for a real phone.
 *
 * `src/mobile/` is a design-preview harness: it draws an iPhone — bezel, status
 * bar, home indicator, model picker, and a picture of a keyboard — so a laptop
 * browser can stand in for a device. On an actual iPhone that means a phone
 * rendered inside a phone, which is what this replaces.
 *
 * The exported names match the harness so the screens are unchanged; only the
 * implementations behind them differ. The harness is left on disk and
 * untouched, so the design preview still works via `src/PrototypePreview.tsx`.
 */
export function AppShell({ children }: PropsWithChildren) {
  return (
    <KeyboardProvider>
      <div className="app-root" data-testid="app-root">{children}</div>
    </KeyboardProvider>
  );
}

export { BottomSheet } from "./BottomSheet";
export { KeyboardInput, KeyboardTextarea, KeyboardProvider, useKeyboard, useKeyboardInsets } from "./Keyboard";
export { MobileScroll } from "./MobileScroll";
// Device-agnostic already: it is pointer/touch maths with no frame assumptions.
export { Carousel, type CarouselProps } from "../mobile/Carousel";
