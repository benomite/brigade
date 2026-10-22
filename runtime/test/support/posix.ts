// `describe` et `test` de node:test pour un fichier dont tous les tests supposent un système POSIX :
// un faux `claude`/`gh` écrit en script shell, ou un vrai dépôt git que la CI Windows refuse. Sous
// Windows chaque test se saute en disant pourquoi (« skipped on win32: … ») ; ailleurs rien ne change.
// Un test qui porte déjà son propre `skip` le garde.
import { describe as decrire, test as tester, type TestContext } from "node:test";
import { posixOnly } from "./plateforme.ts";

export type { TestContext };

const RAISON = "the file drives POSIX shell scripts (fake claude, gh or launcher) or a real git repository";

type Options = { skip?: unknown } & Record<string, unknown>;

function garder<F extends (...args: any[]) => any>(vrai: F): F {
  return ((...args: unknown[]) => {
    const i = args.findIndex((a) => typeof a === "object" && a !== null);
    const raison = posixOnly(RAISON);
    if (raison === false) return vrai(...args);
    if (i >= 0) {
      const options = args[i] as Options;
      args[i] = options.skip === undefined ? { ...options, skip: raison } : options;
    } else {
      const fn = args.findIndex((a) => typeof a === "function");
      args.splice(fn >= 0 ? fn : args.length, 0, { skip: raison });
    }
    return vrai(...args);
  }) as F;
}

export const test = garder(tester);
export const describe = garder(decrire);
