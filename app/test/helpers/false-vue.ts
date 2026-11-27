// La vue jouée sans Electron ni navigateur : `vue.js` tel qu'il est, devant un faux document —
// juste ce qu'elle en touche — et un faux pont. Ce qu'elle pose se relit élément par élément :
// sa balise, sa classe, son texte. Rien n'y est mesuré ni peint — ce qui se voit est dans
// vue.css, que skin.test.ts lit à part.
//   const vue = await jouerLaVue({ demarrage: () => …, espace: () => [second] });
//   vue.element("projets").children[1]?.click();   // un clic du chef
//   vue.dire("surFaits", recue);                     // ce que le process principal envoie
//   await repos();                                   // ce que la vue en fait, promesses comprises
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInThisContext } from "node:vm";
import type { Bridge } from "../../src/vue/bridge.d.ts";

const VUE = join(import.meta.dirname, "../../src/vue");

type Node = Fake | string;
// `dataTransfer` : ce qu'une case glissée porte (voir `glisser`) ; `relatedTarget` : où le pointeur va ;
// `target` : là où le clic est tombé — rien ne remonte d'un élément à son parent, le test le dit.
type Touch = { clientX: number; clientY: number };
// `clientX`, `clientY`, `pointerId`, `deltaY` : un pointeur, un doigt, la molette (le détail en grand d'une validation, #3212).
type Event = { touches?: Touch[]; changedTouches?: Touch[]; key?: string; clientX?: number; clientY?: number; pointerId?: number; deltaY?: number; dataTransfer?: FakeTransfer; relatedTarget?: Fake | null; target?: Fake; preventDefault(): void; stopPropagation(): void };
type Listens = (event: Event) => unknown;

// Un élément : ses enfants, son texte, ses écoutes. Ce que la vue y pose d'autre — `title`,
// `ariaLabel`, `role` — s'y pose comme sur n'importe quel objet.
export class Fake {
  readonly balise: string;
  id = "";
  className = "";
  hidden = false;
  disabled = false;
  title = "";
  // Un onglet dit s'il est celui qui est affiché.
  ariaSelected = "";
  ariaPressed = "";
  // Un bouton qui déplie — un détail, une confirmation — dit s'il l'a fait ; nul, il ne déplie rien.
  ariaExpanded: string | null = "";
  // Un interrupteur dit son rôle, et s'il est allumé — « mixed » : on ne sait pas.
  role = "";
  ariaChecked = "";
  // L'entrée de la barre qui est affichée, et celle qui se glisse.
  ariaCurrent = "";
  // Le nom accessible d'un élément : le texte d'un survol (bricks.js) y est lu.
  ariaLabel = "";
  draggable = false;
  // Couvert par une page, le rail ne se clique pas au travers.
  inert = false;
  value = "";
  // Ce qu'un champ montre vide, s'il se lit sans se changer, et s'il est signalé.
  placeholder = "";
  readOnly = false;
  ariaInvalid = "";
  // Une case à cocher dit si elle l'est.
  checked = false;
  // Un champ dit sa sorte — `date` —, un bouton s'il soumet son formulaire.
  type = "";
  dataset: Record<string, string> = {};
  // Les variables que la vue y pose — la couleur d'un projet —, lues comme elle les a posées.
  style = new FakeStyle();
  parentElement: Fake | null = null;
  #noeuds: Node[] = [];
  #ecoutes = new Map<string, Listens[]>();
  #attributs = new Set<string>();

  constructor(balise: string) {
    this.balise = balise;
  }

  get tagName(): string {
    return this.balise.toUpperCase();
  }
  get textContent(): string {
    return this.#noeuds.map((node) => (typeof node === "string" ? node : node.textContent)).join("");
  }
  set textContent(text: string) {
    this.replaceChildren(...(text === "" ? [] : [text]));
  }
  get children(): Fake[] {
    return this.#noeuds.filter((node) => typeof node !== "string");
  }
  get childElementCount(): number {
    return this.children.length;
  }
  get firstChild(): Node | null {
    return this.#noeuds[0] ?? null;
  }
  get classList() {
    const classes = () => this.className.split(" ").filter(Boolean);
    const set = (name: string, wantedOne: boolean) => void (this.className = [...classes().filter((classe) => classe !== name), ...(wantedOne ? [name] : [])].join(" "));
    return {
      contains: (name: string) => classes().includes(name),
      add: (name: string) => set(name, true),
      toggle: (name: string, wantedOne = !classes().includes(name)) => set(name, wantedOne),
    };
  }

