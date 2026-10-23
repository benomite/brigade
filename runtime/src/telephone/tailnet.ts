// Le chemin du téléphone vers la station, de n'importe quel réseau (#1408) :
// le tailnet du chef — le réseau privé que Tailscale tisse entre ses
// appareils, par-dessus WireGuard. Le téléphone y entre par l'app Tailscale,
// sans terminal ; chaque station, la box comprise, par `tailscale up`. Le
// tailnet traverse les box internet et les réseaux mobiles, chiffre de bout en
// bout, et ne laisse joindre une station qu'aux appareils du chef.
//
// La station n'y ouvre rien elle-même : son guichet écoute sur la boucle
// locale (`guichet.ts`), et c'est `tailscale serve` qui le publie sur le
// tailnet, en HTTPS, sous le nom de la machine (`box.tail1234.ts.net`). Sur la
// box, l'unité de la station ne joint que la boucle locale
// (`IPAddressAllow=localhost`) : tailscaled, hors d'elle, reçoit le téléphone
// et lui passe la demande sur la boucle — rien à y rouvrir.
//
// Ce module lit la publication — `tailscale serve status --json` — et en tire
// l'adresse où le téléphone joint le guichet : celle que le QR porte. Il ne
// règle rien, ne publie rien : publier le guichet est le geste du chef, une
// fois par station.
import { execFile } from "../sans-invite.ts";
import type { Ecoute } from "./appairage.ts";

// Le `tailscale` à lancer : celui du PATH, à défaut.
export const VARIABLE_TAILSCALE = "BRIGADE_TAILSCALE_BIN";

// Où le téléphone joint le guichet par le tailnet. `funnel` : la publication
// est ouverte à Internet entier (`tailscale funnel`), pas au seul tailnet.
export type Publication = { url: string; funnel: boolean };

type Gestionnaire = { Proxy?: unknown };
type Service = { Handlers?: Record<string, Gestionnaire | null> | null };
type Port = { HTTPS?: unknown; HTTP?: unknown };
// Ce que `tailscale serve status --json` rend : la configuration de serve
// (`ipn.ServeConfig`), et celle de chaque `tailscale serve` lancé au premier plan.
type ConfigServe = {
  TCP?: Record<string, Port | null> | null;
  Web?: Record<string, Service | null> | null;
  AllowFunnel?: Record<string, unknown> | null;
  Foreground?: Record<string, ConfigServe | null> | null;
};

const BOUCLE = new Set(["127.0.0.1", "localhost", "::1"]);
const TOUTES = new Set(["0.0.0.0", "::"]);

// Le proxy de serve aboutit-il au guichet ? Au même port, et sur une adresse
// où il écoute : la boucle locale pour un guichet qui y écoute, ou partout.
function aboutit(proxy: unknown, ecoute: Ecoute): boolean {
  if (typeof proxy !== "string") return false;
  let cible: URL;
  try {
    // `tailscale serve 7010` écrit `http://127.0.0.1:7010` ; un port seul se
    // lit sur la boucle locale.
    cible = new URL(/^[0-9]+$/.test(proxy) ? `http://127.0.0.1:${proxy}` : proxy);
  } catch {
    return false;
  }
  if (cible.protocol !== "http:" || Number(cible.port || 80) !== ecoute.port) return false;
  if (cible.pathname !== "/" || cible.search !== "") return false;
  const hote = cible.hostname.replace(/^\[|\]$/g, "");
  const ecoutee = ecoute.hote.replace(/^\[|\]$/g, "");
  return TOUTES.has(ecoutee) || hote === ecoutee || (BOUCLE.has(hote) && BOUCLE.has(ecoutee));
}

// L'adresse du guichet sur le tailnet, lue dans ce que serve publie : le
// service dont la racine passe au guichet, en HTTPS de préférence. Null si
// serve ne le publie pas — ou si ce qu'on lui donne n'est pas une
// configuration de serve.
export function publicationDuGuichet(statut: unknown, ecoute: Ecoute): Publication | null {
  const trouvees: Publication[] = [];
  const parcourir = (config: unknown) => {
    if (typeof config !== "object" || config === null) return;
    const { TCP, Web, AllowFunnel, Foreground } = config as ConfigServe;
    for (const [hotePort, service] of Object.entries(Web ?? {})) {
      if (!aboutit(service?.Handlers?.["/"]?.Proxy, ecoute)) continue;
      const [, hote, port] = /^(.+):([0-9]{1,5})$/.exec(hotePort) ?? [];
      if (hote === undefined || port === undefined) continue;
      const tcp = TCP?.[port];
      const schema = tcp?.HTTPS === true ? "https" : tcp?.HTTP === true ? "http" : null;
      if (schema === null) continue;
      const parDefaut = (schema === "https" && port === "443") || (schema === "http" && port === "80");
      trouvees.push({ url: `${schema}://${hote}${parDefaut ? "" : `:${port}`}`, funnel: AllowFunnel?.[hotePort] === true });
    }
    for (const premierPlan of Object.values(Foreground ?? {})) parcourir(premierPlan);
  };
  parcourir(statut);
  // Le tailnet seul avant Internet, HTTPS avant HTTP.
  trouvees.sort((a, b) => Number(a.funnel) - Number(b.funnel) || Number(b.url.startsWith("https:")) - Number(a.url.startsWith("https:")));
  return trouvees[0] ?? null;
}

// Ce que serve publie sur cette machine, tel que `tailscale` le rend. Null
// quand il n'y a rien à lire : `tailscale` absent, arrêté, déconnecté, ou une
// sortie qui n'est pas du JSON — la station n'est alors pas sur le tailnet, et
// le QR n'en porte pas l'adresse.
export function lirePublication(env: Record<string, string | undefined> = process.env, delaiMs = 10_000): Promise<unknown> {
  const tailscale = env[VARIABLE_TAILSCALE] || "tailscale";
  return new Promise((resoudre) => {
    try {
      const enfant = execFile(tailscale, ["serve", "status", "--json"], { timeout: delaiMs, maxBuffer: 1024 * 1024 }, (erreur, sortie) => {
        if (erreur !== null) return resoudre(null);
        try {
          resoudre(JSON.parse(String(sortie)) as unknown);
        } catch {
          resoudre(null);
        }
      });
      enfant.stdin?.end();
    } catch {
      resoudre(null);
    }
  });
}
