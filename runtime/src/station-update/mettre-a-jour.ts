// La mise à jour de la station de l'ordinateur, celle que l'app tient (#2189,
// épique #2182). La box a la sienne, sous root, qui remet un paquet à apt
// (`mise-a-jour/`) ; ici, rien n'est installé : la station télécharge la
// release dans son propre répertoire — rien à réinstaller de l'app —, puis
// demande à celui qui la tient de la relancer dessus.
//
// Même cadence et même source que la box : un regard deux minutes après le
// démarrage, puis dix minutes après chaque regard ; les releases
// `station-<version>` de `BRIGADE_MISE_A_JOUR_SOURCE`.
//
// Aucun cook n'est coupé. Une release prête, la station se vide : elle ne
// prend plus de ticket (`retenirLaPrise`), et attend que ses cooks en vol
// aient fini. Puis, vidée, elle demande sa relance, une fois. Un ticket qu'elle
// tient encore sans cook est rendu sur GitHub par la station relancée, à son
// premier tour — ce que fait déjà celle de la box après sa mise à jour
// (`brigade-github.ts`) : rien n'est réinventé ici.
//
// Un regard ou un téléchargement qui rate laisse la station telle quelle : ni
// vidée, ni relancée. Le statut le dit, et le regard suivant réessaie.
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Prise } from "../brigade-github.ts";
import { versionDuRuntime } from "../mise-a-jour/en-service.ts";
import { comparerVersions } from "../mise-a-jour/versions.ts";
import { extraireParTar, POINT_D_ENTREE, RUNTIME, verifierRelease, type Extraire } from "./archive.ts";
import { archiveDe, sourceDesVersions, type Release, type SourceDesVersions } from "./releases.ts";
import { dossierDe, ecrireDemande, ecrireStatut, effacerDemande, lireStatut, RELEASES, statutVierge, type DemandeDeRelance, type StatutDeLaStation } from "./statut.ts";

// La ligne que la station écrit quand elle demande sa relance : l'app, qui lit
// déjà ce qu'elle écrit, la reconnaît à ce motif. Le fichier `restart.json` fait
// foi ; la ligne prévient.
export const LIGNE_DE_RELANCE = /^brigade: station update — restart with release (\S+): (.+)$/;
export const ligneDeRelance = (demande: DemandeDeRelance) => `brigade: station update — restart with release ${demande.version}: ${demande.main}`;

// Ce que fait la station de sa demande : la poser là où l'app la lit, et le dire.
export const demanderAuSuperviseur =
  (racine: string, dire: (ligne: string) => void) =>
  (demande: DemandeDeRelance): void => {
    ecrireDemande(racine, demande);
    dire(ligneDeRelance(demande));
  };

export const PREMIER_MS = 2 * 60_000;
export const INTERVALLE_MS = 10 * 60_000;
const ALEA_MS = 60_000;
const PAS_DU_DRAIN_MS = 5_000;

// Une version de la station, telle que sa publication la donne
// (`runtime/paquet/construire.ts`) : `0.<AAAAMMJJ>.<HHMMSS>+g<commit>`. Le
// runtime que l'app embarque porte la version de l'app (`1.0.82`), celui d'un
// clone `0.0.0` : ni l'un ni l'autre n'est une release de la station, et toute
// release publiée passe devant eux — la station a été publiée à chaque
// changement du runtime que l'app embarque.
export const VERSION_DE_STATION = /^0\.\d{8}\.\d{6}(?:\+g[0-9a-f]+)?$/;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const pause = (ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms).unref());

export type OptionsDeLaMiseAJour = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  // La version qui tourne ; par défaut, celle du runtime.
  version?: string;
  versions: SourceDesVersions;
  // La plateforme dont l'archive est prise ; par défaut, celle de la machine.
  plateforme?: NodeJS.Platform;
  // Les tickets dont un cook de la station est en vol, tous projets confondus.
  enVol: () => number[];
  // Ce que fait la station de sa demande de relance. Nul : personne ne la
  // relance sur une autre release — elle regarde et dit son retard, sans rien
  // télécharger ni se vider.
  relancer: ((demande: DemandeDeRelance) => void) | null;
  extraire?: Extraire;
  dire: (ligne: string) => void;
  maintenant?: () => Date;
  // Entre deux regards sur les cooks en vol, pendant le drain.
  pasDuDrainMs?: number;
};

export type MiseAJourDeLaStation = {
  // Un regard : les versions publiées, le téléchargement de la plus récente,
  // le drain, la demande. Rend quand la demande est faite, ou que rien n'est
  // à faire.
  passer(): Promise<StatutDeLaStation>;
  statut(): StatutDeLaStation;
  // Vrai dès que la station se vide pour sa relance : elle ne prend plus de ticket.
  retenue(): boolean;
  // Plus de regard ; un drain en cours n'attend plus.
  arreter(): void;
};