  // Un nœud n'a qu'une place : posé ici, il quitte celle qu'il avait.
  #adopter(noeuds: Node[]): Node[] {
    for (const node of noeuds) {
      if (typeof node === "string") continue;
      node.remove();
      node.parentElement = this;
    }
    return noeuds;
  }
  // Adoptés d'abord : un enfant déjà posé ici quitte sa place avant d'aller au bout, comme dans le DOM.
  append(...noeuds: Node[]): void {
    const adopted = this.#adopter(noeuds);
    this.#noeuds.push(...adopted);
  }
  prepend(...noeuds: Node[]): void {
    const adopted = this.#adopter(noeuds);
    this.#noeuds.unshift(...adopted);
  }
  replaceChildren(...noeuds: Node[]): void {
    for (const old of this.children) old.parentElement = null;
    this.#noeuds = [];
    this.append(...noeuds);
  }
  after(...noeuds: Node[]): void {
    const parent = this.parentElement;
    if (parent === null) return;
    const poses = parent.#adopter(noeuds);
    parent.#noeuds.splice(parent.#noeuds.indexOf(this) + 1, 0, ...poses);
  }
  remove(): void {
    const parent = this.parentElement;
    if (parent === null) return;
    parent.#noeuds = parent.#noeuds.filter((node) => node !== this);
    this.parentElement = null;
  }

  addEventListener(type: string, listens: Listens): void {
    this.#ecoutes.set(type, [...(this.#ecoutes.get(type) ?? []), listens]);
  }
  // Ce que les écoutes ont rendu : une promesse, pour celles qui attendent le pont.
  declencher(type: string, event: Partial<Event> = {}): unknown[] {
    return (this.#ecoutes.get(type) ?? []).map((listens) => listens({ preventDefault: () => {}, stopPropagation: () => {}, ...event }));
  }
  click(): void {
    if (!this.disabled) this.declencher("click");
  }
  // Un attribut posé par son nom — ce que la vue écrit d'un élément SVG, qui n'a pas de propriétés pour cela.
  #valeurs = new Map<string, string>();
  setAttribute(name: string, value: string): void {
    this.#valeurs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.#valeurs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.#attributs.has(name);
  }
  toggleAttribute(name: string, wanted = !this.#attributs.has(name)): void {
    if (wanted) this.#attributs.add(name);
    else this.#attributs.delete(name);
  }
  // Combien de fois il a pris le clavier.
  focalise = 0;
  focus(): void {
    this.focalise++;
  }
  reset(): void {}

  // La boîte de l'élément à l'écran : rien n'est mesuré ici, un test la pose. Un pointeur la reprend, sans rien en faire.
  boite = { left: 0, top: 0, width: 0, height: 0 };
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return this.boite;
  }
  setPointerCapture(): void {}

  // Lui-même ou le plus proche de ses parents qui est d'une de ces balises — `button, a` : la vue
  // n'en demande pas plus.
  closest(selector: string): Fake | null {
    const balises = selector.split(",").map((balise) => balise.trim());
    for (let pose: Fake | null = this; pose !== null; pose = pose.parentElement) if (balises.includes(pose.balise)) return pose;
    return null;
  }

  // Lui-même, ou posé dessous.
  contains(other: Fake | null): boolean {
    return other !== null && (other === this || [...this.descendants()].includes(other));
  }

  // Ceux posés dessous qui sont d'une de ces balises — `input, textarea` : la vue n'en demande pas plus.
  querySelectorAll(selector: string): Fake[] {
    const balises = selector.split(",").map((balise) => balise.trim());
    return [...this.descendants()].filter(({ balise }) => balises.includes(balise));
  }

  // Tout ce qui est posé dessous, dans l'ordre de la page, en tableau : un test en compte (`.filter(…).length`, #4241).
  descendants(): Fake[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  // Les éléments de cette balise posés dessous — `pre`, `button`…
  dessous(balise: string): Fake[] {
    return [...this.descendants()].filter((element) => element.balise === balise);
  }
}

