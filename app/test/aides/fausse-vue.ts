// La vue jouée sans Electron ni navigateur : `vue.js` tel qu'il est, devant un faux document —
// juste ce qu'elle en touche — et un faux pont. Ce qu'elle pose se relit élément par élément :
// sa balise, sa classe, son texte. Rien n'y est mesuré ni peint — ce qui se voit est dans
// vue.css, que peau.test.ts lit à part.
//   const vue = await jouerLaVue({ demarrage: () => …, espace: () => [second] });
//   vue.element("projets").children[1]?.click();   // un clic du chef
//   vue.dire("surLecture", lecture, pages);          // ce que le process principal envoie
//   await repos();                                   // ce que la vue en fait, promesses comprises
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pont } from "../../src/vue/pont.d.ts";

const VUE = join(import.meta.dirname, "../../src/vue");

type Noeud = Faux | string;
// `dataTransfer` : ce qu'une case glissée porte (voir `glisser`) ; `relatedTarget` : où le pointeur va ;
// `target` : là où le clic est tombé — rien ne remonte d'un élément à son parent, le test le dit.
type Evenement = { key?: string; dataTransfer?: FauxTransfert; relatedTarget?: Faux | null; target?: Faux; preventDefault(): void; stopPropagation(): void };
type Ecoute = (evenement: Evenement) => unknown;

// Un élément : ses enfants, son texte, ses écoutes. Ce que la vue y pose d'autre — `title`,
// `ariaLabel`, `role` — s'y pose comme sur n'importe quel objet.
export class Faux {
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
  // Le nom accessible d'un élément : le texte d'un survol (briques.js) y est lu.
  ariaLabel = "";
  draggable = false;
  // Couvert par une page, le rail ne se clique pas au travers.
  inert = false;
  value = "";
  // Une case à cocher dit si elle l'est.
  checked = false;
  // Un champ dit sa sorte — `date` —, un bouton s'il soumet son formulaire.
  type = "";
  dataset: Record<string, string> = {};
  // Les variables que la vue y pose — la couleur d'un projet —, lues comme elle les a posées.
  style = new FauxStyle();
  parentElement: Faux | null = null;
  #noeuds: Noeud[] = [];
  #ecoutes = new Map<string, Ecoute[]>();
  #attributs = new Set<string>();

  constructor(balise: string) {
    this.balise = balise;
  }

  get textContent(): string {
    return this.#noeuds.map((noeud) => (typeof noeud === "string" ? noeud : noeud.textContent)).join("");
  }
  set textContent(texte: string) {
    this.replaceChildren(...(texte === "" ? [] : [texte]));
  }
  get children(): Faux[] {
    return this.#noeuds.filter((noeud) => typeof noeud !== "string");
  }
  get childElementCount(): number {
    return this.children.length;
  }
  get firstChild(): Noeud | null {
    return this.#noeuds[0] ?? null;
  }
  get classList() {
    const classes = () => this.className.split(" ").filter(Boolean);
    const poser = (nom: string, voulue: boolean) => void (this.className = [...classes().filter((classe) => classe !== nom), ...(voulue ? [nom] : [])].join(" "));
    return {
      contains: (nom: string) => classes().includes(nom),
      add: (nom: string) => poser(nom, true),
      toggle: (nom: string, voulue = !classes().includes(nom)) => poser(nom, voulue),
    };
  }

