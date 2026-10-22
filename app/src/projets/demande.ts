// Ce que l'app demande à une station, et ce que la station en dit — le format
// est celui de la station (runtime/src/projets/demande.ts). Deux fichiers de
// plus dans le gist de chaque station appairée (stations/document.ts) :
//   - `brigade-projets.json`, écrit par l'app seule : les projets que le chef
//     demande à cette station, et si elle en est la principale — celle qui fait
//     tourner son manager et sa pass ;
//   - `brigade-projets-suivi.json`, écrit par la station seule : où en est
//     chacun — servi, à autoriser sur GitHub (avec les pages où le faire), en
//     préparation, refusé (et pourquoi), ou secondaire — et où il cuit (`cuitSur`, `ici`), et où en
//     est son déménagement (`bascule`) ; et, pour chaque projet dont elle est la principale, où en
//     est son onboarding (`onboarding`, #1110).
// Un déménagement de sa cuisine (runtime/src/demenagement/) ajoute à la demande `remise`, sur la
// station qu'il quitte, et `reprise`, sur celle qui le reprend : l'app les relit et les réécrit tels
// quels — sans eux, le déménagement en cours ne serait plus qu'un changement de principale.
// Aucune liaison directe entre l'app et la station : c'est tout ce qu'elles se disent.

export const FICHIER_PROJETS = "brigade-projets.json";
export const FICHIER_SUIVI = "brigade-projets-suivi.json";
export const FORMAT = 1;

export type Calibre = { modele: string; effort: string };

export type ProjetDemande = {
  nom: string;
  depot: string;
  base: string;
  principale: boolean;
  cooks: number;
  manager: Calibre;
  reviewer: Calibre;
  // Quand le chef a ouvert le parcours, et quand il l'a validé.
  ouvertLe: string | null;
  demandeLe: string | null;
  // Le déménagement en cours, vu de la station qu'il quitte (`remise`) ou de celle qui le reprend
  // (`reprise`) : l'autre station, son gist, l'instant de la demande. Écrits par le runtime seul.
  remise?: { vers: string; gist: string; demandeLe: string };
  reprise?: { de: string; gist: string; demandeLe: string };
};

