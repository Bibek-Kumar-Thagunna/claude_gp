"use client";

import * as React from "react";

/**
 * Escape closes the thing on screen.
 *
 * The console's overlays — the invite drawer, the role drawer, the new-coupon
 * drawer, the one-time invitation dialog — each paint a backdrop whose only
 * dismissal was `onClick`. A mouse could leave; a keyboard could not, except by
 * finding the small Close button in the corner. Escape is what every one of those
 * overlays is expected to answer, and `NotificationBell` was the only place in the
 * console that did.
 *
 * `keydown` is listened for on the document, not the panel, because the key press
 * may land on the backdrop, on the page behind it, or on nothing focused at all.
 * The handler is re-bound whenever `onClose` changes so a closure over stale state
 * cannot dismiss with the wrong callback, and removed on unmount.
 *
 * What this hook deliberately does **not** do: it does not hold Tab inside the
 * panel, lock the body's scroll, or return focus to whatever opened the overlay.
 * Those three are the rest of a full modal, and they are missing on purpose rather
 * than by oversight — `staff/page.tsx` mounts `ShareOnceDialog` while
 * `InviteDrawer` is still playing its exit animation, so for about 250ms two
 * overlays are on the page, and two competing focus traps would be a worse bug
 * than the one they fix. The overlays still carry `aria-modal="true"`, which is
 * what makes a screen reader treat the page behind as unavailable; a keyboard user
 * can nonetheless Tab out into it. Recorded as a known gap rather than papered
 * over.
 */
export function useEscape(onClose: () => void): void {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}
