// Le closer d'un projet, sur Kitchen > Health (#2491, épique #2484) : ce qu'il a fait — ses passes et ce que chacune a
// retiré —, ce qu'il vérifie en premier sur ce projet, ce que le chef lui demande de vérifier en plus, et ses réglages.
// Tout se lit et s'écrit sur GitHub, par l'API REST et le jeton du `gh` de ce poste, comme les plafonds de durée
// (plafonds-duree.ts) : ni box, ni PR.
//
// - **Ses passes** : le closer passe sur GitHub (#2361, runtime/src/closer-github-passe/) — une passe est une issue
//   `fire`, au titre `Closing pass on …` et au corps marqué `<!-- brigade:fermeture sha=<base> -->`, qu'un cook cuit
//   comme un ticket, sur sa branche `cook/<n>-…`. Ce qu'elle a retiré, c'est la PR de cette branche, mergée : ses
//   lignes retirées et ajoutées, telles que GitHub les compte.
// - **Ce qu'il vérifie en premier** : ce que la dernière passe lui a remis, lu dans le corps de son issue — le code mort
//   et les doublons repérés sur la base, la dérive des derniers merges, le temps des tickets.
// - **Ce qu'il vérifie en plus** : une ligne par vérification, dans `.claude/brigade/closer-checks.md` du dépôt. Le
//   runtime ne les met pas encore dans l'issue d'une passe : elles attendent
//   dans le dépôt.
// - **Ses réglages** : `closer.*` de `.claude/brigade/projet.json` (runtime/src/reglages-projet/reglages.ts) — son
//   calibrage, sa condition de départ, ses plafonds ; le runtime les relit à chaque rapatriement. Sur GitHub, seuls le
//   calibrage et le plafond des lignes retirées sont lus (docs/reglages.md) : la page le dit.
//
// Ce module compose les demandes ; ce qui les porte est donné (`ClientDeLaPriorite`).
import { ecrireLeFichier, FICHIER as PROJET_JSON, lireLeFichier } from "./plafonds-duree.ts";
import type { ClientDeLaPriorite } from "./priorite.ts";
import { EFFORTS, MODELES } from "./projets/projets.ts";
import { refusDe } from "./tableau/client.ts";

// --- Les réglages ------------------------------------------------------------------

// Les réglages du closer, dans l'ordre où la page les montre. `defaut` : ce que le runtime prend quand ni le dépôt ni la
// station n'en disent rien (runtime/src/closing/settings.ts) ; le calibrage n'en a pas. `surGithub` : le closer sur
// GitHub le lit (closer-github-passe.ts ne lit que `calibration` et `removedLines`).
export const REGLAGES = [
  { cle: "calibration", nom: "Calibration", unite: "", defaut: null, surGithub: true },
  { cle: "cooksBelow", nom: "Start condition", unite: "cooks in flight", defaut: 1, surGithub: false },
  { cle: "maxTokens", nom: "Tokens cap", unite: "tokens", defaut: 500_000, surGithub: false },
  { cle: "maxRemovedLines", nom: "Removed lines cap", unite: "lines", defaut: 500, surGithub: true },
] as const satisfies readonly { cle: string; nom: string; unite: string; defaut: number | null; surGithub: boolean }[];
export type CleDuCloser = (typeof REGLAGES)[number]["cle"];
export type Calibrage = { model: string; effort: string };
export type ReglageLu = { cle: CleDuCloser; nom: string; unite: string; defaut: number | null; surGithub: boolean; valeur: number | Calibrage | null };

// --- Les vérifications en plus -----------------------------------------------------

export const VERIFICATIONS = ".claude/brigade/closer-checks.md";
export const LONGUEUR_MAX = 200;
const ENTETE = [
  "# The closer's extra checks",
  "",
  "What the chef asks the closer to check in addition to its own, one per line — written from the app (Kitchen > Health).",
  "",
];

// --- Les passes --------------------------------------------------------------------

// Combien de passes la page montre, les plus récentes.
export const PASSES = 5;
const MARQUE = /^\s*<!--\s*brigade:fermeture(?:\s+sha=([0-9a-f]*))?\s*-->\s*$/m;
// Les auteurs dont le runtime croit une marque (runtime/src/alimenter.ts, `DE_CONFIANCE`).
const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];

