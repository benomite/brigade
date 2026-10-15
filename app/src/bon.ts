// Ce qu'un bon du rail porte, outre son numéro, son état et son titre : ce que la
// file dit déjà du ticket — ce que la cuisine en fait en ce moment, qui le tient,
// depuis quand, son bail, ce qu'il brûle, ce qui le bloque. Rien n'y est compté ni déduit : chaque valeur est un morceau
// de ce que la box a écrit. Deux lectures y entrent :
//   - `faits`, la forme : la station du cook en cours (`cooks`) ;
//   - `status`, du texte : la ligne du ticket sous la ligne `rail`, que le runtime
//     écrit ainsi (runtime/src/etat.ts, `decrireEtat` et `detail`) —
//       `  #<ticket>  <état>  <priorité>  <détail>  <titre>`
//     Le détail n'est découpé que s'il a, pour l'état que `faits` donne, la forme
//     écrite là. Sinon la ligne est relayée entière, mot pour mot, et rien n'en
//     est tiré : un texte reformulé ne devient jamais une valeur fausse.
// Ce que la file ne dit pas est écrit comme tel, chose par chose : un bon ne se
// tait sur rien, et n'invente rien à la place.

// `exact` : ce qui se recopie tel quel — une station.
export type Fait = { libelle: string; valeur: string; exact?: true };
// `dit` : ce que la file dit du ticket. `sans` : ce qu'elle n'en dit pas, parmi
// les cinq choses qu'un bon porte, et pourquoi — absent quand elle les dit toutes.
// `relais` : ce que `status` écrit du ticket sous sa ligne `rail`, mot pour mot,
// quand l'app n'a pas su le découper.
export type Porte = { dit: Fait[]; sans?: string; relais?: string };

// Ce dont un bon se compose, pour un ticket.
// `lignes` : les siennes sous la ligne `rail` de `status` — absentes, cette ligne
// n'a pas été lue ; vides, elle l'a été et ne dit rien de lui.
// `stations` : celles de ses cooks en cours, d'après `faits` — absentes, le
// runtime ne donne pas les cooks.
// `bloque` : le bloc `attend` dit ce qui l'arrête, et le bon le porte à part.
// `enCeMoment` : ce que la cuisine fait du ticket, tel que `faits` le donne et que
// l'app l'écrit (faits.ts, `direEnCeMoment`) — absent, le bon ne porte pas cette ligne.
// `attente` : pour un ticket mis de côté, la raison en clair que le runtime donne
// dans `faits` — elle remplace sa ligne brute de `status`, qui n'est plus relayée.
// `revenu` : pour un ticket revenu de WAITING, le motif que le runtime en donne dans `faits`.
export type Sources = { lignes?: readonly string[]; stations?: readonly string[]; bloque: boolean; enCeMoment?: string; attente?: string; revenu?: string };

const TETE_DE_TICKET = /^ {2}#(\d+) {2}(.*)$/;

// Les lignes de chaque ticket sous la ligne `rail` de `status`, sans leur tête —
// rien, si la sortie n'a pas cette ligne, ou en a plusieurs. Seules les lignes en
// retrait qui la suivent en sont : un numéro plus bas, sous `cooks` ou `serveurs`,
// n'est pas une ligne du rail.
export function lignesDuRail(status: string): Map<number, string[]> | undefined {
  const lignes = status.split("\n");
  const tetes = lignes.flatMap((ligne, rang) => (/^rail\s/.test(ligne) ? [rang] : []));
  const [tete] = tetes;
  if (tete === undefined || tetes.length !== 1) return undefined;
  const lues = new Map<number, string[]>();
  for (let rang = tete + 1; lignes[rang]?.startsWith("  ") === true; rang++) {
    const [, numero, suite] = TETE_DE_TICKET.exec(lignes[rang] as string) ?? [];
    const ticket = Number(numero);
    if (numero === undefined || suite === undefined || !Number.isSafeInteger(ticket)) continue;
    lues.set(ticket, [...(lues.get(ticket) ?? []), suite]);
  }
  return lues;
}

// Une durée, telle que `status` l'écrit (runtime/src/etat.ts, `duree`).
const DUREE = String.raw`\d+ (?:s|min|j|h \d\d)`;
type Lu = { tient?: string; depuis: string; bail?: string; bloque?: string; cuisine?: string };
// Le détail d'une ligne, par état : la forme que le runtime écrit pour lui, et ce
// qu'elle donne. Un état qui n'est pas ici — `86`, un mot inconnu — n'en a pas.
const FORMES: { etats: readonly string[]; forme: RegExp; lire(trouve: RegExpExecArray): Lu }[] = [
  {
    // `par <station> depuis <durée>, [COINCE : ][sans progrès depuis <durée>, ]bail encore <durée>` — ou `bail échu depuis`.
    etats: ["pris"],
    forme: new RegExp(`^par (\\S.*?) depuis (${DUREE}), ((?:COINCE : )?(?:sans progrès depuis ${DUREE}, )?bail (?:encore|échu depuis) ${DUREE})$`),
    lire: ([, tient = "", depuis = "", bail = ""]) => ({ tient, depuis, bail }),
  },
  {
    // `[<ce qui le retient> — ]depuis <durée>`.
    etats: ["en attente", "BLOQUÉ"],
    forme: new RegExp(`^(?:(\\S.*) — )?depuis (${DUREE})$`),
    lire: ([, bloque, depuis = ""]) => ({ depuis, ...(bloque === undefined ? {} : { bloque }) }),
  },
  {
    // `depuis <durée>, cuisiné par <station>`.
    etats: ["en pass", "servi"],
    forme: new RegExp(`^depuis (${DUREE}), cuisiné par (\\S.*)$`),
    lire: ([, depuis = "", cuisine = ""]) => ({ depuis, cuisine }),
  },
];

