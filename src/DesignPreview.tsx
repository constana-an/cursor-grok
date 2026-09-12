import { MobileRuntime } from "./mobile";
import { KeyboardProvider } from "./shell/Keyboard";
import Prototype from "./Prototype";

/**
 * The original preview harness, kept for design work on a laptop: it renders
 * the app inside a simulated iPhone with status bar, home indicator and a
 * picture of the keyboard. Reachable at `?preview=1`.
 *
 * Note that the simulated keyboard and safe areas here are approximations —
 * anything about keyboard behaviour or bottom insets has to be confirmed on a
 * real device, not in this frame.
 */
export default function DesignPreview() {
  return (
    <MobileRuntime>
      {/* The screens now read the real shell's keyboard context, so the frame
          has to supply one. The simulated keyboard inside the harness is no
          longer wired to the app: keyboard behaviour is a device-only question
          and pretending otherwise here is what hid the bug in the first place. */}
      <KeyboardProvider>
        <Prototype />
      </KeyboardProvider>
    </MobileRuntime>
  );
}
