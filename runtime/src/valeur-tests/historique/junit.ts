// Ce qu'un tour de tests a donné, lu dans le rapport JUnit du lanceur du
// projet — `node --test`, celui du runtime comme celui de l'app :
//
//   node --test --test-reporter=junit --test-reporter-destination=<rapport.xml> …
//
// C'est le seul de ses rapports qui dit, pour chaque test, le fichier qui le
// porte : le rapport par défaut (`spec`) et le TAP ne le disent que pour ceux
// qui échouent.
//
// Un test du rapport est un `<testcase>` ; les `<testsuite>` qui l'englobent
// sont ses `describe` et ses tests parents (`t.test`), dont les noms, du plus
// haut au plus proche, précèdent le sien dans son nom complet. Un fichier qui ne
// se charge pas y figure comme un test à son nom, en échec : il a fait échouer
// le tour.
import { isAbsolute, relative } from "node:path";

export type Issue = "pass" | "fail" | "skip";

export type ResultatDeTest = {
  // Le chemin du fichier, relatif à la racine donnée, en `/`.
  fichier: string;
  // Le nom complet : les suites englobantes puis le test, séparés par ` > `.
  nom: string;
  issue: Issue;
  dureeMs: number;
};

export const SEPARATEUR = " > ";

// L'identifiant d'un test : son fichier, puis son nom complet.
export function idDuTest(fichier: string, nom: string): string {
  return `${fichier}${SEPARATEUR}${nom}`;
}

export class RapportIlisible extends Error {}

const ENTITES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decoder(texte: string): string {
  return texte.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (entite, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITES[code] ?? entite;
  });
}

function attributs(texte: string): Map<string, string> {
  return new Map([...texte.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1] ?? "", decoder(a[2] ?? a[3] ?? "")]));
}

function cheminRelatif(fichier: string, racine: string): string {
  const chemin = isAbsolute(fichier) && racine !== "" ? relative(racine, fichier) : fichier;
  // Hors de la racine, le chemin reste celui du rapport.
  const garde = chemin.startsWith("..") || isAbsolute(chemin) ? fichier : chemin;
  return garde.replaceAll("\\", "/");
}

// Les tests du rapport, dans son ordre. Un même test deux fois dans le rapport
// — deux tests de même nom dans un fichier — n'en fait qu'un : en échec si l'un
// a échoué, sa durée la somme des deux. Lève `RapportIlisible` sur ce qui n'est
// pas un rapport JUnit.
export function lireRapportJUnit(xml: string, racine: string): ResultatDeTest[] {
  // Les commentaires portent le bilan du lanceur, que la liste des tests redit.
  const sansCommentaires = xml.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<testsuites[\s>]/.test(sansCommentaires)) throw new RapportIlisible("not a JUnit report: no <testsuites> element");
  const resultats = new Map<string, ResultatDeTest>();
  const suites: string[] = [];
  // Le test ouvert, en attente de sa balise de fin.
  let courant: { fichier: string; nom: string; dureeMs: number; echec: boolean; saute: boolean } | null = null;
  const fermer = () => {
    if (courant === null) return;
    const { fichier, nom, dureeMs, echec, saute } = courant;
    // Un test « à faire » ou sauté qui échoue ne fait pas échouer le tour.
    const issue: Issue = saute ? "skip" : echec ? "fail" : "pass";
    const id = idDuTest(fichier, nom);
    const deja = resultats.get(id);
    if (deja === undefined) resultats.set(id, { fichier, nom, issue, dureeMs });
    else resultats.set(id, { ...deja, issue: deja.issue === "fail" || issue === "fail" ? "fail" : deja.issue === "pass" || issue === "pass" ? "pass" : "skip", dureeMs: deja.dureeMs + dureeMs });
    courant = null;
  };
  // Le texte entre les balises n'a ni `<` ni `&` qui ne soit échappé : chaque
  // `<` ouvre une balise. Un `>` peut rester tel quel, dans le texte comme dans
  // la valeur d'un attribut — le nom d'un test qui en porte un.
  for (const [, fin, element, texte = "", vide] of sansCommentaires.matchAll(/<(\/?)([\w:-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    const a = attributs(texte);
    if (element === "testsuite") {
      if (fin) suites.pop();
      else if (!vide) suites.push(a.get("name") ?? "");
    } else if (element === "testcase") {
      if (fin) {
        fermer();
        continue;
      }
      const nom = a.get("name");
      const fichier = a.get("file");
      const secondes = Number(a.get("time") ?? "0");
      if (nom === undefined || fichier === undefined || !Number.isFinite(secondes) || secondes < 0) throw new RapportIlisible(`a <testcase> has no name, file or duration: <testcase${texte}>`);
      courant = { fichier: cheminRelatif(fichier, racine), nom: [...suites, nom].join(SEPARATEUR), dureeMs: secondes * 1000, echec: a.has("failure"), saute: false };
      if (vide) fermer();
    } else if (courant !== null && !fin) {
      if (element === "failure" || element === "error") courant.echec = true;
      else if (element === "skipped") courant.saute = true;
    }
  }
  return [...resultats.values()];
}
