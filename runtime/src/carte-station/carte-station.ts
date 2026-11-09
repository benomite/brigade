// Jamais au chef un geste d'installation, de démarrage de service ou de base de
// données (#3058, épique #3053). Quand le manager lit, dans le blocage d'un
// cook, un « geste que seul le chef peut faire » qui est l'un de ces trois-là
// (mirrorlab#674, #675), la carte du ticket n'est pas posée : le cook, ou la
// cuisine, le fait. Reste ce qu'un humain installe une fois pour la station —
// le serveur Postgres, par exemple : une seule carte par station et par
// prérequis le nomme, quel que soit le nombre de tickets que son absence bloque.
//
// La carte est une issue `blocked-on-human` qui porte une marque cachée (station
// et prérequis) : la station la cherche avant d'en ouvrir une, comme le ticket de
// qualité (alerte-qualite.ts). Une carte fermée par le chef se rouvre si le
// prérequis manque encore.
import { DE_CONFIANCE } from "../alimenter.ts";
import type { GitHubDeLaQualite } from "../alerte-qualite.ts";

export const MARQUE_CARTE_STATION = "<!-- brigade:carte-station";
// Les issues que la recherche de la carte relit : celles touchées depuis un an.
const FENETRE_MS = 365 * 86_400_000;

export type SorteDeGeste = "install" | "service" | "base";

// Les serveurs qu'un humain installe une fois pour la station.
const SERVEURS: ReadonlyArray<{ cle: string; nom: string; motif: RegExp }> = [
  { cle: "postgres", nom: "PostgreSQL server", motif: /\bpostgres(?:ql)?\b|\bpg_ctl\b|\bcreatedb\b|\bpsql\b/i },
  { cle: "mysql", nom: "MySQL server", motif: /\bmysql\b|\bmariadb\b/i },
  { cle: "redis", nom: "Redis server", motif: /\bredis\b/i },
  { cle: "mongodb", nom: "MongoDB server", motif: /\bmongo(?:db)?\b/i },
];

const INSTALLER = /\b(?:npm|pnpm|yarn|pip3?|apt(?:-get)?|brew|dnf|yum|apk|cargo|gem)\s+(?:install|add)\b|\binstall(?:ing|ed)?\b[^.\n]{0,40}\b(?:postgres(?:ql)?|mysql|mariadb|redis|mongo(?:db)?|node(?:\.?js)?|npm|dependenc\w*|packages?|toolchain|chromium|playwright|docker)\b/i;
const SERVICE = /\bsystemctl\s+(?:start|restart|enable)\b|\bpg_ctl\b|\bbrew\s+services\s+start\b|\bdocker[- ]compose\s+up\b|\bservice\s+\S+\s+(?:start|restart)\b|\b(?:start|restart|launch|bring up)\b[^.\n]{0,40}\b(?:postgres(?:ql)?|mysql|mariadb|redis|mongo(?:db)?|database server|daemon|service)\b|\b(?:unreachable|not running|connection refused)\b/i;
const BASE = /\bcreatedb\b|\bdropdb\b|\bcreate\s+(?:the\s+|a\s+)?(?:database|db|schema|role)\b|\bmigrat(?:e|es|ion|ions)\b|\bdb:(?:create|migrate|reset)\b/i;

// Ce que dit le geste que le manager a lu : son genre, et le serveur qu'il
// nomme, ou null quand ce n'est ni une installation, ni un service à démarrer,
// ni une base à créer ou à migrer — un autre geste, que la carte du ticket
// porte comme avant.
export type GesteLu = { sorte: SorteDeGeste; serveur: { cle: string; nom: string } | null };

export function lireLeGeste(geste: string): GesteLu | null {
  const sorte: SorteDeGeste | null = INSTALLER.test(geste) ? "install" : SERVICE.test(geste) ? "service" : BASE.test(geste) ? "base" : null;
  if (sorte === null) return null;
  const serveur = SERVEURS.find(({ motif }) => motif.test(geste));
  return { sorte, serveur: serveur ? { cle: serveur.cle, nom: serveur.nom } : null };
}

export const marqueDeLaCarte = (station: string, cle: string) => `${MARQUE_CARTE_STATION} station=${station} prerequis=${cle} -->`;

export function carteDeLaStation(station: string, serveur: { cle: string; nom: string }): { titre: string; corps: string; labels: string[] } {
  return {
    titre: `Station ${station} lacks a ${serveur.nom}`,
    corps: [
      marqueDeLaCarte(station, serveur.cle),
      "",
      `Station \`${station}\` has no ${serveur.nom} the kitchen can reach, and only a human installs it, once. Every ticket that needs it waits for it: no other card is posted for them.`,
      "",
      `**Prerequisite:** ${serveur.nom} installed and running on station \`${station}\`.`,
      "",
      "Nothing here is to decide. Once the station has it, close this issue: the tickets that waited resume on their own.",
      "",
      "_Opened by the station, one card per station and prerequisite._",
    ].join("\n"),
    labels: ["blocked-on-human"],
  };
}

export type Pose = { carte: number; ouverte: boolean } | { echec: string };

// La carte de la station pour ce prérequis : celle qui est déjà ouverte, ou une
// nouvelle. `deja` : les cartes que ce processus a ouvertes, au cas où GitHub
// ne rend pas encore la dernière. Sans lecture des issues, rien n'est ouvert —
// mieux vaut une carte de moins qu'un doublon.
export async function poserLaCarteDeLaStation(
  { github, deja, maintenant = () => new Date() }: { github: GitHubDeLaQualite; deja: Map<string, number>; maintenant?: () => Date },
  station: string,
  serveur: { cle: string; nom: string },
): Promise<Pose> {
  const cle = `${station}\n${serveur.cle}`;
  const connue = deja.get(cle);
  if (connue !== undefined) return { carte: connue, ouverte: false };
  const marque = marqueDeLaCarte(station, serveur.cle);
  try {
    const depuis = new Date(maintenant().getTime() - FENETRE_MS).toISOString();
    const ouverte = (await github.issuesDepuis(depuis)).find((issue) => DE_CONFIANCE.includes(issue.association) && issue.state !== "closed" && issue.body.includes(marque));
    if (ouverte !== undefined) {
      deja.set(cle, ouverte.number);
      return { carte: ouverte.number, ouverte: false };
    }
  } catch (erreur) {
    return { echec: `the issues could not be read to find the card of ${station} for the ${serveur.nom}: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  try {
    const carte = await github.creerIssue(carteDeLaStation(station, serveur));
    deja.set(cle, carte);
    return { carte, ouverte: true };
  } catch (erreur) {
    return { echec: `the card of ${station} for the ${serveur.nom} could not be opened: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
}
