// L'étape « protection » de l'installation, faite par l'app pour le chef — ou
// par lui. Jouée par `installation` (`installation-cli.ts`) :
//   npm --prefix runtime run installation -- protection           où en est la branche d'intégration sur GitHub, ce qui manque pour la protéger, et où en est l'étape
//   npm --prefix runtime run installation -- protection --json    la même lecture, pour un programme : un objet JSON, sur une ligne
//   npm --prefix runtime run installation -- protection poser     protège la branche d'intégration, et note l'étape
//
// La protection posée est celle que le runtime suppose (docs/installer.md,
// « Protéger la branche d'intégration ») : PR obligatoire, zéro approbation
// requise, administrateurs inclus. Plus personne ne pousse directement sur la
// branche ; les merges de la pass passent.
//
// Protéger une branche est un geste d'administrateur du dépôt. Ce qui manque
// au compte de `gh` pour le faire est dit avant toute tentative, chaque droit
// avec l'unique action qui le donne, et l'étape est notée en attente : rien
// n'est essayé. Rejouer l'action sur une branche déjà protégée ne réécrit
// rien ; une protection que le chef a posée autrement n'est jamais écrasée —
// ce qui lui manque est dit, avec où le régler.
//
// La push protection — la seconde barrière contre une livraison qui porterait
// des identifiants — est activée au passage quand GitHub l'accepte. Elle ne
// retient pas l'étape : sur un dépôt privé, elle réclame un plan que le chef
// n'a pas forcément, et la station reste alors la seule barrière.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { configRail } from "./alimenter.ts";
import { Sortie, type Appel } from "./appel.ts";
import { ETAPES, installationDe, noterEtape } from "./etapes.ts";
import type { EtatDEtape } from "./events/installation.ts";
import { geste } from "./geste.ts";
import { cheminJournal, ouvrirJournal } from "./journal.ts";
import { ConfigInvalide } from "./runtime.ts";

const ETAPE = "protection";
const AUTEUR = "chef";
const USAGE = "usage : <environnement du service> npm --prefix runtime run installation -- protection [--json | poser]";
const DELAI_MS = 120_000;

// --- GitHub, tel que l'étape lui parle : une requête, une réponse. Le runtime
// passe par `gh` ; les tests, par un GitHub simulé.

export type RequeteGitHub = { methode: "GET" | "PUT" | "PATCH"; chemin: string; corps?: unknown };
// `scopes` : ceux du jeton, quand GitHub les dit — il ne les dit que d'un
// jeton OAuth ou classique ; null sinon.
export type ReponseGitHub = { statut: number; corps: unknown; scopes: string[] | null };
export type ClientGitHub = (requete: RequeteGitHub) => Promise<ReponseGitHub>;

// `gh api -i` : la réponse HTTP fait foi, pas le code de sortie — `gh` sort en
// erreur sur un 404. Le corps d'une écriture passe par l'entrée standard.
export function clientGh(bin: string, env: NodeJS.ProcessEnv): ClientGitHub {
  return (requete) =>
    new Promise((resoudre, rejeter) => {
      // Une lecture part sans `-X` : rien, dans ses arguments, ne ressemble à une écriture.
      const methode = requete.methode === "GET" ? [] : ["-X", requete.methode];
      const args = ["api", "-i", ...methode, ...(requete.corps === undefined ? [] : ["--input", "-"]), requete.chemin];
      const enfant = execFile(bin, args, { env, timeout: DELAI_MS, maxBuffer: 64 * 1024 * 1024 }, (erreur, stdout, stderr) => {
        if ((erreur as NodeJS.ErrnoException | null)?.code === "ENOENT") return rejeter(new Error(`\`${bin}\` est introuvable`));
        const [tete = "", ...reste] = stdout.split(/\r?\n\r?\n/);
        const statut = /^HTTP\/\S+ (\d{3})/.exec(tete)?.[1];
        if (!statut) return rejeter(new Error(stderr.trim() || "réponse illisible"));
        const scopes = /^x-oauth-scopes:(.*)$/im.exec(tete)?.[1];
        let corps: unknown = null;
        try {
          corps = JSON.parse(reste.join("\n\n"));
        } catch {
          // Un corps vide ou illisible : seul le statut parle.
        }
        resoudre({ statut: Number(statut), corps, scopes: scopes === undefined ? null : scopes.split(",").map((scope) => scope.trim()).filter(Boolean) });
      });
      // Une doublure qui ne lit pas son entrée ne fait pas tomber l'appel.
      enfant.stdin?.on("error", () => {});
      enfant.stdin?.end(requete.corps === undefined ? undefined : JSON.stringify(requete.corps));
    });
}