export function miseAJourDeLaStation(options: OptionsDeLaMiseAJour): MiseAJourDeLaStation {
  const { racine, versions, dire } = options;
  const version = options.version ?? versionDuRuntime();
  const archive = archiveDe(options.plateforme ?? process.platform);
  const extraire = options.extraire ?? extraireParTar;
  const maintenant = options.maintenant ?? (() => new Date());
  const pasDuDrainMs = options.pasDuDrainMs ?? PAS_DU_DRAIN_MS;
  const releases = join(dossierDe(racine), RELEASES);

  // Une demande d'avant ce démarrage n'a plus d'objet : la station relancée
  // regarde de nouveau. La plus récente version lue reste dite.
  effacerDemande(racine);
  const avant = lireStatut(racine);
  const statut = statutVierge(version);
  statut.latestStationVersion = avant?.latestStationVersion ?? null;
  statut.checkedAt = avant?.checkedAt ?? null;
  const deStation = VERSION_DE_STATION.test(version);
  const enRetard = () => statut.latestStationVersion !== null && (!deStation || comparerVersions(statut.latestStationVersion, version) > 0);
  statut.behind = enRetard();
  let ecrit = "";
  const ecrire = () => {
    statut.behind = enRetard();
    const texte = JSON.stringify(statut);
    if (texte === ecrit) return;
    try {
      ecrireStatut(racine, statut);
      ecrit = texte;
    } catch (erreur) {
      dire(`brigade: station update — its status does not write (${dossierDe(racine)}): ${message(erreur)}`);
    }
  };
  ecrire();

  let arretee = false;
  let enCours: Promise<StatutDeLaStation> | null = null;
  let ditCheck: string | null = null;
  const echouer = (motif: string) => {
    statut.check = motif;
    if (motif !== ditCheck) dire(`brigade: station update — ${motif}; the station keeps running ${version}, the next check tries again`);
    ditCheck = motif;
  };

  // La release `release`, téléchargée, extraite et vérifiée sous `releases/` :
  // celle qui y est déjà, ou celle de la publication. Rend son runtime.
  const obtenir = async (release: Release): Promise<string> => {
    const dossier = join(releases, release.version);
    if (verifierRelease(dossier, release.version) === null) return join(dossier, RUNTIME);
    if (release.archive === null) throw new Error(`release ${release.version} carries no station archive for this platform${archive === null ? "" : ` (${archive})`}`);
    mkdirSync(releases, { recursive: true });
    // De côté : la release qui tourne, si elle en vient. Le reste — une visée
    // d'avant, un téléchargement coupé — s'en va.
    for (const nom of readdirSync(releases)) if (nom !== version) rmSync(join(releases, nom), { recursive: true, force: true });
    const partiel = join(releases, `.${release.version}.part`);
    mkdirSync(partiel, { recursive: true });
    try {
      const fichier = join(partiel, archive ?? "archive");
      await versions.telecharger({ ...release, archive: release.archive }, fichier);
      const extrait = join(partiel, "extrait");
      await extraire(fichier, extrait);
      const refus = verifierRelease(extrait, release.version);
      if (refus !== null) throw new Error(`release ${release.version} is not a station release: ${refus}`);
      renameSync(extrait, dossier);
    } finally {
      rmSync(partiel, { recursive: true, force: true });
    }
    return join(dossier, RUNTIME);
  };

  // Attend que les cooks en vol aient fini ; rend faux si la mise à jour s'est
  // arrêtée avant.
  const vider = async (): Promise<boolean> => {
    for (;;) {
      if (arretee) return false;
      const cooks = [...options.enVol()].sort((a, b) => a - b);
      if (statut.draining !== null && cooks.join(",") !== statut.draining.cooks.join(",")) {
        statut.draining.cooks = cooks;
        ecrire();
      }
      if (cooks.length === 0) return true;
      await pause(pasDuDrainMs);
    }
  };

  const regarder = async (): Promise<StatutDeLaStation> => {
    if (statut.restart !== null || statut.draining !== null) return statut;
    statut.checkedAt = maintenant().toISOString();
    let liste: Release[];
    try {
      liste = await versions.lister();
    } catch (erreur) {
      echouer(`the published station versions do not read (${versions.nom}): ${message(erreur)}`);
      ecrire();
      return statut;
    }
    const plusRecente = liste.reduce<Release | null>((meilleure, lue) => (meilleure === null || comparerVersions(lue.version, meilleure.version) > 0 ? lue : meilleure), null);
    statut.latestStationVersion = plusRecente?.version ?? null;
    statut.check = null;
    ditCheck = null;
    if (plusRecente === null || !enRetard()) {
      statut.held = null;
      ecrire();
      return statut;
    }
    const visee = plusRecente.version;
    if (options.relancer === null) {
      statut.held = `nothing restarts this station on another release: ${visee} waits (the station keeps running ${version})`;
      ecrire();
      return statut;
    }
    statut.held = null;
    let runtime: string;
    try {
      runtime = await obtenir(plusRecente);
    } catch (erreur) {
      echouer(`release ${visee} cannot be obtained: ${message(erreur)}`);
      ecrire();
      return statut;
    }
    statut.ready = visee;
    statut.draining = { since: maintenant().toISOString(), cooks: [...options.enVol()].sort((a, b) => a - b) };
    ecrire();
    const cooks = statut.draining.cooks.length;
    dire(`brigade: station update — release ${visee} is ready: the station takes no new ticket${cooks === 0 ? "" : ` and waits for its ${cooks} cook${cooks > 1 ? "s" : ""} in flight`}, then asks to be restarted on it`);
    if (!(await vider())) return statut;
    const demande: DemandeDeRelance = { version: visee, runtime, main: join(runtime, POINT_D_ENTREE), from: version, at: maintenant().toISOString() };
    try {
      options.relancer(demande);
    } catch (erreur) {
      // Personne ne la relancera : la station reprend ses tickets, et le
      // regard suivant redemande — la release est déjà là.
      statut.draining = null;
      echouer(`the restart request on release ${visee} cannot be made: ${message(erreur)}`);
      ecrire();
      return statut;
    }
    statut.restart = demande;
    ecrire();
    return statut;
  };

  return {
    passer() {
      if (enCours !== null) return enCours;
      enCours = regarder().finally(() => {
        enCours = null;
      });
      return enCours;
    },
    statut: () => structuredClone(statut),
    retenue: () => statut.draining !== null,
    arreter() {
      arretee = true;
    },
  };
}

