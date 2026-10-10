// Fingerprint of the interface sources, saved next to the committed build.
//
// Students run the prebuilt `out/` folder without Node.js, so the build must
// match the sources. `node scripts/source-stamp.mjs` writes the stamp after a
// build; `--check` fails when the sources changed without rebuilding.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const inputs = [
  "app",
  "components",
  "lib",
  "public",
  "package-lock.json",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
];
const stampFile = join("out", ".source-sha256");

function files(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((name) => files(join(path, name)));
}

const hash = createHash("sha256");
for (const file of inputs.flatMap(files)) {
  // Normalize line endings so Windows checkouts produce the same fingerprint.
  hash.update(
    file.replaceAll("\\", "/") +
      "\0" +
      readFileSync(file, "utf8").replaceAll("\r\n", "\n") +
      "\0",
  );
}
const digest = hash.digest("hex");

if (process.argv.includes("--check")) {
  let saved = "";
  try {
    saved = readFileSync(stampFile, "utf8").trim();
  } catch {}
  if (saved !== digest) {
    console.error(
      "frontend/out is out of date. Run `npm run build` in frontend/ and commit frontend/out.",
    );
    process.exit(1);
  }
  console.log("frontend/out matches the interface sources.");
} else {
  writeFileSync(stampFile, digest + "\n");
}
