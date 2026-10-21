// Un profil de cook au dispatch : une préférence, jamais une contrainte.
//
// Un ticket dont la zone touche le domaine d'un profil (`zones.ts` : l'une
// possède l'autre) part sous ce profil quand le cook du profil est libre : son
// cook reçoit le carnet du profil en plus des leçons du projet, et le journal
// le dit (`profile.notebook-given`). Le cook d'un profil est occupé tant qu'un
// cook lancé sous lui tourne — d'ici ou d'une station distante. Occupé, le
// ticket ne l'attend pas : il part aussitôt, avec un cook généraliste, sans
// carnet. Rien ici ne retient un ticket ni ne choisit une station : seule la
// capacité le fait (`rail.ts`) ; le profil se choisit au lancement, sur la
// place que la station a déjà prise.
//
// Plusieurs profils touchent la zone : le plus précis d'abord — celui dont le
// domaine a le plus de segments —, puis par nom. Le premier libre l'emporte.
//
// Les profils sont ceux que le dépôt du projet définit, là où le « oui » du
// chef les écrit et d'où la page de l'apprentissage les lit
// (`.claude/brigade/profils/`, `definition.ts`), relus à chaque lancement.
// Une définition illisible n'est pas un profil : le ticket part sans elle.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LeconRecue } from "../apprentissage/injection.ts";
import type { Base } from "../base.ts";
import { recouvrement } from "../zones.ts";
import { profilDuCookDesign } from "./design.ts";
import { fichierDuProfil, parseDefinition, PROFILS_DIR, type DefinitionDeProfil } from "./definition.ts";
import type { CarnetDonne } from "./evenements.ts";

// Le carnet que reçoit le cook d'un profil : le profil, son domaine, sa
// définition (relative au dépôt), et les leçons promues de son carnet.
export type CarnetRecu = { nom: string; domaine: string; fichier: string; lecons: LeconRecue[] };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les profils que le dépôt `repoDir` définit, par nom de fichier. Une
// définition illisible est écartée, et `avertir` la nomme.
export function lireLesProfils(repoDir: string, avertir: (texte: string) => void = () => {}): DefinitionDeProfil[] {
  const dossier = join(repoDir, PROFILS_DIR);
  const definis = !existsSync(dossier)
    ? []
    : readdirSync(dossier)
        .filter((fichier) => fichier.endsWith(".md"))
        .sort()
        .flatMap((fichier) => {
          try {
            return [parseDefinition(readFileSync(join(dossier, fichier), "utf8"))];
          } catch (erreur) {
            avertir(`brigade : le profil ${PROFILS_DIR}/${fichier} est illisible, aucun ticket ne part sous lui — ${message(erreur)}`);
            return [];
          }
        });
  // Le cook design est un profil comme les autres, bâti de son fichier ; une
  // définition du même nom, écrite à la main dans le dossier, l'emporte.
  const design = profilDuCookDesign(repoDir);
  return design === null || definis.some((profil) => profil.name === design.name) ? definis : [...definis, design];
}

// Les profils dont un cook tourne : lancé sous lui, et sans fin au journal.
export function profilsOccupes(base: Base, projet: string): Set<string> {
  const lignes = base.lire<{ name: string }>(
    `SELECT json_extract(e.payload, '$.name') AS name
     FROM events e JOIN cook_runs r ON r.run = json_extract(e.payload, '$.run')
     WHERE e.type = 'profile.notebook-given' AND e.project = ? AND r.ended_seq IS NULL`,
    projet,
  );
  return new Set(lignes.map(({ name }) => name));
}

const precision = (zone: string) => zone.split("/").filter((segment) => segment !== "" && segment !== ".").length;

// Le profil sous lequel part le ticket de zone `zone` : le plus précis de ceux
// dont le domaine la touche et dont le cook est libre. Null : aucun ne la
// touche, ou tous sont occupés — un généraliste le cuisine. Une fonction pure.
export function profilPrefere(profils: readonly DefinitionDeProfil[], zone: readonly string[], occupes: ReadonlySet<string>): DefinitionDeProfil | null {
  const candidats = profils
    .filter((profil) => recouvrement([...zone], [profil.zone]) !== null)
    .sort((a, b) => precision(b.zone) - precision(a.zone) || a.name.localeCompare(b.name));
  return candidats.find((profil) => !occupes.has(profil.name)) ?? null;
}

// Le carnet du profil tel que son cook le reçoit : ses leçons promues — une
// leçon sortie du carnet n'en fait plus partie.
export function carnetDuProfil(profil: DefinitionDeProfil): CarnetRecu {
  return {
    nom: profil.name,
    domaine: profil.zone,
    fichier: profil.fichier ?? fichierDuProfil(profil.name),
    lecons: profil.notebook.lessons.filter((lecon) => lecon.state === "promoted").map((lecon) => ({ id: lecon.id, texte: lecon.text })),
  };
}

// Ce que le journal dit du carnet donné au cook `run`.
export const carnetDonne = (run: string, carnet: CarnetRecu): CarnetDonne => ({
  run,
  name: carnet.nom,
  zone: carnet.domaine,
  file: carnet.fichier,
  lessons: carnet.lecons.map((lecon) => lecon.id),
});

// Ce que la consigne d'un cook en dit : rien pour un généraliste ; sinon le
// profil, et chaque leçon de son carnet avec son id.
export function blocDuCarnet(carnet: CarnetRecu | null | undefined): string[] {
  if (!carnet) return [];
  return [
    `Ce ticket touche le domaine \`${carnet.domaine}\` : tu le cuisines sous le profil de cook « ${carnet.nom} », que le projet définit dans \`${carnet.fichier}\`. ${
      carnet.lecons.length === 0
        ? "Son carnet ne porte encore aucune leçon."
        : "Voici son carnet — les leçons promues de ce domaine, chacune avec son id. Le ticket et le `CLAUDE.md` du dépôt priment sur elles."
    }`,
    "",
    ...(carnet.lecons.length === 0 ? [] : [...carnet.lecons.map((lecon) => `- ${lecon.id} : ${lecon.texte}`), ""]),
  ];
}
