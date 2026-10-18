// L'état des grants d'un projet : lequel est actif, son échéance, ses derniers
// usages, et ce qu'aucun grant n'autorise. L'app le lit là où le runtime le
// montre — la sortie de `grant` (runtime/src/grant-cli.ts, `montrer`), relayée
// par l'onglet Grants comme celle des autres (onglets.ts) — et n'y lit que
// quatre choses : chaque ligne `grant <nom>`, les lignes sous `jamais accordé`,
// les lignes sous `derniers usages`, et la ligne du bilan des arrêts faute de
// grant. Rien n'y est deviné : une sortie sans ligne `grant <nom>` n'est pas
// « absent », une section absente n'est pas « aucun », et une ligne qui n'a pas
// la forme reste telle quelle, à part. Rien n'y est calculé non plus : la durée
// restante est celle que la box a comptée à l'heure de la lecture, avec son
// horloge — la seule mention d'une échéance qui ne trompe dans aucun fuseau, et
// celle qui se pose en tête. Ce que le runtime dit se pose mot pour mot ; la
// sortie entière se lit dessous.
// À côté de chaque grant, deux gestes du socle (gestes.ts) : accorder, révoquer.
// Ce module ne lance rien — il lit ce que la veille a déjà rendu.
import type { Lecture } from "./box.ts";
import { GRANTS } from "./gestes.ts";

// Sans argument : la commande montre, elle n'accorde ni ne révoque rien.
export const COMMANDE = "grant";

// Les deux gestes posés à côté de chaque grant, par leur nom dans le socle : la vue
// les nomme, avec le grant sur lequel ils portent — ce qui part se décide dans gestes.ts.
// Tous deux sont confirmés : la confirmation dit ce que le grant change (confirmation.ts).
export const GESTES_DES_GRANTS = [
  { id: "grant-activer", libelle: "enable" },
  { id: "grant-revoquer", libelle: "revoke" },
] as const;

// L'échéance d'un grant actif, telle que sa ligne l'écrit. `reste` : la durée qui lui
// reste, à l'heure de la lecture — elle se pose en tête. `jusqua` : l'instant, à l'heure
// de la box, son fuseau en lettres — il se pose ensuite.
export type Echeance = { reste: string; jusqua: string };
// `mot` : ABSENT, ACTIF, ÉTEINT SEUL ou RÉVOQUÉ, tel que le runtime l'écrit. `depuis`, `par` :
// l'instant de son dernier changement et son auteur — un grant jamais donné n'a ni l'un ni
// l'autre, un grant éteint seul n'a pas d'auteur. `bientot` : le mot du runtime pour un grant
// actif qui va s'éteindre. `limites` : ce que la ligne dit d'autre de ce qu'il en reste — ses
// usages, ou qu'il est sans échéance —, mot pour mot. `dit` : ce que la ligne dit ensuite.
export type Etat = { actif: boolean; mot: string; depuis?: string; par?: string; bientot?: string; echeance?: Echeance; limites: string[]; dit: string };
// `informe` : la ligne d'un grant dont l'état n'a pas la forme, telle quelle — ce n'est pas « absent ».
export type Grant = { action: string } & (Etat | { informe: string });
// Une action qu'aucun grant n'autorise, et la ligne qui l'interdit, mot pour mot.
export type Interdit = { action: string; dit: string };
// Un usage : l'instant, l'issue, le grant qui a servi et la branche, la PR, le commit, le verdict
// qui l'autorise, et ce que le merge est devenu (`suite`) — chacun mot pour mot.
export type Usage = { a: string; ticket: number; action: string; base: string; pr: string; commit: string; verdict: string; suite: string };
// `dit` : ce que la ligne de titre dit de la section — « aucun », quand elle n'a pas de ligne.
// `illisibles` : les lignes de la section qui n'ont pas la forme, telles quelles.
export type Section<Ligne> = { dit: string; lignes: Ligne[]; illisibles: string[] };
// Une section absente : la sortie n'a pas sa ligne de titre. `bilan` : ce que le chef a fait
// des livraisons arrêtées faute de grant, tel que le runtime l'écrit — absent tant qu'aucune ne l'a été.
export type Grants = { grants: Grant[]; interdits?: Section<Interdit>; usages?: Section<Usage>; bilan?: string };

