// Le setup du projet échoue sur la station au moment où le ticket de
// préparation part : c'est ce ticket qui doit le réparer, son cook part donc
// quand même (`station.ts`). Ce module dit, en une phrase, ce qui a échoué —
// pour le cook, sur le corps du ticket et sur la page du projet — : ce qui
// manque à la station quand la sortie du setup le nomme (un fichier, une
// commande), sinon son code de sortie et sa dernière ligne. Pur : rien n'est
// lu ni écrit ici.
import { SCRIPT_SETUP } from "../gates.ts";

export type EchecDuSetup = {
  // Le code de sortie du setup ; null : arrêté avant d'avoir fini.
  code: number | null;
  // Arrêté à son plafond de durée.
  depasse: boolean;
  // La fin de ce qu'il a dit, sortie et sortie d'erreur.
  sortie: string;
};

// Ce qu'on garde de la dernière ligne, et de chaque chose qui manque.
const LIGNE_MAX = 200;
const CHOSE_MAX = 120;
const CHOSES_MAX = 6;

// `bash: docker: command not found`, `./setup.sh: line 4: psql: command not
// found`, `sh: 1: psql: not found`, `zsh: command not found: docker`.
const COMMANDE = [/:\s*([^\s:'"`]+): command not found\s*$/, /^\S+: \d+: ([^\s:'"`]+): not found\s*$/, /command not found: ([^\s'"`]+)\s*$/];
// `cp: cannot stat 'apps/api/.env': No such file or directory`, `cat:
// .env.local: No such file or directory`, `source: .env: file not found`.
const FICHIER = /^(.*?):?\s*(?:No such file or directory|file not found)\s*$/;
// Docker installé, mais sans démon qui tourne.
const DEMON_DOCKER = /Cannot connect to the Docker daemon/i;
const DOCKER = "a running Docker daemon";

const sansGuillemets = (texte: string) => texte.replace(/^['"‘`]+|['"’`]+$/g, "");

// Le chemin que nomme le début d'une ligne « No such file or directory » : le
// dernier segment entre guillemets, sinon ce qui suit le dernier « : ».
function cheminNomme(debut: string): string | null {
  const cite = [...debut.matchAll(/['"‘`]([^'"’`]+)['"’`]/g)].at(-1)?.[1];
  const brut = cite ?? debut.split(/:\s+/).at(-1) ?? "";
  const chemin = sansGuillemets(brut.trim());
  return chemin === "" || /\s/.test(chemin) ? null : chemin;
}

// Ce qui manque à la station, d'après la sortie du setup, dans l'ordre où il
// le dit, une fois chacun : fichiers, commandes, démon Docker.
export function ceQuiManque(sortie: string): string[] {
  const vus: string[] = [];
  const noter = (chose: string) => {
    const net = chose.slice(0, CHOSE_MAX);
    if (!vus.includes(net)) vus.push(net);
  };
  for (const ligne of sortie.split("\n").map((brute) => brute.trim())) {
    if (ligne === "") continue;
    if (DEMON_DOCKER.test(ligne)) {
      noter(DOCKER);
      continue;
    }
    const commande = COMMANDE.map((forme) => forme.exec(ligne)?.[1]).find((nom) => nom !== undefined);
    if (commande !== undefined) {
      noter(`\`${commande}\``);
      continue;
    }
    const [, debut] = FICHIER.exec(ligne) ?? [];
    const chemin = debut === undefined ? null : cheminNomme(debut);
    if (chemin !== null) noter(`\`${chemin}\``);
  }
  return vus.slice(0, CHOSES_MAX);
}

const enumerer = (choses: string[], et: string) => (choses.length < 2 ? (choses[0] ?? "") : `${choses.slice(0, -1).join(", ")} ${et} ${choses.at(-1)}`);

// La dernière ligne non vide de la sortie, sur une ligne, bornée — sans
// accent grave, qu'elle se cite telle quelle.
function derniereLigne(sortie: string): string {
  const ligne = sortie.split("\n").map((brute) => brute.trim()).findLast((brute) => brute !== "" && !brute.startsWith("FAIL ")) ?? "";
  return ligne.replaceAll("`", "'").slice(0, LIGNE_MAX);
}

export type Phrases = { fr: string; en: string };

// Ce qui a échoué, en une phrase, sans majuscule ni point : la même en
// français — le ticket, le cook — et en anglais — la page du projet.
// `station` : celle où le setup a échoué.
export function phraseDuSetup(echec: EchecDuSetup, station: string): Phrases {
  const manque = ceQuiManque(echec.sortie);
  if (manque.length > 0) {
    const liste = enumerer(manque.map((chose) => (chose === DOCKER ? "un démon Docker qui tourne" : chose)), "et");
    return {
      fr: `le setup a besoin ${liste.startsWith("un ") ? "d'" : "de "}${liste}, que la station \`${station}\` n'a pas`,
      en: `the setup needs ${enumerer(manque, "and")}, which the station \`${station}\` does not have`,
    };
  }
  const derniere = derniereLigne(echec.sortie);
  const dit = { fr: derniere === "" ? "" : ` : \`${derniere}\``, en: derniere === "" ? "" : `: \`${derniere}\`` };
  if (echec.depasse) return { fr: `le setup ne finit pas avant son plafond de durée sur la station \`${station}\`${dit.fr}`, en: `the setup does not finish within its time limit on the station \`${station}\`${dit.en}` };
  if (echec.code === null) return { fr: `le setup a été interrompu sur la station \`${station}\`${dit.fr}`, en: `the setup was interrupted on the station \`${station}\`${dit.en}` };
  return { fr: `le setup sort en ${echec.code} sur la station \`${station}\`${dit.fr}`, en: `the setup exits with code ${echec.code} on the station \`${station}\`${dit.en}` };
}

// Le passage du corps du ticket de préparation qui dit l'échec du setup :
// entre ses deux marques, remplacé à chaque échec, retiré s'il n'y en a plus.
export const DEBUT = "<!-- brigade:setup-en-echec -->";
export const FIN = "<!-- /brigade:setup-en-echec -->";
// Le passage se pose avant cette section du corps, ou à sa fin s'il ne l'a pas.
const AVANT = "## À livrer";

export function passageDuSetup(phrase: string): string {
  return [
    DEBUT,
    "## Le setup échoue sur cette station",
    "",
    `**${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.** Le cook de ce ticket part quand même, sans que le setup ait préparé son worktree : la station lui a remis ce que \`${SCRIPT_SETUP}\` a dit. C'est à ce ticket de le rendre jouable ici — sans copier à la main un fichier secret sur la station, ni demander de service qu'elle n'a pas.`,
    FIN,
  ].join("\n");
}

// Le corps, avec le passage (ou sans lui, `passage` null). Inchangé s'il le
// porte déjà tel quel.
export function corpsAvecLeSetup(corps: string, passage: string | null): string {
  const debut = corps.indexOf(DEBUT);
  const fin = debut === -1 ? -1 : corps.indexOf(FIN, debut);
  const sans = debut === -1 || fin === -1 ? corps : `${corps.slice(0, debut).trimEnd()}\n\n${corps.slice(fin + FIN.length).trimStart()}`.trim();
  if (passage === null) return debut === -1 || fin === -1 ? corps : sans;
  const ici = sans.indexOf(AVANT);
  return ici === -1 ? `${sans.trimEnd()}\n\n${passage}` : `${sans.slice(0, ici)}${passage}\n\n${sans.slice(ici)}`;
}