// Ce que porte un glisser du navigateur : ses données par type — lisibles au lâcher seulement,
// leurs types à tout moment — et l'effet qu'il annonce.
export class FakeTransfer {
  readonly #donnees = new Map<string, string>();
  effectAllowed = "uninitialized";
  dropEffect = "none";
  get types(): string[] {
    return [...this.#donnees.keys()];
  }
  setData(type: string, value: string): void {
    this.#donnees.set(type, value);
  }
  getData(type: string): string {
    return this.#donnees.get(type) ?? "";
  }
}

// Le style d'un élément : rien que ses propriétés posées une à une, sans cascade.
export class FakeStyle {
  readonly #proprietes = new Map<string, string>();
  setProperty(name: string, value: string): void {
    this.#proprietes.set(name, value);
  }
  removeProperty(name: string): void {
    this.#proprietes.delete(name);
  }
  getPropertyValue(name: string): string {
    return this.#proprietes.get(name) ?? "";
  }
  get color(): string {
    return this.getPropertyValue("color");
  }
}

// Le terminal : ce qu'on lui a réglé à sa création, et ce qui lui a été écrit, tel quel.
export class FakeXterm {
  readonly options: { fontFamily?: string; fontSize?: number; theme?: Record<string, string> };
  readonly ecrits: string[] = [];
  constructor(options: FakeXterm["options"]) {
    this.options = options;
  }
  write(data: string): void {
    this.ecrits.push(data);
  }
  loadAddon(): void {}
  open(): void {}
  // Ce que la vue fait d'une frappe : un test tape, comme le chef au clavier.
  private saisie: ((data: string) => void) | undefined;
  onData(listens: (data: string) => void): void {
    this.saisie = listens;
  }
  taper(data: string): void {
    this.saisie?.(data);
  }
  // Le filtre de touches que la vue y a posé : rend faux quand la touche n'est pas à xterm.
  filtre: ((key: { key: string; type: string; shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => boolean) | undefined;
  attachCustomKeyEventHandler(filter: NonNullable<FakeXterm["filtre"]>): void {
    this.filtre = filter;
  }
  onResize(): void {}
  // Le titre que `claude` donne à son terminal : un test le change, comme `claude` le fait (ticket 3166).
  private titreChange: ((title: string) => void) | undefined;
  onTitleChange(listens: (title: string) => void): void {
    this.titreChange = listens;
  }
  titrer(title: string): void {
    this.titreChange?.(title);
  }
  // Ce que le chef y a sélectionné : un test le pose, comme le chef à la souris.
  selection = "";
  hasSelection(): boolean {
    return this.selection !== "";
  }
  getSelection(): string {
    return this.selection;
  }
  // Combien de fois il a pris le clavier.
  focalise = 0;
  focus(): void {
    this.focalise++;
  }
  dispose(): void {}
}

// Les variables que tokens.css pose sur la racine : le terminal y lit les siennes.
export function tokensOf(css: string): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";
  return new Map([...root.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name = "", value = ""]) => [name, value.trim()]));
}

type Listeners = { [G in keyof Bridge as G extends `sur${string}` ? G : never]: Bridge[G] };
type Actions = Omit<Bridge, keyof Listeners>;
// Ce que le faux pont répond, geste par geste — tout de suite, ou quand ce qu'il a lancé a fini. Un geste sans réponse
// rend `undefined`.
export type Answers = { [G in keyof Actions]?: (...args: Parameters<NonNullable<Actions[G]>>) => Awaited<ReturnType<NonNullable<Actions[G]>>> | Promise<Awaited<ReturnType<NonNullable<Actions[G]>>>> };

export type Played = {
  // Un élément de la page, par son `id` — posé par index.html, ou par la vue.
  element(id: string): Fake;
  // Tout ce qui est dans la page : ses éléments, et ce que la vue a posé dessous.
  poses(): Fake[];
  // Ce que le process principal envoie à la vue : la lecture d'une box, la sortie d'un terminal…
  dire<E extends keyof Listeners>(listens: E, ...args: Parameters<Parameters<NonNullable<Listeners[E]>>[0]>): void;
  // Ce que la vue a demandé au pont, dans l'ordre.
  appels: { geste: string; args: unknown[] }[];
  // Le dernier appel d'un geste : ses arguments.
  dernier(action: keyof Actions): unknown[];
  xterms: FakeXterm[];
  // Les polices que la vue a fait charger avant d'ouvrir un terminal.
  polices: string[];
};

