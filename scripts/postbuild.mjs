import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

// Portable replacement for `cp -r ...` in the build script (works on
// Windows, macOS and Linux). Copies the static assets and public/ into the
// standalone server bundle, matching what `next build` expects to serve.
const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("[postbuild] .next/standalone is missing — check that next.config.ts sets output: 'standalone'.");
  process.exit(1);
}

const copy = (from, to) => {
  if (!existsSync(from)) {
    console.error(`[postbuild] missing source: ${from}`);
    process.exit(1);
  }
  cpSync(from, to, { recursive: true });
  console.log(`[postbuild] ${from} -> ${to}`);
};

copy(join(root, ".next", "static"), join(standalone, ".next", "static"));
copy(join(root, "public"), join(standalone, "public"));
