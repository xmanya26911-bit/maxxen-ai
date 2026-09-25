import { HERO } from "@/lib/constants";

/**
 * Premium liquid-glass announcement pill:
 * [ MAXXEN 1.0 ]  Build. Iterate. Ship.
 */
export function AnnouncementPill() {
  return (
    <div className="liquid-glass flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
      <span
        aria-hidden="true"
        className="animate-pulse-ring h-2 w-2 shrink-0 rounded-full bg-white"
      />
      <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold tracking-wide text-black">
        {HERO.announcementBadge}
      </span>
      <span className="text-white/80">{HERO.announcementText}</span>
    </div>
  );
}