export type EtatDuProjet = "servi" | "a-autoriser" | "en-preparation" | "refuse" | "secondaire";
// Où en est un déménagement, vu d'une station (runtime/src/projets/demande.ts) : demandé, accepté
// par celle qui le reprend, refusé par elle, remis par celle qu'il quitte, reçu — fini.
export type EtapeDeBascule = "demandee" | "acceptee" | "refusee" | "remise" | "recue";
export type Bascule = { de: string; vers: string; demandeLe: string; etape: EtapeDeBascule };
// `cuitSur` : la station où il cuit, telle que celle-ci la connaît ; `ici` : il cuit sur celle-ci, et
// c'est l'ordinateur du chef. Une station d'avant le déménagement (#1094) n'en dit rien.
// `acces` : le dépôt refuse à la station de le récupérer ou d'y pousser, avec le geste qui le lève
// (#1117, runtime/src/projets/acces.ts) ; `worktree` : sa cuisine ne parvient pas à préparer un
// worktree, avec la raison et l'heure du prochain essai (#1118, runtime/src/echec-du-worktree.ts).
// Absents quand la station n'en dit rien.
// `depot`, `base`, `cooks` : ce que la station sert du projet — son dépôt, sa branche d'intégration et son
// plafond de cooks —, d'où l'app reprend ce qu'une station de plus doit servir ; nuls quand elle n'en dit rien.
export type AccesBloque = { bloque: "fetch" | "push"; raison: string; geste: string };
export type EchecDuWorktree = { ticket: number; raison: string; prochainEssai: string | null; acces: AccesBloque | null };
// `clone` : la station ne parvient pas à cloner le dépôt (#1390, runtime/src/projets/echec-du-clone.ts) —
// la cause en une phrase, le geste, où le faire, ses pages GitHub, le compte GitHub de la station, ce que
// gh et git ont dit (`detail`, que la page ne montre que derrière « details ») et l'écart entre deux essais,
// en secondes. Absent quand le clone n'échoue pas, ou d'une station d'avant #1390.
export type EchecDuClone = { cause: string; raison: string; geste: string; ou: string; liens: string[]; compte: string | null; detail: string; reessaieToutesLes: number };
// `refus` : pourquoi la station ne sert pas le projet, pour le chef (#1177, runtime/src/projets/refus.ts) —
// un code stable, une phrase, et ce que le chef fait. Absent quand rien n'est refusé. Et, du remède qui le
// lève (#1203, runtime/src/remedes/registre.ts), son descripteur (`remedy`) : ce que le bouton fera, en une
// phrase, s'il retire ou efface quelque chose, son identifiant — ou pourquoi il n'y a pas de bouton
// (`noRemedy`). Une station d'avant #1203 n'en dit rien : ni l'un ni l'autre.
export type DescripteurDeRemede = { id: string; description: string; destructive: boolean };
export type Refus = { code: string; message: string; action: string; remedy?: DescripteurDeRemede; noRemedy?: string };
// `blocages` : ce qui bloque le projet, de son ajout à son service (#1394, runtime/src/installation/blocages/) —
// pour chacun, une clé stable, ce qui est bloqué et pourquoi en une phrase chacun, et, s'il y a lieu, le geste que
// l'app sait faire (`action`, son identifiant), la page de GitHub où le faire hors de l'app (`link`) et ce qu'une
// commande a dit (`detail`, que la page ne montre que replié). Absent quand rien ne bloque, ou d'une station d'avant #1394.
export type Blocage = { id: string; message: string; cause: string; action?: string; link?: string; detail?: string };
export type SuiviDuProjet = { nom: string; etat: EtatDuProjet; dit: string; autoriser: string[]; serviLe: string | null; cuitSur: string | null; ici: boolean; bascule: Bascule | null; acces: AccesBloque | null; refus: Refus | null; worktree: EchecDuWorktree | null; clone?: EchecDuClone; blocages?: Blocage[]; depot: string | null; base: string | null; cooks: number | null };

