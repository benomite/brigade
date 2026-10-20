// Le carnet des leçons : les leçons promues d'un projet, dans un fichier versionné
// de son dépôt. Ce module définit le format, le lit et l'écrit, sans rien décider
// des promotions. L'écriture est déterministe — leçons triées par identifiant,
// rétros triées, un seul rendu possible — pour que les diffs et les reverts
// restent propres : ajouter une leçon n'ajoute que ses lignes.
//
// Le format, lisible à la main :
//
//   # Carnet des leçons
//
//   ## L-001
//   - état: promoted
//   - texte: Lancer les tests avant de commiter.
//   - entrée: 2026-10-01
//   - rétros: #12, #15
//
//   ## L-002
//   - état: expired
//   - texte: ...
//   - entrée: 2026-10-02
//   - rétros: #13
//   - origine: pass-send-back #13
//   - sortie: 2026-12-01
//   - raison: expiry
//
// Une leçon retirée ou expirée garde son identifiant et sa trace : elle n'est
// jamais effacée du fichier.
//
// L'origine dit d'où une leçon est née : la rétro d'un cook (`retro`), un
// renvoi de la pass (`pass-send-back #N`) ou un renvoi ou une correction du
// chef (`chef-correction #N`), N le ticket. Une leçon née d'une rétro n'écrit
// pas la ligne : un carnet d'avant l'origine se lit tel quel, toutes ses
// leçons nées d'une rétro, et se réécrit à l'identique.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Le chemin par défaut du carnet, dans le dépôt du projet.
export const CARNET_PATH = ".claude/brigade/carnet.md";

export type LessonState = "promoted" | "retired" | "expired";
// Pourquoi une leçon est sortie : « expiry » (elle a expiré) ou « manual »
// (retrait à la main).
export type ExitReason = "expiry" | "manual";

// D'où une leçon est née. Les deux renvois portent le ticket renvoyé ou corrigé.
export type LessonOrigin = { kind: "retro" } | { kind: "pass-send-back"; ticket: number } | { kind: "chef-correction"; ticket: number };

export const RETRO_ORIGIN: LessonOrigin = { kind: "retro" };

export type Lesson = {
  id: string;
  text: string;
  state: LessonState;
  // La date d'entrée, AAAA-MM-JJ.
  entered: string;
  // Les rétros qui l'ont proposée ou reconfirmée (« #12 », « retro-3 »…).
  retros: string[];
  origin: LessonOrigin;
  // La sortie : présente si et seulement si la leçon n'est plus promue.
  exit?: { date: string; reason: ExitReason };
};

export type Carnet = { lessons: Lesson[] };

// L'erreur d'un carnet illisible ; `line` (à partir de 1) est la ligne fautive,
// absente quand la faute est à l'écriture, hors de tout fichier.
export class CarnetError extends Error {
  line?: number;
  constructor(message: string, line?: number) {
    super(line === undefined ? `carnet : ${message}` : `carnet, ligne ${line} : ${message}`);
    this.name = "CarnetError";
    this.line = line;
  }
}

const TITRE = "# Carnet des leçons";
const ETATS: readonly LessonState[] = ["promoted", "retired", "expired"];
const RAISONS: readonly ExitReason[] = ["expiry", "manual"];
const RAISON_DE_L_ETAT: Record<Exclude<LessonState, "promoted">, ExitReason> = {
  expired: "expiry",
  retired: "manual",
};
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RETRO = /^[^\s,]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const ORIGINE = /^(pass-send-back|chef-correction) #([1-9]\d*)$/;

const CLES = ["état", "texte", "entrée", "rétros", "origine", "sortie", "raison"] as const;
type Cle = (typeof CLES)[number];

function dateValide(valeur: string): boolean {
  const m = DATE.exec(valeur);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === valeur;
}

// L'origine telle que le fichier l'écrit : `retro`, ou le renvoi et son ticket.
export function originText(origin: LessonOrigin): string {
  return origin.kind === "retro" ? "retro" : `${origin.kind} #${origin.ticket}`;
}

// Lit une origine écrite ; null si elle n'en est pas une.
export function parseOrigin(texte: string): LessonOrigin | null {
  if (texte === "retro") return { kind: "retro" };
  const m = ORIGINE.exec(texte);
  if (!m) return null;
  const ticket = Number(m[2]);
  if (!Number.isSafeInteger(ticket)) return null;
  return { kind: m[1] as "pass-send-back" | "chef-correction", ticket };
}