  // Un nœud n'a qu'une place : posé ici, il quitte celle qu'il avait.
  #adopter(noeuds: Noeud[]): Noeud[] {
    for (const noeud of noeuds) {
      if (typeof noeud === "string") continue;
      noeud.remove();
      noeud.parentElement = this;
    }
    return noeuds;
  }
  append(...noeuds: Noeud[]): void {
    this.#noeuds.push(...this.#adopter(noeuds));
  }
  prepend(...noeuds: Noeud[]): void {
    this.#noeuds.unshift(...this.#adopter(noeuds));
  }
  replaceChildren(...noeuds: Noeud[]): void {
    for (const ancien of this.children) ancien.parentElement = null;
    this.#noeuds = [];
    this.append(...noeuds);
  }
  after(...noeuds: Noeud[]): void {
    const parent = this.parentElement;
    if (parent === null) return;
    const poses = parent.#adopter(noeuds);
    parent.#noeuds.splice(parent.#noeuds.indexOf(this) + 1, 0, ...poses);
  }
  remove(): void {
    const parent = this.parentElement;
    if (parent === null) return;
    parent.#noeuds = parent.#noeuds.filter((noeud) => noeud !== this);
    this.parentElement = null;
  }

  addEventListener(type: string, ecoute: Ecoute): void {
    this.#ecoutes.set(type, [...(this.#ecoutes.get(type) ?? []), ecoute]);
  }
  // Ce que les écoutes ont rendu : une promesse, pour celles qui attendent le pont.
  declencher(type: string, evenement: Partial<Evenement> = {}): unknown[] {
    return (this.#ecoutes.get(type) ?? []).map((ecoute) => ecoute({ preventDefault: () => {}, stopPropagation: () => {}, ...evenement }));
  }
  click(): void {
    if (!this.disabled) this.declencher("click");
  }
  toggleAttribute(nom: string, voulu = !this.#attributs.has(nom)): void {
    if (voulu) this.#attributs.add(nom);
    else this.#attributs.delete(nom);
  }
  // Combien de fois il a pris le clavier.
  focalise = 0;
  focus(): void {
    this.focalise++;
  }
  reset(): void {}

  // Lui-même ou le plus proche de ses parents qui est d'une de ces balises — `button, a` : la vue
  // n'en demande pas plus.
  closest(selecteur: string): Faux | null {
    const balises = selecteur.split(",").map((balise) => balise.trim());
    for (let pose: Faux | null = this; pose !== null; pose = pose.parentElement) if (balises.includes(pose.balise)) return pose;
    return null;
  }

  // Lui-même, ou posé dessous.
  contains(autre: Faux | null): boolean {
    return autre !== null && (autre === this || [...this.descendants()].includes(autre));
  }

  // Tout ce qui est posé dessous, dans l'ordre de la page.
  *descendants(): Generator<Faux> {
    for (const enfant of this.children) {
      yield enfant;
      yield* enfant.descendants();
    }
  }
  // Les éléments de cette balise posés dessous — `pre`, `button`…
  dessous(balise: string): Faux[] {
    return [...this.descendants()].filter((element) => element.balise === balise);
  }
}