// Le stockage de la vue (`window.localStorage`) : ce qu'elle y a écrit, par clé. Un test le passe à deux vues
// jouées l'une après l'autre — l'app fermée puis rouverte.
export class FakeStorage {
  readonly valeurs = new Map<string, string>();
  getItem(key: string): string | null {
    return this.valeurs.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.valeurs.set(key, value);
  }
}

// La largeur de l'écran, telle que la vue la demande (`window.matchMedia`, #1186) : étroit ou non, et la requête posée.
// `changer` fait comme un téléphone qu'on tourne : la requête change de réponse, et la vue en est avertie.
export class FakeScreen {
  matches: boolean;
  readonly requetes: string[] = [];
  readonly #ecoutes: (() => void)[] = [];
  constructor(narrow: boolean) {
    this.matches = narrow;
  }
  addEventListener(_type: string, listens: () => void): void {
    this.#ecoutes.push(listens);
  }
  changer(narrow: boolean): void {
    this.matches = narrow;
    for (const listens of this.#ecoutes) listens();
  }
}

// Le module de la vue, tel qu'il est — moins ses deux imports de xterm, que le navigateur résout par
// l'import map de index.html : ici, les faux prennent leur place. Ses modules à elle (`./bricks.js`,
// `./cost/head.js`), le navigateur les résout à côté d'elle : ici, ils sont chargés par leur adresse sur
// le disque, une fois par process comme dans la page, et chacun de ses imports devient la lecture
// du module chargé — une ligne pour une ligne, les lignes d'une erreur restent celles de vue.js.
// Le reste est joué tel quel, comme le corps d'une fonction asynchrone en mode strict — ce qu'est
// un module, `await` compris : chaque vue est jouée de zéro, mais sur le même texte, que V8
// n'analyse et ne compile qu'une fois par process. Importée comme un module, la vue devait avoir
// une adresse neuve à chaque fois, et ses 400 Ko étaient relus, décodés et recompilés à chaque vue.
// Ses minuteries (`setInterval`, `setTimeout`) sont celles du process, mais ne le retiennent pas (#2537) :
// une page vit tant que sa fenêtre est ouverte, une vue jouée ne se ferme jamais, et ses minuteries
// tenaient le fichier de tests ouvert pour toujours — sans `--test-force-exit`, un `node --test` à la
// main ne rendait jamais la main. Elles se lisent sur `globalThis` à chaque appel : les minuteries
// simulées d'un test (`t.mock.timers`) les remplacent comme avant. Elles tiennent sur la première
// ligne : celles de vue.js ne bougent pas.
const TIMERS_WITHOUT_HELD = [
  "const setInterval = (...args) => { const minuterie = globalThis.setInterval(...args); minuterie?.unref?.(); return minuterie; };",
  "const setTimeout = (...args) => { const minuterie = globalThis.setTimeout(...args); minuterie?.unref?.(); return minuterie; };",
].join(" ");
let playable: { texte: string; modules: string[] } | undefined;
function theVuePlayable(): { texte: string; modules: string[] } {
  if (playable !== undefined) return playable;
  const source = readFileSync(join(VUE, "vue.js"), "utf8");
  const imports = /^import \{ FitAddon \} from "@xterm\/addon-fit";\nimport \{ Terminal as Xterm \} from "@xterm\/xterm";$/m;
  const itsOwn = /^import (\{[^}]*\}) from "\.\/((?:[a-z-]+\/)*[A-Za-z-]+\.js)";$/gm;
  if (!imports.test(source) || /^import /m.test(source.replace(imports, "").replace(itsOwn, ""))) throw new Error("vue.js n'importe plus ce que la fausse vue remplace : ses deux imports de xterm, et ses propres modules");
  const modules: string[] = [];
  const body = source.replace(imports, "const { FitAddon } = globalThis.fauxXterm;\nconst { Xterm } = globalThis.fauxXterm;").replace(itsOwn, (_, names: string, module: string) => {
    modules.push(module);
    return `const ${names.replace(/\b([A-Za-z_$][\w$]*) as ([A-Za-z_$][\w$]*)\b/g, "$1: $2")} = globalThis.modulesDeLaVue[${JSON.stringify(module)}];`;
  });
  playable = { texte: `(async function () { "use strict"; ${TIMERS_WITHOUT_HELD} ${body}\n})`, modules };
  return playable;
}

