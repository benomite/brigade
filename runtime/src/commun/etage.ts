// L'étage commun du carnet : les leçons qui servent les cooks de tous les
// projets d'une installation — la station et les projets de sa configuration.
//
// Une leçon promue dans le carnet d'au moins `seuil` projets (2 par défaut, un
// réglage de la station) y est **proposée** ; le chef l'accepte ou la refuse
// (`commun-cli.ts`). Rien n'y entre sans son « oui ». Acceptée, elle reçoit un
// id de l'étage (`C1`, `C2`…) et part dans la consigne de chaque cook, de
// chaque projet. Refusée, elle reste propre au carnet de chaque projet qui la
// tient, et n'est plus jamais proposée.
//
// Une leçon est la même d'un projet à l'autre quand elle dit mot pour mot la
// même chose — comme une leçon candidate en reconfirme une du projet
// (`apprentissage/provisoires.ts`) : ses ids, propres à chaque projet, n'y
// comptent pas. Seuls les blancs sont ramenés à un.
//
// Ce que le chef a tranché vit dans un fichier de la station
// (`<BRIGADE_STATION_DIR>/etage-commun.json`) : aucun projet n'en est le
// support. Une installation d'un seul projet n'a pas d'étage commun.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LeconRecue } from "../apprentissage/injection.ts";
import type { Carnet } from "../carnet/carnet.ts";
import { lire } from "../plafonds.ts";

export const FICHIER_ETAGE_COMMUN = "etage-commun.json";

// Le seuil : le nombre de projets dont le carnet doit tenir la leçon, promue.
// Un réglage de la station, lu de son environnement ; moins de deux ferait
// d'une leçon d'un seul projet une leçon de tous.
export const SEUIL_COMMUN_PAR_DEFAUT = 2;
export const VARIABLE_SEUIL_COMMUN = "BRIGADE_COMMON_TIER_PROJECTS";

export function lireSeuilCommun(env: NodeJS.ProcessEnv): number {
  return lire(env, VARIABLE_SEUIL_COMMUN, SEUIL_COMMUN_PAR_DEFAUT, "an integer, 2 or more", (valeur) => Number.isSafeInteger(valeur) && valeur >= 2);
}

// Une leçon promue d'un projet, telle que l'étage la reconnaît.
export type Provenance = { projet: string; id: string };

export type Proposition = {
  // Ce que le chef tape pour la trancher : stable tant que le texte l'est.
  cle: string;
  texte: string;
  // Les projets dont le carnet la tient promue, triés par nom.
  projets: Provenance[];
};

export type Tranchee = {
  cle: string;
  texte: string;
  etat: "accepted" | "refused";
  // D'où elle venait quand le chef l'a tranchée.
  projets: Provenance[];
  // AAAA-MM-JJ.
  date: string;
  // Une acceptée seulement : son id de l'étage.
  id?: string;
};

// `suivant` ne redescend jamais : un id de l'étage ne sert pas deux fois.
export type EtageCommun = { suivant: number; lecons: Tranchee[] };

export const etageVide = (): EtageCommun => ({ suivant: 1, lecons: [] });

export const normaliser = (texte: string) => texte.trim().replace(/\s+/g, " ");

export const cleDe = (texte: string) => createHash("sha256").update(normaliser(texte)).digest("hex").slice(0, 8);

// Les leçons proposées à l'étage : celles que le carnet d'au moins `seuil`
// projets tient promues, et que le chef n'a pas encore tranchées. `carnets` :
// celui de chaque projet de l'installation, à sa base.
export function propositions(carnets: ReadonlyArray<{ projet: string; carnet: Carnet }>, seuil: number, etage: EtageCommun): Proposition[] {
  const tranchees = new Set(etage.lecons.map((lecon) => lecon.cle));
  const parTexte = new Map<string, Proposition>();
  for (const { projet, carnet } of carnets) {
    for (const lecon of carnet.lessons) {
      if (lecon.state !== "promoted") continue;
      const texte = normaliser(lecon.text);
      const cle = cleDe(texte);
      if (tranchees.has(cle)) continue;
      const proposition = parTexte.get(cle) ?? { cle, texte, projets: [] };
      // Deux blocs du même texte dans un carnet ne font qu'un projet.
      if (!proposition.projets.some((p) => p.projet === projet)) proposition.projets.push({ projet, id: lecon.id });
      parTexte.set(cle, proposition);
    }
  }
  return [...parTexte.values()]
    .filter((proposition) => proposition.projets.length >= seuil)
    .map((proposition) => ({ ...proposition, projets: proposition.projets.sort((a, b) => a.projet.localeCompare(b.projet)) }))
    .sort((a, b) => a.texte.localeCompare(b.texte));
}

// Tranche une proposition : « oui », elle entre à l'étage avec un id neuf ;
// « non », elle n'y entre pas et n'est plus proposée.
export function trancher(etage: EtageCommun, proposition: Proposition, reponse: "accepted" | "refused", date: string): { etage: EtageCommun; tranchee: Tranchee } {
  if (etage.lecons.some((lecon) => lecon.cle === proposition.cle)) throw new Error(`la proposition ${proposition.cle} est déjà tranchée`);
  const acceptee = reponse === "accepted";
  const tranchee: Tranchee = {
    cle: proposition.cle,
    texte: proposition.texte,
    etat: reponse,
    projets: proposition.projets.map((p) => ({ ...p })),
    date,
    ...(acceptee ? { id: `C${etage.suivant}` } : {}),
  };
  return { etage: { suivant: etage.suivant + (acceptee ? 1 : 0), lecons: [...etage.lecons, tranchee] }, tranchee };
}

export const fichierDeLEtage = (racine: string) => join(racine, FICHIER_ETAGE_COMMUN);

export function lireEtage(racine: string): EtageCommun {
  const fichier = fichierDeLEtage(racine);
  if (!existsSync(fichier)) return etageVide();
  const brut = JSON.parse(readFileSync(fichier, "utf8")) as EtageCommun;
  if (!Number.isInteger(brut.suivant) || !Array.isArray(brut.lecons)) throw new Error(`étage commun illisible : ${fichier}`);
  return brut;
}

export function ecrireEtage(racine: string, etage: EtageCommun): void {
  const fichier = fichierDeLEtage(racine);
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.tmp`;
  writeFileSync(provisoire, JSON.stringify(etage, null, 2) + "\n");
  renameSync(provisoire, fichier);
}

// Les leçons de l'étage que reçoit un cook : les acceptées, dans l'ordre où
// le chef les a acceptées. Une installation de moins de deux projets n'a pas
// d'étage commun : rien.
export function leconsCommunes(etage: EtageCommun, projets: number): LeconRecue[] {
  if (projets < 2) return [];
  return etage.lecons.flatMap((lecon) => (lecon.etat === "accepted" && lecon.id !== undefined ? [{ id: lecon.id, texte: lecon.texte, etage: "commun" as const }] : []));
}
