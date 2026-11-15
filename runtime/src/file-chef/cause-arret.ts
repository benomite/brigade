// Le disjoncteur de la station qui sert le projet (#3658, épique #3654). Le
// 15 novembre 2026, un commentaire disait « The kitchen is resumed: its breaker
// is closed » à 19 h 47, alors que la box — la station qui sert le projet —
// tenait `kitchen.held`, cause `breaker`, jusqu'à 20 h 21 ; et la file du chef,
// sur le Mac, disait « cause unknown ».
//
// L'issue du disjoncteur est partagée par les stations d'un projet : elle porte
// le nom de la station qui l'a ouverte, la seule dont le disjoncteur dit qu'il
// est refermé. Une station dont le disjoncteur local est fermé ne reprend donc
// que l'issue qui est la sienne (ou, d'avant ce repère, qui n'en nomme aucune),
// et lit les autres comme un disjoncteur ouvert ailleurs, dont la file du chef
// dit l'ouverture.
import type { IssueDuDisjoncteur } from "../breaker-issue.ts";

const MARQUE_DE_STATION = /^<!-- brigade:breaker-station name=(\S+) -->$/;
const OUVERTURE = /^- \*\*Opened at\*\*: (\S+)$/;

// Le repère de l'issue qui nomme la station dont le disjoncteur l'a ouverte.
export const marqueDeStation = (station: string) => `<!-- brigade:breaker-station name=${station} -->`;

const lignes = (corps: string) => corps.split(/\r?\n/).map((ligne) => ligne.trim());

// La station qui a ouvert l'issue, nulle si elle ne la nomme pas.
const stationDeLIssue = (issue: IssueDuDisjoncteur): string | null => {
  for (const ligne of lignes(issue.corps)) {
    const nom = MARQUE_DE_STATION.exec(ligne)?.[1];
    if (nom !== undefined) return nom;
  }
  return null;
};

// L'heure d'ouverture que l'issue dit, nulle si elle ne se lit pas.
const ouvertureDeLIssue = (issue: IssueDuDisjoncteur): string | null => {
  for (const ligne of lignes(issue.corps)) {
    const instant = OUVERTURE.exec(ligne)?.[1];
    if (instant !== undefined && !Number.isNaN(Date.parse(instant))) return instant;
  }
  return null;
};

// L'issue est celle de cette station : elle la reprend quand son disjoncteur
// se referme. Sans station nommée par l'issue (d'avant le repère), toute
// station la reprend, comme avant.
export const estDeCetteStation = (issue: IssueDuDisjoncteur, station: string | null): boolean => {
  const nommee = stationDeLIssue(issue);
  return nommee === null || nommee === station;
};

// Le disjoncteur ouvert d'une autre station, tel que l'issue le dit : ce que
// la file du chef nomme à la place d'une cause inconnue. Tenu par le publieur
// du disjoncteur, lu par la retenue.
export type SuiviDuDisjoncteurServant = { depuis: string | null };

// Ce que cette station lit des issues ouvertes quand son disjoncteur est fermé :
// l'ouverture de la plus ancienne qui n'est pas la sienne — nulle si aucune ne
// la dit —, ou rien s'il n'y en a aucune.
export function disjoncteurDesAutres(ouvertes: IssueDuDisjoncteur[], station: string | null): { depuis: string | null } | null {
  const autres = ouvertes.filter((issue) => !estDeCetteStation(issue, station));
  if (autres.length === 0) return null;
  return { depuis: autres.flatMap((issue) => ouvertureDeLIssue(issue) ?? []).sort()[0] ?? null };
}