// La protection que le runtime suppose, telle que GitHub la reçoit.
export const PROTECTION = {
  required_status_checks: null,
  enforce_admins: true,
  required_pull_request_reviews: { required_approving_review_count: 0 },
  restrictions: null,
} as const;

const PUSH_PROTECTION = { security_and_analysis: { secret_scanning: { status: "enabled" }, secret_scanning_push_protection: { status: "enabled" } } } as const;

const cheminDeBranche = (depot: string, branche: string) => `repos/${depot}/branches/${encodeURIComponent(branche)}`;
const messageDe = (corps: unknown): string | undefined => (corps !== null && typeof corps === "object" && "message" in corps && typeof corps.message === "string" ? corps.message : undefined);

// Ce que GitHub dit du dépôt au compte de `gh`.
type DepotLu = {
  private?: boolean;
  permissions?: { admin?: boolean };
  security_and_analysis?: { secret_scanning_push_protection?: { status?: string } } | null;
};

// Un droit qui manque au compte de `gh` pour protéger la branche, l'unique
// action qui le lui donne, et pourquoi il le faut.
export type DroitManquant = { droit: string; action: string; pourquoi: string };

// La branche d'intégration sur GitHub. `posee` : la protection que le runtime
// suppose y est — `detail` faux quand ce compte ne peut en lire que
// l'existence. `autre` : protégée, sans ce que `manque` nomme. `absente` :
// rien ne la protège. `illisible` : GitHub n'a pas répondu ce qu'il fallait.
export type Protection =
  | { etat: "posee"; detail: boolean }
  | { etat: "autre"; manque: string[] }
  | { etat: "absente" }
  | { etat: "illisible"; raison: string };

export type Lecture = { depot: DepotLu; droits: DroitManquant[]; protection: Protection };

// Les droits qui manquent au compte pour protéger une branche : être
// administrateur du dépôt, et — quand GitHub dit les scopes du jeton — un
// jeton qui écrit sur le dépôt.
export function droitsManquants(lu: { depot: DepotLu; scopes: string[] | null; compte: string | null; depotNom: string }): DroitManquant[] {
  const manquants: DroitManquant[] = [];
  const compte = lu.compte === null ? "au compte sous lequel `gh` tourne sur la box (`gh auth status` le nomme)" : `à \`${lu.compte}\`, le compte sous lequel \`gh\` tourne sur la box`;
  if (lu.depot.permissions?.admin !== true) {
    manquants.push({
      droit: `administrateur de ${lu.depotNom}`,
      action: `donner le rôle Admin sur ${lu.depotNom} ${compte} — sur GitHub, Settings → Collaborators and teams`,
      pourquoi: "protéger une branche est un geste d'administrateur : GitHub le refuse à un compte qui ne fait qu'y écrire",
    });
  }
  const ecrit = lu.scopes === null || lu.scopes.includes("repo") || (lu.depot.private === false && lu.scopes.includes("public_repo"));
  if (!ecrit) {
    manquants.push({
      droit: `le scope \`repo\` du jeton de \`gh\` (il porte : ${lu.scopes?.length ? lu.scopes.map((scope) => `\`${scope}\``).join(", ") : "aucun scope"})`,
      action: "`gh auth refresh -h github.com -s repo`, sous le compte du service",
      pourquoi: "sans lui, le jeton ne touche pas aux réglages du dépôt, quel que soit le rôle du compte",
    });
  }
  return manquants;
}

// Ce qui manque à une protection posée pour être celle que le runtime suppose.
export function ceQuiManque(lue: unknown): string[] {
  const protection = (lue ?? {}) as { required_pull_request_reviews?: { required_approving_review_count?: number } | null; enforce_admins?: { enabled?: boolean } | null };
  const manque: string[] = [];
  const revues = protection.required_pull_request_reviews;
  if (revues === undefined || revues === null) manque.push("PR obligatoire");
  else if ((revues.required_approving_review_count ?? 0) > 0) manque.push(`zéro approbation requise (elle en exige ${revues.required_approving_review_count} : la pass merge sans approbation, GitHub refuserait ses merges)`);
  if (protection.enforce_admins?.enabled !== true) manque.push("administrateurs inclus");
  return manque;
}

// Lit la protection de la branche. Un administrateur en lit le détail ; un
// autre compte, seulement qu'elle existe.
export async function lireProtection(client: ClientGitHub, depot: string, branche: string, admin: boolean): Promise<Protection> {
  if (!admin) {
    const lue = await client({ methode: "GET", chemin: cheminDeBranche(depot, branche) });
    if (lue.statut === 404) return { etat: "illisible", raison: `la branche \`${branche}\` est introuvable sur ${depot}` };
    if (lue.statut !== 200) return { etat: "illisible", raison: `GitHub répond HTTP ${lue.statut}${messageDe(lue.corps) ? ` (${messageDe(lue.corps)})` : ""}` };
    return (lue.corps as { protected?: boolean } | null)?.protected === true ? { etat: "posee", detail: false } : { etat: "absente" };
  }
  const lue = await client({ methode: "GET", chemin: `${cheminDeBranche(depot, branche)}/protection` });
  if (lue.statut === 404) {
    return /branch not found/i.test(messageDe(lue.corps) ?? "") ? { etat: "illisible", raison: `la branche \`${branche}\` est introuvable sur ${depot}` } : { etat: "absente" };
  }
  if (lue.statut !== 200) return { etat: "illisible", raison: `GitHub répond HTTP ${lue.statut}${messageDe(lue.corps) ? ` (${messageDe(lue.corps)})` : ""}` };
  const manque = ceQuiManque(lue.corps);
  return manque.length === 0 ? { etat: "posee", detail: true } : { etat: "autre", manque };
}