export type Candidat = { id: string; quoi: string };
export type PrDeLaPasse = { numero: number; url: string; mergee: boolean; retirees: number; ajoutees: number };
export type PasseLue = {
  numero: number;
  url: string;
  ouverteLe: string;
  ouverte: boolean;
  sha: string;
  candidats: Candidat[];
  // Ceux qui dépassaient une passe, laissés à la suivante.
  restants: number;
  derive: string[];
  temps: string[];
  pr: PrDeLaPasse | null;
};

// --- La lecture --------------------------------------------------------------------

type Ou<T> = T | { sans: string; detail?: string };
export type LectureDuCloser = { reglages: Ou<{ liste: ReglageLu[] }>; verifications: Ou<{ liste: string[] }>; passes: Ou<{ liste: PasseLue[] }> };
// Ce qu'une écriture a rendu : la valeur écrite (null : retirée) ou la liste des vérifications, ou pourquoi rien n'a changé.
export type RenduDuReglage = { fait: string; cle: CleDuCloser; valeur: number | Calibrage | null } | { refus: string; detail?: string };
export type RenduDesVerifications = { fait: string; liste: string[] } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const reglageDe = (cle: unknown) => REGLAGES.find((reglage) => reglage.cle === cle);
const estCalibrage = (valeur: unknown): valeur is Calibrage =>
  estObjet(valeur) && (MODELES as readonly unknown[]).includes(valeur.model) && (EFFORTS as readonly unknown[]).includes(valeur.effort);
const estEntier = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur > 0;

const reglagesDe = (contenu: Record<string, unknown> | null): ReglageLu[] => {
  const closer = contenu !== null && estObjet(contenu.closer) ? contenu.closer : {};
  return REGLAGES.map(({ cle, nom, unite, defaut, surGithub }) => {
    const pose = closer[cle];
    const valeur = cle === "calibration" ? (estCalibrage(pose) ? { model: pose.model, effort: pose.effort } : null) : estEntier(pose) ? pose : null;
    return { cle, nom, unite, defaut, surGithub, valeur };
  });
};

// Le fichier des vérifications : chaque ligne `- …` en est une, le reste est son en-tête.
export const verificationsDu = (texte: string): string[] => texte.split(/\r?\n/).flatMap((ligne) => (/^\s*[-*]\s+\S/.test(ligne) ? [ligne.replace(/^\s*[-*]\s+/, "").trim()] : []));
export const texteDesVerifications = (liste: readonly string[]): string => [...ENTETE, ...liste.map((verification) => `- ${verification}`), ""].join("\n");

type MarkdownLu = { texte: string; sha: string } | { texte: null; sha: null };
async function lireLeMarkdown(client: ClientDeLaPriorite, depot: string, branche: string | null): Promise<MarkdownLu> {
  const lu = await client.lire(`/repos/${depot}/contents/${VERIFICATIONS}${branche === null ? "" : `?ref=${encodeURIComponent(branche)}`}`);
  if (lu.status === 404) return { texte: null, sha: null };
  if (lu.status !== 200) throw refusDe(`the reading of ${VERIFICATIONS}`, lu);
  const { content, sha } = estObjet(lu.data) ? lu.data : {};
  if (typeof content !== "string" || typeof sha !== "string") throw new Error(`GitHub gave ${VERIFICATIONS} without its content`);
  return { texte: Buffer.from(content, "base64").toString("utf8"), sha };
}

// Les sections `## …` d'un corps d'issue, chacune avec ses lignes.
function sections(corps: string): Map<string, string[]> {
  const lues = new Map<string, string[]>();
  let courante: string[] | null = null;
  for (const ligne of corps.split(/\r?\n/)) {
    const titre = /^##\s+(.+?)\s*$/.exec(ligne);
    if (titre !== null) {
      courante = [];
      lues.set(titre[1] ?? "", courante);
    } else if (courante !== null) courante.push(ligne);
  }
  return lues;
}

