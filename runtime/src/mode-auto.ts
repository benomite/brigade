// Un projet installé par brigade, prêt pour le mode auto de Claude Code : les
// gestes que les rôles prévoient (la section « Gestes prévus » de chaque
// `commands/<rôle>.md`, source unique) et, pour chacun, ce que la
// configuration du projet peut faire — une règle `permissions.allow`, posée
// dans son `.claude/settings.json` ; rien, parce que le classifieur le laisse
// déjà passer ; ou rien, parce qu'aucune règle étroite ne le peut.
//
// Ce que Claude Code permet, et qui borne tout le reste (sa doc, « Configure
// auto mode » et « Configure permissions ») :
//
// - Une règle `permissions.allow` étroite du `.claude/settings.json` d'un
//   projet est résolue avant le classifieur, et reste en vigueur en mode auto
//   — une fois le dossier accepté au dialogue de confiance. Une règle sans `*`
//   ne reconnaît qu'une commande, au caractère près.
// - Les règles en prose du classifieur (`autoMode`) ne sont **pas** lues depuis
//   le dépôt — ni `.claude/settings.json`, ni `.claude/settings.local.json` :
//   seulement depuis les réglages de l'utilisateur ou de son organisation.
//   Brigade n'en écrit donc aucune ; le classifieur reste souverain sur tout ce
//   qu'aucune règle ne nomme.
// - Une règle ne voit que le texte de la commande : ni la demande du chef, ni
//   la PR que vise un `gh pr merge`. Un geste qui ne vaut que « à la demande du
//   chef » ne s'autorise donc pas par configuration.
//
// D'où l'étroitesse, qui n'est pas négociable : aucune règle ne porte de `*`.
// Chaque lecture de la box est nommée en entier — l'hôte, le projet, la
// commande —, parce que la commande distante d'un `ssh` est un texte que Claude
// Code ne découpe pas : un `*` y laisserait passer `; rm -rf ~`.
import { NOM_DE_PROJET } from "./runtime.ts";

export const ROLES = ["second"] as const;
export type Role = (typeof ROLES)[number];

// Le fichier de rôle de chacun : le second est le PO.
export const COMMANDE_DU_ROLE: Record<Role, string> = { second: "po" };

// Le fichier que l'installation écrit, relatif à la racine du projet.
export const REGLAGES_DU_PROJET = ".claude/settings.json";

// Le `ssh` des rôles, tel qu'ils l'écrivent (`commands/po.md`, « À
// l'ouverture ») : sans mot de passe à attendre, sans attente infinie, et `--`
// avant l'hôte pour qu'il ne soit jamais lu comme une option.
export const SSH = "ssh -o BatchMode=yes -o ConnectTimeout=10 --";

// Les commandes du runtime que le geste de la box lance et qui, sans argument,
// ne font que lire : elles n'écrivent jamais au journal. `status` est la
// lecture de la file ; les autres, l'état de brigade. Aucune ne prend
// d'argument ici : `station -- cooks 3`, `base -- replay` ou `guardrails --
// stop` écrivent, et une règle qui les laisserait passer ne serait plus une
// lecture.
export const LECTURE_DE_LA_FILE = "status";
export const LECTURES_DE_L_ETAT = ["rail", "log", "pass", "station", "base", "installation", "guardrails", "partition", "measures", "facts"] as const;

// La doc de brigade sur la box : le clone de `/opt/brigade` (docs/installer.md,
// « Préparer la box »), lue fichier par fichier. Un `grep` ne s'y autorise pas :
// son motif change à chaque fois, et une règle à `*` serait un `ssh` ouvert.
export const RACINE_DE_BRIGADE = "/opt/brigade";
export const DOCS_DE_LA_BOX = ["installer.md", "runtime.md", "app.md", "glossary.md"] as const;

// Le fichier de l'app, hors du dépôt, d'où le second ne prend que `nom` et
// `hote`. Sa première lecture hors du dossier de travail demanderait au chef.
export const CONFIG_DE_L_APP = "~/.config/brigade/app.json";

