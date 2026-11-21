import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type Ref } from "react";

type Props = HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> };

/**
 * A horizontally scrolling row that shows there is more to see.
 *
 * - The edges feather out, but only on a side that still has content past it,
 *   so the first and last items are never faded for no reason.
 * - With a mouse or trackpad, small arrow buttons sit on those same edges, and a
 *   plain vertical wheel scrolls the row sideways (passing through once it hits
 *   the end, so it never traps the page).
 */
export function ScrollRow({ ref, className = "", children, style, ...rest }: Props) {
  const node = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = node.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  // Content (counts, chips) can change width without a resize, so re-measure after every render.
  useEffect(update);

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal (trackpad)
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return; // at the end: let the page scroll
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      resize.disconnect();
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
    };
  }, [update]);

  const setRef = (el: HTMLDivElement | null) => {
    node.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = el;
  };

  const page = (dir: 1 | -1) => {
    const el = node.current;
    el?.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={setRef}
        className={`scroll-fade no-scrollbar overflow-x-auto ${className}`}
        style={
          {
            ...style,
            "--fade-l": edges.start ? "0px" : "36px",
            "--fade-r": edges.end ? "0px" : "36px",
          } as React.CSSProperties
        }
        {...rest}
      >
        {children}
      </div>
      {!edges.start && <EdgeButton side="left" onClick={() => page(-1)} />}
      {!edges.end && <EdgeButton side="right" onClick={() => page(1)} />}
    </div>
  );
}

function EdgeButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      // Mouse and trackpad only: on touch the feather plus a swipe is the idiom.
      className={`glass pressable absolute top-1/2 z-10 hidden size-7 -translate-y-1/2 place-items-center rounded-full [@media(hover:hover)_and_(pointer:fine)]:grid ${
        side === "left" ? "left-1" : "right-1"
      }`}
    >
      <Icon size={15} />
    </button>
  );
}
