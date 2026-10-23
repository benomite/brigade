// Le bac à sable natif de Claude Code est-il là, sur cette machine ? C'est la
// condition pour qu'un cook ordinaire tourne sur le Mac du chef : sans lui, le
// cook lirait tout ce que lit le compte — la clé ssh vers la box, les accès de
// prod, les identifiants du chef. Le bac à sable des cooks du Mac est celui de
// macOS (Seatbelt, piloté par `sandbox-exec`) : sur une autre plateforme, il
// est indisponible, même si `claude` sait en monter un — la box a sa cloison
// à elle (`cloison.ts`).
//
// Trois choses à réunir : macOS, l'outil de Seatbelt, et un `claude` assez
// récent pour lire la configuration que `configuration.ts` écrit. Ce dernier
// point n'est pas un confort : lancé avec `-p`, `claude` ignore sans rien dire
// des réglages qu'il ne sait pas valider — et le cook partirait sans bac à
// sable.
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "../sans-invite.ts";

export type Detection = { disponible: true; version: string } | { disponible: false; raison: string };

// Ce que la détection regarde de la machine : de quoi la simuler dans un test.
export type Sondes = {
  plateforme: NodeJS.Platform;
  existe(chemin: string): boolean;
  // La sortie de `claude --version`, null s'il n'a pas répondu.
  versionDeClaude(): string | null;
  // Le répertoire temporaire de la machine, où partent les jugements du
  // manager. Par défaut, celui du process.
  temporaire?: () => string;
};

// L'outil par lequel le bac à sable de Claude Code monte Seatbelt.
export const SEATBELT = "/usr/bin/sandbox-exec";

// La version de `claude` la plus ancienne qui lit toute la configuration du
// bac à sable : `network.strictAllowlist` (v2.1.219), sans quoi un cook
// joindrait les hôtes hors de la liste, et le bac à sable bâti des seuls
// réglages de `--settings` quand `--setting-sources` coupe les autres sources
// (v2.1.246) — c'est ainsi qu'un cook est lancé (`claude.ts`).
export const VERSION_MINIMALE = "2.1.246";

const VERSION = /(\d+)\.(\d+)\.(\d+)/;

// Vrai si `version` est au moins `minimale` — deux « majeur.mineur.correctif ».
export function auMoins(version: string, minimale: string): boolean {
  const [a, b] = [version, minimale].map((texte) => (VERSION.exec(texte) ?? []).slice(1).map(Number));
  if (a?.length !== 3 || b?.length !== 3) return false;
  for (let rang = 0; rang < 3; rang++) if (a[rang] !== b[rang]) return (a[rang] ?? 0) > (b[rang] ?? 0);
  return true;
}

export function detecter(sondes: Sondes): Detection {
  if (sondes.plateforme !== "darwin") return { disponible: false, raison: `le bac à sable des cooks est celui de macOS, et cette machine tourne sous ${sondes.plateforme}` };
  if (!sondes.existe(SEATBELT)) return { disponible: false, raison: `Seatbelt est introuvable : \`${SEATBELT}\` n'existe pas sur ce Mac` };
  const sortie = sondes.versionDeClaude();
  if (sortie === null) return { disponible: false, raison: "`claude --version` n'a pas répondu : impossible de savoir si ce `claude` connaît le bac à sable" };
  const version = VERSION.exec(sortie)?.[0];
  if (version === undefined) return { disponible: false, raison: `\`claude --version\` ne donne pas de version lisible (« ${sortie.trim().slice(0, 80)} »)` };
  if (!auMoins(version, VERSION_MINIMALE))
    return { disponible: false, raison: `\`claude\` ${version} est trop ancien : il faut ${VERSION_MINIMALE} au moins pour qu'il lise la configuration du bac à sable — \`claude update\`` };
  return { disponible: true, version };
}

// Les sondes de la machine où tourne le runtime. `bin` : le `claude` que la
// station lance (`BRIGADE_CLAUDE_BIN`, sinon `claude`).
export function sondesDeLaMachine(bin: string): Sondes {
  return {
    plateforme: process.platform,
    existe: existsSync,
    temporaire: tmpdir,
    versionDeClaude() {
      try {
        return execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return null;
      }
    },
  };
}