// Le dépôt, les droits du compte et la protection de la branche, en GET
// seulement. Un dépôt que GitHub ne rend pas lève : rien n'en est conclu.
export async function lire(client: ClientGitHub, depot: string, branche: string): Promise<Lecture> {
  const lu = await client({ methode: "GET", chemin: `repos/${depot}` });
  if (lu.statut !== 200) throw new Error(`\`gh\` ne lit pas le dépôt ${depot} : HTTP ${lu.statut}${messageDe(lu.corps) ? ` (${messageDe(lu.corps)})` : ""}`);
  const lui = lu.corps as DepotLu;
  const admin = lui.permissions?.admin === true;
  const protection = await lireProtection(client, depot, branche, admin);
  // Le nom du compte ne sert qu'à dire à qui donner un droit qui manque.
  let compte: string | null = null;
  if (!admin) {
    const qui = await client({ methode: "GET", chemin: "user" }).catch(() => null);
    const login = (qui?.corps as { login?: unknown } | null)?.login;
    if (qui?.statut === 200 && typeof login === "string") compte = login;
  }
  return { depot: lui, droits: droitsManquants({ depot: lui, scopes: lu.scopes, compte, depotNom: depot }), protection };
}

// Où régler une protection que le chef a posée autrement : l'action ne
// l'écrase pas.
const REGLER_A_LA_MAIN = (depot: string, branche: string) =>
  `sur GitHub, ${depot} → Settings → Branches, la règle de \`${branche}\` : « Require a pull request before merging » sans approbation requise, et « Do not allow bypassing the above settings » — l'action n'écrase pas une protection que tu as posée`;

