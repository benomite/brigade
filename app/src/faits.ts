// Ce que l'app dessine : les faits que la box rend dans une forme faite pour un
// programme (`brigade <projet> faits` — docs/runtime.md, « Les faits, pour un
// programme »). L'app n'y déduit rien : un état est un mot lu, un compteur un
// nombre lu. Une sortie qui n'est pas cette forme n'est pas dessinée du tout —
// ce que la box a rendu se lit à sa place. Et une couleur ne se pose que sur un
// mot des deux listes fermées : un mot inconnu s'affiche tel quel, sans couleur.
// Le rail se range en cinq colonnes : quatre d'après le mot d'état de chaque
// ticket, la cinquième — T'attend — d'après `attend`, que la forme donne, et les
// numéros en tête des lignes du bloc `attend` de `status` (attend.ts), qui dit le
// geste en mots. Chaque carte porte ce que la file dit du ticket : sa station et
// ce qu'il brûle d'après la forme, le reste d'après sa ligne sous `rail`, dans
// `status` (bon.ts). La version du runtime et sa mise en service se posent à côté
// de la file, d'après la forme elle aussi ; seul l'échec du dernier geste de box
// vient de l'entrée `version` du bloc (version.ts). Ce sont les trois seules
// choses lues hors de la forme.
import { ditDe, ticketsDe, type Montree } from "./attend.ts";
import { lignesDuRail, porter, type Porte } from "./bon.ts";
import type { Echec, Lecture } from "./box.ts";
import { voir as voirVersion, type MiseEnService, type Version, type Vu as VersionVue } from "./version.ts";

export const COMMANDE = "faits";

// Un cook en cours : son ticket, le titre de ce ticket — vide s'il a quitté le
// rail pendant la cuisson —, sa station.
export type Cook = { ticket: number; titre: string; station: string };

// Un ticket que le bloc `attend` nomme, et ce que `faits` en donne : son titre —
// vide s'il n'est pas sur le rail, le journal ne le connaît pas — et l'adresse de
// son issue, que la box donne : nulle quand elle n'en a pas. L'app n'en compose aucune.
export type Attendu = { ticket: number; titre: string; url: string | null };

// Un ticket servi dans les 24 h avant la lecture, que la box garde après la
// fermeture de son issue : `livre`, l'heure de son service ; `station`, celle qui
// l'a cuisiné — nulle quand aucune ne l'a envoyé en pass ; `pr`, la PR mergée —
// nulle pour un ticket servi sans merge ; `url`, son issue, nulle quand la box ne
// la connaît pas.
export type Livre = { ticket: number; titre: string; url: string | null; livre: string; station: string | null; pr: string | null };

// La forme, telle que le runtime la fige (runtime/src/etat.ts, `Faits`).
// `cooks`, `attend`, `version`, `miseEnService`, `livres` : absents, c'est un
// runtime d'avant ce champ — les seuls que la forme laisse manquer. `version` nulle : le
// runtime en marche n'a rien comparé, et ce n'est pas « à jour ».
export type Faits = {
  etat: string;
  lu: string;
  dernierTick: string | null;
  compteurs: { rail: number; auTravail: number; aLaPass: number; attend: number; livres24h: number };
  dernierEvenement: { seq: number; at: string; type: string; ticket: number | null } | null;
  rail: { ticket: number; etat: string; titre: string; url: string }[];
  cooks?: Cook[];
  attend?: Attendu[];
  version?: Version | null;
  miseEnService?: MiseEnService;
  livres?: Livre[];
};