const origineValide = (o: LessonOrigin | undefined): boolean => o != null && parseOrigin(originText(o)) !== null;

// L'ordre du fichier : par identifiant, les nombres comparés comme des nombres
// (L-2 avant L-10), puis, à égalité, par le texte brut — total et stable.
function comparer(a: string, b: string): number {
  const c = a.localeCompare(b, "en", { numeric: true });
  return c !== 0 ? c : a < b ? -1 : a > b ? 1 : 0;
}

// Les fautes d'une leçon, en clair ; vide : elle est écrivable.
function fautes(l: Lesson): string[] {
  const f: string[] = [];
  if (!ID.test(l.id)) f.push(`identifiant « ${l.id} » invalide (lettres, chiffres, « . », « _ », « - »)`);
  if (l.text === "" || l.text !== l.text.trim() || /[\r\n]/.test(l.text)) {
    f.push("le texte tient en une ligne, non vide, sans espace autour");
  }
  if (!ETATS.includes(l.state)) f.push(`état « ${l.state} » inconnu`);
  if (!dateValide(l.entered)) f.push(`date d'entrée « ${l.entered} » invalide (AAAA-MM-JJ)`);
  if (l.retros.length === 0) f.push("au moins une rétro la propose");
  for (const r of l.retros) if (!RETRO.test(r)) f.push(`rétro « ${r} » invalide (ni espace ni virgule)`);
  if (!origineValide(l.origin)) f.push("origine invalide (retro, ou pass-send-back ou chef-correction avec le numéro de son ticket)");
  if (l.state === "promoted") {
    if (l.exit) f.push("une leçon promue n'a ni date ni raison de sortie");
  } else if (ETATS.includes(l.state)) {
    if (!l.exit) f.push("une leçon retirée ou expirée porte sa date et sa raison de sortie");
    else {
      if (!dateValide(l.exit.date)) f.push(`date de sortie « ${l.exit.date} » invalide (AAAA-MM-JJ)`);
      else if (dateValide(l.entered) && l.exit.date < l.entered) f.push("la sortie précède l'entrée");
      if (l.exit.reason !== RAISON_DE_L_ETAT[l.state]) {
        f.push(`une leçon « ${l.state} » sort pour la raison « ${RAISON_DE_L_ETAT[l.state]} »`);
      }
    }
  }
  return f;
}

// Le texte du carnet. Lève CarnetError si une leçon n'est pas écrivable ou si
// deux leçons portent le même identifiant.
export function writeCarnet(carnet: Carnet): string {
  const vues = new Set<string>();
  for (const l of carnet.lessons) {
    const f = fautes(l);
    if (f.length > 0) throw new CarnetError(`leçon « ${l.id} » : ${f.join(" ; ")}`);
    if (vues.has(l.id)) throw new CarnetError(`identifiant « ${l.id} » en double`);
    vues.add(l.id);
  }
  const lignes = [TITRE];
  for (const l of [...carnet.lessons].sort((a, b) => comparer(a.id, b.id))) {
    lignes.push("", `## ${l.id}`, `- état: ${l.state}`, `- texte: ${l.text}`, `- entrée: ${l.entered}`);
    lignes.push(`- rétros: ${[...new Set(l.retros)].sort(comparer).join(", ")}`);
    if (l.origin.kind !== "retro") lignes.push(`- origine: ${originText(l.origin)}`);
    if (l.exit) lignes.push(`- sortie: ${l.exit.date}`, `- raison: ${l.exit.reason}`);
  }
  return `${lignes.join("\n")}\n`;
}

