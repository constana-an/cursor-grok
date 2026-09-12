import {
  createContext,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type Ref,
  type TextareaHTMLAttributes,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The real keyboard, on a real phone.
 *
 * The prototype runtime in `src/mobile/` draws a picture of a keyboard and
 * tells the app how tall it is. On a device there is no picture: iOS puts its
 * own keyboard over the page and shrinks `visualViewport` instead, so the only
 * honest source for "how much of the screen is left" is that viewport.
 *
 * The exported shape matches the prototype's on purpose — `useKeyboard`,
 * `useKeyboardInsets`, `KeyboardInput` — so the screens do not have to know
 * which one they are running under.
 */
type KeyboardContextValue = {
  visible: boolean;
  /** How much of the layout viewport the keyboard is covering, in CSS px. */
  height: number;
  hide: () => void;
};

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

/** Below this, a viewport change is a URL bar or a rounding artefact. */
const KEYBOARD_MIN_HEIGHT = 120;

export function KeyboardProvider({ children }: PropsWithChildren) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const measure = () => {
      // What the keyboard (and any browser chrome pinned to the bottom) hides.
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setHeight(covered > KEYBOARD_MIN_HEIGHT ? covered : 0);
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  const value = useMemo<KeyboardContextValue>(() => ({
    visible: height > 0,
    height,
    // Blurring the focused field is the only way a page can ask iOS to put the
    // keyboard away; there is no API for it.
    hide: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        active.blur();
      }
    },
  }), [height]);

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}

export function useKeyboard() {
  const context = useContext(KeyboardContext);
  if (!context) throw new Error("useKeyboard must be used inside KeyboardProvider");
  return context;
}

/**
 * Where fixed bottom chrome belongs. Closed, that is the home-indicator inset;
 * open, it rides directly above the keyboard — the same contract the prototype
 * runtime documents, so the tab bar keeps behaving the way it was fixed to.
 */
export function useKeyboardInsets() {
  const keyboard = useKeyboard();
  const [safeArea, setSafeArea] = useState(0);

  useEffect(() => {
    const read = () => {
      const probe = getComputedStyle(document.documentElement).getPropertyValue("--safe-area-bottom");
      setSafeArea(Number.parseFloat(probe) || 0);
    };
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);

  return {
    bottomInset: keyboard.visible ? keyboard.height : safeArea,
    keyboardHeight: keyboard.height,
    safeArea,
  };
}

type KeyboardInputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

/**
 * A plain input. The system keyboard appears because the field is focused, so
 * there is nothing to trigger — the prototype's `keyboard.show()` call has no
 * counterpart here, and pretending otherwise would fight iOS.
 */
export function KeyboardInput({ ref, ...props }: KeyboardInputProps) {
  return <input {...props} ref={ref} />;
}

export function KeyboardTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} />;
}