// Ce que porte un glisser du navigateur : ses données par type — lisibles au lâcher seulement,
// leurs types à tout moment — et l'effet qu'il annonce.
export class FauxTransfert {
  readonly #donnees = new Map<string, string>();
  effectAllowed = "uninitialized";
  dropEffect = "none";
  get types(): string[] {
    return [...this.#donnees.keys()];
  }
  setData(type: string, valeur: string): void {
    this.#donnees.set(type, valeur);
  }
  getData(type: string): string {
    return this.#donnees.get(type) ?? "";
  }
}

// Le style d'un élément : rien que ses propriétés posées une à une, sans cascade.
export class FauxStyle {
  readonly #proprietes = new Map<string, string>();
  setProperty(nom: string, valeur: string): void {
    this.#proprietes.set(nom, valeur);
  }
  removeProperty(nom: string): void {
    this.#proprietes.delete(nom);
  }
  getPropertyValue(nom: string): string {
    return this.#proprietes.get(nom) ?? "";
  }
}

// Le terminal : ce qu'on lui a réglé à sa création, et ce qui lui a été écrit, tel quel.
export class FauxXterm {
  readonly options: { fontFamily?: string; fontSize?: number; theme?: Record<string, string> };
  readonly ecrits: string[] = [];
  constructor(options: FauxXterm["options"]) {
    this.options = options;
  }
  write(donnees: string): void {
    this.ecrits.push(donnees);
  }
  loadAddon(): void {}
  open(): void {}
  onData(): void {}
  // Le filtre de touches que la vue y a posé : rend faux quand la touche n'est pas à xterm.
  filtre: ((touche: { key: string; type: string; shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => boolean) | undefined;
  attachCustomKeyEventHandler(filtre: NonNullable<FauxXterm["filtre"]>): void {
    this.filtre = filtre;
  }
  onResize(): void {}
  // Combien de fois il a pris le clavier.
  focalise = 0;
  focus(): void {
    this.focalise++;
  }
  dispose(): void {}
}

// Les variables que jetons.css pose sur la racine : le terminal y lit les siennes.
export function jetonsDe(css: string): Map<string, string> {
  const racine = /:root\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";
  return new Map([...racine.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)].map(([, nom = "", valeur = ""]) => [nom, valeur.trim()]));
}

type Ecoutes = { [G in keyof Pont as G extends `sur${string}` ? G : never]: Pont[G] };
type Gestes = Omit<Pont, keyof Ecoutes>;
// Ce que le faux pont répond, geste par geste. Un geste sans réponse rend `undefined`.
export type Reponses = { [G in keyof Gestes]?: (...args: Parameters<Gestes[G]>) => Awaited<ReturnType<Gestes[G]>> };

export type Jouee = {
  // Un élément de la page, par son `id` — posé par index.html, ou par la vue.
  element(id: string): Faux;
  // Tout ce qui est dans la page : ses éléments, et ce que la vue a posé dessous.
  poses(): Faux[];
  // Ce que le process principal envoie à la vue : la lecture d'une box, la sortie d'un terminal…
  dire<E extends keyof Ecoutes>(ecoute: E, ...args: Parameters<Parameters<Ecoutes[E]>[0]>): void;
  // Ce que la vue a demandé au pont, dans l'ordre.
  appels: { geste: string; args: unknown[] }[];
  // Le dernier appel d'un geste : ses arguments.
  dernier(geste: keyof Gestes): unknown[];
  xterms: FauxXterm[];
  // Les polices que la vue a fait charger avant d'ouvrir un terminal.
  polices: string[];
};

let jouees = 0;

// Charge une vue neuve — son module entier, jusqu'à son premier affichage.
export async function jouerLaVue(reponses: Reponses & Required<Pick<Reponses, "demarrage">>): Promise<Jouee> {
  const html = readFileSync(join(VUE, "index.html"), "utf8");
  const jetons = jetonsDe(readFileSync(join(VUE, "jetons.css"), "utf8"));

  // Les éléments que la page porte et que la vue prend par leur nom : ceux qui ont un `id`, et
  // `main`. Leur place dans la page n'est pas rejouée.
  const parId = new Map<string, Faux>();
  const principal = new Faux("main");
  for (const [, balise = "", attributs = ""] of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const id = /\bid="([^"]+)"/.exec(attributs)?.[1];
    if (id === undefined) continue;
    const pose = new Faux(balise);
    pose.id = id;
    pose.className = /\bclass="([^"]+)"/.exec(attributs)?.[1] ?? "";
    pose.hidden = /\shidden\b/.test(attributs);
    parId.set(id, pose);
  }
  const trouver = (id: string): Faux | null => {
    const pose = parId.get(id);
    if (pose !== undefined) return pose;
    for (const racine of [principal, ...parId.values()]) for (const element of racine.descendants()) if (element.id === id) return element;
    return null;
  };

  const appels: Jouee["appels"] = [];
  const ecoutes = new Map<string, (...args: unknown[]) => void>();
  const xterms: FauxXterm[] = [];
  const polices: string[] = [];
  const pont = new Proxy(
    {},
    {
      get:
        (_, geste: string) =>
        (...args: unknown[]) => {
          if (geste.startsWith("sur")) return void ecoutes.set(geste, args[0] as (...recus: unknown[]) => void);
          appels.push({ geste, args });
          const repondre = (reponses as Record<string, ((...recus: unknown[]) => unknown) | undefined>)[geste];
          return Promise.resolve(repondre?.(...args));
        },
    },
  );

  Object.assign(globalThis, {
    window: { brigade: pont },
    document: {
      documentElement: new Faux("html"),
      fonts: { load: (police: string) => (polices.push(police), Promise.resolve([])) },
      getElementById: trouver,
      querySelector: (selecteur: string) => (selecteur === "main" ? principal : null),
      createElement: (balise: string) => new Faux(balise),
    },
    getComputedStyle: () => ({ getPropertyValue: (nom: string) => jetons.get(nom) ?? "" }),
    ResizeObserver: class {
      observe(): void {}
    },
    Option: function (this: Faux, texte: string, valeur: string) {
      const option = new Faux("option");
      option.textContent = texte;
      option.value = valeur;
      return option;
    },
    fauxXterm: {
      FitAddon: class {
        fit(): void {}
      },
      Xterm: class extends FauxXterm {
        constructor(options: FauxXterm["options"]) {
          super(options);
          xterms.push(this);
        }
      },
    },
  });

  // Le module de la vue, tel qu'il est — moins ses deux imports de xterm, que le navigateur
  // résout par l'import map de index.html : ici, les faux prennent leur place. Ses modules à elle
  // (`./briques.js`, `./cost/tete.js`), le navigateur les résout à côté d'elle : ici, par leur adresse
  // sur le disque, une vue jouée depuis une adresse `data:` n'ayant pas d'« à côté ».
  const source = readFileSync(join(VUE, "vue.js"), "utf8");
  const imports = /^import \{ FitAddon \} from "@xterm\/addon-fit";\nimport \{ Terminal as Xterm \} from "@xterm\/xterm";$/m;
  const siens = /^(import \{[^}]*\} from )"\.\/((?:[a-z-]+\/)*[a-z-]+\.js)";$/gm;
  if (!imports.test(source) || /^import /m.test(source.replace(imports, "").replace(siens, ""))) throw new Error("vue.js n'importe plus ce que la fausse vue remplace : ses deux imports de xterm, et ses propres modules");
  const jouable = `${source.replace(imports, "const { FitAddon, Xterm } = globalThis.fauxXterm;").replace(siens, (_, debut: string, module: string) => `${debut}${JSON.stringify(pathToFileURL(join(VUE, module)).href)};`)}\n// vue jouée n° ${++jouees}`;
  await import(`data:text/javascript;base64,${Buffer.from(jouable).toString("base64")}`);
  await repos();

  return {
    element(id) {
      const pose = id === "main" ? principal : trouver(id);
      if (pose === null) throw new Error(`aucun élément « ${id} » dans la page`);
      return pose;
    },
    poses: () => [...new Set([principal, ...parId.values()].flatMap((racine) => [racine, ...racine.descendants()]))],
    dire(ecoute, ...args) {
      const recevoir = ecoutes.get(ecoute);
      if (recevoir === undefined) throw new Error(`la vue n'écoute pas « ${ecoute} »`);
      recevoir(...args);
    },
    appels,
    dernier(geste) {
      const appel = appels.findLast((fait) => fait.geste === geste);
      if (appel === undefined) throw new Error(`la vue n'a pas appelé « ${geste} »`);
      return appel.args;
    },
    xterms,
    polices,
  };
}

