// Un critère testable a un test gelé (#3741). La fiche classe chaque critère
// d'acceptation : `testable`, ou `not-testable` avec la preuve qu'il doit. La
// pass renvoie la livraison dont un critère testable n'a aucun test gelé qui le
// couvre, dont un critère non testable n'apporte pas sa preuve, ou dont un
// critère qui décrit un comportement est classé non testable. Une fiche qui dit
// « no testable criterion: proof by … » n'est pas renvoyée faute de tests.
//
// Ce module ne lit rien : les critères, la couverture que la relecture en dit et
// les fichiers gelés lui sont donnés.
import { etatDuCritere, nomDuTest, type Couverture, type Preuve } from "./rouge-sur-main.ts";

export type Critere = { texte: string; classe: "testable" } | { texte: string; classe: "not-testable"; preuve: string } | { texte: string; classe: "none"; preuve: string } | { texte: string; classe: null };

const SANS_TESTABLE = /^no testable criterion\s*:\s*(?:proof by\s+)?(.+)$/i;
const MARQUE = /\s*\((testable|not[- ]testable\s*:\s*[^()]+?)\)\s*\.?$/i;
// Un critère qui décrit un comportement : « Given …, … », « When … ».
const COMPORTEMENT = /^(?:given|when|if|once|étant donné|quand|lorsque|si)\b/i;

// La classe qu'un critère porte, lue de son texte : `(testable)`,
// `(not-testable: proof by <preuve>)`, ou la ligne `no testable criterion: proof
// by <preuve>`. Sans marque, il n'est pas classé : la pass n'en dit rien.
export function lireLeCritere(texte: string): Critere {
  const sans = SANS_TESTABLE.exec(texte.trim());
  if (sans?.[1] !== undefined) return { texte, classe: "none", preuve: sans[1] };
  const marque = MARQUE.exec(texte)?.[1]?.toLowerCase();
  if (marque === undefined) return { texte, classe: null };
  const nu = texte.replace(MARQUE, "").trim();
  if (marque === "testable") return { texte: nu, classe: "testable" };
  return { texte: nu, classe: "not-testable", preuve: marque.replace(/^not[- ]testable\s*:\s*/, "").replace(/^proof by\s+/, "").trim() };
}

const dit = (texte: string) => (texte.length <= 120 ? texte : `${texte.slice(0, 119)}…`);

// Les motifs de renvoi, un par critère fautif, qui le nomme. `couvertures` : ce
// que la relecture a dit de chaque critère, dans l'ordre ; `gelés` : les fichiers
// du commit gelé. Un test couvre un critère s'il est gelé, rouge sur la base et
// vert sur la branche (`etatDuCritere`).
export function motifsDesCriteres(criteres: readonly Critere[], couvertures: readonly Couverture[] | null, preuve: Preuve, gelés: readonly string[]): string[] {
  const motifs: string[] = [];
  criteres.forEach((critere, rang) => {
    if (critere.classe === null || critere.classe === "none") return;
    const etat = etatDuCritere(couvertures?.[rang], preuve);
    const nom = `criterion ${rang + 1} (“${dit(critere.texte)}”)`;
    if (critere.classe === "testable") {
      const gele = etat.etat === "test" && etat.tests.some(({ fichier }) => gelés.includes(fichier));
      if (!gele) motifs.push(`- **Blocking**: ${nom} is classed testable and no frozen test covers it${etat.etat === "test" ? ` (the test that covers it, ${etat.tests.map(nomDuTest).join(", ")}, is not in the frozen acceptance commit)` : ""}: freeze a test for it.`);
      return;
    }
    if (COMPORTEMENT.test(critere.texte.trim())) motifs.push(`- **Blocking**: ${nom} describes a behaviour and is classed not-testable: a behaviour is testable, classify it so and freeze a test for it.`);
    else if (etat.etat === "rien") motifs.push(`- **Blocking**: ${nom} is classed not-testable and the proof it owes (${critere.preuve}) is not in the delivery.`);
  });
  return motifs;
}