// Charge une vue neuve — son module entier, jusqu'à son premier affichage. Sans stockage, la vue n'en a pas ; sans
// écran, elle n'a pas de `matchMedia` : elle est large. `session` : le stockage de la session de la fenêtre
// (`window.sessionStorage`) — passé à deux vues jouées l'une après l'autre, c'est la fenêtre rechargée (#3159).
export async function playTheVue(answers: Answers & Required<Pick<Answers, "demarrage">>, { stockage: storage, ecran: screen, session }: { stockage?: FakeStorage; ecran?: FakeScreen; session?: FakeStorage } = {}): Promise<Played> {
  const html = readFileSync(join(VUE, "index.html"), "utf8");
  const tokens = tokensOf(readFileSync(join(VUE, "tokens.css"), "utf8"));

  // Les éléments que la page porte et que la vue prend par leur nom : ceux qui ont un `id`, et
  // `main`. Leur place dans la page n'est pas rejouée.
  const parId = new Map<string, Fake>();
  const principal = new Fake("main");
  for (const [, balise = "", attributs = ""] of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const id = /\bid="([^"]+)"/.exec(attributs)?.[1];
    if (id === undefined) continue;
    const pose = new Fake(balise);
    pose.id = id;
    pose.className = /\bclass="([^"]+)"/.exec(attributs)?.[1] ?? "";
    pose.hidden = /\shidden\b/.test(attributs);
    parId.set(id, pose);
  }
  const find = (id: string): Fake | null => {
    const pose = parId.get(id);
    if (pose !== undefined) return pose;
    for (const root of [principal, ...parId.values()]) for (const element of root.descendants()) if (element.id === id) return element;
    return null;
  };

  const calls: Played["appels"] = [];
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const xterms: FakeXterm[] = [];
  const fonts: string[] = [];
  const bridge = new Proxy(
    {},
    {
      get:
        (_, action: string) =>
        (...args: unknown[]) => {
          if (action.startsWith("sur")) return void listeners.set(action, args[0] as (...receivedOnes: unknown[]) => void);
          calls.push({ geste: action, args });
          const reply = (answers as Record<string, ((...receivedOnes: unknown[]) => unknown) | undefined>)[action];
          return Promise.resolve(reply?.(...args));
        },
    },
  );

  Object.assign(globalThis, {
    window: {
      brigade: bridge,
      ...(storage === undefined ? {} : { localStorage: storage }),
      ...(session === undefined ? {} : { sessionStorage: session }),
      ...(screen === undefined ? {} : { matchMedia: (request: string) => (screen.requetes.push(request), screen) }),
    },
    document: {
      documentElement: new Fake("html"),
      fonts: { load: (police: string) => (fonts.push(police), Promise.resolve([])) },
      getElementById: find,
      querySelector: (selector: string) => (selector === "main" ? principal : null),
      createElement: (balise: string) => new Fake(balise),
      // Le tracé de la page des coûts (cost/curve.js) : un élément SVG s'y pose comme un autre.
      createElementNS: (_namespace: string, balise: string) => new Fake(balise),
    },
    getComputedStyle: () => ({ getPropertyValue: (name: string) => tokens.get(name) ?? "" }),
    ResizeObserver: class {
      observe(): void {}
    },
    Option: function (this: Fake, text: string, value: string) {
      const option = new Fake("option");
      option.textContent = text;
      option.value = value;
      return option;
    },
    fauxXterm: {
      FitAddon: class {
        fit(): void {}
      },
      Xterm: class extends FakeXterm {
        constructor(options: FakeXterm["options"]) {
          super(options);
          xterms.push(this);
        }
      },
    },
  });

  const { texte: text, modules } = theVuePlayable();
  const loads = await Promise.all(modules.map(async (module) => [module, await import(pathToFileURL(join(VUE, module)).href)] as const));
  Object.assign(globalThis, { modulesDeLaVue: Object.fromEntries(loads) });
  await (runInThisContext(text, { filename: join(VUE, "vue.js") }) as () => Promise<void>)();
  await repos();

  return {
    element(id) {
      const pose = id === "main" ? principal : find(id);
      if (pose === null) throw new Error(`aucun élément « ${id} » dans la page`);
      return pose;
    },
    poses: () => [...new Set([principal, ...parId.values()].flatMap((root) => [root, ...root.descendants()]))],
    dire(listens, ...args) {
      const receive = listeners.get(listens);
      if (receive === undefined) throw new Error(`la vue n'écoute pas « ${listens} »`);
      receive(...args);
    },
    appels: calls,
    dernier(action) {
      const call = calls.findLast((done) => done.geste === action);
      if (call === undefined) throw new Error(`la vue n'a pas appelé « ${action} »`);
      return call.args;
    },
    xterms,
    polices: fonts,
  };
}