// Ce que l'issue d'une passe a remis au closer, tel que closer-github-passe.ts l'écrit (`corpsDeLaFermeture`).
export function lirePasse(issue: { number: number; html_url?: string; created_at: string; state: string; body: string }): Omit<PasseLue, "pr"> | null {
  const marque = MARQUE.exec(issue.body);
  if (marque === null) return null;
  const lues = sections(issue.body);
  const candidatsLus = lues.get("Candidates") ?? [];
  const candidats = candidatsLus.flatMap((ligne) => {
    const lu = /^- ([DM]\d+) — (.+)$/.exec(ligne.trim());
    return lu === null ? [] : [{ id: lu[1] ?? "", quoi: lu[2] ?? "" }];
  });
  const restants = Number(/^(\d+) more are left for a next pass\.$/m.exec(candidatsLus.join("\n"))?.[1] ?? 0);
  const derive = (lues.get("Drift") ?? []).flatMap((ligne) => (/^- last \d+ merges: /.test(ligne.trim()) ? [ligne.trim().slice(2)] : []));
  const temps = (lues.get("Times") ?? []).map((ligne) => ligne.trim()).filter((ligne) => ligne !== "");
  return { numero: issue.number, url: issue.html_url ?? "", ouverteLe: issue.created_at, ouverte: issue.state === "open", sha: marque[1] ?? "", candidats, restants, derive, temps };
}

// Les passes : les issues au titre de la fermeture, cherchées sur GitHub, gardées quand leur corps porte la marque d'un
// auteur de confiance — comme le runtime les retrouve —, les plus récentes d'abord ; puis la PR de chacune.
async function lirePasses(client: ClientDeLaPriorite, depot: string): Promise<PasseLue[]> {
  const q = `repo:${depot} is:issue in:title "Closing pass on"`;
  const cherche = await client.lire(`/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=${PASSES * 2}`);
  if (cherche.status !== 200) throw refusDe("the search of the closing passes", cherche);
  const items = estObjet(cherche.data) && Array.isArray(cherche.data.items) ? cherche.data.items : [];
  const passes = items
    .flatMap((item: unknown) => {
      if (!estObjet(item) || item.pull_request !== undefined || !DE_CONFIANCE.includes(String(item.author_association))) return [];
      const { number, html_url, created_at, state, body } = item;
      if (typeof number !== "number" || typeof created_at !== "string" || typeof body !== "string") return [];
      const lue = lirePasse({ number, created_at, state: String(state), body, ...(typeof html_url === "string" ? { html_url } : {}) });
      return lue === null ? [] : [lue];
    })
    .sort((a, b) => b.numero - a.numero)
    .slice(0, PASSES);
  const [proprietaire] = depot.split("/");
  return Promise.all(passes.map(async (passe) => ({ ...passe, pr: await prDe(client, depot, proprietaire ?? "", passe.numero) })));
}

// La PR d'une passe : celle de sa branche `cook/<n>-…`, la mergée d'abord, puis la plus récente — ses lignes dans son détail.
async function prDe(client: ClientDeLaPriorite, depot: string, proprietaire: string, numero: number): Promise<PrDeLaPasse | null> {
  const listees = await client.lire(`/repos/${depot}/pulls?state=all&head=${encodeURIComponent(`${proprietaire}:cook/${numero}-github`)}&per_page=10`);
  if (listees.status !== 200) throw refusDe(`the reading of the pull requests of #${numero}`, listees);
  const prs = (Array.isArray(listees.data) ? listees.data : []).filter(estObjet).filter((pr) => typeof pr.number === "number");
  const pr = prs.find((une) => typeof une.merged_at === "string") ?? prs.sort((a, b) => Number(b.number) - Number(a.number))[0];
  if (pr === undefined) return null;
  const detail = await client.lire(`/repos/${depot}/pulls/${String(pr.number)}`);
  if (detail.status !== 200) throw refusDe(`the reading of pull request #${String(pr.number)}`, detail);
  const lu = estObjet(detail.data) ? detail.data : {};
  return {
    numero: Number(pr.number),
    url: typeof lu.html_url === "string" ? lu.html_url : typeof pr.html_url === "string" ? pr.html_url : "",
    mergee: lu.merged === true || typeof lu.merged_at === "string",
    retirees: typeof lu.deletions === "number" ? lu.deletions : 0,
    ajoutees: typeof lu.additions === "number" ? lu.additions : 0,
  };
}

