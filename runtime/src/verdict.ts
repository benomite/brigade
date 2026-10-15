// Le verdict de « Vérifier » (`installation`), structuré pour un programme :
// l'app le lit tel quel (`installation --json`), sans parser de texte. Trois
// issues, et une seule :
//   pret       rien ne manque pour lancer un cook ;
//   pas-pret   des manques, chacun en mots simples, avec qui le lève — le chef,
//              d'un bouton de l'app ou par la commande exacte, ou brigade seule ;
//   plantee    la vérification n'est pas allée au bout : c'est une panne de
//              brigade, pas du projet — rien n'y est constaté, et le chef n'a
//              rien à faire. Connue, elle porte le numéro de son issue.
// Les lignes « à savoir » sont à part : elles ne retiennent rien, et ne
// comptent pas parmi les manques. La sortie brute — ce que la commande écrit
// en texte, au caractère près — est jointe, intacte, dans les trois cas.
import { ACTIONS_DE_L_APP, etapesAReprendre, type ActionDeLApp, type Constat } from "./installation.ts";

// Un manque, dit au chef. `texte` : en mots simples. `acteur` : qui le lève.
// Pour le chef, `action` (une étape que l'app fait d'un bouton) ou `commande`
// (à lancer telle quelle). `constat` et `geste` : la ligne et la flèche que la
// vérification écrit, telles quelles ; `etape` : l'étape à reprendre.
export type Manque = {
  ou: Constat["ou"];
  texte: string;
  constat: string;
  geste?: string;
  etape?: string;
} & ({ acteur: "chef"; action?: ActionDeLApp; commande?: string } | { acteur: "brigade" });

// Une ligne « à savoir » : rien n'y attend, elle se lit.
export type ASavoir = { ou: Constat["ou"]; texte: string; geste?: string };

// Une panne connue de la vérification : l'issue qui la suit, et ce qu'elle est.
export type PanneConnue = { issue: number; texte: string };

// Ce qui a arrêté la vérification. Le chef n'a rien à faire : la panne est à
// brigade, qui la corrige — connue ou non.
export type Panne = { erreur: string; connue: PanneConnue | null; acteur: "brigade"; rienAFaire: true };

export type Verdict =
  | { verdict: "pret"; phrase: string; manques: []; aSavoir: ASavoir[]; brut: string }
  | { verdict: "pas-pret"; phrase: string; manques: Manque[]; aSavoir: ASavoir[]; etapes: string[]; brut: string }
  | { verdict: "plantee"; phrase: string; panne: Panne; manques: []; aSavoir: []; brut: string };

// Les pannes de la vérification que brigade connaît, chacune reconnue à ce
// qu'elle écrit. Une box qui tourne sur un code d'avant leur correction les
// rend encore : c'est la mise à jour de brigade qui les lève, pas le chef.
export const PANNES_CONNUES: ReadonlyArray<{ motif: RegExp } & PanneConnue> = [
  {
    issue: 654,
    motif: /\bEACCES\b.*\/etc\/sudoers\.d\//,
    texte: "la vérification lisait un fichier de /etc/sudoers.d que le compte du service n'a pas le droit de lire — corrigé dans brigade, la box l'aura à sa prochaine mise à jour",
  },
];

const pluriel = (combien: number, mot: string) => `${combien.toLocaleString("fr-FR")} ${mot}${combien > 1 ? "s" : ""}`;

// Ce qu'une vérification plantée écrit : la ligne d'erreur de la commande.
export const rendreLaPanne = (erreur: unknown): string => `brigade : ${erreur instanceof Error ? erreur.message : String(erreur)}\n`;

const estUneAction = (etape: string | undefined): etape is ActionDeLApp => ACTIONS_DE_L_APP.some((action) => action === etape);

// Qui lève un manque, et comment. Sans remède dit, l'étape que l'app fait
// d'un bouton, sinon la première commande de sa flèche.
function remedeDe(constat: Constat): { acteur: "chef"; action?: ActionDeLApp; commande?: string } | { acteur: "brigade" } {
  const remede = constat.remede;
  if (remede?.qui === "brigade") return { acteur: "brigade" };
  if (remede !== undefined) return "action" in remede ? { acteur: "chef", action: remede.action } : { acteur: "chef", commande: remede.commande };
  if (estUneAction(constat.etape)) return { acteur: "chef", action: constat.etape };
  const commande = /`((?:sudo|git|gh|brigade|claude|systemctl) [^`]+)`/.exec(constat.geste ?? "")?.[1];
  return commande === undefined ? { acteur: "chef" } : { acteur: "chef", commande };
}

// Le verdict d'une vérification allée au bout. `brut` : ce qu'elle a écrit.
export function verdictDesConstats(constats: Constat[], brut: string): Verdict {
  const manques: Manque[] = constats
    .filter((constat) => constat.etat === "manque")
    .map((constat) => ({
      ou: constat.ou,
      texte: constat.simple ?? constat.texte,
      constat: constat.texte,
      ...(constat.geste === undefined ? {} : { geste: constat.geste }),
      ...(constat.etape === undefined ? {} : { etape: constat.etape }),
      ...remedeDe(constat),
    }));
  const aSavoir: ASavoir[] = constats
    .filter((constat) => constat.etat === "note")
    .map((constat) => ({ ou: constat.ou, texte: constat.texte, ...(constat.geste === undefined ? {} : { geste: constat.geste }) }));
  if (manques.length === 0) return { verdict: "pret", phrase: "prêt : rien ne manque pour lancer un cook", manques: [], aSavoir, brut };
  return {
    verdict: "pas-pret",
    phrase: `pas prêt : ${pluriel(manques.length, "chose")} à faire`,
    manques,
    aSavoir,
    etapes: etapesAReprendre(constats),
    brut,
  };
}

// Le verdict d'une vérification qui n'est pas allée au bout. `brut` : ce
// qu'elle a écrit avant de s'arrêter — par défaut, sa ligne d'erreur.
export function verdictDeLaPanne(erreur: unknown, brut: string = rendreLaPanne(erreur)): Verdict {
  const dite = erreur instanceof Error ? erreur.message : String(erreur);
  const trouvee = PANNES_CONNUES.find(({ motif }) => motif.test(dite) || motif.test(brut));
  const connue = trouvee === undefined ? null : { issue: trouvee.issue, texte: trouvee.texte };
  return {
    verdict: "plantee",
    phrase: `la vérification n'a pas pu aller au bout : c'est un problème de brigade, pas de ton projet — ${connue === null ? "une panne pas encore connue" : `une panne connue (#${connue.issue})`}, tu n'as rien à faire`,
    panne: { erreur: dite, connue, acteur: "brigade", rienAFaire: true },
    manques: [],
    aSavoir: [],
    brut,
  };
}

// Vérifie, et rend le verdict — jamais une exception : une vérification qui
// plante est un verdict, pas une erreur. `rendre` : ce que la commande écrit
// en texte de ce qu'elle a constaté (`installation-cli.ts`), la sortie brute.
export async function verdictDeVerification(verifier: () => Promise<Constat[]>, rendre: (constats: Constat[]) => string): Promise<Verdict> {
  let constats: Constat[];
  try {
    constats = await verifier();
  } catch (erreur) {
    return verdictDeLaPanne(erreur);
  }
  return verdictDesConstats(constats, rendre(constats));
}
