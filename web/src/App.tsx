import { List, LocateFixed, Map as MapIcon, Navigation, RefreshCw, Search, Star, X } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HawkerCard, HawkerDetail, HawkerRow, type Row } from "./components/hawker";
import type { MapPoint } from "./components/MapView";
import { DismissibleSheet } from "./components/DismissibleSheet";
import { ScrollRow } from "./components/ScrollRow";
import { Swipeable } from "./components/Swipeable";

// MapLibre is ~1 MB; the list and summary should not wait for it.
const MapView = lazy(() => import("./components/MapView").then((m) => ({ default: m.MapView })));
import { DayStrip, StatusDot, type DayCount } from "./components/viz";
import { addDays, formatDay, formatTimestamp } from "./lib/dates";
import { distanceKm, formatDistance, useFavourites, useGeolocation, useHawkers, useMediaQuery, useToday } from "./lib/hooks";
import { useDark } from "./lib/scheme";
import { STATE_LABEL, STATE_ORDER, statusOn, statusSentence, type State } from "./lib/status";
import { bindBackButton, haptics, isTelegram, startParam } from "./lib/telegram";

type Filter = "all" | "closed" | "soon" | "open" | "favourites";
type Sort = "status" | "nearest" | "name";

const STRIP_DAYS = 21;

function initialHawkerId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("h");
  if (fromUrl) return fromUrl;
  const param = startParam();
  return param?.startsWith("h_") ? param.slice(2) : null;
}

function matches(row: Row, q: string): boolean {
  if (!q) return true;
  const h = row.hawker;
  return [h.name, h.altName, h.address, h.postalCode].some((v) => v?.toLowerCase().includes(q));
}

function inFilter(row: Row, filter: Filter, favs: string[]): boolean {
  switch (filter) {
    case "all":
      return true;
    case "closed":
      return row.status.state === "closed" || row.status.state === "works";
    case "favourites":
      return favs.includes(row.hawker.id);
    default:
      return row.status.state === filter;
  }
}

function compare(sort: Sort) {
  return (a: Row, b: Row) => {
    if (sort === "nearest" && a.distance !== null && b.distance !== null) return a.distance - b.distance;
    if (sort === "status" || sort === "nearest") {
      const s = STATE_ORDER.indexOf(a.status.state) - STATE_ORDER.indexOf(b.status.state);
      if (s) return s;
      const soon = (a.status.daysUntilNext ?? 999) - (b.status.daysUntilNext ?? 999);
      if (a.status.state === "soon" && soon) return soon;
    }
    return a.hawker.name.localeCompare(b.hawker.name);
  };
}

