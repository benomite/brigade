// Le rapport de panne devient une URL de nouvelle issue GitHub préremplie (#1975). Module pur : aucun
// appel réseau, aucun import HTTP — l'URL est seulement construite, c'est l'utilisateur qui l'ouvre. La
// rédaction des secrets est passée en paramètre (le vrai module est construit à part) : tout texte libre
// la traverse avant d'entrer dans le titre ou le corps.

export interface Rapport {
  appVersion: string;
  runtimeVersion: string;
  system: string;
  failure: string;
  logLines: string[];
}

export interface RapportPret {
  title: string;
  body: string;
  url: string;
}

export const URL_NOUVELLE_ISSUE = "https://github.com/benomite/brigade/issues/new";
export const ETIQUETTE = "field-report";
export const MARQUEUR = "Field report from the brigade app";
// Les dernières lignes du journal gardées au plus, avant même le plafond de l'URL.
export const MAX_LIGNES = 50;
// La panne tient en quelques mots : au-delà, on coupe.
export const MAX_PANNE = 200;
// Longueur maximale de l'URL complète (encodée) ; les lignes de journal les plus anciennes cèdent d'abord.
export const MAX_URL = 7000;

const coupe = (texte: string, max: number): string =>
  texte.length <= max ? texte : `${texte.slice(0, max - 1)}…`;

function construire(titre: string, corps: string): RapportPret {
  const requete = new URLSearchParams({ title: titre, body: corps, labels: ETIQUETTE });
  // URLSearchParams écrit l'espace « + » : GitHub le lit bien, mais %20 reste sans ambiguïté.
  const url = `${URL_NOUVELLE_ISSUE}?${requete.toString().replaceAll("+", "%20")}`;
  return { title: titre, body: corps, url };
}

function corpsDe(r: Rapport, panne: string, lignes: string[]): string {
  const sections = [
    MARQUEUR,
    `## Versions\n- App: ${r.appVersion}\n- Runtime: ${r.runtimeVersion}`,
    `## System\n${r.system}`,
    `## Failure\n${panne}`,
  ];
  if (lignes.length > 0) {
    sections.push(`## Log (last ${lignes.length} lines)\n\`\`\`\n${lignes.join("\n")}\n\`\`\``);
  }
  return sections.join("\n\n");
}

export function construireRapport(rapport: Rapport, redact: (texte: string) => string): RapportPret {
  const propre: Rapport = {
    appVersion: redact(rapport.appVersion),
    runtimeVersion: redact(rapport.runtimeVersion),
    system: redact(rapport.system),
    failure: redact(rapport.failure),
    logLines: rapport.logLines.slice(-MAX_LIGNES).map((l) => redact(l)),
  };
  let panne = coupe(propre.failure.replace(/\s+/g, " ").trim(), MAX_PANNE);
  const titre = `Field report: ${coupe(panne, 80)}`;
  let lignes = propre.logLines;
  let prêt = construire(titre, corpsDe(propre, panne, lignes));
  // D'abord les lignes de journal, les plus anciennes en premier.
  while (prêt.url.length > MAX_URL && lignes.length > 0) {
    lignes = lignes.slice(Math.max(1, Math.ceil(lignes.length / 10)));
    prêt = construire(titre, corpsDe(propre, panne, lignes));
  }
  // Puis, en dernier recours, la panne elle-même.
  while (prêt.url.length > MAX_URL && panne.length > 20) {
    panne = coupe(panne, Math.floor(panne.length / 2));
    prêt = construire(titre, corpsDe(propre, panne, lignes));
  }
  return prêt;
}
