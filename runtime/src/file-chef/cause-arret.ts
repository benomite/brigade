// Le disjoncteur de la station qui sert le projet (#3658, épique #3654). Le
// 15 novembre 2026, un commentaire disait « The kitchen is resumed: its breaker
// is closed » à 19 h 47, alors que le disjoncteur de la box — la station qui
// sert le projet — resta ouvert jusqu'à 20 h 21.
//
// L'issue du disjoncteur est partagée par les stations d'un projet : elle porte
// le nom de la station qui l'a ouverte, la seule dont le disjoncteur dit qu'il
// est refermé. Une station dont le disjoncteur local est fermé ne reprend donc
// que l'issue qui est la sienne (ou, d'avant ce repère, qui n'en nomme aucune).
import type { IssueDuDisjoncteur } from "../breaker-issue.ts";

const MARQUE_DE_STATION = /^<!-- brigade:breaker-station name=(\S+) -->$/;

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

// L'issue est celle de cette station : elle la reprend quand son disjoncteur
// se referme. Sans station nommée par l'issue (d'avant le repère), toute
// station la reprend, comme avant.
export const estDeCetteStation = (issue: IssueDuDisjoncteur, station: string | null): boolean => {
  const nommee = stationDeLIssue(issue);
  return nommee === null || nommee === station;
};