export function App() {
  const { data, error, loading, reload } = useHawkers();
  const today = useToday();
  const dark = useDark();
  const desktop = useMediaQuery("(min-width: 900px)");
  const favs = useFavourites();
  const geo = useGeolocation();

  const [day, setDay] = useState(today);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("status");
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(initialHawkerId);
  const [detailOpen, setDetailOpen] = useState(() => initialHawkerId() !== null);
  const [focusKey, setFocusKey] = useState(() => (initialHawkerId() ? 1 : 0));
  const [meKey, setMeKey] = useState(0);
  const pushed = useRef(false);
  const wantsFly = useRef(false);

  // Roll the viewing day forward if the app is left open past midnight.
  useEffect(() => setDay((d) => (d < today ? today : d)), [today]);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    return data.hawkers.map((hawker) => ({
      hawker,
      status: statusOn(hawker, day),
      distance: geo.position ? distanceKm(geo.position, hawker) : null,
    }));
  }, [data, day, geo.position]);

  const q = query.trim().toLowerCase();
  const searched = useMemo(() => rows.filter((r) => matches(r, q)), [rows, q]);
  const visible = useMemo(
    () => searched.filter((r) => inFilter(r, filter, favs.ids)).sort(compare(sort)),
    [searched, filter, favs.ids, sort],
  );

  const counts = useMemo(() => {
    const c: Record<State, number> = { closed: 0, works: 0, soon: 0, open: 0 };
    for (const r of searched) c[r.status.state]++;
    return c;
  }, [searched]);

  const dayCounts: DayCount[] = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: STRIP_DAYS }, (_, i) => {
      const d = addDays(today, i);
      let cleaning = 0;
      let works = 0;
      for (const h of data.hawkers) {
        const s = statusOn(h, d).state;
        if (s === "closed") cleaning++;
        else if (s === "works") works++;
      }
      return { day: d, cleaning, works };
    });
  }, [data, today]);

  const points: MapPoint[] = useMemo(
    () =>
      visible.map((r) => ({
        id: r.hawker.id,
        name: r.hawker.name,
        subtitle: statusSentence(r.status, day, today),
        lat: r.hawker.lat,
        lng: r.hawker.lng,
        state: r.status.state,
        favourite: favs.ids.includes(r.hawker.id),
      })),
    [visible, favs.ids, day, today],
  );

  const selected = rows.find((r) => r.hawker.id === selectedId) ?? null;

  // Swiping the map card walks outward from the hawker the user last picked:
  // nearest first, so each swipe moves to a neighbour instead of across the island.
  // The anchor stays put while swiping, so swiping back retraces the same path.
  const [anchorId, setAnchorId] = useState<string | null>(selectedId);
  const fromSwipe = useRef(false);
  useEffect(() => {
    if (fromSwipe.current) fromSwipe.current = false;
    else setAnchorId(selectedId);
  }, [selectedId]);
  const swipeOrder = useMemo(() => {
    const a = rows.find((r) => r.hawker.id === anchorId)?.hawker;
    if (!a) return visible;
    const kx = Math.cos((a.lat * Math.PI) / 180);
    const d = (r: Row) => ((r.hawker.lng - a.lng) * kx) ** 2 + (r.hawker.lat - a.lat) ** 2;
    return [...visible].sort((x, y) => d(x) - d(y));
  }, [visible, rows, anchorId]);
  const swipeIndex = swipeOrder.findIndex((r) => r.hawker.id === selectedId);
  const swipeTo = (dir: 1 | -1) => {
    const next = swipeOrder[swipeIndex + dir];
    if (!next) return;
    haptics.select();
    fromSwipe.current = true;
    setSelectedId(next.hawker.id);
    setFocusKey((k) => k + 1);
  };

  // A deep link to an id that does not exist should not leave an empty detail open.
  useEffect(() => {
    if (data && selectedId && !data.hawkers.some((h) => h.id === selectedId)) {
      setSelectedId(null);
      setDetailOpen(false);
    }
  }, [data, selectedId]);

  const openDetail = useCallback((id: string, fly: boolean) => {
    haptics.select();
    setSelectedId(id);
    setDetailOpen(true);
    if (fly) setFocusKey((k) => k + 1);
    const url = `?h=${encodeURIComponent(id)}`;
    if (pushed.current) window.history.replaceState({ detail: id }, "", url);
    else window.history.pushState({ detail: id }, "", url);
    pushed.current = true;
  }, []);

  const closeDetail = useCallback(() => {
    if (pushed.current) {
      window.history.back();
    } else {
      window.history.replaceState(null, "", window.location.pathname);
      setDetailOpen(false);
    }
  }, []);

  // Mobile: the map sits behind the detail sheet, so drop back to it centred on this hawker.
  const showOnMap = useCallback(() => {
    haptics.select();
    closeDetail();
    setView("map");
    setFocusKey((k) => k + 1);
  }, [closeDetail]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      pushed.current = false;
      const id = (e.state as { detail?: string } | null)?.detail;
      setDetailOpen(!!id);
      if (id) setSelectedId(id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && detailOpen && closeDetail();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen, closeDetail]);

  // Telegram's native back button: detail → list/map, list → map.
  const listOpen = !desktop && view === "list";
  useEffect(
    () => bindBackButton(detailOpen || listOpen, () => (detailOpen ? closeDetail() : setView("map"))),
    [detailOpen, listOpen, closeDetail],
  );

  const onMapSelect = useCallback(
    (id: string | null) => {
      if (!id) {
        if (!desktop) setSelectedId(null);
        return;
      }
      if (desktop) openDetail(id, false);
      else {
        haptics.select();
        setSelectedId(id);
      }
    },
    [desktop, openDetail],
  );

  const locate = () => {
    wantsFly.current = true;
    if (geo.position) setMeKey((k) => k + 1);
    geo.locate();
  };
  useEffect(() => {
    if (!geo.position) return;
    setSort("nearest");
    if (wantsFly.current) {
      wantsFly.current = false;
      setMeKey((k) => k + 1);
    }
  }, [geo.position]);

  // "Nearest" asks for a fix the first time; without one it falls back to status order.
  const chooseSort = useCallback(
    (next: Sort) => {
      setSort(next);
      if (next === "nearest" && !geo.position) geo.locate();
    },
    [geo.position, geo.locate],
  );
  useEffect(() => {
    if (geo.status === "denied" || geo.status === "unavailable") setSort((s) => (s === "nearest" ? "status" : s));
  }, [geo.status]);

  // Picking a search suggestion on the map: clear the query so every pin comes back,
  // and drop a filter that would hide the hawker that was picked.
  const pickFromSearch = useCallback(
    (id: string) => {
      haptics.select();
      const row = rows.find((r) => r.hawker.id === id);
      if (row && !inFilter(row, filter, favs.ids)) setFilter("all");
      setQuery("");
      setSelectedId(id);
      setFocusKey((k) => k + 1);
    },
    [rows, filter, favs.ids],
  );
  const suggestions = useMemo(() => (q ? [...searched].sort(compare(sort)) : []), [q, searched, sort]);

  const padding = useMemo(
    () =>
      desktop
        ? { top: 24, bottom: 24, left: 440, right: 24 }
        : { top: 80, bottom: selected ? 200 : 210, left: 16, right: 16 },
    [desktop, selected],
  );

  const panel = (
    <ListPanel
      rows={visible}
      counts={counts}
      dayCounts={dayCounts}
      day={day}
      today={today}
      setDay={setDay}
      filter={filter}
      setFilter={setFilter}
      sort={sort}
      setSort={chooseSort}
      locating={geo.status === "locating"}
      favourites={favs.ids}
      onToggleFavourite={favs.toggle}
      selectedId={selectedId}
      onOpen={(id) => openDetail(id, true)}
      loading={loading && !data}
      error={!data ? error : null}
      reload={reload}
      lastModified={data?.lastModified ?? null}
      total={data?.count ?? 0}
      query={query}
      setQuery={setQuery}
      desktop={desktop}
    />
  );

  const detail = selected && detailOpen && (
    <HawkerDetail
      key={selected.hawker.id}
      row={selected}
      day={day}
      today={today}
      favourite={favs.has(selected.hawker.id)}
      onToggleFavourite={() => favs.toggle(selected.hawker.id)}
      onBack={closeDetail}
      onShowOnMap={desktop ? undefined : showOnMap}
      showBack
    />
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Suspense fallback={<div className="absolute inset-0 bg-sunken" />}>
        <MapView
        points={points}
        selectedId={selectedId}
        onSelect={onMapSelect}
        me={geo.position}
        dark={dark}
        padding={padding}
        focusKey={focusKey}
        meKey={meKey}
        />
      </Suspense>

      {desktop ? (
        <>
          <aside className="glass absolute top-[max(1rem,var(--safe-top))] bottom-[max(1rem,var(--safe-bottom))] left-[max(1rem,var(--safe-left))] z-10 flex w-[408px] flex-col overflow-hidden rounded-3xl">
            {detail ? <div className="animate-fade-in h-full overflow-y-auto">{detail}</div> : panel}
          </aside>
          <div className="absolute right-[max(1rem,var(--safe-right))] bottom-[max(2rem,calc(var(--safe-bottom)+1rem))] z-10 flex flex-col items-end gap-2">
            <LocateButton onClick={locate} busy={geo.status === "locating"} />
            <MapLegend counts={counts} filter={filter} setFilter={setFilter} />
          </div>
        </>
      ) : (
        <>
          <TopBar
            query={query}
            setQuery={setQuery}
            view={view}
            setView={setView}
            results={suggestions}
            day={day}
            today={today}
            onPick={pickFromSearch}
          />

          {view === "list" && (
            <div className="animate-fade-in absolute inset-0 z-10 flex flex-col bg-surface pt-[calc(var(--safe-top)+70px)] pr-(--safe-right) pl-(--safe-left)">
              {panel}
            </div>
          )}

          {view === "map" && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 pr-[calc(var(--safe-right)+12px)] pl-[calc(var(--safe-left)+12px)]"
              // The home indicator only needs ~22px clear; a full inset plus a gap floats the card.
              style={{ paddingBottom: "max(12px, calc(var(--safe-bottom) - 12px))" }}
            >
              <div className="flex justify-end">
                <LocateButton onClick={locate} busy={geo.status === "locating"} />
              </div>
              <div className="pointer-events-auto">
                {selected ? (
                  <Swipeable
                    canPrev={swipeIndex > 0}
                    canNext={swipeIndex < swipeOrder.length - 1}
                    onSwipe={swipeTo}
                  >
                    <HawkerCard
                      row={selected}
                      day={day}
                      today={today}
                      favourite={favs.has(selected.hawker.id)}
                      onToggleFavourite={() => favs.toggle(selected.hawker.id)}
                      onOpen={() => openDetail(selected.hawker.id, false)}
                    />
                  </Swipeable>
                ) : (
                  <div className="glass rounded-2xl px-3 pt-3 pb-2">
                    <SummaryChips
                      counts={counts}
                      filter={filter}
                      setFilter={setFilter}
                      day={day}
                      today={today}
                      favouriteCount={favs.ids.length}
                    />
                    <div className="mt-2">
                      <DayStrip counts={dayCounts} value={day} today={today} onChange={setDay} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {detail && (
            <DismissibleSheet
              onDismiss={closeDetail}
              className="animate-sheet-in absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-surface pr-(--safe-right) pl-(--safe-left)"
            >
              {detail}
            </DismissibleSheet>
          )}
        </>
      )}

      {geo.status === "denied" && (
        <Toast onDone={() => undefined}>Location permission denied. Showing all hawkers.</Toast>
      )}
    </div>
  );
}

function TopBar({
  query,
  setQuery,
  view,
  setView,
  results,
  day,
  today,
  onPick,
}: {
  query: string;
  setQuery: (q: string) => void;
  view: "map" | "list";
  setView: (v: "map" | "list") => void;
  /** Matches for the current query, best first. */
  results: Row[];
  day: string;
  today: string;
  onPick: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  // On the map, typing shows matches right under the box instead of jumping to the list.
  const suggesting = view === "map" && focused && query.trim() !== "";
  const top = results.slice(0, 6);
  const toList = () => {
    haptics.select();
    input.current?.blur();
    setView("list");
  };

  return (
    <div className="absolute inset-x-0 top-0 z-20 pt-[calc(var(--safe-top)+10px)] pr-[calc(var(--safe-right)+12px)] pl-[calc(var(--safe-left)+12px)]">
      <div className="flex items-center gap-2">
        <SearchField
          query={query}
          setQuery={setQuery}
          inputRef={input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmit={() => {
            if (view !== "map") return input.current?.blur();
            if (results.length === 1) {
              input.current?.blur();
              onPick(results[0].hawker.id);
            } else if (results.length) toList();
          }}
        />
        {/* One toggle that names where it goes, rather than a two-way switch. */}
        <button
          type="button"
          onClick={() => {
            haptics.select();
            setView(view === "map" ? "list" : "map");
          }}
          aria-label={view === "map" ? "Show list" : "Show map"}
          className="glass pressable flex h-12 shrink-0 items-center gap-1.5 rounded-full pr-4 pl-3.5 text-[15px] font-semibold"
        >
          {view === "map" ? <List size={18} /> : <MapIcon size={18} />}
          {view === "map" ? "List" : "Map"}
        </button>
      </div>

      {suggesting && (
        <div
          className="glass animate-fade-in mt-2 overflow-hidden rounded-2xl"
          // Keep focus in the input so a tap here lands before the box blurs and closes.
          onMouseDown={(e) => e.preventDefault()}
        >
          {top.length ? (
            <ul className="flex flex-col py-1">
              {top.map((r) => (
                <li key={r.hawker.id}>
                  <button
                    type="button"
                    onClick={() => {
                      input.current?.blur();
                      onPick(r.hawker.id);
                    }}
                    className="row flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
                  >
                    <StatusDot state={r.status.state} size={9} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{r.hawker.name}</span>
                      <span className="block truncate text-[13px] text-secondary">
                        {r.distance !== null && <span className="tabular">{formatDistance(r.distance)} · </span>}
                        {statusSentence(r.status, day, today)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3.5 text-sm text-secondary">No hawkers match.</p>
          )}
          {results.length > top.length && (
            <button type="button" onClick={toList} className="row w-full border-t border-line px-4 py-3 text-left text-[13px] font-semibold">
              See all {results.length} in the list
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SearchField({
  query,
  setQuery,
  onFocus,
  onBlur,
  onSubmit,
  inputRef,
  flat,
}: {
  query: string;
  setQuery: (q: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmit?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  flat?: boolean;
}) {
  return (
    <label className={`flex h-12 min-w-0 shrink-0 items-center gap-2.5 rounded-full px-4 ${flat ? "bg-sunken" : "glass flex-1"}`}>
      <Search size={18} className="shrink-0 text-secondary" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
        placeholder="Search hawkers"
        aria-label="Search by hawker name, street or postal code"
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-secondary [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="text-secondary"
        >
          <X size={16} />
        </button>
      )}
    </label>
  );
}

const CHIP_STATES: { key: Filter; state?: State; label: string }[] = [
  { key: "closed", state: "closed", label: "Closed" },
  { key: "soon", state: "soon", label: "Soon" },
  { key: "open", state: "open", label: "Open" },
];

function SummaryChips({
  counts,
  filter,
  setFilter,
  day,
  today,
  favouriteCount,
}: {
  counts: Record<State, number>;
  filter: Filter;
  setFilter: (f: Filter) => void;
  day: string;
  today: string;
  favouriteCount: number;
}) {
  const closed = counts.closed + counts.works;
  const n = (k: Filter) => (k === "closed" ? closed : k === "all" ? 0 : counts[k as State]);
  return (
    <div>
      <p className="mb-2 px-1 text-[13px] text-secondary">
        <span className="font-semibold text-primary">{day === today ? "Today" : formatDay(day)}</span> ·{" "}
        <span className="tabular">{closed}</span> closed · <span className="tabular">{counts.soon}</span> closing within 7 days
      </p>
      <ScrollRow className="flex gap-1.5">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        {/* Right after "All" so it is never scrolled off-screen on a phone. */}
        <Chip
          active={filter === "favourites"}
          onClick={() => setFilter(filter === "favourites" ? "all" : "favourites")}
          label="Favourites"
        >
          <Star size={14} fill={filter === "favourites" ? "currentColor" : "var(--status-soon)"} color={filter === "favourites" ? "currentColor" : "var(--status-soon)"} />
          <span className="tabular">{favouriteCount}</span>
        </Chip>
        {CHIP_STATES.map((c) => (
          <Chip key={c.key} active={filter === c.key} onClick={() => setFilter(filter === c.key ? "all" : c.key)}>
            <StatusDot state={c.state!} size={8} />
            {c.label}
            <span className="tabular opacity-60">{n(c.key)}</span>
          </Chip>
        ))}
      </ScrollRow>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => {
        haptics.select();
        onClick();
      }}
      className="pressable flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
      style={{
        background: active ? "var(--accent)" : "var(--surface-sunken)",
        color: active ? "var(--accent-text)" : "var(--text-primary)",
      }}
    >
      {children}
    </button>
  );
}

function ListPanel(props: {
  rows: Row[];
  counts: Record<State, number>;
  dayCounts: DayCount[];
  day: string;
  today: string;
  setDay: (d: string) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  locating: boolean;
  favourites: string[];
  onToggleFavourite: (id: string) => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
  lastModified: string | null;
  total: number;
  query: string;
  setQuery: (q: string) => void;
  /** Desktop sidebar: brand, search and the day strip live here. On a phone the map card has the days. */
  desktop: boolean;
}) {

  // Scrolling down the list folds the day strip away; scrolling back up a bit (or
  // reaching the top) brings it back. The filters stay put either way.
  const [compact, setCompact] = useState(false);
  const scroll = useRef({ y: 0, up: 0, quietUntil: 0 });
  const fold = (next: boolean) => {
    if (next === compact) return;
    // Folding resizes the list, which can clamp scrollTop near the bottom; ignore
    // the scroll events that causes until the transition is over.
    scroll.current.quietUntil = performance.now() + 350;
    setCompact(next);
  };
  const onListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const s = scroll.current;
    const n = e.currentTarget;
    const y = n.scrollTop;
    const dy = y - s.y;
    // Folding makes the list taller, so at the very bottom the browser pulls
    // scrollTop up to fit. That lands exactly on the bottom edge; a real
    // upward scroll leaves it. Don't read the clamp as the user scrolling up.
    const atBottom = y + n.clientHeight >= n.scrollHeight - 2;
    s.y = y;
    if (y <= 8) {
      s.up = 0;
      fold(false);
      return;
    }
    if (performance.now() < s.quietUntil) return;
    if (dy > 0) {
      s.up = 0;
      if (y > 40) fold(true);
    } else if (atBottom) {
      s.up = 0;
    } else {
      s.up -= dy;
      if (s.up > 80) fold(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        {props.desktop && (
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
            <div className="min-w-0">
              <h1 className="text-lg leading-tight font-bold">HawkerGoWhere</h1>
              <p className="text-xs text-secondary">Hawker centre closures in Singapore</p>
            </div>
          </div>
        )}
        {props.desktop && <SearchField query={props.query} setQuery={props.setQuery} flat />}
        {props.desktop && (
        <div
          aria-hidden={compact}
          inert={compact}
          className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
            compact ? "-mb-3 grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <DayStrip counts={props.dayCounts} value={props.day} today={props.today} onChange={props.setDay} />
          </div>
        </div>
        )}
        <SummaryChips
          counts={props.counts}
          filter={props.filter}
          setFilter={props.setFilter}
          day={props.day}
          today={props.today}
          favouriteCount={props.favourites.length}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-secondary">
        <span className="tabular min-w-0 truncate">
          {props.rows.length === props.total ? `${props.total} hawkers` : `${props.rows.length} of ${props.total}`}
        </span>
        <SortControl value={props.sort} onChange={props.setSort} locating={props.locating} />
      </div>

      <div onScroll={onListScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(var(--safe-bottom)+16px)]">
        {props.loading && <ListSkeleton />}
        {props.error && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-secondary">Couldn't load hawker data ({props.error}).</p>
            <button type="button" onClick={props.reload} className="pressable flex items-center gap-1.5 rounded-full bg-sunken px-4 py-2 text-sm font-medium">
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}
        {!props.loading && !props.error && props.rows.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-secondary">
            {props.filter === "favourites" ? "Tap ☆ on any hawker to keep it here." : "No hawkers match."}
          </p>
        )}
        <ul className="flex flex-col gap-1 px-2 pt-2">
          {props.rows.map((row) => (
            <HawkerRow
              key={row.hawker.id}
              row={row}
              day={props.day}
              today={props.today}
              selected={row.hawker.id === props.selectedId}
              favourite={props.favourites.includes(row.hawker.id)}
              onOpen={() => props.onOpen(row.hawker.id)}
              onToggleFavourite={() => props.onToggleFavourite(row.hawker.id)}
            />
          ))}
        </ul>
        {props.lastModified && (
          <p className="px-4 pt-6 pb-2 text-center text-[11px] leading-relaxed text-secondary">
            NEA cleaning schedule via data.gov.sg · updated {formatTimestamp(props.lastModified)}
            <br />
            “Open” means no scheduled closure. Individual stall hours vary.
            {isTelegram() ? null : (
              <>
                <br />
                Also on Telegram:{" "}
                <a className="text-link" href="https://t.me/HawkerGoWhereBot" target="_blank" rel="noreferrer">
                  @HawkerGoWhereBot
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

const SORTS: { key: Sort; label: string }[] = [
  { key: "status", label: "Closed first" },
  { key: "nearest", label: "Nearest" },
  { key: "name", label: "A–Z" },
];

function SortControl({ value, onChange, locating }: { value: Sort; onChange: (s: Sort) => void; locating: boolean }) {
  return (
    <div role="radiogroup" aria-label="Sort" className="flex shrink-0 rounded-full bg-(--segment-track) p-0.5">
      {SORTS.map(({ key, label }) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (on) return;
              haptics.select();
              onChange(key);
            }}
            className="flex h-7 items-center gap-1 rounded-full px-2.5 font-medium transition-[background-color,color,box-shadow] duration-150"
            style={{
              background: on ? "var(--segment-thumb)" : "transparent",
              color: on ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: on ? "var(--segment-thumb-shadow)" : undefined,
            }}
          >
            {key === "nearest" && <Navigation size={11} className={on && locating ? "animate-pulse" : undefined} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul aria-hidden className="animate-pulse">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-3">
          <span className="size-2.5 rounded-full bg-sunken" />
          <div className="flex-1">
            <div className="mb-1.5 h-3.5 w-2/3 rounded bg-sunken" />
            <div className="h-3 w-1/2 rounded bg-sunken" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LocateButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Show my location"
      className="glass pressable pointer-events-auto grid size-11 place-items-center rounded-full"
    >
      <LocateFixed size={18} className={busy ? "animate-pulse" : undefined} />
    </button>
  );
}

function MapLegend({
  counts,
  filter,
  setFilter,
}: {
  counts: Record<State, number>;
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const items: { state: State; filter: Filter }[] = [
    { state: "closed", filter: "closed" },
    { state: "works", filter: "closed" },
    { state: "soon", filter: "soon" },
    { state: "open", filter: "open" },
  ];
  return (
    <div className="glass flex flex-col gap-0.5 rounded-2xl p-1.5 text-[13px]">
      {items.map((i) => (
        <button
          key={i.state}
          type="button"
          onClick={() => setFilter(filter === i.filter ? "all" : i.filter)}
          aria-pressed={filter === i.filter}
          className="row flex items-center gap-2 rounded-lg px-2 py-1"
          style={{ opacity: filter === "all" || filter === i.filter ? 1 : 0.45 }}
        >
          <StatusDot state={i.state} size={9} />
          <span className="flex-1 text-left">{STATE_LABEL[i.state]}</span>
          <span className="tabular pl-3 text-secondary">{counts[i.state]}</span>
        </button>
      ))}
    </div>
  );
}

function Toast({ children }: { children: React.ReactNode; onDone: () => void }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(false), 3500);
    return () => window.clearTimeout(t);
  }, []);
  if (!shown) return null;
  return (
    <div className="glass animate-sheet-in absolute top-[calc(var(--safe-top)+64px)] left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm">
      {children}
    </div>
  );
}
