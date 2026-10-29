// Le premier lancement de l'app sur un PC neuf (#1434) : aucun projet dans son fichier, et ce que le runtime dit des
// stations du chef — écrit par ses fonctions mêmes (`echecDeGh`, `lireLEchec`, `connexionGitHub`), comme l'app le
// recevra. Les écrans `premier-lancement*` en sont tirés.
import { connexionGitHub, echecDeGh, type StationsDuChef } from "../../../runtime/src/appairage/stations-du-chef.ts";
import { lireLEchec } from "../../../runtime/src/projets/copie-locale.ts";
import { configuration, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";

// Son Mac et parade-box, appairés, et les projets que chacune porte.
export const LISTEES: StationsDuChef = {
  state: "listed",
  unreadable: [],
  stations: [
    { id: "gmac", name: "Mac", machine: "macOS 26.0 · 12 cores", kind: "ordinateur", cooks: true, version: "2.4.0", online: true, lastSeen: MAINTENANT, stoppedAt: null, projects: [{ name: "brigade", repository: "benomite/brigade" }] },
    {
      id: "gbox",
      name: "parade-box",
      machine: "Debian 12 · 8 cores",
      kind: "ordinateur",
      cooks: true,
      version: "2.4.0",
      online: true,
      lastSeen: MAINTENANT,
      stoppedAt: null,
      projects: [
        { name: "brigade", repository: "benomite/brigade" },
        { name: "parade", repository: "benomite/parade" },
        { name: "cantine", repository: "benomite/cantine" },
      ],
    },
  ],
};
// Le `gh` de ce PC n'est connecté à aucun compte.
export const SANS_COMPTE = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
// Il n'y a pas de `gh` sur ce PC.
export const SANS_GH = echecDeGh("gh", 30_000, { code: "ENOENT", message: "spawn gh ENOENT" }, "");
// Le clone de parade refusé : ce compte n'a pas accès au dépôt.
export const ACCES_REFUSE = {
  state: "failed" as const,
  project: "parade",
  repository: "benomite/parade",
  ...lireLEchec("benomite/parade", "ERROR: Permission to benomite/parade.git denied to chef-pc.\nfatal: unable to access 'https://github.com/benomite/parade.git/': The requested URL returned error: 403", { compte: "chef-pc", jeton: null, proprietaire: true }),
};
export const CONNEXION = connexionGitHub("gh");

// Le premier écran, ce que le runtime dit des stations, et les clics qui suivent.
export function premierLancement(dit: string, stations: StationsDuChef, etapes: Etape[] = [], reponses: Record<string, unknown> = {}): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes,
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: { ...demarrage(configuration([])), poste: { nom: "this PC", mac: false } }, stationsDuChef: stations, ...reponses },
      envois: {},
    }),
  };
}
