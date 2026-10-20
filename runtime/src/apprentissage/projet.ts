// Ce que les cooks ont appris, pour un projet, dans la forme que sa page dessine :
// ses leçons (provisoires, dans le journal ; promues, dans le carnet versionné de
// son dépôt) et ses profils (leurs définitions, dans le même dépôt). C'est `facts`
// qui le porte (`faits.ts`) : l'app n'y déduit rien. Lecture seule — la page ne
// crée ni branche ni PR ; le chef retire une leçon par une PR qu'il ouvre lui-même.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Base } from "../base.ts";
import { CARNET_PATH, readCarnet, type Lesson } from "../carnet/carnet.ts";
import { DEPOT_GITHUB } from "../etat.ts";
import type { Journal } from "../journal.ts";
import { parseDefinition, PROFILS_DIR } from "../profils/definition.ts";
import { parcoursDesTickets } from "../parcours-des-tickets.ts";
import { avantApres, type AvantApres } from "./progres.ts";
import { leconsProvisoires, retrosDuProjet } from "./provisoires.ts";

export type LeconAffichee = {
  id: string;
  texte: string;
  statut: "provisoire" | "promue";
  // AAAA-MM-JJ.
  date: string;
  // Les tickets dont la rétro l'a proposée ou reconfirmée, croissants.
  tickets: number[];
  // Les cooks qui l'ont reçue.
  cooks: number;
  // La livraison des tickets pris avant et après sa date.
  progres: AvantApres;
  // Une promue seulement : sa ligne dans le carnet du projet, sur GitHub.
  url?: string;
};

export type ProfilAffiche = {
  nom: string;
  domaine: string;
  // Son carnet : ses leçons, promues ou sorties.
  carnet: Array<{ id: string; texte: string; etat: string }>;
  tickets: number[];
  // La livraison des tickets pris avant et après son acceptation.
  progres: AvantApres;
};

export type Apprentissage = { lecons: LeconAffichee[]; profils: ProfilAffiche[] };

export type Source = {
  journal: Journal;
  projet: string;
  // Le dépôt du projet sur le disque ; absent, ni carnet ni profil.
  repoDir?: string;
  // « propriétaire/dépôt » et branche d'intégration : sans eux, aucune adresse.
  depot?: string;
  branche?: string;
};

const unique = (numeros: number[]) => [...new Set(numeros)].sort((a, b) => a - b);

// Combien de cooks ont reçu chaque leçon, par son id : ce que dit le lancement
// de chacun (`lessons` de `cook.launched`, `apprentissage/injection.ts`).
function cooksParLecon(base: Base, projet: string): Map<string, number> {
  const recus = new Map<string, Set<string>>();
  const lignes = base.lire<{ seq: number; payload: string }>("SELECT seq, payload FROM events WHERE type = 'cook.launched' AND project = ? ORDER BY seq", projet);
  for (const { seq, payload } of lignes) {
    const { run, lessons } = JSON.parse(payload) as { run?: unknown; lessons?: unknown };
    if (!Array.isArray(lessons)) continue;
    const cook = typeof run === "string" ? run : `seq-${seq}`;
    for (const id of lessons) if (typeof id === "string") recus.set(id, (recus.get(id) ?? new Set()).add(cook));
  }
  return new Map([...recus].map(([id, cooks]) => [id, cooks.size]));
}

// La ligne (à partir de 1) du texte de la leçon dans le fichier du carnet.
function ligneDeLaLecon(fichier: string, id: string): number | null {
  const lignes = readFileSync(fichier, "utf8").split(/\r?\n/);
  const debut = lignes.indexOf(`## ${id}`);
  if (debut === -1) return null;
  const texte = lignes.findIndex((ligne, i) => i > debut && ligne.startsWith("- texte: "));
  return (texte === -1 ? debut : texte) + 1;
}

export function apprentissageDuProjet({ journal, projet, repoDir, depot, branche }: Source): Apprentissage {
  const cooks = cooksParLecon(journal.base, projet);
  const parcours = parcoursDesTickets(journal.base);
  const retros = retrosDuProjet(journal.base, projet);
  const ticketDe = (ref: string) => {
    const dieze = /^#([1-9]\d*)$/.exec(ref)?.[1];
    return dieze !== undefined ? Number(dieze) : retros.find((retro) => retro.ref === ref)?.ticket;
  };

  const provisoires: LeconAffichee[] = leconsProvisoires(journal.base, projet).map((lecon) => ({
    id: lecon.id,
    texte: lecon.texte,
    statut: "provisoire",
    date: lecon.at.slice(0, 10),
    tickets: unique(lecon.entrees.map((entree) => entree.ticket)),
    cooks: cooks.get(lecon.id) ?? 0,
    progres: avantApres(parcours, lecon.at.slice(0, 10)),
  }));

  const adresse = depot !== undefined && DEPOT_GITHUB.test(depot) && branche ? `https://github.com/${depot}/blob/${branche}/${CARNET_PATH}` : null;
  const fichierCarnet = repoDir === undefined ? null : join(repoDir, CARNET_PATH);
  const promues: LeconAffichee[] =
    repoDir === undefined
      ? []
      : readCarnet(repoDir)
          .lessons.filter((lecon: Lesson) => lecon.state === "promoted")
          .map((lecon) => {
            const ligne = adresse !== null && fichierCarnet !== null ? ligneDeLaLecon(fichierCarnet, lecon.id) : null;
            return {
              id: lecon.id,
              texte: lecon.text,
              statut: "promue" as const,
              date: lecon.entered,
              tickets: unique(lecon.retros.flatMap((ref) => ticketDe(ref) ?? [])),
              cooks: cooks.get(lecon.id) ?? 0,
              progres: avantApres(parcours, lecon.entered),
              ...(adresse !== null && ligne !== null ? { url: `${adresse}#L${ligne}` } : {}),
            };
          });

  const dossier = repoDir === undefined ? null : join(repoDir, PROFILS_DIR);
  const profils: ProfilAffiche[] =
    dossier === null || !existsSync(dossier)
      ? []
      : readdirSync(dossier)
          .filter((fichier) => fichier.endsWith(".md"))
          .sort()
          .map((fichier) => parseDefinition(readFileSync(join(dossier, fichier), "utf8")))
          .map((profil) => ({
            nom: profil.name,
            domaine: profil.zone,
            carnet: profil.notebook.lessons.map((lecon) => ({ id: lecon.id, texte: lecon.text, etat: lecon.state })),
            tickets: profil.tickets,
            progres: avantApres(parcours, profil.accepted),
          }));

  return { lecons: [...provisoires, ...promues], profils };
}