// Le constat que « Vérifier » rend de la branche d'intégration : posée, ou ce
// qui manque et le geste qui le règle.
// `simple` : le manque en mots simples, pour le verdict de « Vérifier ».
export function constater(lecture: Lecture, depot: string, branche: string, env: NodeJS.ProcessEnv): { etat: "ok" | "manque" | "note"; texte: string; geste?: string; simple?: string } {
  const { protection, droits } = lecture;
  if (protection.etat === "posee") {
    return {
      etat: "ok",
      texte: protection.detail
        ? `branche d'intégration \`${branche}\` protégée : PR obligatoire, administrateurs inclus`
        : `branche d'intégration \`${branche}\` protégée — ce compte n'en lit pas le détail, seul un administrateur du dépôt le peut`,
    };
  }
  // Une protection que GitHub ne rend pas n'est pas constatée : « Vérifier »
  // ne se dit pas vert sur une branche qu'il n'a pas vue protégée.
  if (protection.etat === "illisible") {
    return {
      etat: "manque",
      texte: `protection de la branche d'intégration non vérifiée : ${protection.raison} — rien ne dit qu'un push direct n'y entre pas`,
      geste: `relancer la vérification une fois GitHub joignable ; \`${geste("installation protection", env)}\` dit ce qu'il rend de \`${branche}\``,
      simple: `brigade n'a pas pu lire sur GitHub si la branche d'intégration \`${branche}\` est protégée`,
    };
  }
  if (protection.etat === "autre") {
    return {
      etat: "manque",
      texte: `la branche d'intégration \`${branche}\` est protégée sans ${protection.manque.join(", ni ")} : la pass ne tient pas la branche`,
      geste: REGLER_A_LA_MAIN(depot, branche),
      simple: `la branche d'intégration \`${branche}\` est protégée, mais pas comme brigade en a besoin : des changements pourraient y entrer sans relecture`,
    };
  }
  return {
    etat: "manque",
    texte: `la branche d'intégration \`${branche}\` n'est pas protégée sur GitHub : un push direct y entre sans passer par la pass`,
    simple: `la branche d'intégration \`${branche}\` n'est pas protégée : des changements pourraient y entrer sans relecture`,
    geste: droits.length === 0 ? `\`${geste("installation protection poser", env)}\`` : `${droits.map((droit) => droit.action).join(", puis ")}, puis \`${geste("installation protection poser", env)}\``,
  };
}

// Ce que l'action a fait. `posee` : la protection est là — posée maintenant,
// ou déjà. `bloquee` : rien n'est essayé ou GitHub a refusé ; `droits` dit ce
// qui manque, `raison` ce qui a arrêté.
export type Pose =
  | { issue: "posee"; deja: boolean; pushProtection: PushProtection }
  | { issue: "bloquee"; droits: DroitManquant[]; raison: string };

// `active` : elle y était, ou GitHub vient de l'accepter. `refusee` : GitHub ne
// l'active pas ici, `raison` dit ce qu'il en rend.
export type PushProtection = { etat: "active"; deja: boolean } | { etat: "refusee"; raison: string };

// Pose la protection de la branche, si elle n'y est pas et que le compte en a
// le droit. Ne note rien au journal : c'est à l'appelant.
export async function poser(client: ClientGitHub, depot: string, branche: string): Promise<Pose> {
  const lecture = await lire(client, depot, branche);
  const { protection } = lecture;
  if (protection.etat === "illisible") return { issue: "bloquee", droits: [], raison: protection.raison };
  if (protection.etat === "autre") return { issue: "bloquee", droits: [], raison: `la branche est déjà protégée, sans ${protection.manque.join(", ni ")} — ${REGLER_A_LA_MAIN(depot, branche)}` };
  if (protection.etat === "posee") return { issue: "posee", deja: true, pushProtection: await activerPushProtection(client, depot, lecture.depot) };
  // Rien n'est essayé sans les droits : GitHub refuserait.
  if (lecture.droits.length > 0) return { issue: "bloquee", droits: lecture.droits, raison: "il manque au compte de `gh` de quoi protéger une branche — rien n'est essayé" };

  const posee = await client({ methode: "PUT", chemin: `${cheminDeBranche(depot, branche)}/protection`, corps: PROTECTION });
  if (posee.statut !== 200) {
    const dit = messageDe(posee.corps);
    // Un dépôt privé d'un compte gratuit n'a pas de protection de branche.
    if (posee.statut === 403 && /upgrade|github pro/i.test(dit ?? "")) {
      return {
        issue: "bloquee",
        droits: [{ droit: "la protection de branche sur un dépôt privé", action: `passer le propriétaire de ${depot} à GitHub Pro (ou Team, pour une organisation), ou rendre le dépôt public`, pourquoi: `GitHub ne protège la branche d'un dépôt privé que sur un plan payant (il dit : ${dit})` }],
        raison: "GitHub refuse de protéger la branche sur ce plan",
      };
    }
    // Le jeton n'a pas le droit que son rôle laissait croire : un jeton à grain fin.
    if (posee.statut === 403 || posee.statut === 404) {
      return {
        issue: "bloquee",
        droits: [{ droit: "la permission « Administration » en écriture du jeton de `gh`", action: `donner au jeton de \`gh\` la permission « Administration : Read and write » sur ${depot} — sur GitHub, Settings → Developer settings → Personal access tokens`, pourquoi: `GitHub refuse la protection à ce jeton (HTTP ${posee.statut}${dit ? ` : ${dit}` : ""}), alors que son compte administre le dépôt` }],
        raison: "GitHub refuse de protéger la branche à ce jeton",
      };
    }
    return { issue: "bloquee", droits: [], raison: `GitHub refuse de protéger la branche : HTTP ${posee.statut}${dit ? ` (${dit})` : ""}` };
  }
  // Ce que GitHub a pris est relu, comme la vérification le lira.
  const relue = await lireProtection(client, depot, branche, true);
  if (relue.etat !== "posee") return { issue: "bloquee", droits: [], raison: `GitHub a accepté la protection, mais ne la rend pas telle qu'elle a été posée (${relue.etat === "autre" ? `sans ${relue.manque.join(", ni ")}` : relue.etat === "illisible" ? relue.raison : "absente"})` };
  return { issue: "posee", deja: false, pushProtection: await activerPushProtection(client, depot, lecture.depot) };
}

