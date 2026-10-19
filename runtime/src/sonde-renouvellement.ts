// La sonde du renouvellement de la session Max, vue de systemd : le minuteur
// `brigade-renouvellement.timer` est-il actif, et que disent les derniers
// passages de `brigade-renouvellement.service` ? Elle ne lit ni le fichier
// d'état ni les identifiants (`renouvellement.ts` s'en charge) : elle répond à
// « le renouvellement tourne-t-il seulement ? », ce que le fichier d'état ne
// peut pas dire quand rien ne s'est jamais lancé.
//
// Les appels à systemd passent par `Systemd`, injectable : les tests en jouent
// un faux, sans systemd. `systemdReel` est celui de la box.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MINUTEUR = "brigade-renouvellement.timer";
const SERVICE = "brigade-renouvellement.service";
// Combien de passages le journal est interrogé, au plus.
const PASSAGES = 20;

// Un passage du service, du plus récent au plus ancien dans `Systemd.passages`.
export type Passage = {
  at: Date;
  reussi: boolean;
  // Ce que le journal a dit de ce passage (lignes de `brigade-renouvellement`
  // et de systemd), pour en tirer la raison d'un échec.
  lignes: string[];
};

export type Systemd = {
  minuteurActif: () => Promise<boolean>;
  // Les derniers passages du service, le plus récent d'abord.
  passages: (max: number) => Promise<Passage[]>;
};

export type EtatDuRenouvellement =
  | { etat: "ok"; dernierReussi: string; echecsConsecutifs: 0 }
  | { etat: "minuteur-inactif"; dernierReussi: string | null; echecsConsecutifs: number }
  | { etat: "claude-introuvable"; raison: string; dernierReussi: string | null; echecsConsecutifs: number }
  | { etat: "echec"; raison: string; dernierReussi: string | null; echecsConsecutifs: number };

const deuxChiffres = (n: number) => String(n).padStart(2, "0");
// L'heure locale de la box, HH:MM.
const heure = (date: Date) => `${deuxChiffres(date.getHours())}:${deuxChiffres(date.getMinutes())}`;

const INTROUVABLE = /claude-introuvable|claude[^\n]*(introuvable|not found|No such file)|status=127|code 127/i;
// Ce que `brigade-renouvellement` écrit d'un échec : « échec (nature) : détail ».
const LIGNE_D_ECHEC = /brigade-renouvellement\s*:\s*(échec.*)$/;

// La raison d'un passage en échec : la ligne d'échec du script si le journal
// la porte, sinon la dernière ligne que systemd a dite de ce passage.
function raison(passage: Passage): string {
  for (const ligne of [...passage.lignes].reverse()) {
    const trouve = LIGNE_D_ECHEC.exec(ligne);
    if (trouve?.[1]) return trouve[1].trim();
  }
  const derniere = passage.lignes.findLast((ligne) => ligne.trim() !== "");
  return derniere?.trim() ?? "échec sans explication au journal";
}

export async function sonderRenouvellement(systemd: Systemd): Promise<EtatDuRenouvellement> {
  const [actif, passages] = await Promise.all([systemd.minuteurActif(), systemd.passages(PASSAGES)]);
  let echecsConsecutifs = 0;
  for (const passage of passages) {
    if (passage.reussi) break;
    echecsConsecutifs += 1;
  }
  const reussi = passages.find((passage) => passage.reussi);
  const dernierReussi = reussi ? heure(reussi.at) : null;

  if (!actif) return { etat: "minuteur-inactif", dernierReussi, echecsConsecutifs };
  const dernier = passages[0];
  if (dernier === undefined) {
    return { etat: "echec", raison: "aucun passage au journal : le minuteur est actif, mais le service ne s'est jamais lancé", dernierReussi, echecsConsecutifs };
  }
  if (dernier.reussi) return { etat: "ok", dernierReussi: heure(dernier.at), echecsConsecutifs: 0 };
  const dite = raison(dernier);
  if (INTROUVABLE.test(dernier.lignes.join("\n"))) return { etat: "claude-introuvable", raison: dite, dernierReussi, echecsConsecutifs };
  return { etat: "echec", raison: dite, dernierReussi, echecsConsecutifs };
}

type LogEntry = { MESSAGE?: unknown; __REALTIME_TIMESTAMP?: string };

// Les passages, tirés des messages du journal : systemd dit « Finished … »
// d'un passage réussi, « Failed with result … » puis « Failed to start … » d'un échec ; les lignes que le
// script a écrites avant lui en donnent la raison.
export function logPassages(sortie: string): Passage[] {
  const passages: Passage[] = [];
  let lignes: string[] = [];
  // Le message précédent a clos un échec par « Failed with result ».
  let apresEchec = false;
  for (const brut of sortie.split("\n")) {
    if (brut.trim() === "") continue;
    let entree: LogEntry;
    try {
      entree = JSON.parse(brut) as LogEntry;
    } catch {
      continue;
    }
    const message = typeof entree.MESSAGE === "string" ? entree.MESSAGE : "";
    const at = new Date(Number(entree.__REALTIME_TIMESTAMP ?? "0") / 1000);
    const suiteDeLEchec = apresEchec;
    apresEchec = false;
    if (/^Finished /.test(message)) {
      passages.push({ at, reussi: true, lignes });
      lignes = [];
    } else if (/Failed with result/.test(message)) {
      passages.push({ at, reussi: false, lignes: [...lignes, message] });
      lignes = [];
      apresEchec = true;
    } else if (/Failed to start/.test(message) && suiteDeLEchec) {
      // Systemd dit les deux à la suite d'un même échec : un seul passage.
    } else if (/Failed to start/.test(message)) {
      passages.push({ at, reussi: false, lignes: [...lignes, message] });
      lignes = [];
    } else {
      lignes.push(message);
    }
  }
  return passages.reverse();
}

export const systemdReel: Systemd = {
  async minuteurActif() {
    try {
      const { stdout } = await execFileAsync("systemctl", ["is-active", MINUTEUR]);
      return stdout.trim() === "active";
    } catch {
      // `is-active` sort en erreur dès que l'unité n'est pas active.
      return false;
    }
  },
  async passages(max) {
    try {
      const { stdout } = await execFileAsync("journalctl", ["-u", SERVICE, "-o", "json", "--no-pager", "-n", String(max * 8)]);
      return logPassages(stdout).slice(0, max);
    } catch {
      return [];
    }
  },
};
