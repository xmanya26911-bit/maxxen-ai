import Link from "next/link";
import { FOOTER_V2 } from "@/lib/constants";
import { ChromeLogo } from "./logo";

/** Internal routes use next/link; external URLs and hashes use plain anchors. */
function FooterLink({ label, href }: { label: string; href: string }) {
  const className =
    "mx-focus rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-white";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {label}
    </a>
  );
}

/**
 * Footer v2 — chrome brand row (emblem + wordmark + mono meta), FOOTER_V2
 * link set, hairline bottom bar with copyright + deploy note, and a giant
 * clipped chrome "MAXXEN" watermark bleeding off the bottom edge.
 */
export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-white/[0.08] px-6 pt-14 md:px-16 lg:px-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <a
            href="#home"
            className="mx-focus flex items-center gap-3 rounded-md"
            aria-label="MAXXEN home"
          >
            <ChromeLogo size={34} />
            <span className="text-chrome text-xl font-semibold tracking-tight">
              MAXXEN
            </span>
            <span className="hidden font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              {FOOTER_V2.meta}
            </span>
          </a>

          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
              {FOOTER_V2.links.map((link) => (
                <li key={link.label}>
                  <FooterLink label={link.label} href={link.href} />
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/[0.08] pt-6 text-sm text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>{FOOTER_V2.copyright}</p>
          <p>
            Built with MAXXEN — deployed on{" "}
            <span className="text-white/70">YOUR Vercel</span>.
          </p>
        </div>
      </div>

      {/* Giant chrome watermark, cropped by the footer's bottom edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none relative mt-10 h-[13vw] select-none overflow-hidden"
      >
        <p className="text-chrome absolute inset-x-0 top-0 whitespace-nowrap text-center text-[18vw] font-semibold leading-[0.82] opacity-[0.06]">
          MAXXEN
        </p>
      </div>
    </footer>
  );
}