// Active la push protection si elle ne l'est pas. Un refus ne lève pas.
async function activerPushProtection(client: ClientGitHub, depot: string, lu: DepotLu): Promise<PushProtection> {
  if (lu.security_and_analysis?.secret_scanning_push_protection?.status === "enabled") return { etat: "active", deja: true };
  const reponse = await client({ methode: "PATCH", chemin: `repos/${depot}`, corps: PUSH_PROTECTION }).catch((erreur: unknown) => ({ statut: 0, corps: { message: erreur instanceof Error ? erreur.message : String(erreur) }, scopes: null }));
  const etat = (reponse.corps as DepotLu | null)?.security_and_analysis?.secret_scanning_push_protection?.status;
  if (reponse.statut === 200 && etat === "enabled") return { etat: "active", deja: false };
  const dit = messageDe(reponse.corps);
  return { etat: "refusee", raison: reponse.statut === 200 ? `GitHub la laisse \`${etat ?? "inconnue"}\`` : `HTTP ${reponse.statut}${dit ? ` : ${dit}` : ""}` };
}

const ETATS_LUS: Record<EtatDEtape, string> = { todo: "à faire", done: "faite", waiting: "en attente" };
const PROTECTIONS_LUES = { posee: "posée", autre: "autre", absente: "absente", illisible: "illisible" } as const;

// La forme JSON : un contrat avec l'app, figé par `test/proteger-branche.test.ts`.
export function faitsDeLaProtection(lus: { etat: EtatDEtape; depot: string; branche: string; lecture: Lecture | null; illisible: string | null }) {
  const { lecture } = lus;
  const protection = lecture?.protection;
  return {
    etape: { id: ETAPE, etat: ETATS_LUS[lus.etat] },
    depot: lus.depot,
    branche: lus.branche,
    protection: protection === undefined ? "illisible" : PROTECTIONS_LUES[protection.etat],
    manque: protection?.etat === "autre" ? protection.manque : [],
    // Un droit ne manque que pour poser ce qui n'y est pas.
    droits: protection?.etat === "absente" ? (lecture?.droits ?? []) : [],
    raison: lus.illisible ?? (protection?.etat === "illisible" ? protection.raison : null),
  };
}

