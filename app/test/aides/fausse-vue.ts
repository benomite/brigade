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
import type { Pont } from "../../src/vue/pont.d.ts";

const VUE = join(import.meta.dirname, "../../src/vue");

type Noeud = Faux | string;
type Evenement = { key?: string; preventDefault(): void };
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
  value = "";
  dataset: Record<string, string> = {};
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
    return (this.#ecoutes.get(type) ?? []).map((ecoute) => ecoute({ preventDefault: () => {}, ...evenement }));
  }
  click(): void {
    if (!this.disabled) this.declencher("click");
  }
  toggleAttribute(nom: string, voulu = !this.#attributs.has(nom)): void {
    if (voulu) this.#attributs.add(nom);
    else this.#attributs.delete(nom);
  }
  focus(): void {}
  reset(): void {}

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
  onResize(): void {}
  focus(): void {}
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
  // résout par l'import map de index.html : ici, les faux prennent leur place.
  const source = readFileSync(join(VUE, "vue.js"), "utf8");
  const imports = /^import \{ FitAddon \} from "@xterm\/addon-fit";\nimport \{ Terminal as Xterm \} from "@xterm\/xterm";$/m;
  if (!imports.test(source) || /^import /m.test(source.replace(imports, ""))) throw new Error("vue.js n'importe plus ce que la fausse vue remplace : ses deux imports de xterm, et eux seuls");
  const jouable = `${source.replace(imports, "const { FitAddon, Xterm } = globalThis.fauxXterm;")}\n// vue jouée n° ${++jouees}`;
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
