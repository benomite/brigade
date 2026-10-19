// The configuration of Claude Code's sandbox for a Mac cook: what the station
// passes to `claude` (`--settings`) so that an ordinary cook touches, on the
// chef's Mac, nothing but its ticket. It writes in its worktree and in the
// project's caches, nowhere else; it reads neither `~/.ssh`, nor the chef's
// credentials, nor their prod access; it reaches only the hosts of the
// project's network list — an empty list, none.
//
// Two layers, because the sandbox only guards shell commands:
//   `sandbox`      what Seatbelt imposes on every Bash command and on what it
//                  launches — files and network, held by the kernel;
//   `permissions`  what `claude` refuses to its own tools (Read, Edit,
//                  Write, WebFetch), which run outside the sandbox.
// The second only holds in `dontAsk` mode: in `bypassPermissions`, the rules
// that allow no longer have any effect, everything goes through except what is
// denied — the Edit tool would write anywhere. The configuration therefore
// disables that mode, and says which one the cook starts in.
//
// What neither of them takes away: the account's temporary directory, where
// `claude` makes the sandbox commands write (`$TMPDIR`), and the `.git` of the
// clone the worktree comes from, without which `git commit` fails — `claude`
// refuses `hooks/` and `config` in it.
//
// Pure: nothing is read or written, no path is resolved on disk. Paths are
// given absolute, as the Mac sees them.
import { posix } from "node:path";
import type { Regle } from "../reseau.ts";

// What the chef keeps under their home directory and no cook reads: their keys,
// their credentials, their access. Relative to `~`.
export const FORBIDDEN_READS = [
  // The key to the box, and those to everything else.
  ".ssh",
  ".gnupg",
  // The macOS keychain.
  "Library/Keychains",
  // The GitHub and git tokens.
  ".config/gh",
  ".git-credentials",
  ".netrc",
  // Access to the clouds and the prod machines.
  ".aws",
  ".azure",
  ".config/gcloud",
  ".kube",
  ".docker",
  ".terraform.d",
  ".config/op",
  // The login of `claude` and the configuration of the chef's app.
  ".claude/.credentials.json",
  ".config/brigade",
];

// The cook the configuration is written for. `hosts`: the project's network
// list, as `reseau.ts` holds it — nothing is added to it. `prod`: the chef's
// prod access, besides what `FORBIDDEN_READS` already names.
export type Cook = { worktree: string; caches: string[]; hosts: Regle[]; home: string; prod?: string[] };

export type Settings = {
  sandbox: {
    enabled: true;
    failIfUnavailable: true;
    allowUnsandboxedCommands: false;
    autoAllowBashIfSandboxed: true;
    excludedCommands: [];
    enableWeakerNestedSandbox: false;
    enableWeakerNetworkIsolation: false;
    filesystem: { allowWrite: string[]; denyWrite: string[]; denyRead: string[] };
    network: { allowedDomains: string[]; strictAllowlist: true; allowLocalBinding: false; allowAllUnixSockets: false };
  };
  permissions: { allow: string[]; deny: string[]; disableBypassPermissionsMode: "disable" };
};

export type SandboxConfig = { permissionMode: "dontAsk"; settings: Settings };

export class InvalidSandbox extends Error {}

// What would make a path a pattern in a permission rule (`*`, `?`, `[`, `{`),
// or close its parenthesis.
const NOT_A_PATH = /[*?[\]{}()\\\0-\x1f]/;