// Ce que la vue fait d'un clic ou d'une lecture, promesses comprises : le faux pont répond sans
// attendre, tout est donc fait quand la file des promesses est vide — aucun délai n'est couru.
export const repos = (): Promise<void> => new Promise((fait) => setImmediate(fait));

// Ouvre une lecture comme le chef le fait depuis l'écran principal : Cooks sous l'onglet Coût ;
// Rail, Manager et Grants sous Paramètres, par sa rangée de lectures ; Log, par le geste « journal ».
// Rend l'élément cliqué en dernier.
export async function ouvrirLecture(vue: Jouee, titre: string): Promise<Faux> {
  const cliquer = async (ou: Faux | undefined, nom: string): Promise<Faux> => {
    const pose = ou?.children.find((candidat) => candidat.textContent === nom) ?? ou?.dessous("button").find((candidat) => candidat.textContent === nom);
    if (pose === undefined) throw new Error(`pas de « ${nom} »`);
    pose.click();
    await repos();
    return pose;
  };
  if (titre === "Log") {
    const geste = vue.element("journal");
    geste.click();
    await repos();
    return geste;
  }
  if (titre === "Cooks") return cliquer(vue.element("onglets"), "Cost");
  await cliquer(vue.element("onglets"), "Settings");
  return cliquer(vue.element("parametres-onglets"), titre);
}
