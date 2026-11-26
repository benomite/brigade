// Le closer d'un projet, sur Kitchen > Health (#2491, épique #2484) : ce qu'il a fait — ses passes et ce que chacune a
// retiré —, ce qu'il vérifie en premier sur ce projet, ce que le chef lui demande de vérifier en plus, et ses réglages.
// Tout se lit et s'écrit sur GitHub, par l'API REST et le jeton du `gh` de ce poste, comme les plafonds de durée
// (caps-duree.ts) : ni box. Ses réglages, gardés dans `projet.json`, et ses vérifications en plus, gardées dans
// `closer-checks.md`, s'y proposent par une pull request (#2920).
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
import { FICHIER as PROJECT_JSON, lireLeFichier, type PrOuverte, proposerLeFichier, texteDuFichier } from "./caps-duree.ts";
import type { ClientDeLaPriority } from "./priority.ts";
import { PROPOSE } from "./settings-du-project.ts";
import { EFFORTS, MODELES } from "./projects/projects.ts";
import { refusalDe } from "./tableau/client.ts";

// --- Les réglages ------------------------------------------------------------------

// Les réglages du closer, dans l'ordre où la page les montre. `defaut` : ce que le runtime prend quand ni le dépôt ni la
// station n'en disent rien (runtime/src/closing/settings.ts) ; le calibrage n'en a pas. `surGithub` : le closer sur
// GitHub le lit (closer-github-passe.ts ne lit que `calibration` et `removedLines`).
export const SETTINGS = [
  { cle: "calibration", nom: "Calibration", unite: "", defaut: null, surGithub: true },
  { cle: "cooksBelow", nom: "Start condition", unite: "cooks in flight", defaut: 1, surGithub: false },
  { cle: "maxTokens", nom: "Tokens cap", unite: "tokens", defaut: 500_000, surGithub: false },
  { cle: "maxRemovedLines", nom: "Removed lines cap", unite: "lines", defaut: 500, surGithub: true },
] as const satisfies readonly { cle: string; nom: string; unite: string; defaut: number | null; surGithub: boolean }[];
export type CleDuCloser = (typeof SETTINGS)[number]["cle"];
export type Calibration = { model: string; effort: string };
export type SettingLu = { cle: CleDuCloser; nom: string; unite: string; defaut: number | null; surGithub: boolean; valeur: number | Calibration | null };

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
export type PrDeLaPass = { numero: number; url: string; mergee: boolean; retirees: number; ajoutees: number };
export type PassLue = {
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
  pr: PrDeLaPass | null;
};

// --- La lecture --------------------------------------------------------------------

type Ou<T> = T | { sans: string; detail?: string };
export type ReadDuCloser = { reglages: Ou<{ liste: SettingLu[] }>; verifications: Ou<{ liste: string[] }>; passes: Ou<{ liste: PassLue[] }> };
// Ce qu'une écriture a rendu : la valeur écrite (null : retirée) ou la liste des vérifications, ou pourquoi rien n'a changé.
export type RenduDuSetting =
  | ({ propose: string; cle: CleDuCloser; valeur: number | Calibration | null } & PrOuverte)
  | { fait: string; cle: CleDuCloser; valeur: number | Calibration | null }
  | { refus: string; detail?: string };
// Ce qu'un geste sur les vérifications a rendu : la PR qui le propose — la vérification, et la liste en vigueur, qui ne
// change qu'au merge —, la liste déjà telle quelle, ou pourquoi rien n'a changé.
export type RenduDesVerifications =
  | ({ propose: string; geste: "ajouter" | "retirer"; verification: string; liste: string[] } & PrOuverte)
  | { fait: string; liste: string[] }
  | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const settingDe = (cle: unknown) => SETTINGS.find((setting) => setting.cle === cle);
const estCalibration = (valeur: unknown): valeur is Calibration =>
  estObjet(valeur) && (MODELES as readonly unknown[]).includes(valeur.model) && (EFFORTS as readonly unknown[]).includes(valeur.effort);
const estEntier = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur > 0;

const settingsDe = (contenu: Record<string, unknown> | null): SettingLu[] => {
  const closer = contenu !== null && estObjet(contenu.closer) ? contenu.closer : {};
  return SETTINGS.map(({ cle, nom: name, unite, defaut, surGithub }) => {
    const pose = closer[cle];
    const valeur = cle === "calibration" ? (estCalibration(pose) ? { model: pose.model, effort: pose.effort } : null) : estEntier(pose) ? pose : null;
    return { cle, nom: name, unite, defaut, surGithub, valeur };
  });
};

