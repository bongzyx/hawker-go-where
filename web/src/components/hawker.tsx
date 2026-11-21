import { ArrowLeft, ChevronRight, Map as MapIcon, MapPin, Navigation, PersonStanding, ShoppingBasket, Share2, Soup, Star } from "lucide-react";
import { useState } from "react";
import type { Hawker } from "../../shared/types";
import { formatRange, relativeDays } from "../lib/dates";
import { formatDistance } from "../lib/hooks";
import { closureLabel, closureLength, statusSentence, type HawkerStatus } from "../lib/status";
import { haptics, openExternal, share } from "../lib/telegram";
import { StatusDot, StatusPill, YearTimeline } from "./viz";

export type Row = { hawker: Hawker; status: HawkerStatus; distance: number | null };

function FavButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        haptics.tap();
        onToggle();
      }}
      aria-pressed={on}
      aria-label={on ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      className="pressable grid size-10 shrink-0 place-items-center rounded-full"
    >
      <Star
        size={18}
        strokeWidth={2}
        fill={on ? "var(--status-soon)" : "none"}
        color={on ? "var(--status-soon)" : "var(--text-secondary)"}
      />
    </button>
  );
}

export function HawkerRow({
  row,
  day,
  today,
  selected,
  favourite,
  onOpen,
  onToggleFavourite,
}: {
  row: Row;
  day: string;
  today: string;
  selected: boolean;
  favourite: boolean;
  onOpen: () => void;
  onToggleFavourite: () => void;
}) {
  const { hawker, status, distance } = row;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={selected}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
        className="row flex items-center gap-3 rounded-2xl py-3 pr-1.5 pl-3.5"
      >
        <StatusDot state={status.state} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-[15px] font-semibold">{hawker.name}</p>
            {hawker.isNew && (
              <span className="shrink-0 rounded bg-sunken px-1 text-[10px] font-semibold uppercase text-secondary">New</span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-secondary">
            {distance !== null && <span className="tabular font-medium text-primary">{formatDistance(distance)} · </span>}
            {statusSentence(status, day, today)}
          </p>
        </div>
        <FavButton on={favourite} onToggle={onToggleFavourite} label={hawker.name} />
      </div>
    </li>
  );
}

/** Compact card over the map for the pin you just tapped. */
export function HawkerCard({
  row,
  day,
  today,
  favourite,
  onOpen,
  onToggleFavourite,
}: {
  row: Row;
  day: string;
  today: string;
  favourite: boolean;
  onOpen: () => void;
  onToggleFavourite: () => void;
}) {
  const { hawker, status, distance } = row;
  return (
    <div className="glass animate-sheet-in rounded-3xl p-4">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="mb-1.5 flex items-center gap-2">
            <StatusPill state={status.state} />
            {distance !== null && <span className="tabular text-xs text-secondary">{formatDistance(distance)}</span>}
          </div>
          <p className="truncate text-lg leading-snug font-semibold">{hawker.name}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-secondary">{statusSentence(status, day, today)}</p>
        </button>
        <FavButton on={favourite} onToggle={onToggleFavourite} label={hawker.name} />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="pressable flex h-12 flex-1 items-center justify-center gap-1 rounded-full bg-accent text-[15px] font-semibold text-accent-text"
        >
          Details <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => openExternal(directionsUrl(hawker))}
          className="pressable flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-sunken text-[15px] font-semibold"
        >
          <Navigation size={15} /> Directions
        </button>
      </div>
    </div>
  );
}

function directionsUrl(h: Hawker) {
  return `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`;
}

export function shareUrl(h: Hawker): string {
  const app = import.meta.env.VITE_TG_APP_LINK as string | undefined;
  return app ? `${app}?startapp=h_${h.id}` : `${window.location.origin}/?h=${h.id}`;
}

