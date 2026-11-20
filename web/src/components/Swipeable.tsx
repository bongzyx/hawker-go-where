import { useRef, type ReactNode } from "react";

type Gesture = { id: number; x: number; y: number; t: number; dx: number; mode: "pending" | "swipe" | "scroll" };

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Horizontal swipe on a card. The card follows the finger; past a quarter of
 * its width (or on a quick flick) it slides out, `onSwipe` swaps the content,
 * and the new card slides in from the other side. Vertical drags are left alone.
 * `onSwipe(1)` is a swipe to the left (next), `onSwipe(-1)` to the right (previous).
 */
export function Swipeable({
  children,
  canPrev,
  canNext,
  onSwipe,
}: {
  children: ReactNode;
  canPrev: boolean;
  canNext: boolean;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const g = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);

  const move = (x: number, ms = 0, opacity = 1) => {
    const n = el.current;
    if (!n) return;
    n.style.transition = ms ? `transform ${ms}ms ${EASE}, opacity ${ms}ms ease-out` : "none";
    n.style.transform = x ? `translateX(${x}px)` : "";
    n.style.opacity = opacity === 1 ? "" : String(opacity);
  };

  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    if (s.mode !== "swipe") return;
    const n = el.current!;
    const w = n.offsetWidth;
    const dir = s.dx < 0 ? 1 : -1;
    const allowed = dir === 1 ? canNext : canPrev;
    const far = Math.abs(s.dx) > w * 0.25;
    const flick = Math.abs(s.dx) > 40 && e.timeStamp - s.t < 250;
    if (cancelled || !allowed || !(far || flick)) {
      move(0, 260);
      return;
    }
    move(-dir * w, 160, 0);
    window.setTimeout(() => {
      onSwipe(dir);
      move(dir * w * 0.4, 0, 0);
      void n.offsetWidth; // commit the start position before animating in
      move(0, 260);
    }, 160);
  };

  return (
    <div
      ref={el}
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, mode: "pending" };
        swallowClick.current = false;
      }}
      onPointerMove={(e) => {
        const s = g.current;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (s.mode === "pending") {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (Math.abs(dx) <= Math.abs(dy)) {
            s.mode = "scroll";
            return;
          }
          s.mode = "swipe";
          swallowClick.current = true;
          el.current?.setPointerCapture(e.pointerId);
        }
        if (s.mode !== "swipe") return;
        const blocked = (dx > 0 && !canPrev) || (dx < 0 && !canNext);
        s.dx = blocked ? dx / 4 : dx; // rubber-band at either end
        move(s.dx);
      }}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      onClickCapture={(e) => {
        // A drag that started on a button must not also press it.
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