// Ce que la vue dessine d'un projet, prêt à poser : elle n'y calcule rien.
// `ton` : la couleur du mot d'état — absente, le mot n'est pas de la liste fermée.
// `arretee` : la bannière d'arrêt se pose.
// Une carte du rail : `ouvrable`, ce ticket s'ouvre sur son issue ; `attendu`, il
// attend une décision du chef, et il est dans T'attend ; `attend`, ce que le bloc
// `attend` dit de lui, entrée par entrée, mot pour mot — une entrée et ce qui la
// précise dessous d'un seul tenant, ses lignes comprises. Sans `etat` ni `titre` :
// il attend, et il n'est pas sur le rail que `faits` rend. Et ce qu'elle porte de
// la file (bon.ts) : ce qu'elle dit du ticket, ce qu'elle n'en dit pas, sa ligne
// telle quelle quand l'app n'a pas su la découper. Dans Livré, `pr` : la PR mergée
// du ticket s'ouvre — faux, son adresse n'est pas en https ; absent, il n'en a pas.
export type Carte = { ticket: number; etat?: string; ton?: string; titre?: string; ouvrable: boolean; attendu: boolean; attend: string[]; pr?: boolean } & Porte;
// `compte` : le nombre de ses cartes — ou `?`, pour T'attend, tant que rien ne dit
// qui attend. `vide` : ce qui se lit à la place des cartes quand il n'y en a pas.
// `defile` : ses cartes défilent dans une hauteur bornée — longue, la colonne ne
// pousse rien sous les autres.
export type Colonne = { nom: string; ton: string; compte: string; cartes: Carte[]; vide: string; defile?: true };
// `hors` : les tickets que `faits` rend et qu'aucune colonne ne prend. `attendLu` :
// l'heure de la lecture de `status` dont vient le bloc — absente, il n'a pas été pris.
// `railLu` : celle dont viennent les lignes que les cartes portent — absente, la
// ligne `rail` de `status` n'a pas été lue.
export type Rail = { colonnes: Colonne[]; hors: Carte[]; attendLu?: string; railLu?: string };
// Le bloc `attend` d'un projet, tel que `status` l'a écrit, et l'heure de sa lecture.
export type BlocLu = { bloc: string; a: string };
// Ce que `status` a rendu pour un projet, son bloc `attend` mis à part, et l'heure de sa lecture.
export type StatusLu = { texte: string; a: string };
// `vide` : ce qui se lit à la place des cooks quand il n'y en a pas à poser.
// `version` : la version du runtime et sa mise en service, à côté de la file (version.ts).
export type Tableau = {
  etat: string;
  ton?: string;
  arretee: boolean;
  tick: string;
  compteurs: { libelle: string; nombre: number }[];
  cooks: { enCours: Cook[]; vide: string };
  evenement: string;
  rail: Rail;
  version: VersionVue;
};

// Ce qu'une lecture de `faits` donne à la vue : le tableau ; ou, sous un `titre`
// qui dit lequel, ce que la box a `rendu` à la place des faits, mot pour mot, et
// en quoi ce n'est pas la forme (`informe`) ; ou l'échec de la veille, tel quel.
export type Dessinable = { projet: string; demande: number; a: string } & ({ tableau: Tableau } | { titre: string; informe: string; rendu: string } | ({ titre: string } & Echec));

class Informe extends Error {}

const refuser = (champ: string, attendu: string): never => {
  throw new Informe(`« ${champ} » n'est pas ${attendu}`);
};
const objet = (valeur: unknown, champ: string): Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : refuser(champ, "un objet");
const texte = (valeur: unknown, champ: string): string => (typeof valeur === "string" ? valeur : refuser(champ, "un texte"));
const entier = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : refuser(champ, "un nombre entier positif"));
const heure = (valeur: unknown, champ: string): string => (typeof valeur === "string" && !Number.isNaN(Date.parse(valeur)) ? valeur : refuser(champ, "une heure"));
const booleen = (valeur: unknown, champ: string): boolean => (typeof valeur === "boolean" ? valeur : refuser(champ, "vrai ou faux"));
const ouRien = <T>(valeur: unknown, champ: string, lire: (valeur: unknown, champ: string) => T): T | null => (valeur === null ? null : lire(valeur, champ));

// La version du runtime face à son origine : nulle, le runtime n'a rien comparé.
function comprendreVersion(valeur: unknown): Version | null {
  if (valeur === null) return null;
  const lu = objet(valeur, "version");
  return {
    etat: texte(lu.etat, "version.etat"),
    depuis: heure(lu.depuis, "version.depuis"),
    branche: ouRien(lu.branche, "version.branche", texte),
    enService: texte(lu.enService, "version.enService"),
    enAttente: ouRien(lu.enAttente, "version.enAttente", texte),
    livraisons: ouRien(lu.livraisons, "version.livraisons", entier),
    raison: ouRien(lu.raison, "version.raison", texte),
  };
}

