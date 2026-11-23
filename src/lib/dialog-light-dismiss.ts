"use client";

import { useEffect, type RefObject } from "react";

const lightDismissProps = { closedby: "any" } as const;

export function useDialogLightDismiss(dialogRef: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype) {
      return;
    }

    // Match native light dismiss when a browser lacks the closedby attribute.
    const isOutside = (event: PointerEvent) => {
      const { left, right, top, bottom } = dialog.getBoundingClientRect();
      return (
        event.clientX < left || event.clientX > right ||
        event.clientY < top || event.clientY > bottom
      );
    };

    let pressedOutside = false;
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) dialog.close();
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [dialogRef]);

  return lightDismissProps;
}
