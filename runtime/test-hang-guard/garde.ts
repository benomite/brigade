// `node:test`, with a limit on every test: past 30 s a test fails, naming its file, its title, the
// line where it is declared and what the process still holds (children, sockets, timers) — where it
// stopped. Replaces nothing in the runner: `--test-timeout` stays as a wide backstop.
//
// A test that needs more says so in its own options, and nowhere else:
//
//     test("…", { timeout: 300_000 }, async (t) => { … })     // grep: `timeout: ` in test/
//
// `BRIGADE_TEST_TIMEOUT_MS` changes the default (the guard's own tests use it).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as reel from "node:test";
import { fileURLToPath } from "node:url";

const DEFAUT_MS = 30_000;
const limiteParDefaut = (): number => {
  const lue = Number(process.env.BRIGADE_TEST_TIMEOUT_MS);
  return Number.isFinite(lue) && lue > 0 ? lue : DEFAUT_MS;
};

const ICI = fileURLToPath(import.meta.url);

// A ticket's frozen acceptance tests (`test/acceptation-<n>/`, #3725) may read a live PR through
// `gh`. Where `gh` is missing or logged out (the CI, a bare clone) they cannot answer: the tests of
// such a file skip there, saying why, instead of turning the base suite red. Where `gh` is logged
// in — the station, whose pass judges them — they run (#3847). A file it cannot read runs as is.
function sansGh(fichier: string | undefined): string | null {
  if (fichier === undefined || !/[\\/]test[\\/]acceptation-\d+[\\/]/.test(fichier)) return null;
  let source: string;
  try {
    source = readFileSync(fichier, "utf8");
  } catch {
    return null;
  }
  if (!source.includes('"gh"')) return null;
  return spawnSync("gh", ["auth", "token"], { stdio: "ignore" }).status === 0 ? null : "gh is missing or logged out: this frozen acceptance test reads GitHub through it";
}
const SANS_GH = sansGh(process.argv[1]);

// The first frame of the stack that is neither this file nor the runner: where the test is written.
function oEstEcrit(): string {
  const lignes = (new Error().stack ?? "").split("\n").slice(1);
  const cadre = lignes.find((l) => !l.includes(ICI) && !l.includes("node:internal"));
  return (cadre ?? "unknown location").trim().replace(/^at /, "");
}

function poignees(): string[] {
  const decrites: string[] = [];
  // Deprecated, but the only one that says *which* child, socket or timer.
  for (const h of (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles()) {
    const o = h as { constructor?: { name?: string }; spawnargs?: string[]; pid?: number; localPort?: number; remotePort?: number; _idleTimeout?: number };
    const nom = o.constructor?.name ?? "handle";
    if (o.spawnargs) decrites.push(`child process pid ${o.pid}: ${o.spawnargs.join(" ").slice(0, 200)}`);
    else if (o.localPort !== undefined || o.remotePort !== undefined) decrites.push(`${nom} local port ${o.localPort ?? "-"} remote port ${o.remotePort ?? "-"}`);
    else if (nom === "Socket" || nom === "WriteStream" || nom === "ReadStream") continue; // stdio
    else decrites.push(nom + (o._idleTimeout !== undefined ? ` (${o._idleTimeout} ms)` : ""));
  }
  const parType = new Map<string, number>();
  for (const type of process.getActiveResourcesInfo()) parType.set(type, (parType.get(type) ?? 0) + 1);
  decrites.push(`pending resources: ${[...parType].map(([t, n]) => `${t}×${n}`).join(", ") || "none"}`);
  return decrites;
}

function entoure<F extends (...args: any[]) => unknown>(titre: string, ecrit: string, fn: F, limite: number): F {
  // Callback style (`(t, done)`): the runner settles it, we cannot race it.
  if (fn.length >= 2) return fn;
  return (async function (this: unknown, ...args: unknown[]) {
    let minuteur: NodeJS.Timeout | undefined;
    const coupe = new Promise<never>((_, rejeter) => {
      minuteur = setTimeout(() => {
        const fichier = process.argv[1] ?? "?";
        rejeter(new Error([`test timed out after ${limite} ms`, `  file:  ${fichier}`, `  test:  ${titre}`, `  written at: ${ecrit}`, "  stopped with, still held:", ...poignees().map((p) => `    - ${p}`), "  (a test that needs more says so with { timeout: <ms> } in its options)"].join("\n")));
      }, limite);
      minuteur.unref();
    });
    try {
      return await Promise.race([Promise.resolve(fn.apply(this, args as never)), coupe]);
    } finally {
      clearTimeout(minuteur);
    }
  }) as unknown as F;
}

// Reads `(name, options, fn)`, `(name, fn)`, `(fn)`, `(options, fn)`.
// `estUnTest`: a test (not a hook), which skips in a frozen acceptance file that `gh` cannot serve.
function enveloppe<F extends (...args: any[]) => unknown>(original: F, estUnTest = false): F {
  const garde = function (this: unknown, ...args: any[]) {
    const i = args.findIndex((a) => typeof a === "function");
    if (i === -1) return original.apply(this, args);
    const titre = typeof args[0] === "string" ? args[0] : (args[0]?.name ?? args[i].name ?? "(anonymous)");
    const options = args.find((a, j) => j < i && a !== null && typeof a === "object") as { timeout?: unknown } | undefined;
    if (estUnTest && SANS_GH !== null) return original.call(this, titre, { ...options, skip: SANS_GH }, args[i]);
    const limite = typeof options?.timeout === "number" && options.timeout > 0 && options.timeout !== Infinity ? options.timeout : limiteParDefaut();
    const suite = args.slice();
    suite[i] = entoure(titre, oEstEcrit(), args[i], limite);
    return original.apply(this, suite);
  } as unknown as F;
  Object.assign(garde, original);
  return garde;
}

export const test = enveloppe(reel.test, true);
export const it = enveloppe(reel.it, true);
// `describe` only holds tests, which are guarded one by one; its hooks are guarded here.
export const before = enveloppe(reel.before);
export const after = enveloppe(reel.after);
export const beforeEach = enveloppe(reel.beforeEach);
export const afterEach = enveloppe(reel.afterEach);
export const describe = reel.describe;
export const suite = reel.suite;
export const mock = reel.mock;
export const run = reel.run;
for (const k of ["skip", "todo", "only"] as const) {
  const original = (reel.test as unknown as Record<string, (...a: any[]) => unknown>)[k];
  if (typeof original === "function") (test as unknown as Record<string, unknown>)[k] = enveloppe(original, true);
}
(test as unknown as Record<string, unknown>).describe = reel.describe;
(test as unknown as Record<string, unknown>).it = it;
export default test;