// Ce qui est entre l'état et le titre d'une ligne — l'un et l'autre viennent de
// `faits`, et la bornent : la priorité, puis le détail. Rien, si elle n'est pas
// celle que le runtime écrit pour cet état et ce titre.
function milieu(ligne: string, etat: string, titre: string): { priorite: string; detail: string } | undefined {
  const [tete, pied] = [`${etat}  `, `  ${titre}`];
  if (ligne.length < tete.length + pied.length || !ligne.startsWith(tete) || !ligne.endsWith(pied)) return undefined;
  const [, priorite, detail] = /^(-|prio:\S+) {2}(.*)$/.exec(ligne.slice(tete.length, ligne.length - pied.length)) ?? [];
  return priorite === undefined || detail === undefined ? undefined : { priorite, detail };
}

// La priorité que la ligne d'un ticket écrit, telle quelle : `prio:<n>`, ou `-`
// quand son issue ne porte aucun `prio:` — rien, si la ligne ne se lit pas.
export const priorite = (ligne: string, etat: string, titre: string): string | undefined => milieu(ligne, etat, titre)?.priorite;

// Ce que la ligne d'un ticket dit de lui — ou rien, si elle n'est pas celle que
// le runtime écrit pour cet état et ce titre.
function decouper(ligne: string, etat: string, titre: string): Lu | undefined {
  const detail = milieu(ligne, etat, titre)?.detail;
  const lue = FORMES.find(({ etats }) => etats.includes(etat));
  const trouve = detail === undefined ? null : (lue?.forme.exec(detail) ?? null);
  return lue === undefined || trouve === null ? undefined : lue.lire(trouve);
}

// Les cinq choses qu'un bon porte, dans l'ordre où elles se lisent : le libellé
// de chacune quand la file la dit, et comment elle se nomme quand elle ne la dit pas.
const CHOSES = [
  { cle: "tient", libelle: "taken by", tu: "who holds it" },
  { cle: "depuis", libelle: "since", tu: "since when" },
  { cle: "bail", libelle: "lease", tu: "its lease" },
  { cle: "brule", libelle: "burns", tu: "what it burns" },
  { cle: "bloque", libelle: "blocked by", tu: "what blocks it" },
] as const;

// Le bon d'un ticket : ce que la file en dit, ce qu'elle n'en dit pas, et sa
// ligne de `status` telle quelle quand elle n'a pas pu être découpée. `etat` et
// `titre` : ceux que `faits` donne — absents, le ticket n'est pas sur le rail.
export function porter({ etat, titre }: { etat?: string; titre?: string }, { lignes, stations, bloque, enCeMoment, attente, revenu }: Sources): Porte {
  // Un ticket n'a qu'une ligne sur le rail : deux ne disent pas laquelle croire.
  const [ligne] = lignes ?? [];
  const lu = ligne === undefined || lignes?.length !== 1 || etat === undefined || titre === undefined ? undefined : decouper(ligne, etat, titre);
  const illisible = attente === undefined && lignes !== undefined && lignes.length > 0 && lu === undefined;
  const dites: Record<(typeof CHOSES)[number]["cle"], Omit<Fait, "libelle"> | undefined> = {
    // La station que `faits` donne d'abord : c'est la forme. À défaut, celle de la ligne.
    tient: stations !== undefined && stations.length > 0 ? { valeur: stations.join(", "), exact: true } : lu?.tient === undefined ? undefined : { valeur: lu.tient, exact: true },
    depuis: lu === undefined ? undefined : { valeur: lu.depuis },
    bail: lu?.bail === undefined ? undefined : { valeur: lu.bail },
    // Ce qu'il brûle, la file ne le dit pas : ni la forme, ni sa ligne sous `rail`.
    brule: undefined,
    bloque: lu?.bloque === undefined ? undefined : { valeur: lu.bloque },
  };
  // Ce que le bloc `attend` dit de lui est posé sur le bon, à part : c'est ce qui le bloque.
  const tues = CHOSES.filter(({ cle }) => dites[cle] === undefined && !(cle === "bloque" && bloque)).map(({ tu }) => tu);
  const pourquoi = illisible
    ? "not given by `facts`, and not read by the app in what `status` writes about this ticket, relayed below as is"
    : lignes === undefined
      ? "not given by `facts`, and the `rail` line of `status` was not read"
      : "not given by the queue";
  return {
    dit: [
      // Ce qui bouge le plus souvent se lit d'abord : ce que la cuisine en fait en ce moment.
      ...(enCeMoment === undefined ? [] : [{ libelle: "right now", valeur: enCeMoment }]),
      // Un ticket mis de côté : sa raison en une ligne, jamais la ligne brute du runtime.
      ...(attente === undefined ? [] : [{ libelle: "set aside", valeur: attente }]),
      // Revenu de WAITING : le motif, mot pour mot — jamais déduit par l'app.
      ...(revenu === undefined ? [] : [{ libelle: "came back", valeur: revenu }]),
      ...CHOSES.flatMap(({ cle, libelle }) => (dites[cle] === undefined ? [] : [{ libelle, ...dites[cle] }])),
      // Qui l'a cuisiné n'est pas qui le tient : dit sous son nom, en plus des cinq.
      ...(lu?.cuisine === undefined ? [] : [{ libelle: "cooked by", valeur: lu.cuisine, exact: true as const }]),
    ],
    ...(tues.length === 0 ? {} : { sans: `${pourquoi} : ${tues.join(" · ")}` }),
    ...(illisible ? { relais: (lignes ?? []).join("\n") } : {}),
  };
}