export function HawkerDetail({
  row,
  day,
  today,
  favourite,
  onBack,
  onToggleFavourite,
  onShowOnMap,
  showBack,
}: {
  row: Row;
  day: string;
  today: string;
  favourite: boolean;
  onBack: () => void;
  onToggleFavourite: () => void;
  /** Only where the map is hidden behind the detail (mobile). */
  onShowOnMap?: () => void;
  showBack: boolean;
}) {
  const { hawker, status, distance } = row;
  const [photoOk, setPhotoOk] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const year = Number(today.slice(0, 4));
  const dated = hawker.closures.filter((c) => c.start && c.end);
  const tbc = hawker.closures.filter((c) => !c.start);

  const doShare = async () => {
    const result = await share(shareUrl(hawker), `${hawker.name}: ${statusSentence(status, today, today)}`);
    if (result === "copied") {
      setToast("Link copied");
      window.setTimeout(() => setToast(null), 1800);
    }
  };

  return (
    <article className="flex min-h-full flex-col">
      {showBack && (
        // Zero-height sticky rail: the button stays put while the sheet scrolls under it.
        <div className="sticky top-0 z-10 h-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="glass pressable absolute left-3 grid size-10 place-items-center rounded-full"
            style={{ top: "calc(var(--safe-top) + 0.75rem)" }}
          >
            <ArrowLeft size={18} />
          </button>
        </div>
      )}
      <div className="relative">
        {hawker.photoUrl && photoOk ? (
          <img
            src={hawker.photoUrl}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setPhotoOk(false)}
            className="aspect-[16/9] w-full bg-sunken object-cover"
          />
        ) : (
          <div className="h-16" />
        )}
      </div>

      <div className="flex flex-col gap-5 px-4 pt-4 pb-[calc(var(--safe-bottom)+1.5rem)]">
        <header>
          <div className="mb-2 flex items-center gap-2">
            <StatusPill state={status.state} />
            {hawker.isNew && <span className="text-[11px] font-semibold uppercase text-secondary">New centre</span>}
            {distance !== null && <span className="tabular ml-auto text-xs text-secondary">{formatDistance(distance)} away</span>}
          </div>
          <h1 className="text-2xl font-bold leading-tight">{hawker.name}</h1>
          {hawker.altName && <p className="mt-0.5 text-sm text-secondary">{hawker.altName}</p>}
          <p className="mt-2 text-[15px] font-medium">{statusSentence(status, day, today)}</p>
        </header>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openExternal(directionsUrl(hawker))}
            className="pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent text-sm font-semibold text-accent-text"
          >
            <Navigation size={16} /> Directions
          </button>
          <button
            type="button"
            onClick={doShare}
            aria-label="Share"
            className="pressable grid size-11 place-items-center rounded-full bg-sunken"
          >
            <Share2 size={17} />
          </button>
          <div className="grid size-11 place-items-center rounded-full bg-sunken">
            <FavButton on={favourite} onToggle={onToggleFavourite} label={hawker.name} />
          </div>
        </div>
        {toast && <p className="-mt-3 text-center text-xs text-secondary">{toast}</p>}

        <section className="rounded-2xl bg-elevated p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{day.slice(0, 4)} at a glance</h2>
            <span className="flex items-center gap-3 text-[11px] text-secondary">
              <Legend colour="var(--status-closed)" label="Cleaning" />
              <Legend colour="var(--status-works)" label="Works" />
            </span>
          </div>
          <YearTimeline closures={hawker.closures} today={today} day={day} />
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {dated.map((c, i) => {
              const done = c.end! < today;
              const now = c.start! <= today && today <= c.end!;
              return (
                <li key={i} className="flex items-start gap-3 py-2.5 last:pb-0" style={{ opacity: done ? 0.55 : 1 }}>
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-sm"
                    style={{ background: c.kind === "works" ? "var(--status-works)" : "var(--status-closed)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{formatRange(c.start!, c.end!, year)}</p>
                    <p className="text-xs text-secondary">
                      {closureLabel(c)} · {closureLength(c)} day{closureLength(c) > 1 ? "s" : ""}
                    </p>
                    {c.remarks && <p className="mt-1 text-xs text-secondary">{c.remarks}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-medium text-secondary">
                    {now ? "Now" : done ? "Done" : capitalise(relativeDays(today, c.start!))}
                  </span>
                </li>
              );
            })}
            {tbc.map((c, i) => (
              <li key={`tbc-${i}`} className="flex items-start gap-3 py-2.5 text-secondary last:pb-0">
                <span className="mt-1.5 size-2 shrink-0 rounded-sm border border-current" />
                <div className="flex-1">
                  <p className="text-sm">{closureLabel(c)}: dates TBC</p>
                  {c.remarks && <p className="mt-1 text-xs">{c.remarks}</p>}
                </div>
              </li>
            ))}
            {!dated.length && !tbc.length && <li className="pt-2.5 text-sm text-secondary">No closures scheduled.</li>}
          </ul>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <Stat icon={<Soup size={18} />} value={hawker.foodStalls} label="Food stalls" />
          <Stat icon={<ShoppingBasket size={18} />} value={hawker.marketStalls} label="Market stalls" />
        </section>

        <section className="flex flex-col gap-3" aria-label="Location">
          <p className="flex items-start gap-2 text-sm">
            <MapPin size={16} className="mt-0.5 shrink-0 text-secondary" />
            {hawker.address}
          </p>
          {(onShowOnMap || hawker.googleMapsUrl) && (
            <div className="flex gap-2">
              {onShowOnMap && (
                <PillButton icon={<MapIcon size={16} />} label="Show on map" onClick={onShowOnMap} />
              )}
              {hawker.googleMapsUrl && (
                <PillButton
                  icon={<PersonStanding size={16} />}
                  label="Street View"
                  onClick={() => openExternal(hawker.googleMapsUrl!)}
                />
              )}
            </div>
          )}
        </section>

        {hawker.description && <p className="text-sm leading-normal text-secondary">{hawker.description}</p>}
      </div>
    </article>
  );
}

function PillButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-sunken text-sm font-semibold"
    >
      {icon} {label}
    </button>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-2 rounded-sm" style={{ background: colour }} />
      {label}
    </span>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-elevated p-3">
      <span className="text-secondary">{icon}</span>
      <div>
        <p className="tabular text-lg leading-none font-semibold">{value || "None"}</p>
        <p className="mt-1 text-xs text-secondary">{label}</p>
      </div>
    </div>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