// La mise en service demandée, et les cooks en vol à la lecture.
function comprendreMiseEnService(valeur: unknown): MiseEnService {
  const lu = objet(valeur, "miseEnService");
  return {
    etat: texte(lu.etat, "miseEnService.etat"),
    depuis: ouRien(lu.depuis, "miseEnService.depuis", heure),
    coupe: booleen(lu.coupe, "miseEnService.coupe"),
    enVol: (Array.isArray(lu.enVol) ? lu.enVol : refuser("miseEnService.enVol", "une liste")).map((cook: unknown, rang) => {
      const lequel = `miseEnService.enVol[${rang}]`;
      const vol = objet(cook, lequel);
      return { ticket: ouRien(vol.ticket, `${lequel}.ticket`, entier), run: texte(vol.run, `${lequel}.run`), station: ouRien(vol.station, `${lequel}.station`, texte), tokens: ouRien(vol.tokens, `${lequel}.tokens`, entier) };
    }),
    tokens: entier(lu.tokens, "miseEnService.tokens"),
  };
}

// La sortie de `faits`, champ pour champ — ou en quoi elle n'est pas la forme.
// Rien n'y est complété : un champ qui manque refuse la forme entière — sauf
// `cooks`, `attend`, `version`, `miseEnService` et `livres`, qu'un runtime
// d'avant eux ne rend pas, et qui manquent alors ici aussi.
// Un champ de plus est laissé de côté, un mot d'état inconnu est gardé.
export function comprendre(sortie: string): Faits | { informe: string } {
  if (sortie.trim() === "") return { informe: "la commande n'a rien rendu" };
  let lu: unknown;
  try {
    lu = JSON.parse(sortie);
  } catch {
    return { informe: "ce n'est pas du JSON" };
  }
  try {
    const racine = typeof lu === "object" && lu !== null && !Array.isArray(lu) ? (lu as Record<string, unknown>) : refuser("la sortie", "un objet");
    const compteurs = objet(racine.compteurs, "compteurs");
    const evenement = ouRien(racine.dernierEvenement, "dernierEvenement", objet);
    return {
      etat: texte(racine.etat, "etat"),
      lu: heure(racine.lu, "lu"),
      dernierTick: ouRien(racine.dernierTick, "dernierTick", heure),
      compteurs: {
        rail: entier(compteurs.rail, "compteurs.rail"),
        auTravail: entier(compteurs.auTravail, "compteurs.auTravail"),
        aLaPass: entier(compteurs.aLaPass, "compteurs.aLaPass"),
        attend: entier(compteurs.attend, "compteurs.attend"),
        livres24h: entier(compteurs.livres24h, "compteurs.livres24h"),
      },
      dernierEvenement:
        evenement === null
          ? null
          : {
              seq: entier(evenement.seq, "dernierEvenement.seq"),
              at: heure(evenement.at, "dernierEvenement.at"),
              type: texte(evenement.type, "dernierEvenement.type"),
              ticket: ouRien(evenement.ticket, "dernierEvenement.ticket", entier),
            },
      rail: (Array.isArray(racine.rail) ? racine.rail : refuser("rail", "une liste")).map((ticket: unknown, rang) => {
        const lequel = `rail[${rang}]`;
        const lu = objet(ticket, lequel);
        return { ticket: entier(lu.ticket, `${lequel}.ticket`), etat: texte(lu.etat, `${lequel}.etat`), titre: texte(lu.titre, `${lequel}.titre`), url: texte(lu.url, `${lequel}.url`) };
      }),
      ...(racine.cooks === undefined
        ? {}
        : {
            cooks: (Array.isArray(racine.cooks) ? racine.cooks : refuser("cooks", "une liste")).map((cook: unknown, rang) => {
              const lequel = `cooks[${rang}]`;
              const lu = objet(cook, lequel);
              return { ticket: entier(lu.ticket, `${lequel}.ticket`), titre: texte(lu.titre, `${lequel}.titre`), station: texte(lu.station, `${lequel}.station`) };
            }),
          }),
      ...(racine.attend === undefined
        ? {}
        : {
            attend: (Array.isArray(racine.attend) ? racine.attend : refuser("attend", "une liste")).map((attendu: unknown, rang) => {
              const lequel = `attend[${rang}]`;
              const lu = objet(attendu, lequel);
              return { ticket: entier(lu.ticket, `${lequel}.ticket`), titre: texte(lu.titre, `${lequel}.titre`), url: ouRien(lu.url, `${lequel}.url`, texte) };
            }),
          }),
      ...(racine.version === undefined ? {} : { version: comprendreVersion(racine.version) }),
      ...(racine.miseEnService === undefined ? {} : { miseEnService: comprendreMiseEnService(racine.miseEnService) }),
      ...(racine.livres === undefined
        ? {}
        : {
            livres: (Array.isArray(racine.livres) ? racine.livres : refuser("livres", "une liste")).map((livre: unknown, rang) => {
              const lequel = `livres[${rang}]`;
              const lu = objet(livre, lequel);
              return {
                ticket: entier(lu.ticket, `${lequel}.ticket`),
                titre: texte(lu.titre, `${lequel}.titre`),
                url: ouRien(lu.url, `${lequel}.url`, texte),
                livre: heure(lu.livre, `${lequel}.livre`),
                station: ouRien(lu.station, `${lequel}.station`, texte),
                pr: ouRien(lu.pr, `${lequel}.pr`, texte),
              };
            }),
          }),
    };
  } catch (erreur) {
    if (erreur instanceof Informe) return { informe: erreur.message };
    throw erreur;
  }
}