// Le fichier des vérifications : chaque ligne `- …` en est une, le reste est son en-tête.
export const verificationsDu = (texte: string): string[] => texte.split(/\r?\n/).flatMap((line) => (/^\s*[-*]\s+\S/.test(line) ? [line.replace(/^\s*[-*]\s+/, "").trim()] : []));
export const texteDesVerifications = (liste: readonly string[]): string => [...ENTETE, ...liste.map((verification) => `- ${verification}`), ""].join("\n");

// Un fichier texte du dépôt (`chemin`, celui des vérifications par défaut ; le savoir-faire du projet, #4239) : son texte
// et son `sha`, ou null quand la branche ne l'a pas.
export type MarkdownLu = { texte: string; sha: string } | { texte: null; sha: null };
export async function lireLeMarkdown(client: ClientDeLaPriority, repository: string, branch: string | null, chemin: string = VERIFICATIONS): Promise<MarkdownLu> {
  const lu = await client.lire(`/repos/${repository}/contents/${chemin}${branch === null ? "" : `?ref=${encodeURIComponent(branch)}`}`);
  if (lu.status === 404) return { texte: null, sha: null };
  if (lu.status !== 200) throw refusalDe(`the reading of ${chemin}`, lu);
  const { content, sha } = estObjet(lu.data) ? lu.data : {};
  if (typeof content !== "string" || typeof sha !== "string") throw new Error(`GitHub gave ${chemin} without its content`);
  return { texte: Buffer.from(content, "base64").toString("utf8"), sha };
}

// Les sections `## …` d'un corps d'issue, chacune avec ses lignes.
function sections(corps: string): Map<string, string[]> {
  const lues = new Map<string, string[]>();
  let courante: string[] | null = null;
  for (const line of corps.split(/\r?\n/)) {
    const titre = /^##\s+(.+?)\s*$/.exec(line);
    if (titre !== null) {
      courante = [];
      lues.set(titre[1] ?? "", courante);
    } else if (courante !== null) courante.push(line);
  }
  return lues;
}

// Ce que l'issue d'une passe a remis au closer, tel que closer-github-passe.ts l'écrit (`corpsDeLaFermeture`).
export function lirePass(issue: { number: number; html_url?: string; created_at: string; state: string; body: string }): Omit<PassLue, "pr"> | null {
  const marque = MARQUE.exec(issue.body);
  if (marque === null) return null;
  const lues = sections(issue.body);
  const candidatsLus = lues.get("Candidates") ?? [];
  const candidats = candidatsLus.flatMap((line) => {
    const lu = /^- ([DM]\d+) — (.+)$/.exec(line.trim());
    return lu === null ? [] : [{ id: lu[1] ?? "", quoi: lu[2] ?? "" }];
  });
  const restants = Number(/^(\d+) more are left for a next pass\.$/m.exec(candidatsLus.join("\n"))?.[1] ?? 0);
  const drift = (lues.get("Drift") ?? []).flatMap((line) => (/^- last \d+ merges: /.test(line.trim()) ? [line.trim().slice(2)] : []));
  const time = (lues.get("Times") ?? []).map((line) => line.trim()).filter((line) => line !== "");
  return { numero: issue.number, url: issue.html_url ?? "", ouverteLe: issue.created_at, ouverte: issue.state === "open", sha: marque[1] ?? "", candidats, restants, derive: drift, temps: time };
}

// Les passes : les issues au titre de la fermeture, cherchées sur GitHub, gardées quand leur corps porte la marque d'un
// auteur de confiance — comme le runtime les retrouve —, les plus récentes d'abord ; puis la PR de chacune.
async function lirePasses(client: ClientDeLaPriority, repository: string): Promise<PassLue[]> {
  const q = `repo:${repository} is:issue in:title "Closing pass on"`;
  const cherche = await client.lire(`/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=${PASSES * 2}`);
  if (cherche.status !== 200) throw refusalDe("the search of the closing passes", cherche);
  const items = estObjet(cherche.data) && Array.isArray(cherche.data.items) ? cherche.data.items : [];
  const passes = items
    .flatMap((item: unknown) => {
      if (!estObjet(item) || item.pull_request !== undefined || !DE_CONFIANCE.includes(String(item.author_association))) return [];
      const { number, html_url, created_at, state, body } = item;
      if (typeof number !== "number" || typeof created_at !== "string" || typeof body !== "string") return [];
      const lue = lirePass({ number, created_at, state: String(state), body, ...(typeof html_url === "string" ? { html_url } : {}) });
      return lue === null ? [] : [lue];
    })
    .sort((a, b) => b.numero - a.numero)
    .slice(0, PASSES);
  const [proprietaire] = repository.split("/");
  return Promise.all(passes.map(async (pass) => ({ ...pass, pr: await prDe(client, repository, proprietaire ?? "", pass.numero) })));
}

