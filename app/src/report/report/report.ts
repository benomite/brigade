// Le rapport de panne devient une URL de nouvelle issue GitHub préremplie (#1975). Module pur : aucun
// appel réseau, aucun import HTTP — l'URL est seulement construite, c'est l'utilisateur qui l'ouvre. La
// rédaction des secrets est passée en paramètre (le vrai module est construit à part) : tout texte libre
// la traverse avant d'entrer dans le titre ou le corps.

export interface Report {
  appVersion: string;
  runtimeVersion: string;
  system: string;
  failure: string;
  logLines: string[];
}

export interface ReportReady {
  title: string;
  body: string;
  url: string;
}

export const URL_NEW_ISSUE = "https://github.com/benomite/brigade/issues/new";
export const LABEL = "field-report";
export const MARKER = "Field report from the brigade app";
// Les dernières lignes du journal gardées au plus, avant même le plafond de l'URL.
export const MAX_LINES = 50;
// La panne tient en quelques mots : au-delà, on coupe.
export const MAX_OUTAGE = 200;
// Longueur maximale de l'URL complète (encodée) ; les lignes de journal les plus anciennes cèdent d'abord.
export const MAX_URL = 7000;

const cut = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

function build(title: string, body: string): ReportReady {
  const request = new URLSearchParams({ title: title, body: body, labels: LABEL });
  // URLSearchParams écrit l'espace « + » : GitHub le lit bien, mais %20 reste sans ambiguïté.
  const url = `${URL_NEW_ISSUE}?${request.toString().replaceAll("+", "%20")}`;
  return { title: title, body: body, url };
}

function bodyOf(r: Report, outage: string, lines: string[]): string {
  const sections = [
    MARKER,
    `## Versions\n- App: ${r.appVersion}\n- Runtime: ${r.runtimeVersion}`,
    `## System\n${r.system}`,
    `## Failure\n${outage}`,
  ];
  if (lines.length > 0) {
    sections.push(`## Log (last ${lines.length} lines)\n\`\`\`\n${lines.join("\n")}\n\`\`\``);
  }
  return sections.join("\n\n");
}

export function buildReport(report: Report, redact: (text: string) => string): ReportReady {
  const own: Report = {
    appVersion: redact(report.appVersion),
    runtimeVersion: redact(report.runtimeVersion),
    system: redact(report.system),
    failure: redact(report.failure),
    logLines: report.logLines.slice(-MAX_LINES).map((l) => redact(l)),
  };
  let outage = cut(own.failure.replace(/\s+/g, " ").trim(), MAX_OUTAGE);
  const title = `Field report: ${cut(outage, 80)}`;
  let lines = own.logLines;
  let prêt = build(title, bodyOf(own, outage, lines));
  // D'abord les lignes de journal, les plus anciennes en premier.
  while (prêt.url.length > MAX_URL && lines.length > 0) {
    lines = lines.slice(Math.max(1, Math.ceil(lines.length / 10)));
    prêt = build(title, bodyOf(own, outage, lines));
  }
  // Puis, en dernier recours, la panne elle-même.
  while (prêt.url.length > MAX_URL && outage.length > 20) {
    outage = cut(outage, Math.floor(outage.length / 2));
    prêt = build(title, bodyOf(own, outage, lines));
  }
  return prêt;
}
