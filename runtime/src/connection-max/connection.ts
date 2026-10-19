// La connexion Max de la machine, telle que la station la tient : une seule
// pour tous ses projets — c'est celle du compte, pas d'un projet. Elle se lit
// du fichier d'état du renouvellement (`deploy/brigade-renouvellement`, joué
// par le minuteur que le paquet livre), et de lui seul : des dates et la
// nature d'un échec, jamais un jeton. Le fichier où `claude` garde la
// connexion n'est jamais ouvert, ni même regardé.
//
// Trois états :
//   connectee  un passage réussi du renouvellement, sans échec derrière lui ;
//   perdue     le renouvellement dit qu'il faut un login (identifiants
//              absents, renouvellement refusé, jeton mort), ou un projet l'a
//              vu dans le flux d'un cook ;
//   inconnue   rien ne le dit encore : aucun passage, ou un fichier illisible.
//
// Perdue, elle ne se rétablit que sur des identifiants réécrits après la
// perte : c'est la trace d'un login. Un passage frais n'y suffit pas — il
// réussit aussi quand rien n'a été réécrit.
import { readFileSync } from "node:fs";

export type Etat = "connectee" | "perdue" | "inconnue";

export type MaxConnection = {
  etat: Etat;
  // Depuis quand elle est dans cet état.
  depuis: string | null;
  // Perdue : pourquoi — la nature que le renouvellement consigne
  // (`identifiants-absents`, `session-refusee`, `non-renouvele`), ou ce qu'un
  // projet a vu (`authentication_failed`, `not-logged-in`).
  raison: string | null;
  detail: string | null;
  // Le dernier passage réussi du renouvellement.
  verifiee: string | null;
  // La dernière réécriture de la connexion qu'un passage réussi a relevée —
  // un login, ou un renouvellement. C'est elle qui lève une perte.
  reecrite: string | null;
  // Le renouvellement : a-t-il fait un passage dans les dix dernières minutes,
  // et son échec en cours, s'il en a un qui n'est pas une perte (`claude`
  // introuvable, muet…) — la connexion n'en est pas changée.
  renouvellement: { vivant: boolean; echec: { nature: string; detail: string | null; at: string } | null };
  // Perdue : le seul geste qu'elle demande.
  geste: string | null;
};

// Ce que le renouvellement consigne d'un échec qui ne se répare que par un
// login. Les autres (`claude-introuvable`, `claude-muet`, `claude-en-echec`,
// `statut-illisible`) disent que le renouvellement est en panne, pas que la
// connexion est perdue.
export const PERTES_DU_RENOUVELLEMENT = ["identifiants-absents", "session-refusee", "non-renouvele"];

// Ce qu'un projet voit d'une connexion perdue : le flux d'un cook, ou
// `claude auth status` au démarrage de sa cuisine.
export const PERTES_D_UN_PROJET = ["authentication_failed", "not-logged-in"];

// Le compte sous lequel la station tourne, et fait sa connexion Max.
export const COMPTE = "brigade";

// Le login se fait sur le serveur, par la commande d'installation du guide
// relancée : elle ne refait que lui (`connecter-cli.ts`). Un `claude auth
// login` sous le compte de la station y suffit aussi.
export const GESTE = `un login Max sur le serveur — relancer la commande d'installation du guide, qui ne refait que lui (ou \`claude auth login\` sous le compte ${COMPTE}) ; la cuisine reprend seule dans la minute`;

// Sans passage depuis ce délai, le renouvellement ne tourne plus : il passe
// toutes les trente secondes.
export const VIVANT_MS = 10 * 60_000;

export const INCONNUE: MaxConnection = {
  etat: "inconnue",
  depuis: null,
  raison: null,
  detail: null,
  verifiee: null,
  reecrite: null,
  renouvellement: { vivant: false, echec: null },
  geste: null,
};

// Ce que le fichier d'état du renouvellement porte, ses dates relues.
export type Renouvellement = {
  verifie: string | null;
  echec: string | null;
  nature: string | null;
  detail: string | null;
  // `renouvele` et `ecrits`, le plus récent des deux.
  reecrits: string | null;
};

const date = (valeur: string | undefined): string | null => {
  if (valeur === undefined || valeur === "") return null;
  const instant = Date.parse(valeur);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
};

const plusRecente = (...dates: Array<string | null>): string | null =>
  dates.reduce<string | null>((a, b) => (b === null ? a : a === null || Date.parse(b) > Date.parse(a) ? b : a), null);

// Lit le texte du fichier d'état : des lignes `clé=valeur`.
export function lireRenouvellement(texte: string): Renouvellement {
  const cles = new Map(texte.split("\n").flatMap((ligne) => (ligne.includes("=") ? [[ligne.slice(0, ligne.indexOf("=")), ligne.slice(ligne.indexOf("=") + 1)] as const] : [])));
  return {
    verifie: date(cles.get("verifie")),
    echec: date(cles.get("echec")),
    nature: cles.get("echec_nature") || null,
    detail: cles.get("echec_detail") || null,
    reecrits: plusRecente(date(cles.get("renouvele")), date(cles.get("ecrits"))),
  };
}

