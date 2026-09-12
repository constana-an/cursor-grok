import { type PropsWithChildren, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDrag } from "@use-gesture/react";
import { AnimatePresence, motion } from "motion/react";
import { useKeyboard, useKeyboardInsets } from "./Keyboard";

type BottomSheetProps = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  snap?: number;
}>;

/**
 * The prototype's sheet, minus the device frame.
 *
 * Two things change on a real phone: it portals into `document.body` rather
 * than into a simulated screen element, and its height comes from the actual
 * viewport instead of a hard-coded device geometry. The drag-to-dismiss, the
 * springs and the exit animation are worth keeping exactly as they were.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  snap = 0.72,
  children,
}: BottomSheetProps) {
  const keyboard = useKeyboard();
  const { keyboardHeight } = useKeyboardInsets();
  const [dragY, setDragY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    (typeof window === "undefined" ? 800 : window.innerHeight));

  useEffect(() => {
    const measure = () => setViewportHeight(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  useEffect(() => {
    if (open) keyboard.hide();
    // Opening is the event that dismisses the keyboard, not every keyboard change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) keyboard.hide();
    onOpenChange(nextOpen);
  };

  const bindDrag = useDrag(
    (state) => {
      const [, movementY] = state.movement;
      const [, velocityY] = state.velocity;
      const [, directionY] = state.direction;
      const nextY = Math.max(0, movementY);

      if (!state.last) {
        setDragY(nextY);
        return;
      }

      const shouldClose = nextY > 96 || (velocityY > 0.55 && directionY > 0);
      setDragY(0);
      if (shouldClose) onOpenChange(false);
    },
    { axis: "y", filterTaps: true },
  );

  const sheetHeight = Math.round(viewportHeight * snap);
  const effectiveHeight = Math.max(260, sheetHeight - Math.min(keyboardHeight, 180));

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {/* Kept mounted after `open` flips so AnimatePresence can run the exit
          animation before Radix removes the node. */}
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  className="sheet-overlay app-sheet-overlay"
                  data-testid="sheet-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div
                  className="bottom-sheet app-sheet"
                  data-testid="bottom-sheet"
                  style={{ bottom: keyboardHeight, maxHeight: effectiveHeight }}
                  initial={{ y: effectiveHeight + 36 }}
                  animate={{ y: dragY }}
                  exit={{
                    y: effectiveHeight + 36,
                    transition: { type: "spring", stiffness: 250, damping: 30, mass: 1.05 },
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 43, mass: 0.9 }}
                >
                  <div className="sheet-handle-zone" data-testid="sheet-handle" {...bindDrag()}>
                    <div className="sheet-handle" />
                  </div>
                  <div className="sheet-header">
                    <Dialog.Title className="sheet-title">{title}</Dialog.Title>
                    {description ? <Dialog.Description className="sheet-description">{description}</Dialog.Description> : null}
                  </div>
                  <div className="sheet-content">{children}</div>
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