// Tout le bloc : les trois lectures, chacune pour soi — l'une qui échoue ne retire pas les autres.
export async function lireLeCloser({ depot, branche, client }: { depot: string; branche: string | null; client: ClientDeLaPriorite }): Promise<LectureDuCloser> {
  const [reglages, verifications, passes] = await Promise.all([
    lireLeFichier(client, depot, branche).then(
      ({ contenu }) => ({ liste: reglagesDe(contenu) }),
      (erreur) => ({ sans: "the closer's settings unavailable", detail: message(erreur) }),
    ),
    lireLeMarkdown(client, depot, branche).then(
      ({ texte }) => ({ liste: texte === null ? [] : verificationsDu(texte) }),
      (erreur) => ({ sans: "extra checks unavailable", detail: message(erreur) }),
    ),
    lirePasses(client, depot).then(
      (liste) => ({ liste }),
      (erreur) => ({ sans: "the closer's passes unavailable", detail: message(erreur) }),
    ),
  ]);
  return { reglages, verifications, passes };
}

// --- Les écritures -----------------------------------------------------------------

// La valeur qu'un réglage propose, ou pourquoi elle n'en est pas une. Vide, il se retire du dépôt : le calibrage, quand
// le modèle et l'effort le sont tous deux.
export function valeurProposee(cle: CleDuCloser, saisie: unknown): { valeur: number | Calibrage | null } | { refus: string } {
  if (cle === "calibration") {
    const { model, effort } = estObjet(saisie) ? saisie : {};
    const m = typeof model === "string" ? model.trim() : "";
    const e = typeof effort === "string" ? effort.trim() : "";
    if (m === "" && e === "") return { valeur: null };
    if (m === "" || e === "") return { refus: "the model and the effort are chosen together: one without the other makes the start be refused" };
    const calibrage = { model: m, effort: e };
    return estCalibrage(calibrage) ? { valeur: calibrage } : { refus: `the calibration must be one of ${MODELES.join(", ")} and one of ${EFFORTS.join(", ")}` };
  }
  const texte = typeof saisie === "number" ? String(saisie) : typeof saisie === "string" ? saisie.trim() : "";
  if (texte === "") return { valeur: null };
  const nombre = /^[0-9]+$/.test(texte) ? Number(texte) : Number.NaN;
  return estEntier(nombre) ? { valeur: nombre } : { refus: `${(reglageDe(cle)?.nom ?? cle).toLowerCase()} must be a whole number greater than zero` };
}

const memeValeur = (a: unknown, b: number | Calibrage | null) =>
  b === null ? a === undefined : typeof b === "number" ? a === b : estObjet(a) && a.model === b.model && a.effort === b.effort;
const ditLaValeur = (valeur: number | Calibrage) => (typeof valeur === "number" ? String(valeur) : `${valeur.model} / ${valeur.effort}`);

