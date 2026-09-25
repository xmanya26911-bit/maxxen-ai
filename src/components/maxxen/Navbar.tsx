"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChromeLogo } from "./logo";
import ChromeRing from "./motion/ChromeRing";

const SECTION_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
] as const;

const LAUNCH_PILL =
  "mx-focus rounded-lg bg-white px-5 py-2.5 text-sm font-semibold tracking-[-0.01em] text-black transition-opacity hover:opacity-80";

/**
 * Fixed top navigation — Y2K chrome edition.
 * Chrome emblem brand (hover: chrome ring + glow), centered section links,
 * a distinct /chat link with a glint dot, and a white "Launch app ↗" pill.
 * Transparent over the hero; gains a blurred black surface on scroll.
 * Mobile: brand + menu sheet with the same links.
 */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled || open
          ? "border-b border-white/[0.06] bg-black/70 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="flex items-center justify-between px-6 py-4 md:px-16 lg:px-28">
        {/* Brand — chrome emblem with a ring + glow on hover */}
        <a
          href="#home"
          className="group mx-focus flex items-center gap-2.5 rounded-full p-1 pr-3"
          aria-label="MAXXEN home"
        >
          <span className="relative grid place-items-center">
            <ChromeRing className="absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <ChromeLogo
              size={30}
              className="transition-[filter] duration-300 group-hover:drop-shadow-[0_0_16px_rgba(255,255,255,0.4)]"
            />
          </span>
          <span className="text-chrome text-lg font-semibold tracking-tight">
            MAXXEN
          </span>
        </a>

        {/* Desktop navigation */}
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-9 lg:absolute lg:left-1/2 lg:flex lg:-translate-x-1/2"
        >
          {SECTION_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="mx-focus rounded-md px-1 py-0.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-white"
            >
              {link.label}
            </a>
          ))}
          {/* Distinct chat entry point */}
          <Link
            href="/chat"
            className="mx-focus flex items-center gap-2 rounded-md px-1 py-0.5 text-sm font-medium text-white transition-opacity hover:opacity-80"
          >
            <span
              aria-hidden="true"
              className="bg-glint animate-glint h-1.5 w-1.5 rounded-full"
            />
            Chat
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {/* Sign in — quiet entry to the passwordless /login flow */}
          <Link
            href="/login"
            className="mx-focus hidden rounded-md px-1 py-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-white sm:block"
          >
            Sign in
          </Link>

          {/* Launch app */}
          <Link href="/chat" className={LAUNCH_PILL}>
            Launch app
            <ArrowUpRight
              className="ml-1.5 inline h-4 w-4 align-[-2px]"
              aria-hidden="true"
            />
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="mx-focus grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-white transition-colors hover:bg-white/[0.06] lg:hidden"
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-menu"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-t border-white/[0.06] px-6 pb-6 pt-3 lg:hidden"
          >
            <ul className="flex flex-col">
              {SECTION_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="mx-focus block rounded-lg px-2 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/chat"
                  onClick={() => setOpen(false)}
                  className="mx-focus flex items-center gap-2.5 rounded-lg px-2 py-3 text-base font-medium text-white transition-colors hover:bg-white/[0.04]"
                >
                  <span
                    aria-hidden="true"
                    className="bg-glint animate-glint h-1.5 w-1.5 rounded-full"
                  />
                  Chat
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="mx-focus block rounded-lg px-2 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  Sign in
                </Link>
              </li>
              <li className="mt-2">
                <Link
                  href="/chat"
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-center gap-1.5 ${LAUNCH_PILL}`}
                >
                  Launch app
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </li>
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