// Ce que l'app dit d'une lecture de `faits` en échec : le même cas que sous
// `status` (vue.js, `rendre`), avec les mêmes mots — le code de sortie le
// choisit. Sans cas, sur une box jointe, c'est `faits` qui n'a pas répondu : un
// runtime d'avant cette commande.
const TITRES: Readonly<Record<Exclude<Echec["cas"], null | "ssh-en-echec">, string>> = {
  "projet-inconnu": "JOINT, MAIS INCONNU DE LA BOX",
  "sans-droit": "JOINT, MAIS SANS LE DROIT DU GESTE",
  "commande-manque": "JOINT, MAIS UNE COMMANDE MANQUE SUR LA BOX",
  "node-inapte": "JOINT, MAIS LE NODE DE LA BOX NE CONVIENT PAS AU RUNTIME",
};
// `sansReponse` : ce qui se dit d'une box jointe dont le code ne dit aucun cas — pour une autre commande que `faits`.
export function titreDEchec({ cas, atteinte }: Echec, sansReponse = "JOINT, MAIS `faits` N'A PAS RÉPONDU"): string {
  if (cas !== null && cas !== "ssh-en-echec") return TITRES[cas];
  return atteinte ? sansReponse : "PAS JOINT";
}

// Une lecture de la veille, et ce qui s'en dessine. Sans faits, rien n'est
// dessiné : le titre dit quel cas, et ce qui a été obtenu suit.
function lire(lecture: Lecture, attend?: BlocLu, status?: StatusLu): { faits?: Faits; recue: Dessinable } {
  if ("erreur" in lecture) return { recue: { ...lecture, titre: titreDEchec(lecture) } };
  const { projet, demande, a } = lecture;
  const rendu = lecture.sorties.find(({ commande }) => commande === COMMANDE)?.texte ?? "";
  const faits = comprendre(rendu);
  if ("informe" in faits) return { recue: { projet, demande, a, titre: "LA BOX N'A PAS RENDU LA FORME DE `faits`", informe: faits.informe, rendu } };
  return { faits, recue: { projet, demande, a, tableau: tableau(faits, attend, status) } };
}

export const dessiner = (lecture: Lecture): Dessinable => lire(lecture).recue;

// Les deux listes fermées de la forme, et la couleur de chaque mot.
const TONS_DE_PROJET = new Map([
  ["ouverte", "vert"],
  ["retenue", "jaune"],
  ["arrêtée", "rouge"],
  ["éteinte", "rouge"],
]);
const TONS_DE_TICKET = new Map([
  ["en attente", "gris"],
  ["BLOQUÉ", "rouge"],
  ["pris", "bleu"],
  ["en pass", "jaune"],
  ["servi", "vert"],
  ["86", "rouge"],
]);
// Le mot et, s'il est de la liste, sa couleur : un mot inconnu n'en porte aucune.
const colore = (tons: ReadonlyMap<string, string>, etat: string): { etat: string; ton?: string } => {
  const ton = tons.get(etat);
  return ton === undefined ? { etat } : { etat, ton };
};