// Le fichier d'état, ou null s'il ne se lit pas : absent — aucun passage
// encore —, ou illisible.
export function lireFichierDuRenouvellement(fichier: string): Renouvellement | null {
  try {
    return lireRenouvellement(readFileSync(fichier, "utf8"));
  } catch {
    return null;
  }
}

const apres = (instant: string | null, repere: string | null) => instant !== null && (repere === null || Date.parse(instant) > Date.parse(repere));

// La connexion à `maintenant`, d'après le fichier d'état et ce qu'elle était.
export function evaluer(lu: Renouvellement | null, precedente: MaxConnection, maintenant: Date): MaxConnection {
  if (lu === null) {
    // Une perte ne s'oublie pas parce que le fichier manque.
    return precedente.etat === "perdue" ? { ...precedente, renouvellement: { vivant: false, echec: null } } : { ...INCONNUE, reecrite: precedente.reecrite };
  }
  const passages = [lu.verifie, lu.echec].flatMap((instant) => (instant === null ? [] : [Date.parse(instant)]));
  const vivant = passages.length > 0 && maintenant.getTime() - Math.max(...passages) <= VIVANT_MS;
  const enEchec = lu.echec !== null && !apres(lu.verifie, lu.echec);
  const nature = lu.nature ?? "inconnue";
  const reecrite = plusRecente(precedente.reecrite, enEchec ? null : lu.reecrits);
  const sans = { vivant, echec: null };

  if (enEchec && PERTES_DU_RENOUVELLEMENT.includes(nature)) {
    // Une perte qui continue garde sa date : un passage par minute n'en fait
    // pas une nouvelle par minute.
    const depuis = precedente.etat === "perdue" ? precedente.depuis : lu.echec;
    return { etat: "perdue", depuis, raison: nature, detail: lu.detail, verifiee: precedente.verifiee, reecrite, renouvellement: sans, geste: GESTE };
  }
  const echec = enEchec && lu.echec !== null ? { nature, detail: lu.detail, at: lu.echec } : null;
  if (enEchec) {
    // Le renouvellement est en panne : la connexion reste ce qu'elle était.
    return { ...precedente, reecrite, renouvellement: { vivant, echec } };
  }
  if (lu.verifie === null) return { ...INCONNUE, reecrite, renouvellement: sans };
  if (precedente.etat === "perdue" && !apres(reecrite, precedente.depuis)) {
    // Un passage réussi, mais rien de réécrit depuis la perte : pas de login.
    return { ...precedente, reecrite, renouvellement: sans };
  }
  const depuis = precedente.etat === "connectee" ? precedente.depuis : lu.verifie;
  return { etat: "connectee", depuis, raison: null, detail: null, verifiee: lu.verifie, reecrite, renouvellement: sans, geste: null };
}

// Un projet a vu la connexion tomber, à `at` : elle l'est pour toute la
// machine. Une réécriture postérieure — un login déjà fait — la contredit.
export function perdre(precedente: MaxConnection, raison: string, at: string): MaxConnection {
  if (precedente.etat === "perdue" || apres(precedente.reecrite, at)) return precedente;
  return { ...precedente, etat: "perdue", depuis: at, raison, detail: null, geste: GESTE };
}

// Ce que la station en dit, sur une ligne de son journal de service.
export function sayConnection(connection: MaxConnection): string {
  const heure = (instant: string | null) => (instant === null ? "?" : `${instant.slice(0, 10)} ${instant.slice(11, 16)} UTC`);
  switch (connection.etat) {
    case "connectee":
      return `connexion Max valide — vérifiée par le renouvellement à ${heure(connection.verifiee)}`;
    case "perdue":
      return `connexion Max perdue depuis ${heure(connection.depuis)} (${connection.raison}${connection.detail ? ` : ${connection.detail}` : ""}) — la cuisine de tous les projets est suspendue ; le seul geste : ${GESTE}`;
    case "inconnue":
      return "connexion Max encore inconnue — le renouvellement n'a fait aucun passage réussi";
  }
}

// La forme exposée : ce qu'un autre process lit (l'app, un tableau de bord),
// sans rien d'autre que des dates et des natures.
export function lireExposition(texte: string): MaxConnection | null {
  try {
    const lue = JSON.parse(texte) as Partial<MaxConnection>;
    if (lue.etat !== "connectee" && lue.etat !== "perdue" && lue.etat !== "inconnue") return null;
    return { ...INCONNUE, ...lue, renouvellement: { ...INCONNUE.renouvellement, ...lue.renouvellement } } as MaxConnection;
  } catch {
    return null;
  }
}