// La commande, sur un GitHub donné. `principal` la joue sur celui de `gh`.
export async function commande({ args, env, dire, redire }: Appel, client: ClientGitHub): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const etape = ETAPES.find((connue) => connue.id === ETAPE);
  if (etape === undefined) throw new Error(`l'étape « ${ETAPE} » n'est plus une étape de l'installation`);
  let depot: string;
  try {
    depot = configRail(env).depot;
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message}\n${USAGE}`);
    throw erreur;
  }
  const branche = env.BRIGADE_BASE_BRANCH;
  if (!branche) echouer(2, `BRIGADE_BASE_BRANCH n'est pas défini : rien ne dit quelle branche protéger\n${USAGE}`);

  if (args.length === 0 || (args.length === 1 && args[0] === "--json")) {
    const etat = installationDe(repertoireEtat).etapes.find((lue) => lue.id === ETAPE)?.etat ?? "todo";
    let lecture: Lecture | null = null;
    let illisible: string | null = null;
    try {
      lecture = await lire(client, depot, branche);
    } catch (erreur) {
      illisible = erreur instanceof Error ? erreur.message : String(erreur);
    }
    const faits = faitsDeLaProtection({ etat, depot, branche, lecture, illisible });
    if (args.length === 1) dire(JSON.stringify(faits));
    else montrer(faits);
    return;
  }
  if (args.length !== 1 || args[0] !== "poser") echouer(2, USAGE);

  // Sans journal, il en naîtra un au nom que l'unité donne au projet : sans
  // ce nom, rien n'est essayé sur GitHub.
  if (!existsSync(cheminJournal(repertoireEtat)) && !env.BRIGADE_PROJECT) echouer(1, `aucun journal dans ${repertoireEtat}, et BRIGADE_PROJECT n'est pas défini : rien ne dit à quel projet noter l'étape`);
  let pose: Pose;
  try {
    pose = await poser(client, depot, branche);
  } catch (erreur) {
    echouer(1, `${erreur instanceof Error ? erreur.message : String(erreur)} — rien n'est posé, l'étape reste où elle en était`);
  }
  const journal = ouvrirJournal(repertoireEtat);
  try {
    const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? env.BRIGADE_PROJECT ?? "";
    noterEtape(journal, { projet, etape: ETAPE, etat: pose.issue === "posee" ? "done" : "waiting", auteur: AUTEUR });
  } finally {
    journal.fermer();
  }

  if (pose.issue === "bloquee") {
    redire(`brigade : « ${etape.titre} » bloquée — ${pose.raison}`);
    for (const droit of pose.droits) {
      redire(`  il manque : ${droit.droit}`);
      redire(`  → ${droit.action}`);
      redire(`    pourquoi : ${droit.pourquoi}`);
    }
    if (pose.droits.length > 0) redire(`  puis rejouer \`${geste("installation protection poser", env)}\``);
    throw new Sortie(1);
  }
  dire(
    pose.deja
      ? `brigade : \`${branche}\` est déjà protégée sur ${depot} — rien n'est réécrit`
      : `brigade : \`${branche}\` protégée sur ${depot} — PR obligatoire, zéro approbation requise, administrateurs inclus : plus personne n'y pousse directement, les merges de la pass passent`,
  );
  const push = pose.pushProtection;
  if (push.etat === "active") dire(push.deja ? "brigade : la push protection de GitHub était déjà active" : "brigade : push protection de GitHub activée — elle refuse un push qui porterait des identifiants qu'elle reconnaît");
  else dire(`brigade : la push protection de GitHub n'est pas activée (${push.raison}) : gratuite sur un dépôt public, elle réclame GitHub Secret Protection sur un dépôt privé — la station reste la seule barrière contre une livraison qui porterait des identifiants`);
  dire(`brigade : « ${etape.titre} » notée faite`);

  function montrer(faits: ReturnType<typeof faitsDeLaProtection>): void {
    if (etape === undefined) return;
    dire(`brigade : « ${etape.titre} » — ${faits.etape.etat}`);
    dire(`  à quoi elle sert : ${etape.sert}`);
    dire(`  si tu la sautes  : ${etape.sauter}`);
    dire("");
    const lue = {
      posée: `\`${faits.branche}\` est protégée sur ${faits.depot}`,
      autre: `\`${faits.branche}\` est protégée sur ${faits.depot}, sans ${faits.manque.join(", ni ")}`,
      absente: `\`${faits.branche}\` n'est pas protégée sur ${faits.depot}`,
      illisible: `\`${faits.branche}\` sur ${faits.depot} : ${faits.raison ?? "illisible"}`,
    }[faits.protection];
    dire(lue);
    if (faits.protection === "autre") dire(`  → ${REGLER_A_LA_MAIN(faits.depot, faits.branche)}`);
    if (faits.protection !== "absente") return;
    for (const droit of faits.droits) {
      dire(`  il manque : ${droit.droit}`);
      dire(`  → ${droit.action}`);
      dire(`    pourquoi : ${droit.pourquoi}`);
    }
    dire("");
    dire(`Pour la protéger : \`${geste("installation protection poser", env)}\`${faits.droits.length > 0 ? ", une fois ce qui manque donné" : ""}`);
  }
}

export function principal(appel: Appel): Promise<void> {
  return commande(appel, clientGh(appel.env.BRIGADE_GH_BIN || "gh", appel.env as NodeJS.ProcessEnv));
}
