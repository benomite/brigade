// Test d'acceptation gelé (#4050). La maquette docs/maquettes/app/Project.dc.html est lue telle qu'elle est : son balisage en
// texte, et son composant joué (`renderVals`) avec une horloge fausse. Le contrat que ces tests fixent, parce que le ticket le
// laisse ouvert :
//   - le bloc est l'élément marqué `data-cook-roster` ; chaque ligne de cook est l'élément marqué `data-cook-line`, dans une
//     boucle `sc-for` sur `g.lines`, elle-même dans une boucle sur `cookRoster.groups` ; un titre de groupe est posé avant ses lignes ;
//   - `renderVals()` rend `cookRoster` : `{ empty: boolean, emptyLine: string, groups: [{ state: "working" | "waiting", heading,
//     lines: [{ num, title, doing, since, model, stalled, ...style }] }] }` ;
//   - la source des cooks est `this.props.cooks` quand elle est donnée — `[{ num, title, stage, step?, model, lastMoveAt (ISO),
//     waiting? }]` —, sinon les données de la maquette ; le temps écoulé se calcule avec l'horloge (`Date.now()`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const HTML = readFileSync(join(import.meta.dirname, "../../../docs/maquettes/app/Project.dc.html"), "utf8");
const SCRIPT = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(HTML)?.[1] ?? assert.fail("no component script");
const MIN = 60_000;
const ISO = [...SCRIPT.matchAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g)].map((m) => Date.parse(m[0]));
const BASE = ISO.length > 0 ? Math.min(...ISO) : Date.parse("2026-11-23T12:00:00.000Z");

type Ligne = Record<string, any> & { num: string; title: string; doing: string; since: string; model: string; stalled: boolean };
type Groupe = { state: string; heading: string; lines: Ligne[] };
type Roster = { empty: boolean; emptyLine: string; groups: Groupe[] };

function jouer(maintenant: number, props: Record<string, unknown> = {}): Roster {
  class Horloge extends Date {
    constructor(...a: any[]) {
      super(...((a.length > 0 ? a : [maintenant]) as [number]));
    }
    static now() {
      return maintenant;
    }
  }
  class DCLogic {
    props: Record<string, unknown> = {};
  }
  const Composant = new Function("DCLogic", "Date", `${SCRIPT}\nreturn Component;`)(DCLogic, Horloge);
  const composant = new Composant();
  composant.props = props;
  return composant.renderVals().cookRoster ?? assert.fail("renderVals() rend cookRoster");
}
const lignes = (r: Roster, etat?: string): Ligne[] => r.groups.filter((g) => etat === undefined || g.state === etat).flatMap((g) => g.lines);
const minutes = (texte: string): number | undefined => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(s|sec|secs|min|mins|m|h|hr|d)\b/.exec(texte);
  if (m === null) return undefined;
  const n = Number(m[1]);
  return ({ s: n / 60, sec: n / 60, secs: n / 60, min: n, mins: n, m: n, h: n * 60, hr: n * 60, d: n * 1440 } as Record<string, number>)[m[2] as string];
};
// Le texte du balisage de l'élément qui porte `marque`, balises comprises, jusqu'à sa fermeture.
function region(html: string, marque: string): string {
  const i = html.indexOf(marque);
  assert.ok(i >= 0, `le balisage porte ${marque}`);
  const debut = html.lastIndexOf("<", i);
  const nom = /^<([\w-]+)/.exec(html.slice(debut))?.[1] ?? assert.fail("une balise");
  const re = new RegExp(`<(/?)${nom}\\b[^>]*>`, "g");
  re.lastIndex = debut;
  let profondeur = 0;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    profondeur += m[1] === "/" ? -1 : m[0].endsWith("/>") ? 0 : 1;
    if (profondeur === 0) return html.slice(debut, re.lastIndex);
  }
  return assert.fail("balise jamais fermée");
}
const bloc = (): string => region(HTML, "data-cook-roster");
const ligneMarquee = (): string => region(bloc(), "data-cook-line");
const variableDesLignes = (): string => /<sc-for[^>]*list="\{\{\s*\w+\.lines\s*\}\}"[^>]*as="(\w+)"/.exec(bloc())?.[1] ?? assert.fail("une boucle sc-for sur les lignes d'un groupe");

// #4050, critère 7 : un clic sur une ligne ouvre la fiche du ticket de cette ligne.
test("a line is a link or button that carries its own ticket so that clicking it opens that ticket's card", () => {
  const ligne = ligneMarquee();
  const ouvrante = /^<[^>]*>/.exec(ligne)?.[0] ?? "";
  assert.match(ouvrante, /^<(a|button)\b/, "la ligne est cliquable : un lien ou un bouton");
  const v = variableDesLignes();
  const liaisons = [...ouvrante.matchAll(new RegExp(`(href|data-[\\w-]+|onclick)="([^"]*)\\{\\{\\s*${v}\\.(\\w+)\\s*\\}\\}`, "g"))];
  assert.ok(liaisons.length >= 1, "la cible de la ligne vient de la ligne elle-même");
  const cooks = [
    { num: "#9001", title: "One", stage: "Taken", model: "m", lastMoveAt: new Date(BASE - MIN).toISOString() },
    { num: "#9002", title: "Two", stage: "Taken", model: "m", lastMoveAt: new Date(BASE - MIN).toISOString() },
  ];
  const l = lignes(jouer(BASE, { cooks }));
  const cle = liaisons[0]?.[3] as string;
  for (const x of l) assert.ok(String(x[cle]).includes(x.num.replace("#", "")), `la cible de ${x.num} nomme son ticket`);
  assert.notEqual(l[0]?.[cle], l[1]?.[cle], "deux lignes, deux cibles");
});