// Les titres que `grant` écrit en tête de ligne, dans son ordre : une section va de son
// titre au suivant. Les derniers gestes ne sont pas lus.
// Le runtime les écrit en anglais depuis #932 ; une box pas encore à jour les écrit encore en français :
// les deux se lisent, sous le nom anglais.
const INTERDITS = "never granted";
const USAGES = "latest uses";
const TITRES: Readonly<Record<string, string>> = {
  [INTERDITS]: INTERDITS,
  "jamais accordé": INTERDITS,
  "latest actions": "latest actions",
  "derniers gestes": "latest actions",
  [USAGES]: USAGES,
  "derniers usages": USAGES,
};
// Un titre, complété d'espaces jusqu'à sa valeur — ou seul sur sa ligne. Rend le titre tel qu'écrit.
const titreDe = (ligne: string) => Object.keys(TITRES).find((titre) => ligne.trimEnd() === titre || ligne.startsWith(`${titre}  `));
// La ligne d'un grant : `grant <nom>`, complété d'espaces jusqu'à son état.
const TETE = /^grant (\S+) {2,}(.*)$/;
// Le bilan des arrêts faute de grant : seul sur sa ligne, en fin de sortie.
const BILANS = ["without a grant, ", "sans grant, "];

// L'état : `ABSENT — <suite>`, `ACTIVE since <instant> (by <auteur>) — <suite>`, `REVOKED`
// de même, ou `LAPSED since <instant> — <suite>`. Avant #932 : `ACTIF depuis le <instant> (par <auteur>)`,
// `RÉVOQUÉ`, `ÉTEINT SEUL`.
const ETAT = /^(ABSENT|ACTIVE|LAPSED|REVOKED|ACTIF|ÉTEINT SEUL|RÉVOQUÉ)(?: (?:since|depuis le) (\S+))?(?: \((?:by|par) (.*?)\))? — (.*)$/;
const ACTIFS = ["ACTIVE", "ACTIF"];
const ETEINTS_SEULS = ["LAPSED", "ÉTEINT SEUL"];
// Ce par quoi la suite d'un grant actif commence quand il va s'éteindre.
const BIENTOT = ["EXPIRING SOON", "BIENTÔT ÉTEINT"];
// Ce qu'il reste d'un grant actif, puis ce que cela vaut : `<reste>: <suite>` (`<reste> : <suite>` avant #932).
// Le reste est fait de mentions séparées d'un point médian ; celle de l'échéance est
// `<durée> left (until <instant>)` (`encore <durée> (jusqu'au <instant>)`).
const RESTE = /^(.*) : (.*)$|^(.*?): (.*)$/;
const ECHEANCE = /^(encore .+|.+ left) \((jusqu'au .+|until .+)\)$/;
// Une ligne de `jamais accordé` : `<action> — <ce qui est interdit>`.
const INTERDIT = /^(\S+) — (.+)$/;
// Une ligne de `latest uses` : `  <instant>  #<issue>  <grant> on <branche>  <PR>  <commit>  verdict no. <n>  <suite>` (`sur`, `n°` avant #932).
const USAGE = /^ {2}(\S+) {2}#(\d+) {2}(\S+) (?:on|sur) (\S+) {2}(\S+) {2}(\S+) {2}(verdict (?:no\.|n°) \d+) {2}(.+)$/;

// Ce que la ligne d'un grant actif dit de ce qu'il en reste : son échéance, s'il en a une en
// date, et le reste tel quel. Sans la forme, tout ce qu'elle dit reste dans `limites`, entier.
function resteDe(suite: string): Pick<Etat, "bientot" | "echeance" | "limites" | "dit"> {
  const annonce = BIENTOT.find((mot) => suite.startsWith(`${mot} — `));
  const [, resteFr, ditFr, resteEn, ditEn] = RESTE.exec(annonce === undefined ? suite : suite.slice(`${annonce} — `.length)) ?? [];
  const [reste, dit] = resteFr === undefined ? [resteEn, ditEn] : [resteFr, ditFr];
  if (reste === undefined || dit === undefined) return { limites: [suite], dit: "" };
  const mentions = reste.split(" · ");
  const rang = mentions.findIndex((mention) => ECHEANCE.test(mention));
  const [, encore, jusqua] = ECHEANCE.exec(mentions[rang] ?? "") ?? [];
  return {
    ...(annonce === undefined ? {} : { bientot: annonce }),
    ...(encore === undefined || jusqua === undefined ? {} : { echeance: { reste: encore, jusqua } }),
    limites: mentions.filter((_, i) => i !== rang),
    dit,
  };
}

function grantDe(action: string, etat: string, ligne: string): Grant {
  const [, mot, depuis, par, suite] = ETAT.exec(etat) ?? [];
  if (mot === undefined || suite === undefined) return { action, informe: ligne };
  const qui = { ...(depuis === undefined ? {} : { depuis }), ...(par === undefined ? {} : { par }) };
  // Seul un grant actif a un reste : éteint, révoqué ou absent, la suite ne dit que ce qu'il en est.
  return ACTIFS.includes(mot) ? { action, actif: true, mot, ...qui, ...resteDe(suite) } : { action, actif: false, mot, ...qui, limites: [], dit: suite };
}

// Une section telle qu'elle est écrite : ce que sa ligne de titre dit après lui, et les lignes qui la suivent.
type Ouverte = { dit: string; lignes: string[] };

// Ce que cette sortie de `grant` dit — ou en quoi elle n'en a pas la forme.
export function grantsDe(sortie: string): Grants | { informe: string } {
  const grants: Grant[] = [];
  const sections = new Map<string, Ouverte>();
  let courante: Ouverte | undefined;
  let bilan: string | undefined;
  for (const ligne of sortie.split("\n")) {
    const [, action, etat] = TETE.exec(ligne) ?? [];
    const ecrit = titreDe(ligne);
    const titre = ecrit === undefined ? undefined : TITRES[ecrit];
    // Seule sa première ligne dit un grant, ou ouvre une section : la même, plus bas, est une ligne de celle où elle tombe.
    if (action !== undefined && etat !== undefined && !grants.some((lu) => lu.action === action)) {
      grants.push(grantDe(action, etat, ligne));
      courante = undefined;
    } else if (ecrit !== undefined && titre !== undefined && !sections.has(titre)) sections.set(titre, (courante = { dit: ligne.slice(ecrit.length).trim(), lignes: [] }));
    else if (bilan === undefined && BILANS.some((debut) => ligne.startsWith(debut))) {
      bilan = ligne;
      courante = undefined;
    } else if (ligne.trim() !== "") courante?.lignes.push(ligne);
  }
  if (grants.length === 0) return { informe: "it has no `grant <name>` line" };

  const interdits = sections.get(INTERDITS);
  const usages = sections.get(USAGES);
  return {
    grants,
    ...(interdits === undefined ? {} : { interdits: interditsDe(interdits) }),
    ...(usages === undefined ? {} : { usages: usagesDe(usages, grants) }),
    ...(bilan === undefined ? {} : { bilan }),
  };
}

// La première action interdite est sur la ligne du titre, les suivantes sous elle, à son aplomb.
function interditsDe({ dit, lignes }: Ouverte): Section<Interdit> {
  const section: Section<Interdit> = { dit: "", lignes: [], illisibles: [] };
  for (const ligne of dit === "" ? lignes : [dit, ...lignes]) {
    const [, action, interdit] = INTERDIT.exec(ligne.trim()) ?? [];
    if (action !== undefined && interdit !== undefined) section.lignes.push({ action, dit: interdit });
    else section.illisibles.push(ligne);
  }
  return section;
}

// Les usages, lus un à un : ceux qui n'ont pas la forme restent à part — et celui d'un grant
// dont la sortie n'a pas la ligne aussi : il ne se rattache à rien.
function usagesDe({ dit, lignes }: Ouverte, grants: readonly Grant[]): Section<Usage> {
  const section: Section<Usage> = { dit, lignes: [], illisibles: [] };
  for (const ligne of lignes) {
    const [, a, numero, action, base, pr, commit, verdict, suite] = USAGE.exec(ligne) ?? [];
    const ticket = Number(numero);
    if (a !== undefined && action !== undefined && base !== undefined && pr !== undefined && commit !== undefined && verdict !== undefined && suite !== undefined && Number.isSafeInteger(ticket) && grants.some((lu) => lu.action === action))
      section.lignes.push({ a, ticket, action, base, pr, commit, verdict, suite });
    else section.illisibles.push(ligne);
  }
  return section;
}

// Une liste, prête à poser. `vide` : ce qui se lit à la place de ses lignes quand elle n'en a pas.
export type Liste<Ligne> = { lignes: Ligne[]; illisibles: string[]; vide?: string };
// Un grant, prêt à poser : son état et sa couleur (`ton`), ou pourquoi son état n'est pas posé
// (`sans`) — ce n'est jamais « absent » ; ses usages à lui ; et si ses deux gestes s'offrent
// (`commandable`) — le socle n'écrit que pour un grant que la doc nomme.
export type GrantVu = { action: string; commandable: boolean; usages: Liste<Usage> } & ((Etat & { ton: string }) | { sans: string });
// Ce que l'onglet Grants pose au-dessus du texte de sa lecture : la vue n'y calcule rien.
// `illisibles` : les lignes de `derniers usages` qui ne se rattachent à aucun grant, telles quelles.
// `sans` : pourquoi l'état n'est pas posé — ce n'est jamais « aucun grant actif ».
export type Vu = { projet: string; demande: number; a: string } & ({ grants: GrantVu[]; interdits: Liste<Interdit>; illisibles: string[]; bilan?: string } | { sans: string });

const PAS_LU = "the grants' state was not read: what the app got in its place is below. This is not “no active grant”";
const sansForme = (informe: string) => `the grants' state was not read in this output: ${informe}. This is not “no active grant” — it is shown below, in full`;
const sansEtat = (ligne: string) => `this grant's state was not read: its line does not have the expected form. This is neither “active” nor “absent” — “${ligne}”`;
const sansSection = (pasLu: string, titre: string, rien: string) => `${pasLu}: the output has no \`${titre}\` line. This is not “${rien}” — it is shown below, in full`;

// Un grant actif est vert ; ce qui demande un regard — il va s'éteindre, il s'est éteint seul —
// est jaune ; ce que le chef a décidé, ou jamais donné, est gris.
const ton = ({ actif, mot, bientot }: Etat) => (actif ? (bientot === undefined ? "vert" : "jaune") : ETEINTS_SEULS.includes(mot) ? "jaune" : "gris");

// Les usages d'un grant, parmi ceux que la sortie liste. Sans ligne du tout, c'est le mot du
// runtime qui se lit ; sans ligne pour lui seul, l'app dit de combien d'usages elle parle — et
// quand elle n'en a lu aucun dans ce qui est écrit, elle ne dit pas « aucun » : elle renvoie à ces lignes.
function usagesDuGrant(action: string, section: Section<Usage> | undefined): Liste<Usage> {
  if (section === undefined) return { lignes: [], illisibles: [], vide: sansSection("not read", USAGES, "none") };
  const lignes = section.lignes.filter((usage) => usage.action === action);
  if (lignes.length > 0) return { lignes, illisibles: [] };
  const autres = section.lignes.length;
  if (autres > 0) return { lignes, illisibles: [], vide: `none among the ${autres} latest uses the output lists` };
  if (section.illisibles.length > 0) return { lignes, illisibles: [], vide: "not read: none of the lines under `latest uses` has the expected form. This is not “none” — they are shown further down, as they are" };
  return { lignes, illisibles: [], ...(section.dit === "" ? {} : { vide: section.dit }) };
}

// Ce qu'une lecture de l'onglet Grants donne à poser. Ratée, ou sans la forme, elle
// ne dit rien des grants : ce que l'app a obtenu se lit dans l'onglet, comme pour les autres.
export function voir(lecture: Lecture): Vu {
  const { projet, demande, a } = lecture;
  const sortie = "erreur" in lecture ? undefined : lecture.sorties.find(({ commande }) => commande === COMMANDE)?.texte;
  if (sortie === undefined) return { projet, demande, a, sans: PAS_LU };
  const lus = grantsDe(sortie);
  if ("informe" in lus) return { projet, demande, a, sans: sansForme(lus.informe) };
  const { interdits, usages, bilan } = lus;
  return {
    projet,
    demande,
    a,
    grants: lus.grants.map((grant) => {
      const pose = { action: grant.action, commandable: GRANTS.includes(grant.action), usages: usagesDuGrant(grant.action, usages) };
      return "informe" in grant ? { ...pose, sans: sansEtat(grant.informe) } : { ...grant, ...pose, ton: ton(grant) };
    }),
    interdits: interdits === undefined ? { lignes: [], illisibles: [], vide: sansSection("not read", INTERDITS, "nothing") } : { lignes: interdits.lignes, illisibles: interdits.illisibles },
    illisibles: usages?.illisibles ?? [],
    ...(bilan === undefined ? {} : { bilan }),
  };
}
