import { useEffect, useRef, type ReactNode } from "react";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

type Drag = { x: number; y: number; t: number; dy: number; mode: "pending" | "drag" | "scroll" };

/**
 * A full-screen scrolling sheet that closes when pulled down from the top.
 * The drag only starts when the sheet is already scrolled to the top and the
 * finger moves mostly downwards; otherwise it scrolls as normal. Pull past
 * 120px, or flick, and it slides away before `onDismiss` runs.
 *
 * Uses touch events (not pointer events) because the browser claims a vertical
 * pan for scrolling and cancels the pointer; a non-passive touchmove can stop that.
 */
export function DismissibleSheet({
  onDismiss,
  className,
  children,
}: {
  onDismiss: () => void;
  className?: string;
  children: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    const n = el.current;
    if (!n) return;
    let d: Drag | null = null;

    const place = (y: number, ms = 0) => {
      n.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
      n.style.transform = y ? `translateY(${y}px)` : "";
    };

    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      d = e.touches.length === 1 && n.scrollTop <= 0
        ? { x: t.clientX, y: t.clientY, t: e.timeStamp, dy: 0, mode: "pending" }
        : null;
    };

    const move = (e: TouchEvent) => {
      if (!d || d.mode === "scroll") return;
      const t = e.touches[0];
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      if (d.mode === "pending") {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        d.mode = dy > 0 && dy >= Math.abs(dx) ? "drag" : "scroll";
        if (d.mode === "scroll") return;
      }
      if (e.cancelable) e.preventDefault();
      d.dy = Math.max(0, dy);
      place(d.dy);
    };

    const end = (e: TouchEvent) => {
      const g = d;
      d = null;
      if (!g || g.mode !== "drag") return;
      const flick = g.dy > 60 && e.timeStamp - g.t < 300;
      if (e.type === "touchend" && (g.dy > 120 || flick)) {
        place(n.offsetHeight, 220);
        window.setTimeout(() => dismiss.current(), 200);
      } else {
        place(0, 280);
      }
    };

    n.addEventListener("touchstart", start, { passive: true });
    n.addEventListener("touchmove", move, { passive: false });
    n.addEventListener("touchend", end);
    n.addEventListener("touchcancel", end);
    return () => {
      n.removeEventListener("touchstart", start);
      n.removeEventListener("touchmove", move);
      n.removeEventListener("touchend", end);
      n.removeEventListener("touchcancel", end);
    };
  }, []);

  return (
    <div ref={el} className={className}>
      {children}
    </div>
  );
}