const ETATS: readonly string[] = ["servi", "a-autoriser", "en-preparation", "refuse", "secondaire"];
const ETAPES: readonly string[] = ["demandee", "acceptee", "refusee", "remise", "recue"];
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const date = (valeur: unknown): string | null => (texte(valeur) && !Number.isNaN(Date.parse(valeur)) ? valeur : null);
const nomDeStation = (valeur: unknown): valeur is string => texte(valeur) && valeur.trim() !== "" && valeur.length <= 100;
const gist = (valeur: unknown): valeur is string => texte(valeur) && /^[A-Za-z0-9]{1,64}$/.test(valeur);
const lireAcces = (lu: unknown): AccesBloque | null => {
  const { bloque, raison, geste } = (lu ?? {}) as Record<string, unknown>;
  return (bloque === "fetch" || bloque === "push") && texte(raison) && raison.trim() !== "" && texte(geste) && geste.trim() !== "" ? { bloque, raison, geste } : null;
};
const lireRemede = (lu: unknown): DescripteurDeRemede | null => {
  const { id, description, destructive } = (lu ?? {}) as Record<string, unknown>;
  return texte(id) && /^[a-z][a-z0-9-]*$/.test(id) && texte(description) && description.trim() !== "" && typeof destructive === "boolean" ? { id, description, destructive } : null;
};
const lireRefus = (lu: unknown): Refus | null => {
  const { code, message, action, remedy, noRemedy } = (lu ?? {}) as Record<string, unknown>;
  if (!texte(code) || !texte(message) || message.trim() === "" || !texte(action) || action.trim() === "") return null;
  const remede = lireRemede(remedy);
  if (remede !== null) return { code, message, action, remedy: remede };
  return texte(noRemedy) && noRemedy.trim() !== "" ? { code, message, action, noRemedy } : { code, message, action };
};
const lireEchec = (lu: unknown): EchecDuWorktree | null => {
  const { ticket, raison, prochainEssai, acces } = (lu ?? {}) as Record<string, unknown>;
  if (typeof ticket !== "number" || !Number.isInteger(ticket) || ticket <= 0 || !texte(raison) || raison.trim() === "") return null;
  return { ticket, raison, prochainEssai: date(prochainEssai), acces: lireAcces(acces) };
};
const lireClone = (lu: unknown): EchecDuClone | null => {
  const { cause, raison, geste, ou, liens, compte, detail, reessaieToutesLes } = (lu ?? {}) as Record<string, unknown>;
  if (!texte(cause) || !texte(raison) || raison.trim() === "" || !texte(geste) || geste.trim() === "") return null;
  return {
    cause,
    raison,
    geste,
    ou: texte(ou) ? ou : "",
    // Seules des pages de GitHub s'ouvrent d'un geste.
    liens: Array.isArray(liens) ? liens.filter((url): url is string => texte(url) && /^https:\/\/github\.com\//.test(url)) : [],
    compte: texte(compte) && compte.trim() !== "" ? compte : null,
    detail: texte(detail) ? detail : "",
    reessaieToutesLes: typeof reessaieToutesLes === "number" && Number.isFinite(reessaieToutesLes) && reessaieToutesLes > 0 ? reessaieToutesLes : 30,
  };
};
// Un blocage illisible — sans clé, sans message ou sans cause — n'est pas montré. Comme partout dans l'app, seule
// une page de GitHub s'ouvre d'un geste : un autre lien est oublié, le blocage reste.
const lireUnBlocage = (lu: unknown): Blocage[] => {
  const { id, message, cause, action, link, detail } = (lu ?? {}) as Record<string, unknown>;
  if (!texte(id) || id.trim() === "" || !texte(message) || message.trim() === "" || !texte(cause) || cause.trim() === "") return [];
  return [
    {
      id,
      message,
      cause,
      ...(texte(action) && /^[a-z0-9][a-z0-9.:_-]{0,79}$/.test(action) ? { action } : {}),
      ...(texte(link) && /^https:\/\/github\.com\/\S*$/.test(link) ? { link } : {}),
      ...(texte(detail) && detail.trim() !== "" ? { detail } : {}),
    },
  ];
};
const calibre = (lu: unknown): Calibre => {
  const { modele, effort } = (lu ?? {}) as Record<string, unknown>;
  return { modele: texte(modele) ? modele : "", effort: texte(effort) ? effort : "" };
};

// Le fichier que l'app écrit dans le gist d'une station.
export function documentDeDemande(projets: readonly ProjetDemande[]): string {
  return `${JSON.stringify({ brigade: "projets", format: FORMAT, projets }, null, 2)}\n`;
}

// Ce que l'app a écrit dans le gist d'une station, relu. Absent : rien de
// demandé. Illisible : null — l'app ne le réécrit pas sans le dire.
export function lireDemande(brut: string | undefined): ProjetDemande[] | null {
  if (brut === undefined) return [];
  let lu: { brigade?: unknown; projets?: unknown };
  try {
    lu = JSON.parse(brut) as typeof lu;
  } catch {
    return null;
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "projets" || !Array.isArray(lu.projets)) return null;
  return (lu.projets as unknown[]).flatMap((brut) => {
    const { nom, depot, base, principale, cooks, manager, reviewer, ouvertLe, demandeLe, remise, reprise } = (brut ?? {}) as Record<string, unknown>;
    if (!texte(nom) || !texte(depot) || !texte(base)) return [];
    const laRemise = (remise ?? {}) as Record<string, unknown>;
    const laReprise = (reprise ?? {}) as Record<string, unknown>;
    return [
      {
        nom,
        depot,
        base,
        principale: principale === true,
        cooks: typeof cooks === "number" ? cooks : 0,
        manager: calibre(manager),
        reviewer: calibre(reviewer),
        ouvertLe: date(ouvertLe),
        demandeLe: date(demandeLe),
        ...(nomDeStation(laRemise.vers) && gist(laRemise.gist) && date(laRemise.demandeLe) !== null ? { remise: { vers: laRemise.vers, gist: laRemise.gist, demandeLe: laRemise.demandeLe as string } } : {}),
        ...(nomDeStation(laReprise.de) && gist(laReprise.gist) && date(laReprise.demandeLe) !== null ? { reprise: { de: laReprise.de, gist: laReprise.gist, demandeLe: laReprise.demandeLe as string } } : {}),
      },
    ];
  });
}

// Ce que la station a écrit de ses projets demandés. Absent ou illisible : rien encore.
export function lireSuivi(brut: string | undefined): SuiviDuProjet[] {
  if (brut === undefined) return [];
  try {
    const lu = JSON.parse(brut) as { brigade?: unknown; projets?: unknown };
    if (lu?.brigade !== "projets-suivi" || !Array.isArray(lu.projets)) return [];
    return (lu.projets as unknown[]).flatMap((brut) => {
      const { nom, etat, dit, autoriser, serviLe, cuitSur, ici, bascule, acces, refus, worktree, clone, blocages, depot, base, cooks } = (brut ?? {}) as Record<string, unknown>;
      if (!texte(nom) || !texte(etat) || !ETATS.includes(etat)) return [];
      const echecDuClone = lireClone(clone);
      const lesBlocages = Array.isArray(blocages) ? blocages.flatMap(lireUnBlocage) : [];
      return [
        {
          nom,
          etat: etat as EtatDuProjet,
          dit: texte(dit) ? dit : "",
          autoriser: Array.isArray(autoriser) ? autoriser.filter((url): url is string => texte(url) && /^https:\/\/github\.com\//.test(url)) : [],
          serviLe: date(serviLe),
          cuitSur: nomDeStation(cuitSur) ? cuitSur : null,
          ici: ici === true,
          bascule: lireBascule(bascule),
          acces: lireAcces(acces),
          refus: lireRefus(refus),
          worktree: lireEchec(worktree),
          ...(echecDuClone === null ? {} : { clone: echecDuClone }),
          ...(lesBlocages.length === 0 ? {} : { blocages: lesBlocages }),
          depot: texte(depot) && depot.trim() !== "" ? depot.trim() : null,
          base: texte(base) && base.trim() !== "" ? base.trim() : null,
          cooks: typeof cooks === "number" && Number.isSafeInteger(cooks) && cooks >= 1 ? cooks : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

// Où en est un projet neuf, de son ajout à son premier ticket (#1110, runtime/src/onboarding/etat.ts,
// `Onboarding`) : la station principale l'écrit dans son suivi, sous `onboarding`, par nom de projet.
// Quatre étapes dans l'ordre, chacune faite, courante ou à venir, avec sa phrase et, courante, le
// geste attendu du chef ; le ticket qui prépare le dépôt, son état, et, en échec, pourquoi et quand
// il repart. L'app n'en ouvre que des pages de GitHub.
export type EtatDEtape = "faite" | "courante" | "a-venir";
export type GesteDOnboarding = { quoi: string; ou: string; liens: string[] };
export type EtapeDOnboarding = { etape: string; titre: string; etat: EtatDEtape; dit: string; geste: GesteDOnboarding | null };
export type EtatDePreparation = "en-cours" | "en-echec" | "a-relire" | "suspendu" | "faite" | "abandonne";
export type PreparationDuDepot = { ticket: number; url: string; etat: EtatDePreparation; raison: string | null; prochainEssai: string | null; pr: string | null };
export type Onboarding = { etat: "en-cours" | "pret"; termine: boolean; courante: string | null; etapes: EtapeDOnboarding[]; preparation: PreparationDuDepot | null; sansBacASable: boolean | null; decisionAttendue: boolean };

const ETATS_D_ETAPE: readonly string[] = ["faite", "courante", "a-venir"];
const ETATS_DE_PREPARATION: readonly string[] = ["en-cours", "en-echec", "a-relire", "suspendu", "faite", "abandonne"];
const pageGitHub = (valeur: unknown): valeur is string => texte(valeur) && /^https:\/\/github\.com\//.test(valeur);

function lireGeste(lu: unknown): GesteDOnboarding | null {
  if (lu === null || typeof lu !== "object") return null;
  const { quoi, ou, liens } = lu as Record<string, unknown>;
  if (!texte(quoi) || quoi.trim() === "") return null;
  return { quoi, ou: texte(ou) ? ou : "", liens: Array.isArray(liens) ? liens.filter(pageGitHub) : [] };
}

function lirePreparation(lue: unknown): PreparationDuDepot | null {
  if (lue === null || typeof lue !== "object") return null;
  const { ticket, url, etat, raison, prochainEssai, pr } = lue as Record<string, unknown>;
  if (typeof ticket !== "number" || !Number.isInteger(ticket) || ticket <= 0 || !pageGitHub(url) || !texte(etat) || !ETATS_DE_PREPARATION.includes(etat)) return null;
  return { ticket, url, etat: etat as EtatDePreparation, raison: texte(raison) && raison !== "" ? raison : null, prochainEssai: date(prochainEssai), pr: pageGitHub(pr) ? pr : null };
}

function lireUnOnboarding(lu: unknown): Onboarding | null {
  if (lu === null || typeof lu !== "object") return null;
  const { etat, termine, courante, etapes, preparation, sansBacASable, decisionAttendue } = lu as Record<string, unknown>;
  if ((etat !== "en-cours" && etat !== "pret") || !Array.isArray(etapes)) return null;
  const lues = etapes.flatMap((brute): EtapeDOnboarding[] => {
    const { etape, titre, etat: sien, dit, geste } = (brute ?? {}) as Record<string, unknown>;
    if (!texte(etape) || !texte(titre) || !texte(sien) || !ETATS_D_ETAPE.includes(sien)) return [];
    return [{ etape, titre, etat: sien as EtatDEtape, dit: texte(dit) ? dit : "", geste: lireGeste(geste) }];
  });
  if (lues.length === 0) return null;
  return { etat: etat as Onboarding["etat"], termine: termine === true, courante: texte(courante) ? courante : null, etapes: lues, preparation: lirePreparation(preparation), sansBacASable: typeof sansBacASable === "boolean" ? sansBacASable : null, decisionAttendue: decisionAttendue === true };
}

// L'onboarding de chaque projet dont la station est la principale, par son nom. Absent, illisible,
// ou d'une station d'avant #1110 : rien.
export function lireOnboarding(brut: string | undefined): Record<string, Onboarding> {
  if (brut === undefined) return {};
  try {
    const lu = JSON.parse(brut) as { brigade?: unknown; onboarding?: unknown };
    if (lu?.brigade !== "projets-suivi" || lu.onboarding === null || typeof lu.onboarding !== "object" || Array.isArray(lu.onboarding)) return {};
    return Object.fromEntries(
      Object.entries(lu.onboarding as Record<string, unknown>).flatMap(([nom, un]): [string, Onboarding][] => {
        const onboarding = lireUnOnboarding(un);
        return onboarding === null ? [] : [[nom, onboarding]];
      }),
    );
  } catch {
    return {};
  }
}

// Ce qu'une station dit d'un déménagement, ou null.
export function lireBascule(lue: unknown): Bascule | null {
  const { de, vers, demandeLe, etape } = (lue ?? {}) as Record<string, unknown>;
  return nomDeStation(de) && nomDeStation(vers) && date(demandeLe) !== null && texte(etape) && ETAPES.includes(etape) ? { de, vers, demandeLe: demandeLe as string, etape: etape as EtapeDeBascule } : null;
}
