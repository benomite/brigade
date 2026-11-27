// Le premier lancement de l'app sur un PC neuf (#1434) : aucun projet dans son fichier, et ce que l'app reçoit des
// stations du chef (`StationsOfChef`, app/src/first-launch.ts), mot pour mot. Les écrans `premier-lancement*` en sont
// tirés.
import type { Connection, LocalCopy, StationsOfChef } from "../../../app/src/first-launch.ts";
import { configuration, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";

// Son Mac et parade-box, appairés, et les projets que chacune porte.
export const LISTEES: StationsOfChef = {
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
// Le geste qui connecte le `gh` de ce PC.
export const CONNEXION: Connection = { id: "github-sign-in", label: "Sign in to GitHub", command: ["gh", "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"] };
// Le `gh` de ce PC n'est connecté à aucun compte.
export const SANS_COMPTE: StationsOfChef = { state: "sign-in-required", reason: "This computer is not signed in to GitHub, so brigade cannot read the stations you have paired.", action: CONNEXION };
// Il n'y a pas de `gh` sur ce PC.
export const SANS_GH: StationsOfChef = {
  state: "unavailable",
  cause: "gh-missing",
  reason: "The GitHub CLI (`gh`) is not installed on this computer, and brigade reads your stations on GitHub through it.",
  link: "https://cli.github.com",
  detail: "spawn gh ENOENT",
};
// Le clone de parade refusé : ce compte n'a pas accès au dépôt.
export const ACCES_REFUSE: LocalCopy = {
  state: "failed",
  project: "parade",
  repository: "benomite/parade",
  cause: "access-denied",
  reason: "GitHub denies chef-pc access to benomite/parade, so it cannot be cloned: ask an owner of benomite/parade to give chef-pc read access.",
  link: "https://github.com/benomite/parade",
  detail: "ERROR: Permission to benomite/parade.git denied to chef-pc.\nfatal: unable to access 'https://github.com/benomite/parade.git/': The requested URL returned error: 403",
};
// Le compte GitHub de ce PC, tel que l'étape du compte du parcours d'ajout le reçoit (#2475, `compteGitHub`) : celui
// des stations listées, aucun quand `gh` n'en a pas, illisible sans `gh`.
export const COMPTE = { login: "benomite" };
const compteDe = (stations: StationsOfChef) =>
  stations.state === "listed"
    ? COMPTE
    : stations.state === "sign-in-required"
      ? { nonConnecte: true }
      : { refus: "The GitHub CLI (`gh`) is not installed on this computer, and brigade reads your GitHub account through it.", ...(stations.link === undefined ? {} : { lien: stations.link }), ...(stations.detail === undefined ? {} : { detail: stations.detail }) };

// Le premier écran, ce que l'app reçoit des stations, et les clics qui suivent.
export function premierLancement(dit: string, stations: StationsOfChef, etapes: Etape[] = [], reponses: Record<string, unknown> = {}): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes,
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: { ...demarrage(configuration([])), poste: { nom: "this PC", mac: false } }, stationsDuChef: stations, compteGitHub: compteDe(stations), ...reponses },
      envois: {},
    }),
  };
}