// Une durée, dite comme `status` la dit.
export function duree(ms: number): string {
  const secondes = Math.max(0, Math.floor(ms / 1000));
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(minutes / (24 * 60))} j`;
}

// Un âge se compte entre deux heures de la box — celle du fait, celle de la
// lecture : l'horloge du poste n'y entre pas.
const avant = (fait: string, lu: string) => `${duree(Date.parse(lu) - Date.parse(fait))} avant la lecture`;

// Le dernier événement : son type s'affiche, il ne s'interprète pas.
export function evenement({ dernierEvenement, lu }: Faits): string {
  if (dernierEvenement === null) return "aucun : le journal est vide";
  const { type, ticket, at } = dernierEvenement;
  return [type, ...(ticket === null ? [] : [`#${ticket}`]), avant(at, lu)].join(" · ");
}

// L'écart entre le dernier tick et la lecture : affiché, jamais conclu.
export function tick({ dernierTick, lu }: Faits): string {
  return dernierTick === null ? "aucun tick : runtime arrêté, ou pas encore de tick depuis son démarrage" : `dernier tick ${avant(dernierTick, lu)}`;
}

// Seule une adresse https s'ouvre : rien de ce qu'une box rend n'est lancé
// comme un fichier ou un programme.
const ouvrable = (url: string) => URL.parse(url)?.protocol === "https:";

// Les quatre colonnes que `faits` remplit, dans l'ordre de l'écran, et les mots
// d'état que chacune prend. Tout autre mot — `86`, un mot inconnu — n'est d'aucune.
const COLONNES_DE_FAITS = [
  { nom: "Sur le rail", ton: "gris", etats: ["en attente", "BLOQUÉ"] },
  { nom: "Au travail", ton: "bleu", etats: ["pris"] },
  { nom: "Pass", ton: "jaune", etats: ["en pass"] },
  { nom: "Livré", ton: "vert", etats: ["servi"] },
] as const;
const T_ATTEND = { nom: "T'attend", ton: "rouge", rang: 3 } as const;
const LIVRE = "Livré";
const AUCUN = "aucun ticket";
// Livré, quand la box donne `livres` : ce que la cuisine a servi en 24 h, que
// l'issue soit fermée ou non. Vide, c'est qu'elle n'a rien servi — et elle le dit.
const RIEN_LIVRE = "rien livré depuis 24 h";
const SANS_PR = "aucune — servi sans merge";
const SANS_CUISINIER = "non communiqué par la file : qui l'a cuisiné — aucune station ne l'a envoyé en pass";
// La colonne ne dit jamais « rien ne t'attend » : une entrée sans numéro — une
// version, une connexion — attend aussi, et n'a pas de carte. C'est le bloc qui le dit.
const AUCUN_NUMERO = "aucun ticket en tête d'une ligne du bloc `attend`";
const AUCUN_ATTENDU = "aucun ticket dans `attend`, d'après `faits`";
const RIEN_DE_LU = "pas lue : le runtime de cette box ne donne pas `attend` dans `faits`, et le bloc `attend` de `ssh <hote> brigade <nom> status` n'a pas été pris pour ce projet. Ce n'est pas « rien ne t'attend » — les tickets restent dans leurs colonnes";