function toPath(raw: string, home: string, what: string): string {
  const expanded = raw === "~" ? home : raw.startsWith("~/") ? posix.join(home, raw.slice(2)) : raw;
  if (!posix.isAbsolute(expanded)) throw new InvalidSandbox(`${what} (« ${raw} ») : un chemin absolu est attendu`);
  if (NOT_A_PATH.test(expanded)) throw new InvalidSandbox(`${what} (« ${raw} ») : un chemin ne porte ni motif (* ? [ ] { }), ni parenthèse, ni antislash`);
  const clean = posix.normalize(expanded).replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

// True if `child` is `parent` or lies under it.
const under = (parent: string, child: string) => parent === "/" || child === parent || child.startsWith(`${parent}/`);

const unique = (values: string[]) => [...new Set(values)];

// A host of the list, as `reseau.ts` read it: labels, nothing else.
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/;

// The entries of a rule for `allowedDomains`: `*.host` only covers the
// subdomains there, the host itself is written separately. Without a port, the
// rule opens every port of the host — the sandbox cannot say "443 and 80".
function domains(rule: Regle): string[] {
  if (!HOST.test(rule.hote)) throw new InvalidSandbox(`hôte de la liste réseau (« ${rule.hote} ») : un nom d'hôte est attendu`);
  if (rule.port !== null && !(Number.isSafeInteger(rule.port) && rule.port >= 1 && rule.port <= 65535)) throw new InvalidSandbox(`hôte ${rule.hote} : le port ${rule.port} n'existe pas`);
  const names = rule.sousDomaines ? [rule.hote, `*.${rule.hote}`] : [rule.hote];
  return rule.port === null ? names : names.map((name) => `${name}:${rule.port}`);
}

// A permission rule on an absolute path: `//` in front, the path itself and
// everything under it.
const rules = (tool: string, place: string) => [`${tool}(/${place})`, `${tool}(/${place}/**)`];

export function configure(cook: Cook): SandboxConfig {
  if (!posix.isAbsolute(cook.home)) throw new InvalidSandbox(`répertoire du compte (« ${cook.home} ») : un chemin absolu est attendu`);
  const home = toPath(cook.home, cook.home, "répertoire du compte");
  const forbidden = unique([...FORBIDDEN_READS.map((relative) => posix.join(home, relative)), ...(cook.prod ?? []).map((access) => toPath(access, home, "accès de prod"))]);
  const written = unique([toPath(cook.worktree, home, "worktree"), ...cook.caches.map((cache) => toPath(cache, home, "cache du projet"))]);
  for (const place of written) {
    // Writing above the account is writing everywhere below it: its startup
    // files, its keys.
    if (under(place, home)) throw new InvalidSandbox(`${place} : un cook n'écrit ni à la racine du compte (${home}), ni au-dessus`);
    const touched = forbidden.find((path) => under(path, place) || under(place, path));
    if (touched !== undefined) throw new InvalidSandbox(`${place} : un cook n'y écrirait pas sans toucher à ${touched}, qu'il ne doit pas même lire`);
  }
  const hosts = cook.hosts.map((rule) => ({ rule, names: domains(rule) }));
  return {
    permissionMode: "dontAsk",
    settings: {
      sandbox: {
        enabled: true,
        // Without a sandbox, `claude` refuses to start rather than run the
        // commands bare; and a refused command is never replayed outside the
        // sandbox.
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        autoAllowBashIfSandboxed: true,
        excludedCommands: [],
        enableWeakerNestedSandbox: false,
        enableWeakerNetworkIsolation: false,
        filesystem: { allowWrite: written, denyWrite: forbidden, denyRead: forbidden },
        // `strictAllowlist`: a host outside the list is refused, whatever the
        // mode — without it, `bypassPermissions` would let it through.
        network: { allowedDomains: unique(hosts.flatMap(({ names }) => names)), strictAllowlist: true, allowLocalBinding: false, allowAllUnixSockets: false },
      },
      permissions: {
        allow: unique([
          ...written.map((place) => `Edit(/${place}/**)`),
          // WebFetch follows its own rules, not the sandbox list; a WebFetch
          // rule opens the host on all its ports, so it is not written for a
          // host bound to one port.
          ...hosts.flatMap(({ rule, names }) => (rule.port === null ? names.map((name) => `WebFetch(domain:${name})`) : [])),
        ]),
        deny: forbidden.flatMap((path) => [...rules("Read", path), ...rules("Edit", path)]),
        disableBypassPermissionsMode: "disable",
      },
    },
  };
}

// What the station adds to a cook's launch in the sandbox, in place of its
// `--permission-mode`.
export function sandboxArguments(config: SandboxConfig): string[] {
  return ["--permission-mode", config.permissionMode, "--settings", JSON.stringify(config.settings)];
}