// Lit un carnet. Une ligne qu'il ne comprend pas lève CarnetError, qui la nomme.
export function parseCarnet(text: string): Carnet {
  const lignes = text.split(/\r?\n/);
  if (lignes[lignes.length - 1] === "") lignes.pop();
  if (lignes[0] !== TITRE) throw new CarnetError(`le fichier commence par « ${TITRE} »`, 1);

  type Bloc = { id: string; ligne: number; valeurs: Partial<Record<Cle, { v: string; ligne: number }>> };
  const blocs: Bloc[] = [];
  for (let i = 1; i < lignes.length; i++) {
    const ligne = lignes[i] ?? "";
    const n = i + 1;
    if (ligne.trim() === "") continue;
    const titre = /^## (.*)$/.exec(ligne);
    if (titre) {
      const id = titre[1] ?? "";
      if (!ID.test(id)) throw new CarnetError(`identifiant « ${id} » invalide`, n);
      if (blocs.some((b) => b.id === id)) throw new CarnetError(`identifiant « ${id} » en double`, n);
      blocs.push({ id, ligne: n, valeurs: {} });
      continue;
    }
    const champ = /^- ([^:]+): (.*)$/.exec(ligne);
    if (!champ) throw new CarnetError(`ligne incomprise : « ${ligne} »`, n);
    const bloc = blocs[blocs.length - 1];
    if (!bloc) throw new CarnetError("un champ avant toute leçon (« ## identifiant »)", n);
    const cle = (champ[1] ?? "") as Cle;
    if (!CLES.includes(cle)) throw new CarnetError(`champ « ${cle} » inconnu`, n);
    if (bloc.valeurs[cle]) throw new CarnetError(`champ « ${cle} » en double`, n);
    bloc.valeurs[cle] = { v: champ[2] ?? "", ligne: n };
  }

  const lessons = blocs.map((b): Lesson => {
    const dit = (cle: Cle) => {
      const x = b.valeurs[cle];
      if (!x) throw new CarnetError(`leçon « ${b.id} » : champ « ${cle} » manquant`, b.ligne);
      return x;
    };
    const etat = dit("état");
    if (!ETATS.includes(etat.v as LessonState)) throw new CarnetError(`état « ${etat.v} » inconnu`, etat.ligne);
    const entree = dit("entrée");
    if (!dateValide(entree.v)) throw new CarnetError(`date « ${entree.v} » invalide (AAAA-MM-JJ)`, entree.ligne);
    const retros = dit("rétros");
    const liste = retros.v.split(", ");
    for (const r of liste) if (!RETRO.test(r)) throw new CarnetError(`rétro « ${r} » invalide`, retros.ligne);
    const origine = b.valeurs["origine"];
    const origin = origine === undefined ? RETRO_ORIGIN : parseOrigin(origine.v);
    if (origin === null) throw new CarnetError(`origine « ${origine!.v} » inconnue (retro, pass-send-back #N ou chef-correction #N)`, origine!.ligne);
    const lesson: Lesson = { id: b.id, text: dit("texte").v, state: etat.v as LessonState, entered: entree.v, retros: liste, origin: { ...origin } };
    const sortie = b.valeurs["sortie"];
    const raison = b.valeurs["raison"];
    if (lesson.state === "promoted") {
      const x = sortie ?? raison;
      if (x) throw new CarnetError("une leçon promue n'a ni sortie ni raison", x.ligne);
    } else {
      if (!sortie) throw new CarnetError(`leçon « ${b.id} » : champ « sortie » manquant`, b.ligne);
      if (!raison) throw new CarnetError(`leçon « ${b.id} » : champ « raison » manquant`, b.ligne);
      if (!dateValide(sortie.v)) throw new CarnetError(`date « ${sortie.v} » invalide (AAAA-MM-JJ)`, sortie.ligne);
      if (!RAISONS.includes(raison.v as ExitReason)) throw new CarnetError(`raison « ${raison.v} » inconnue`, raison.ligne);
      lesson.exit = { date: sortie.v, reason: raison.v as ExitReason };
    }
    const f = fautes(lesson);
    if (f.length > 0) throw new CarnetError(`leçon « ${b.id} » : ${f.join(" ; ")}`, b.ligne);
    return lesson;
  });
  return { lessons: lessons.sort((a, b) => comparer(a.id, b.id)) };
}

// Le carnet d'un projet ; absent, il est vide. `path` remplace le chemin par
// défaut, relatif au dépôt `repoDir`.
export function readCarnet(repoDir: string, path: string = CARNET_PATH): Carnet {
  let text: string;
  try {
    text = readFileSync(join(repoDir, path), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { lessons: [] };
    throw e;
  }
  return parseCarnet(text);
}

export function saveCarnet(repoDir: string, carnet: Carnet, path: string = CARNET_PATH): void {
  const fichier = join(repoDir, path);
  const text = writeCarnet(carnet);
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, text);
}