// Change un réglage du closer dans le dépôt : `projet.json` relu — son dernier état, son `sha` —, la seule clé
// `closer.<cle>` changée, le reste gardé tel quel. Sans fichier, il est créé, quand la branche est connue.
export async function changerLeReglage({ depot, branche, cle, saisie, client }: { depot: string; branche: string | null; cle: unknown; saisie: unknown; client: ClientDeLaPriorite }): Promise<RenduDuReglage> {
  const reglage = reglageDe(cle);
  if (reglage === undefined) return { refus: `nothing was changed: ${String(cle)} is not a setting of the closer` };
  const propose = valeurProposee(reglage.cle, saisie);
  if ("refus" in propose) return { refus: `nothing was changed: ${propose.refus}` };
  let lu: Awaited<ReturnType<typeof lireLeFichier>>;
  try {
    lu = await lireLeFichier(client, depot, branche);
  } catch (erreur) {
    return { refus: `nothing was changed: ${PROJET_JSON} was not read on GitHub`, detail: message(erreur) };
  }
  if (lu.contenu === null && branche === null) return { refus: `nothing was changed: ${depot} has no ${PROJET_JSON} and its integration branch is not known`, detail: "" };
  const contenu: Record<string, unknown> = lu.contenu ?? { version: 1, integrationBranch: branche };
  const avant = estObjet(contenu.closer) ? contenu.closer : {};
  if (memeValeur(avant[reglage.cle], propose.valeur)) return { fait: "unchanged: the repository already says so", cle: reglage.cle, valeur: propose.valeur };
  const closer: Record<string, unknown> = { ...avant };
  if (propose.valeur === null) delete closer[reglage.cle];
  else closer[reglage.cle] = propose.valeur;
  if (Object.keys(closer).length === 0) delete contenu.closer;
  else contenu.closer = closer;
  const dit = propose.valeur === null ? `remove closer.${reglage.cle}` : `set closer.${reglage.cle} to ${ditLaValeur(propose.valeur)}`;
  try {
    await ecrireLeFichier(client, depot, branche, { contenu, sha: lu.sha, dit });
  } catch (erreur) {
    return { refus: `nothing was changed: GitHub did not write ${PROJET_JSON}`, detail: message(erreur) };
  }
  return { fait: "saved in the repository — the station applies it at its next fetch", cle: reglage.cle, valeur: propose.valeur };
}

// Une vérification, telle que le chef la tape, ou pourquoi elle n'en est pas une : une ligne, sans en-tête.
export function verificationProposee(saisie: unknown): { verification: string } | { refus: string } {
  const texte = typeof saisie === "string" ? saisie.trim().replace(/\s+/g, " ") : "";
  if (texte === "") return { refus: "say what the closer should check" };
  if (texte.length > LONGUEUR_MAX) return { refus: `a check holds in ${LONGUEUR_MAX} characters at most` };
  return { verification: texte };
}

// Ajoute une vérification au fichier du dépôt — ou en retire une. Le fichier est relu pour son `sha` ; sans lui, il est
// créé. Une vérification déjà là n'est pas ajoutée deux fois.
export async function changerLesVerifications({ depot, branche, geste, saisie, client }: { depot: string; branche: string | null; geste: unknown; saisie: unknown; client: ClientDeLaPriorite }): Promise<RenduDesVerifications> {
  if (geste !== "ajouter" && geste !== "retirer") return { refus: "nothing was changed: the action is neither to add nor to remove a check" };
  const propose = verificationProposee(saisie);
  if ("refus" in propose) return { refus: `nothing was changed: ${propose.refus}` };
  let lu: MarkdownLu;
  try {
    lu = await lireLeMarkdown(client, depot, branche);
  } catch (erreur) {
    return { refus: `nothing was changed: ${VERIFICATIONS} was not read on GitHub`, detail: message(erreur) };
  }
  const avant = lu.texte === null ? [] : verificationsDu(lu.texte);
  const deja = avant.includes(propose.verification);
  if (geste === "ajouter" && deja) return { fait: "unchanged: the closer already has this check", liste: avant };
  if (geste === "retirer" && !deja) return { fait: "unchanged: the closer does not have this check", liste: avant };
  const apres = geste === "ajouter" ? [...avant, propose.verification] : avant.filter((verification) => verification !== propose.verification);
  try {
    const ecrit = await client.ecrire("PUT", `/repos/${depot}/contents/${VERIFICATIONS}`, {
      message: `brigade: ${geste === "ajouter" ? "add" : "remove"} a check of the closer (from the app, Kitchen > Health)`,
      content: Buffer.from(texteDesVerifications(apres), "utf8").toString("base64"),
      ...(lu.sha === null ? {} : { sha: lu.sha }),
      ...(branche === null ? {} : { branch: branche }),
    });
    if (ecrit.status !== 200 && ecrit.status !== 201) throw refusDe(`the change of ${VERIFICATIONS}`, ecrit);
  } catch (erreur) {
    return { refus: `nothing was changed: GitHub did not write ${VERIFICATIONS}`, detail: message(erreur) };
  }
  return { fait: geste === "ajouter" ? "added in the repository" : "removed from the repository", liste: apres };
}