// La PR d'une passe : celle de sa branche `cook/<n>-…`, la mergée d'abord, puis la plus récente — ses lignes dans son détail.
async function prDe(client: ClientDeLaPriority, repository: string, proprietaire: string, numero: number): Promise<PrDeLaPass | null> {
  const listees = await client.lire(`/repos/${repository}/pulls?state=all&head=${encodeURIComponent(`${proprietaire}:cook/${numero}-github`)}&per_page=10`);
  if (listees.status !== 200) throw refusalDe(`the reading of the pull requests of #${numero}`, listees);
  const prs = (Array.isArray(listees.data) ? listees.data : []).filter(estObjet).filter((pr) => typeof pr.number === "number");
  const pr = prs.find((une) => typeof une.merged_at === "string") ?? prs.sort((a, b) => Number(b.number) - Number(a.number))[0];
  if (pr === undefined) return null;
  const detail = await client.lire(`/repos/${repository}/pulls/${String(pr.number)}`);
  if (detail.status !== 200) throw refusalDe(`the reading of pull request #${String(pr.number)}`, detail);
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
export async function lireLeCloser({ depot: repository, branche: branch, client }: { depot: string; branche: string | null; client: ClientDeLaPriority }): Promise<ReadDuCloser> {
  const [settings, verifications, passes] = await Promise.all([
    lireLeFichier(client, repository, branch).then(
      ({ contenu }) => ({ liste: settingsDe(contenu) }),
      (error) => ({ sans: "the closer's settings unavailable", detail: message(error) }),
    ),
    lireLeMarkdown(client, repository, branch).then(
      ({ texte }) => ({ liste: texte === null ? [] : verificationsDu(texte) }),
      (error) => ({ sans: "extra checks unavailable", detail: message(error) }),
    ),
    lirePasses(client, repository).then(
      (liste) => ({ liste }),
      (error) => ({ sans: "the closer's passes unavailable", detail: message(error) }),
    ),
  ]);
  return { reglages: settings, verifications, passes };
}

// --- Les écritures -----------------------------------------------------------------

// La valeur qu'un réglage propose, ou pourquoi elle n'en est pas une. Vide, il se retire du dépôt : le calibrage, quand
// le modèle et l'effort le sont tous deux.
export function valeurProposee(cle: CleDuCloser, saisie: unknown): { valeur: number | Calibration | null } | { refus: string } {
  if (cle === "calibration") {
    const { model, effort } = estObjet(saisie) ? saisie : {};
    const m = typeof model === "string" ? model.trim() : "";
    const e = typeof effort === "string" ? effort.trim() : "";
    if (m === "" && e === "") return { valeur: null };
    if (m === "" || e === "") return { refus: "the model and the effort are chosen together: one without the other makes the start be refused" };
    const calibration = { model: m, effort: e };
    return estCalibration(calibration) ? { valeur: calibration } : { refus: `the calibration must be one of ${MODELES.join(", ")} and one of ${EFFORTS.join(", ")}` };
  }
  const texte = typeof saisie === "number" ? String(saisie) : typeof saisie === "string" ? saisie.trim() : "";
  if (texte === "") return { valeur: null };
  const nombre = /^[0-9]+$/.test(texte) ? Number(texte) : Number.NaN;
  return estEntier(nombre) ? { valeur: nombre } : { refus: `${(settingDe(cle)?.nom ?? cle).toLowerCase()} must be a whole number greater than zero` };
}

const memeValeur = (a: unknown, b: number | Calibration | null) =>
  b === null ? a === undefined : typeof b === "number" ? a === b : estObjet(a) && a.model === b.model && a.effort === b.effort;
const ditLaValeur = (valeur: number | Calibration) => (typeof valeur === "number" ? String(valeur) : `${valeur.model} / ${valeur.effort}`);

// Change un réglage du closer dans le dépôt : `projet.json` relu — son dernier état, son `sha` —, la seule clé
// `closer.<cle>` changée, le reste gardé tel quel, puis proposé par une pull request vers la branche d'intégration. Sans
// fichier, il est créé, quand la branche est connue.
export async function changerLeSetting({ depot: repository, branche: branch, cle, saisie, client }: { depot: string; branche: string | null; cle: unknown; saisie: unknown; client: ClientDeLaPriority }): Promise<RenduDuSetting> {
  const setting = settingDe(cle);
  if (setting === undefined) return { refus: `nothing was changed: ${String(cle)} is not a setting of the closer` };
  const propose = valeurProposee(setting.cle, saisie);
  if ("refus" in propose) return { refus: `nothing was changed: ${propose.refus}` };
  let lu: Awaited<ReturnType<typeof lireLeFichier>>;
  try {
    lu = await lireLeFichier(client, repository, branch);
  } catch (error) {
    return { refus: `nothing was changed: ${PROJECT_JSON} was not read on GitHub`, detail: message(error) };
  }
  if (lu.contenu === null && branch === null) return { refus: `nothing was changed: ${repository} has no ${PROJECT_JSON} and its integration branch is not known`, detail: "" };
  const contenu: Record<string, unknown> = lu.contenu ?? { version: 1, integrationBranch: branch };
  const avant = estObjet(contenu.closer) ? contenu.closer : {};
  if (memeValeur(avant[setting.cle], propose.valeur)) return { fait: "unchanged: the repository already says so", cle: setting.cle, valeur: propose.valeur };
  const closer: Record<string, unknown> = { ...avant };
  if (propose.valeur === null) delete closer[setting.cle];
  else closer[setting.cle] = propose.valeur;
  if (Object.keys(closer).length === 0) delete contenu.closer;
  else contenu.closer = closer;
  const dit = propose.valeur === null ? `remove closer.${setting.cle}` : `set closer.${setting.cle} to ${ditLaValeur(propose.valeur)}`;
  try {
    const ouverte = await proposerLeFichier(client, repository, branch, { texte: texteDuFichier(contenu), sha: lu.sha, dit, ou: "Kitchen > Health" });
    return { propose: PROPOSE, ...ouverte, cle: setting.cle, valeur: propose.valeur };
  } catch (error) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${PROJECT_JSON}`, detail: message(error) };
  }
}

// Une vérification, telle que le chef la tape, ou pourquoi elle n'en est pas une : une ligne, sans en-tête.
export function verificationProposee(saisie: unknown): { verification: string } | { refus: string } {
  const texte = typeof saisie === "string" ? saisie.trim().replace(/\s+/g, " ") : "";
  if (texte === "") return { refus: "say what the closer should check" };
  if (texte.length > LONGUEUR_MAX) return { refus: `a check holds in ${LONGUEUR_MAX} characters at most` };
  return { verification: texte };
}

// Ajoute une vérification au fichier du dépôt — ou en retire une —, proposé par une pull request vers la branche
// d'intégration (#2920) : rien n'y change avant le merge, et la liste rendue reste celle en vigueur. Le fichier est relu
// pour son `sha` ; sans lui, il est créé. Une vérification déjà là n'est pas ajoutée deux fois.
export async function changerLesVerifications({ depot: repository, branche: branch, geste: action, saisie, client }: { depot: string; branche: string | null; geste: unknown; saisie: unknown; client: ClientDeLaPriority }): Promise<RenduDesVerifications> {
  if (action !== "ajouter" && action !== "retirer") return { refus: "nothing was changed: the action is neither to add nor to remove a check" };
  const propose = verificationProposee(saisie);
  if ("refus" in propose) return { refus: `nothing was changed: ${propose.refus}` };
  let lu: MarkdownLu;
  try {
    lu = await lireLeMarkdown(client, repository, branch);
  } catch (error) {
    return { refus: `nothing was changed: ${VERIFICATIONS} was not read on GitHub`, detail: message(error) };
  }
  const avant = lu.texte === null ? [] : verificationsDu(lu.texte);
  const deja = avant.includes(propose.verification);
  if (action === "ajouter" && deja) return { fait: "unchanged: the closer already has this check", liste: avant };
  if (action === "retirer" && !deja) return { fait: "unchanged: the closer does not have this check", liste: avant };
  const apres = action === "ajouter" ? [...avant, propose.verification] : avant.filter((verification) => verification !== propose.verification);
  const dit = `${action === "ajouter" ? "add" : "remove"} a check of the closer`;
  try {
    const ouverte = await proposerLeFichier(client, repository, branch, { chemin: VERIFICATIONS, texte: texteDesVerifications(apres), sha: lu.sha, dit, ou: "Kitchen > Health" });
    return { propose: PROPOSE, ...ouverte, geste: action, verification: propose.verification, liste: avant };
  } catch (error) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${VERIFICATIONS}`, detail: message(error) };
  }
}