// Le rail en cinq colonnes. Un ticket qui attend une décision du chef est dans
// T'attend, et là seulement : c'est l'information qui décide d'un geste. Il y est
// dès que la file le nomme — dans `attend`, que `faits` donne, ou en tête d'une
// ligne du bloc `attend` de `status`, qui dit en plus ce qu'on attend de lui. Les
// autres sont dans la colonne de leur mot d'état, dans l'ordre de service ;
// T'attend garde l'ordre du bloc, le plus ancien d'abord, puis celui de `faits`.
// Livré, quand la box donne `livres`, en vient seul : les tickets servis dans les
// 24 h, le plus récent d'abord, un pour un avec `livrés 24 h` — partis du rail ou
// non. Un ticket `servi` du rail qu'elle n'y met pas, servi avant, est rendu à
// part ; un ticket qu'elle y met et que le rail porte sous un autre mot — repris
// depuis, 86 — reste aussi là où ce mot le range. Sans `livres`, un runtime
// d'avant ce champ : Livré prend les tickets `servi` du rail, comme les autres.
// `status` : ce que la box en a rendu, d'où vient la ligne que chaque carte porte.
export function rail(faits: Faits, attend?: BlocLu, status?: StatusLu): Rail {
  const lignes = status === undefined ? undefined : lignesDuRail(status.texte);
  const connus = new Map(faits.rail.map((connu) => [connu.ticket, connu]));
  const dits = new Map<number, string[]>();
  for (const entree of attend === undefined ? [] : ticketsDe(attend.bloc)) dits.set(entree.ticket, [...(dits.get(entree.ticket) ?? []), ditDe(entree)]);
  for (const { ticket } of faits.attend ?? []) if (!dits.has(ticket)) dits.set(ticket, []);

  // La carte d'un ticket : ce que le rail en donne — ou, pour un ticket qui attend
  // sans y être, ce que `faits.attend` en donne : son titre s'il y en a un, son
  // adresse si la box l'a rendue —, puis ce que la file dit de lui.
  const carte = (ticket: number): Carte => {
    const connu = connus.get(ticket);
    const donne = faits.attend?.find((attendu) => attendu.ticket === ticket);
    const url = connu?.url ?? donne?.url;
    const titre = connu?.titre ?? (donne === undefined || donne.titre === "" ? undefined : donne.titre);
    const dit = dits.get(ticket);
    return {
      ticket,
      ...(connu === undefined ? {} : colore(TONS_DE_TICKET, connu.etat)),
      ...(titre === undefined ? {} : { titre }),
      ouvrable: url != null && ouvrable(url),
      attendu: dit !== undefined,
      attend: dit ?? [],
      ...porter(connu === undefined ? {} : { etat: connu.etat, titre: connu.titre }, {
        ...(lignes === undefined ? {} : { lignes: lignes.get(ticket) ?? [] }),
        ...(faits.cooks === undefined ? {} : { stations: [...new Set(faits.cooks.filter((cook) => cook.ticket === ticket).map(({ station }) => station))] }),
        ...(faits.miseEnService === undefined ? {} : { vols: faits.miseEnService.enVol.filter((vol) => vol.ticket === ticket) }),
        bloque: dit !== undefined && dit.length > 0,
      }),
    };
  };

  // La carte d'un ticket livré : ce que `livres` en donne — son titre, ou celui du
  // rail s'il n'en a pas ; quand il a été livré, à l'horloge de la box ; qui l'a
  // cuisiné ; sa PR mergée. Ce que la file n'en dit pas est écrit.
  const livre = ({ ticket, titre, url, livre: quand, station, pr }: Livre): Carte => {
    const connu = connus.get(ticket);
    const adresse = url ?? connu?.url;
    const nomme = titre === "" ? connu?.titre : titre;
    return {
      ticket,
      ...colore(TONS_DE_TICKET, "servi"),
      ...(nomme === undefined || nomme === "" ? {} : { titre: nomme }),
      ouvrable: adresse != null && ouvrable(adresse),
      attendu: false,
      attend: [],
      ...(pr === null ? {} : { pr: ouvrable(pr) }),
      dit: [
        { libelle: "livré", valeur: avant(quand, faits.lu) },
        ...(station === null ? [] : [{ libelle: "cuisiné par", valeur: station, exact: true as const }]),
        ...(pr === null ? [{ libelle: "PR", valeur: SANS_PR }] : []),
      ],
      ...(station === null ? { sans: SANS_CUISINIER } : {}),
    };
  };
  const livres = faits.livres?.map(livre);
  // Un ticket `servi` du rail que `livres` donne a sa carte dans Livré : il n'en a pas d'autre.
  const servis = new Set(livres?.map(({ ticket }) => ticket));
  const ailleurs = faits.rail.filter(({ ticket, etat }) => !dits.has(ticket) && !(etat === "servi" && servis.has(ticket))).map(({ ticket }) => carte(ticket));
  const colonnes: Colonne[] = COLONNES_DE_FAITS.map(({ nom, ton, etats }) => {
    if (nom === LIVRE && livres !== undefined) return { nom, ton, compte: String(livres.length), cartes: livres, vide: RIEN_LIVRE, defile: true };
    const siennes = ailleurs.filter(({ etat }) => (etats as readonly (string | undefined)[]).includes(etat));
    return { nom, ton, compte: String(siennes.length), cartes: siennes, vide: AUCUN };
  });
  const rienDeLu = attend === undefined && faits.attend === undefined;
  colonnes.splice(T_ATTEND.rang, 0, {
    nom: T_ATTEND.nom,
    ton: T_ATTEND.ton,
    compte: rienDeLu ? "?" : String(dits.size),
    cartes: [...dits.keys()].map(carte),
    vide: rienDeLu ? RIEN_DE_LU : attend === undefined ? AUCUN_ATTENDU : AUCUN_NUMERO,
  });
  const rangees = new Set(colonnes.flatMap((colonne) => colonne.cartes));
  return {
    colonnes,
    hors: ailleurs.filter((posee) => !rangees.has(posee)),
    ...(attend === undefined ? {} : { attendLu: attend.a }),
    ...(status === undefined || lignes === undefined ? {} : { railLu: status.a }),
  };
}