// Ce qui désigne la box et le projet dans une règle : le nom que le `ssh` du
// chef donne à sa box (un nom de son `~/.ssh/config`, ou `compte@machine`) et
// le nom du projet sur elle. Rien d'autre ne passe : ni espace, ni `*`, ni
// guillemet, ni tiret en tête — l'hôte d'une règle ne doit être ni une option,
// ni un motif, ni une seconde commande.
export const HOTE = /^(?:[A-Za-z0-9_][A-Za-z0-9._-]*@)?[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export type Cible = { nom?: string; hote?: string };

export class CibleInvalide extends Error {}

export function verifierCible({ nom, hote }: Cible): void {
  if (nom !== undefined && !NOM_DE_PROJET.test(nom)) throw new CibleInvalide(`nom de projet refusé : « ${nom} » — attendu : minuscules, chiffres et tirets`);
  if (hote !== undefined && !HOTE.test(hote)) throw new CibleInvalide(`hôte refusé : « ${hote} » — attendu : le nom que ton \`ssh\` donne à ta box, ou \`compte@machine\`, sans espace, sans \`*\`, sans tiret en tête`);
}

// La commande exacte qui lit, sur la box, ce que `distante` nomme.
export const surLaBox = (hote: string, distante: string) => `${SSH} ${hote} ${distante}`;

export const lireLaFile = (hote: string, nom: string) => surLaBox(hote, `brigade ${nom} ${LECTURE_DE_LA_FILE}`);
export const lireLEtat = (hote: string, nom: string) => LECTURES_DE_L_ETAT.map((commande) => surLaBox(hote, `brigade ${nom} ${commande}`));
export const lireLaDoc = (hote: string) => DOCS_DE_LA_BOX.map((doc) => surLaBox(hote, `cat ${RACINE_DE_BRIGADE}/docs/${doc}`));

// La règle qui autorise cette commande, et elle seule : sans `*`, Claude Code
// la compare au caractère près.
export const bash = (commande: string) => `Bash(${commande})`;

type Regles = { regles: (cible: Required<Cible>) => string[]; sansHote?: true };
type SansRegle = { classifieur: string };
type Impossible = { impossible: string };
export type Geste = { role: Role; libelle: string } & (Regles | SansRegle | Impossible);

const mergeImpossible = (cequiLeFaitPasser: string) =>
  `une règle ne voit que le texte de la commande — ni la demande du chef, ni la PR visée : il faudrait autoriser \`gh pr merge *\`, c'est-à-dire tout merge. Le classifieur reste souverain ; ${cequiLeFaitPasser}. S'il refuse encore, le rôle le dit en une phrase et donne le geste : \`! gh pr merge <N> --squash\``;

// Tous les gestes prévus, rôle par rôle, dans l'ordre de leur fichier. Le
// libellé est le texte en gras de la ligne du rôle : un test vérifie que la
// liste et les fichiers de rôle disent les mêmes gestes.
export const GESTES: Geste[] = [
  { role: "second", libelle: "Lire la file", regles: ({ hote, nom }) => [lireLaFile(hote, nom)].map(bash) },
  { role: "second", libelle: "Lire la doc ou l'état de brigade sur la box", regles: ({ hote, nom }) => [...lireLaDoc(hote), ...lireLEtat(hote, nom)].map(bash) },
  { role: "second", libelle: "Lire `~/.config/brigade/app.json`", regles: () => [`Read(${CONFIG_DE_L_APP})`], sansHote: true },
  {
    role: "second",
    libelle: "Mettre un ticket en attente, sur demande du chef",
    classifieur: "une écriture sur la box, aux arguments libres (ticket, ce qu'il attend, de qui) : aucune règle sans `*` ne la nomme, et une règle à `*` laisserait passer toute commande distante ; le classifieur juge, sur la demande du chef",
  },
  {
    role: "second",
    libelle: "`gh issue create` / `gh issue list --search`",
    classifieur: "le dépôt de la session est de confiance : le mode auto les laisse passer ; une règle à `*` les autoriserait vers n'importe quel dépôt, avec n'importe quel corps",
  },
  { role: "second", libelle: "Merger une PR de brigade : sur demande explicite du chef, seulement", impossible: mergeImpossible("la demande du chef qui nomme la PR (« merge la #372 ») est ce qui le fait passer") },
];

// Les règles d'un geste pour cette cible : celles qu'il porte, ou aucune s'il
// lui manque l'hôte et le nom qui les écrivent.
export function reglesDuGeste(geste: Geste, { nom, hote }: Cible): string[] | undefined {
  if (!("regles" in geste)) return [];
  if (geste.sansHote) return geste.regles({ nom: nom ?? "", hote: hote ?? "" });
  if (nom === undefined || hote === undefined) return undefined;
  return geste.regles({ nom, hote });
}

// Toutes les règles du projet, sans doublon, dans l'ordre des gestes.
export function reglesDuModeAuto(cible: Cible): string[] {
  verifierCible(cible);
  return [...new Set(GESTES.flatMap((geste) => reglesDuGeste(geste, cible) ?? []))];
}

export class ReglagesIllisibles extends Error {}

export type Pose = {
  // Le nouveau texte du fichier ; absent, le fichier est déjà juste et ne
  // s'écrit pas.
  texte?: string;
  ajoutees: string[];
  dejaLa: string[];
};

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Ajoute à `permissions.allow` les règles qui y manquent, et rien d'autre :
// les réglages du chef — ses autres clés, ses règles, leur ordre — restent
// tels quels, et une règle déjà là ne se répète pas. Un fichier qui n'est pas
// du JSON, ou dont `permissions.allow` n'est pas une liste, est refusé : on ne
// réécrit pas ce qu'on ne sait pas lire.
export function poserLesRegles(texte: string | undefined, regles: string[]): Pose {
  let reglages: unknown = {};
  if (texte !== undefined && texte.trim() !== "") {
    try {
      reglages = JSON.parse(texte);
    } catch (erreur) {
      throw new ReglagesIllisibles(`ce n'est pas du JSON (${(erreur as Error).message})`);
    }
  }
  if (!estObjet(reglages)) throw new ReglagesIllisibles("le fichier n'est pas un objet JSON");
  const permissions = reglages.permissions ?? {};
  if (!estObjet(permissions)) throw new ReglagesIllisibles("« permissions » n'est pas un objet");
  const allow = permissions.allow ?? [];
  if (!Array.isArray(allow)) throw new ReglagesIllisibles("« permissions.allow » n'est pas une liste");

  const dejaLa = regles.filter((regle) => allow.includes(regle));
  const ajoutees = regles.filter((regle) => !allow.includes(regle));
  if (ajoutees.length === 0 && texte !== undefined) return { ajoutees, dejaLa };

  reglages.permissions = { ...permissions, allow: [...allow, ...ajoutees] };
  return { texte: `${JSON.stringify(reglages, null, indentation(texte))}\n`, ajoutees, dejaLa };
}

// L'indentation du fichier du chef, pour que le diff ne montre que les règles.
function indentation(texte: string | undefined): string | number {
  const lue = /^[ \t]+(?=")/m.exec(texte ?? "")?.[0];
  return lue === undefined ? 2 : lue;
}