// Ce que la vue fait d'un clic ou d'une lecture, promesses comprises : le faux pont répond sans
// attendre, tout est donc fait quand la file des promesses est vide — aucun délai n'est couru.
export const repos = (): Promise<void> => new Promise((done) => setImmediate(done));

// Montre un onglet du projet comme le chef : d'un clic sur le menu, à côté de son nom (#1184, #2485, #2921). Rend l'onglet cliqué.
export async function openTab(vue: Played, title: "Rail" | "Stations"): Promise<Fake> {
  const tab = vue.element("onglets-du-projet").children.find((candidate) => candidate.textContent === title);
  if (tab === undefined) throw new Error(`pas d'onglet « ${title} »`);
  tab.click();
  await repos();
  return tab;
}

// La carte d'un ticket, sur l'onglet montré (toutes les colonnes sont sur Rail) :
// cherchée sur l'onglet montré, puis sur l'autre, montré d'un clic comme le chef le ferait.
export function cardOfTicket(vue: Played, number: number): Fake | undefined {
  const finds = () => vue.element("rail").dessous("li").find((li) => li.className === "bon" && li.children[0]?.children[0]?.textContent === `#${number}`);
  const here = finds();
  if (here !== undefined) return here;
  vue.element("onglets-du-projet").children.find((tab) => tab.textContent === "Rail")?.click();
  return finds();
}

// Ouvre une lecture comme le chef le fait depuis l'écran principal : Settings — une seule
// page, qui ne lit rien (#1700) ; Log, par le geste « journal ». Rend l'élément
// cliqué en dernier. Les pages Rail, Manager et General de Settings n'existent plus : les demander lève.
export async function openRead(vue: Played, title: string): Promise<Fake> {
  const click = async (or: Fake | undefined, name: string): Promise<Fake> => {
    const pose = or?.children.find((candidate) => candidate.textContent === name) ?? or?.dessous("button").find((candidate) => candidate.textContent === name);
    if (pose === undefined) throw new Error(`pas de « ${name} »`);
    pose.click();
    await repos();
    return pose;
  };
  if (title !== "Settings") throw new Error(`pas de page « ${title} » : Settings n'a plus de sous-pages (#1700)`);
  return click(vue.element("onglets-du-projet"), "Settings");
}

// Les lignes de tous les projets, « Cost » et « Closer », sont en bas du bandeau de santé de chaque projet (#2638, #2921), une
// section de Settings (#3014) : le premier projet de la barre s'ouvre, puis Settings, comme le chef le fait. Rend la ligne qui
// porte ce nom.
async function lineOfAllTheProjects(vue: Played, name: string): Promise<Fake> {
  vue.element("projets").children[1]?.click();
  await repos();
  await openRead(vue, "Settings");
  const line = vue.element("de-tous-les-projets").dessous("button").find(({ ariaLabel }) => ariaLabel === name);
  if (line === undefined) throw new Error(`pas de ligne « ${name} » dans le bandeau de santé`);
  return line;
}

// Ouvre la page des coûts de tous les projets comme le chef le fait (#1022) : par sa ligne « Cost », sous Health (#2638).
// Rend la page.
export async function openTheCosts(vue: Played): Promise<Fake> {
  (await lineOfAllTheProjects(vue, "the cost of all projects")).click();
  await repos();
  return vue.element("cout");
}

// Toutes les stations et « + station », un bloc de l'accueil (#3195) : l'entrée « Tous les projets » de la barre l'ouvre.
// Rend leur bloc.
export async function openAllTheStations(vue: Played): Promise<Fake> {
  vue.element("projets").children[0]?.click();
  await repos();
  return vue.element("toutes-les-stations");
}