const AUCUN_COOK = "aucun cook en cours";
const COOKS_PAS_LUS = "cooks en cours : pas lus — le runtime de cette box ne les donne pas encore dans `faits`. Ce n'est pas « aucun cook » : `ssh <hote> brigade <nom> station` les montre";

// Les faits, tels que la vue les pose : la pastille, les cinq compteurs dans
// l'ordre de la carte, les cooks en cours dans celui de la box, le dernier
// événement, le rail en cinq colonnes, et la version à côté de la file.
export function tableau(faits: Faits, attend?: BlocLu, status?: StatusLu): Tableau {
  const { compteurs } = faits;
  return {
    ...colore(TONS_DE_PROJET, faits.etat),
    arretee: faits.etat === BANNIERE.etat,
    tick: tick(faits),
    compteurs: [
      { libelle: "rail", nombre: compteurs.rail },
      { libelle: "au travail", nombre: compteurs.auTravail },
      { libelle: "à la pass", nombre: compteurs.aLaPass },
      { libelle: "t'attend", nombre: compteurs.attend },
      { libelle: "livrés 24 h", nombre: compteurs.livres24h },
    ],
    cooks: { enCours: faits.cooks ?? [], vide: faits.cooks === undefined ? COOKS_PAS_LUS : AUCUN_COOK },
    evenement: evenement(faits),
    rail: rail(faits, attend, status),
    // Un âge se compte, là aussi, entre deux heures de la box.
    version: voirVersion(faits, attend, (instant) => duree(Date.parse(faits.lu) - Date.parse(instant))),
  };
}

// La bannière d'arrêt : posée sur le « stop » du chef, avec ce qu'il implique
// (docs/runtime.md, « Les garde-fous ») et le geste du socle qui la relance (gestes.ts).
export const BANNIERE = {
  etat: "arrêtée",
  bouton: "reprendre",
  texte: ["CUISINE À L'ARRÊT — ton « stop » tient", "Tous les cooks en cours ont été arrêtés, et plus aucun n'est lancé — redémarrage du runtime compris, jusqu'à « reprendre »."],
} as const;