// La prise d'une station GitHub seul, retenue pendant le drain : elle ne prend
// plus aucun ticket, sans rien écrire sur l'issue. Le lâcher reste le sien.
export function retenirLaPrise(prise: Prise, retenue: () => boolean): Prise {
  return {
    prendre: (issue) => (retenue() ? Promise.resolve({ prise: false }) : prise.prendre(issue)),
    lacher: (issue) => prise.lacher(issue),
  };
}

// Les regards, à la cadence de la box : le premier `premierMs` après le
// démarrage, puis `intervalleMs` après la fin de chacun, à une minute près.
// Plus aucun une fois la relance demandée. Rend de quoi arrêter.
export function tenirLaMiseAJour(miseAJour: MiseAJourDeLaStation, cadence: { premierMs?: number; intervalleMs?: number; aleaMs?: number } = {}): () => void {
  const alea = () => Math.floor(Math.random() * (cadence.aleaMs ?? ALEA_MS));
  let minuterie: NodeJS.Timeout | undefined;
  let arretee = false;
  const plusTard = (ms: number) => {
    if (arretee) return;
    minuterie = setTimeout(() => {
      void miseAJour
        .passer()
        .catch(() => null)
        .then((statut) => {
          if (statut === null || statut.restart === null) plusTard((cadence.intervalleMs ?? INTERVALLE_MS) + alea());
        });
    }, ms);
    minuterie.unref();
  };
  plusTard((cadence.premierMs ?? PREMIER_MS) + alea());
  return () => {
    arretee = true;
    clearTimeout(minuterie);
    miseAJour.arreter();
  };
}

// La mise à jour, telle que l'environnement de la station la règle — ou null
// quand elle n'a pas lieu ici :
// - `BRIGADE_MISE_A_JOUR_DIR` défini : c'est une box, sa mise à jour est
//   l'unité systemd qui remet le paquet à apt ;
// - `BRIGADE_MISE_A_JOUR_SOURCE` absent : rien ne dit où sont les versions.
// `BRIGADE_STATION_RELANCE=app` : celui qui tient la station la relance sur la
// release qu'elle demande (le contrat de `README.md`). Absent, la station
// regarde et dit son retard, sans rien télécharger ni se vider.
export function configDeLaMiseAJour(env: NodeJS.ProcessEnv): { versions: SourceDesVersions; relance: boolean } | null {
  if (env.BRIGADE_MISE_A_JOUR_DIR) return null;
  if (!env.BRIGADE_MISE_A_JOUR_SOURCE) return null;
  return { versions: sourceDesVersions(env.BRIGADE_MISE_A_JOUR_SOURCE, archiveDe(process.platform)), relance: env.BRIGADE_STATION_RELANCE === "app" };
}

// La mise à jour d'une station, ouverte d'après son environnement et tenue à
// sa cadence ; null quand elle n'a pas lieu ici. La station lui dit ses cooks
// en vol (`enVol`), et retient ses prises tant que `retenue()` est vrai
// (`retenirLaPrise`).
export function ouvrirLaMiseAJour(options: { racine: string; env: NodeJS.ProcessEnv; enVol: () => number[]; dire: (ligne: string) => void }): { miseAJour: MiseAJourDeLaStation; arreter: () => void } | null {
  const config = configDeLaMiseAJour(options.env);
  if (config === null) return null;
  const miseAJour = miseAJourDeLaStation({ racine: options.racine, versions: config.versions, enVol: options.enVol, relancer: config.relance ? demanderAuSuperviseur(options.racine, options.dire) : null, dire: options.dire });
  return { miseAJour, arreter: tenirLaMiseAJour(miseAJour) };
}
