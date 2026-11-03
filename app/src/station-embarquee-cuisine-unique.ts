// Une cuisine par projet (#2110, épique #2108, même classe que #1789) : au lancement de l'app, la station
// embarquée n'ouvre pas la cuisine d'un projet qu'une autre station du compte sert déjà. Deux cuisines d'un
// même dépôt ne partagent aucun verrou : rouvrir l'app sur le Mac du chef en ouvrait une seconde (état vide,
// sauvegarde jamais faite, aucun cook), pendant que la box servait le projet.
//
// - **Avant de lancer la station**, l'app lit les stations appairées du compte (celles que la home montre)
//   et la configuration de la station (`<BRIGADE_STATION_DIR>/projets`). Une ligne dont le dépôt est servi
//   par une autre station qui fait tourner des cooks est mise de côté : la ligne reste dans le fichier, en
//   commentaire (`# held-back …`), avec la station qui sert le projet. La station ne la lit plus : ni
//   cuisine, ni tableau publié pour ce projet. Elle continue de cuire dans la cuisine de l'autre, comme
//   une station de plus.
// - **Rien n'est perdu.** Dès que plus aucune autre station ne sert le dépôt, la ligne est remise telle quelle.
// - **Une lecture qui échoue ne change rien** : sans savoir, la configuration est lue comme avant.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StationsDuChef } from "../../runtime/src/appairage/stations-du-chef.ts";

// Le fichier des projets de la station (poste/cuisine-ici.ts, `CONFIGURATION`).
const CONFIGURATION = "projets";
// Ce qui précède, en commentaire, une ligne mise de côté.
const MARQUE = "# held-back";
const MISE_DE_COTE = /^# held-back \(served by (.+?)\): (.*)$/;

export type Soi = { gist: string | null; nom: string };
export type ServiAilleurs = { nom: string; depot: string; station: string };

const minuscules = (texte: string) => texte.toLowerCase();

// Les projets de la configuration (un par ligne qui en a au moins trois champs : nom, dépôt, branche) qu'une
// autre station du compte sert déjà — pour chacun, la station qui le sert. Les stations lues ne se lisent pas
// (`state` autre que `listed`) : aucun.
export function serviAilleurs(configuration: string, lues: StationsDuChef, soi: Soi): ServiAilleurs[] {
  if (lues.state !== "listed") return [];
  const autres = lues.stations.filter((station) => station.cooks && station.id !== soi.gist && minuscules(station.name) !== minuscules(soi.nom));
  const trouves: ServiAilleurs[] = [];
  for (const ligne of configuration.split("\n")) {
    const [nom, depot] = ligne.trim().split(/\s+/);
    if (nom === undefined || depot === undefined || nom.startsWith("#")) continue;
    const sert = autres.find((station) => station.projects.some(({ repository }) => repository !== null && minuscules(repository) === minuscules(depot)));
    if (sert !== undefined) trouves.push({ nom, depot, station: sert.name });
  }
  return trouves;
}

// La configuration après décision : les lignes de projets servis ailleurs en commentaire, celles mises de côté
// que plus aucune autre station ne sert remises. Rend aussi ce qui a changé, pour le dire.
export function decider(configuration: string, lues: StationsDuChef, soi: Soi): { texte: string; mises: ServiAilleurs[]; remises: string[] } {
  const mises: ServiAilleurs[] = [];
  const remises: string[] = [];
  if (lues.state !== "listed") return { texte: configuration, mises, remises };
  const ailleurs = serviAilleurs(configuration, lues, soi);
  // Les lignes mises de côté sont relues comme des lignes de projet, pour savoir si leur dépôt est encore servi.
  const restituees = configuration.split("\n").map((ligne) => MISE_DE_COTE.exec(ligne.trim())?.[2] ?? null);
  const encore = new Set(serviAilleurs(restituees.filter((ligne): ligne is string => ligne !== null).join("\n"), lues, soi).map(({ nom }) => nom));
  const texte = configuration
    .split("\n")
    .map((ligne, rang) => {
      const restituee = restituees[rang];
      if (restituee !== null && restituee !== undefined) {
        const [nom = ""] = restituee.trim().split(/\s+/);
        if (encore.has(nom)) return ligne;
        remises.push(nom);
        return restituee;
      }
      const [nom] = ligne.trim().split(/\s+/);
      const sert = ailleurs.find((autre) => autre.nom === nom && !ligne.trim().startsWith("#"));
      if (sert === undefined) return ligne;
      mises.push(sert);
      return `${MARQUE} (served by ${sert.station}): ${ligne.trim()}`;
    })
    .join("\n");
  return { texte, mises, remises };
}

export type OptionsCuisineUnique = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  // Les stations appairées du compte, telles que le runtime les lit.
  lire: () => Promise<StationsDuChef>;
  soi: () => Soi;
  dire: (ligne: string) => void;
};

// À jouer avant chaque lancement de la station : met de côté, dans sa configuration, les projets qu'une autre
// station sert, et le dit. Ne lève jamais : un échec laisse la configuration comme elle était.
export async function garderUneSeuleCuisine(options: OptionsCuisineUnique): Promise<void> {
  const fichier = join(options.racine, CONFIGURATION);
  try {
    let configuration: string;
    try {
      configuration = readFileSync(fichier, "utf8");
    } catch {
      return;
    }
    const { texte, mises, remises } = decider(configuration, await options.lire(), options.soi());
    for (const { nom, depot, station } of mises) options.dire(`brigade: ${nom} (${depot}) is already served by ${station}: this computer's station starts no kitchen for it and publishes no board for it — it can still cook there`);
    for (const nom of remises) options.dire(`brigade: ${nom} is no longer served by another station: this computer's station serves it again`);
    if (texte === configuration) return;
    const provisoire = `${fichier}.${process.pid}.tmp`;
    writeFileSync(provisoire, texte);
    renameSync(provisoire, fichier);
  } catch (erreur) {
    options.dire(`brigade: whether another station already serves this computer's projects could not be read — ${erreur instanceof Error ? erreur.message : String(erreur)}; its configuration is left as it was`);
  }
}