// Les derniers faits de chaque projet, tenus par le process principal : la vue
// nomme un projet et un ticket, jamais une adresse. Celle qui s'ouvre est celle
// que la box a donnée pour ce ticket, à la dernière lecture. Le dernier `status`
// de chaque projet y est tenu aussi, son bloc `attend` mis à part : il vient d'une
// autre lecture, et le rail se dessine des deux.
export function tenirFaits() {
  const tenus = new Map<string, { faits: Faits; lecture: Lecture }>();
  const blocs = new Map<string, BlocLu>();
  const statuts = new Map<string, StatusLu>();
  const poser = <T>(ou: Map<string, T>, projet: string, valeur: T | undefined) => void (valeur === undefined ? ou.delete(projet) : ou.set(projet, valeur));
  return {
    recevoir(lecture: Lecture): Dessinable {
      const { faits, recue } = lire(lecture, blocs.get(lecture.projet), statuts.get(lecture.projet));
      if (faits === undefined) tenus.delete(lecture.projet);
      else tenus.set(lecture.projet, { faits, lecture });
      return recue;
    },
    // Ce que `status` vient de rendre pour un projet, son bloc mis à part : s'il
    // change ce qui est dessiné, les derniers faits du projet reviennent
    // redessinés. Une lecture ratée retire tout de celle d'avant, une lecture sans
    // bord son bloc, une lecture sans ligne `rail` ce que les cartes en portaient —
    // rien ne se dessine d'une sortie qui n'est plus la dernière.
    attendre(montree: Montree): Dessinable | undefined {
      const avant = blocs.has(montree.projet) || statuts.has(montree.projet);
      const lue = "erreur" in montree ? undefined : montree;
      const bloc = lue?.attend === undefined ? undefined : { bloc: lue.attend, a: montree.a };
      const texte = lue?.sorties.find(({ commande }) => commande === "status")?.texte;
      const status = texte === undefined || lignesDuRail(texte) === undefined ? undefined : { texte, a: montree.a };
      poser(blocs, montree.projet, bloc);
      poser(statuts, montree.projet, status);
      const tenu = tenus.get(montree.projet);
      if (tenu === undefined || (!avant && bloc === undefined && status === undefined)) return undefined;
      return lire(tenu.lecture, bloc, status).recue;
    },
    // Les projets dont `status` est lu désormais — celui qui est affiché, ou tous.
    // Ce qu'il a rendu pour un projet qui n'en est plus est lâché : ses faits, eux,
    // continuent d'être lus, et rien ne s'y dessine d'un `status` que plus rien ne
    // rafraîchit. Rend ce qui est à redessiner, sans lui.
    veiller(projets: readonly string[]): Dessinable[] {
      return [...new Set([...blocs.keys(), ...statuts.keys()])].filter((projet) => !projets.includes(projet)).flatMap((projet) => {
        blocs.delete(projet);
        statuts.delete(projet);
        const tenu = tenus.get(projet);
        return tenu === undefined ? [] : [lire(tenu.lecture).recue];
      });
    },
    adresse(projet: unknown, ticket: unknown): string | undefined {
      const donnes = typeof projet === "string" ? tenus.get(projet)?.faits : undefined;
      const url =
        donnes?.rail.find((candidat) => candidat.ticket === ticket)?.url ??
        donnes?.attend?.find((candidat) => candidat.ticket === ticket)?.url ??
        donnes?.livres?.find((candidat) => candidat.ticket === ticket)?.url;
      return url != null && ouvrable(url) ? url : undefined;
    },
    // La PR mergée d'un ticket livré, telle que la box l'a donnée à la dernière lecture.
    pr(projet: unknown, ticket: unknown): string | undefined {
      const donnes = typeof projet === "string" ? tenus.get(projet)?.faits : undefined;
      const url = donnes?.livres?.find((candidat) => candidat.ticket === ticket)?.pr;
      return url != null && ouvrable(url) ? url : undefined;
    },
    // Les derniers faits lus d'un projet, et l'heure de leur lecture : c'est d'eux qu'une
    // confirmation tire son prix (confirmation.ts). Rien, s'ils ne sont pas lus.
    dernier(projet: unknown): { faits: Faits; a: string } | undefined {
      const tenu = typeof projet === "string" ? tenus.get(projet) : undefined;
      return tenu === undefined ? undefined : { faits: tenu.faits, a: tenu.lecture.a };
    },
    // Ce que le dernier bloc `attend` dit de ce ticket, ligne pour ligne — celles qui le précisent
    // comprises —, et son titre si `faits` le donne. Rien quand le bloc ne le nomme pas : la vue ne
    // fait pas dire à la file ce qu'elle n'a pas dit.
    attendu(projet: unknown, ticket: unknown): { lignes: string[]; titre?: string } | undefined {
      const bloc = typeof projet === "string" ? blocs.get(projet) : undefined;
      if (bloc === undefined || typeof ticket !== "number") return undefined;
      const entrees = ticketsDe(bloc.bloc).filter((attendu) => attendu.ticket === ticket);
      if (entrees.length === 0) return undefined;
      const donnes = tenus.get(projet as string)?.faits;
      const titre = donnes?.rail.find((candidat) => candidat.ticket === ticket)?.titre ?? donnes?.attend?.find((candidat) => candidat.ticket === ticket)?.titre;
      return { lignes: entrees.flatMap(({ ligne, suite }) => [ligne, ...suite]), ...(titre === undefined || titre === "" ? {} : { titre }) };
    },
    oublier(): void {
      tenus.clear();
      blocs.clear();
      statuts.clear();
    },
  };
}
