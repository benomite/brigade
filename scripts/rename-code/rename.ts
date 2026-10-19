// The mechanical rename of the code (#1003, #1039): the glossary terms of
// `runtime/` and `app/` identifiers and file names become English, everywhere
// at once, by following the references the TypeScript language service finds
// — never by rewriting a file by hand. Usage and replay: README.md.
//
//   rename.sh                 dry run: rename a copy of the commit, prove that
//                             every name still resolves to the same declaration
//                             as before, print what was done; the repository
//                             is not touched
//   rename.sh --keep <dir>    the same, keeping the renamed copy at <dir>
//   rename.sh --apply         rename this tree, then prove; undone whole if the
//                             proof fails
//   rename.sh --check         list the glossary terms left in identifiers and
//                             file names that the table does not keep: exit 1
//                             if there is one
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { exchangedMembers, findNode } from "./exchanged.ts";
import { FIXUPS, KEPT_FILES, KEPT_MEMBERS, KEPT_NAMES, NAMES, PATHS, WORDS } from "./table.ts";
import { translate } from "./words.ts";

// The tree the tool works on: the repository it lives in, or the copy a dry
// run makes of it (`main`).
const HOME = resolve(import.meta.dirname, "../..");
let REPO = HOME;
// Where names are renamed: declarations and file names.
const OWN = ["runtime/src", "runtime/test", "app/src", "app/test"];
// Code that only follows: it imports the renamed code, its references and the
// paths it names follow, its own names do not change.
const FOLLOWERS = ["scripts/capture-ecran"];
// Text whose paths follow the renamed files. History (the CHANGELOG, the
// dated specs) is left as it was written; the role files are the agents'
// voice and name no renamed file.
const PATH_TEXT = ["runtime", "app", "scripts/capture-ecran", ".claude/brigade", "docs", "README.md", "CLAUDE.md"];
const PATH_TEXT_SKIPPED = ["docs/superpowers/"];
// The zones whose dependencies the program's types come from: those
// `.claude/brigade/worktree-setup.sh` installs.
const DEPENDENCIES = ["runtime", "app"];

const translator = { words: WORDS };
const rel = (file: string) => relative(REPO, file);
const abs = (file: string) => join(REPO, file);
const tracked = (...paths: string[]): string[] =>
  execFileSync("git", ["ls-files", "-z", "--", ...paths], { cwd: REPO, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((file) => existsSync(abs(file)));
const under = (file: string, roots: string[]) => roots.some((root) => file === root || file.startsWith(root + "/"));
const isCode = (file: string) => /\.(?:ts|js|cjs|mjs)$/.test(file) && !file.endsWith(".json");

// ---------------------------------------------------------------------------
// The language service over the runtime, the app and their followers, as one
// program: the app imports `runtime/src`, so neither is renamed without the
// other.

function service(files: string[]): ts.LanguageService {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ["node"],
    typeRoots: [abs("runtime/node_modules/@types"), abs("app/node_modules/@types")],
    noEmit: true,
    strict: true,
    allowJs: true,
    checkJs: true,
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
  };
  const texts = new Map(files.map((file) => [abs(file), readFileSync(abs(file), "utf8")]));
  // The types come from the dependencies the worktree setup installs, the
  // runtime's and the app's, and from nowhere else: a dependency installed
  // here and not there must not change the result.
  const visible = (path: string) => !path.startsWith(REPO + "/") || !path.includes("/node_modules/") || DEPENDENCIES.some((zone) => path.startsWith(abs(`${zone}/node_modules/`)));
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...texts.keys()],
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) => {
      const text = texts.get(file) ?? (visible(file) && existsSync(file) ? readFileSync(file, "utf8") : undefined);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => REPO,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (file) => texts.has(file) || (visible(file) && ts.sys.fileExists(file)),
    readFile: (file) => texts.get(file) ?? (visible(file) ? ts.sys.readFile(file) : undefined),
    readDirectory: ts.sys.readDirectory,
    directoryExists: (path) => visible(path + "/") && ts.sys.directoryExists(path),
    getDirectories: ts.sys.getDirectories,
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

const codeFiles = () => tracked(...OWN, ...FOLLOWERS).filter(isCode).filter((file) => !file.includes("/node_modules/"));

// ---------------------------------------------------------------------------
// What is declared, and under which kind.

type Kind = "binding" | "member";
type Declared = { file: string; name: string; start: number; kind: Kind; syntax: string; node: ts.Node };

const MEMBER_SYNTAX = new Set([
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.ShorthandPropertyAssignment,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.JsxAttribute,
]);
const BINDING_SYNTAX = new Set([
  ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ClassExpression,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.Parameter,
  ts.SyntaxKind.TypeParameter,
  ts.SyntaxKind.BindingElement,
  ts.SyntaxKind.ImportClause,
  ts.SyntaxKind.NamespaceImport,
  ts.SyntaxKind.ImportSpecifier,
  ts.SyntaxKind.ExportSpecifier,
  ts.SyntaxKind.JSDocTypedefTag,
  ts.SyntaxKind.JSDocCallbackTag,
]);

function declarations(program: ts.Program, files: string[]): Declared[] {
  const found: Declared[] = [];
  for (const file of files) {
    const source = program.getSourceFile(abs(file));
    if (source === undefined) throw new Error(`not in the program: ${file}`);
    const visit = (node: ts.Node) => {
      const parent = node.parent;
      if ((ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) && parent !== undefined) {
        const named = (parent as ts.NamedDeclaration).name === node || (ts.isJSDocTypedefTag(parent) && parent.name === node);
        if (named && (MEMBER_SYNTAX.has(parent.kind) || BINDING_SYNTAX.has(parent.kind))) {
          // `import { a }` and `export { a }` follow `a`; only an alias (`a as b`) is a name of its own.
          const follows = (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) && parent.propertyName === undefined;
          // `{ a: b }` in a binding pattern: `a` is a member, `b` the binding.
          const pattern = ts.isBindingElement(parent) && parent.propertyName === node;
          if (!follows && !pattern) {
            found.push({ file, name: node.text, start: node.getStart(), kind: MEMBER_SYNTAX.has(parent.kind) ? "member" : "binding", syntax: ts.SyntaxKind[parent.kind], node });
          }
        }
        if (ts.isBindingElement(parent) && parent.propertyName === node) {
          found.push({ file, name: node.text, start: node.getStart(), kind: "member", syntax: "BindingPropertyName", node });
        }
      }
      ts.forEachChild(node, visit);
      // JSDoc typedefs live outside the tree `forEachChild` walks.
      for (const doc of (node as { jsDoc?: ts.JSDoc[] }).jsDoc ?? []) ts.forEachChild(doc, visit);
    };
    visit(source);
  }
  return found;
}

const newName = (declared: Pick<Declared, "name" | "file">): string => NAMES[`${declared.file}#${declared.name}`] ?? NAMES[declared.name] ?? translate(declared.name, translator);
const keptName = (name: string) => KEPT_NAMES.some((kept) => kept.names.includes(name));
const keptMember = (name: string) => KEPT_MEMBERS.some((kept) => kept.names.includes(name));

// ---------------------------------------------------------------------------
// The files and folders, and their new names.

// `garde-fous-cli.test.ts` → `guardrails-cli.test.ts`: the part before the
// first dot is the name, the rest its extensions.
const translatePart = (part: string): string => {
  const dot = part.indexOf(".", 1);
  const stem = dot === -1 ? part : part.slice(0, dot);
  return translate(stem, translator, "kebab") + (dot === -1 ? "" : part.slice(dot));
};
const keptFile = (file: string) => KEPT_FILES.some((kept) => kept.paths.some((path) => file === path || file.startsWith(path + "/")));

// Every renamed path part, file or folder, by its old absolute path.
function moves(files: string[]): Map<string, string> {
  const renamed = new Map<string, string>();
  for (const file of files.filter((candidate) => under(candidate, OWN))) {
    if (keptFile(file)) continue;
    const parts = file.split("/");
    for (let depth = 2; depth <= parts.length; depth++) {
      const path = parts.slice(0, depth).join("/");
      if (keptFile(path) && depth < parts.length) continue;
      const part = parts[depth - 1]!;
      const translated = PATHS[path] ?? translatePart(part);
      if (translated !== part) renamed.set(abs(path), translated);
    }
  }
  return renamed;
}

const moved = (path: string, renamed: Map<string, string>): string => {
  const parts = relative(REPO, path).split("/");
  return join(REPO, ...parts.map((part, index) => renamed.get(join(REPO, ...parts.slice(0, index + 1))) ?? part));
};

// ---------------------------------------------------------------------------
// Edits: spans of the original texts, applied all at once.

type Edit = { start: number; end: number; text: string; why: string; prefix?: number };

function addEdit(edits: Map<string, Edit[]>, file: string, edit: Edit) {
  const list = edits.get(file) ?? [];
  list.push(edit);
  edits.set(file, list);
}

function settle(file: string, list: Edit[]): Edit[] {
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Edit[] = [];
  for (const edit of sorted) {
    const last = out.at(-1);
    if (last && last.start === edit.start && last.end === edit.end) {
      if (last.text === edit.text) continue;
      // `{ a }` reached from both its member and its binding, both renamed
      // to the same name: it stays a shorthand.
      if (last.why === edit.why && / → /.test(edit.why)) {
        last.text = edit.why.split(" → ")[1]!;
        last.prefix = 0;
        continue;
      }
      // `{ a }` whose member and binding get two different names: the
      // binding's edit is `a: b` (a prefix), the member's `c: a` (a suffix);
      // together, `c: b`.
      const [binding, member] = (last.prefix ?? 0) > 0 ? [last, edit] : [edit, last];
      if ((binding.prefix ?? 0) > 0 && (member.prefix ?? 0) === 0 && member.text.includes(": ")) {
        const property = member.text.slice(0, member.text.indexOf(": "));
        const value = binding.text.slice(binding.prefix);
        last.text = `${property}: ${value}`;
        last.prefix = property.length + 2;
        last.why = `${member.why}, ${binding.why}`;
        continue;
      }
      throw new Error(`${rel(file)}:${edit.start}: two renames of one span: «${last.text}» (${last.why}) and «${edit.text}» (${edit.why})`);
    }
    if (last && edit.start < last.end) throw new Error(`${rel(file)}:${edit.start}: overlapping edits: «${last.text}» (${last.why}) and «${edit.text}» (${edit.why})`);
    out.push({ ...edit });
  }
  return out;
}

const apply = (text: string, edits: Edit[]) => {
  let out = "";
  let at = 0;
  for (const edit of edits) {
    out += text.slice(at, edit.start) + edit.text;
    at = edit.end;
  }
  return out + text.slice(at);
};

// The position, in the edited text, of a position of the original one.
const shift = (edits: Edit[], position: number, prefix = 0): number => {
  let delta = 0;
  for (const edit of edits) {
    if (edit.start > position) break;
    if (edit.start === position) return position + delta + prefix;
    delta += edit.text.length - (edit.end - edit.start);
  }
  return position + delta;
};

// ---------------------------------------------------------------------------
// Paths written in text: imports, `node src/…` in a script, a file named in a
// test or a doc. A path is rewritten only if it names, from one of the places
// a path is read from, a file or folder that exists and moves.

const TOKEN = /(?:[\w@.~-]|\\\.)*(?:\/(?:[\w@.~-]|\\\.)*)*/g;

function bases(file: string): string[] {
  const zone = file.split("/")[0]!;
  const out = [dirname(abs(file)), REPO];
  for (const root of ["runtime", "app"]) out.push(abs(root), abs(`${root}/src`), abs(`${root}/test`));
  if (zone === "scripts") out.push(abs("scripts/capture-ecran"));
  return [...new Set(out)];
}

function pathEdits(file: string, text: string, renamed: Map<string, string>, existing: Set<string>): Edit[] {
  const edits: Edit[] = [];
  for (const found of text.matchAll(TOKEN)) {
    const token = found[0];
    if (!token.includes("/") && !/(?:\.|\\\.)(?:ts|js|cjs|mjs|sh|json|css|html|md|jsonl|ndjson|txt|py)$/.test(token)) continue;
    const escaped = token.includes("\\.");
    const plain = token.replace(/\\\./g, ".").replace(/\.+$/, "");
    if (plain === "" || plain.startsWith("//")) continue;
    // `${WT}/app/src/bon.ts`: after an interpolation, a leading slash
    // belongs to the path, not to the root.
    const interpolated = plain.startsWith("/") && text[found.index! - 1] === "}";
    const path = interpolated ? plain.slice(1) : plain;
    let replacement: string | undefined;
    for (const base of bases(file)) {
      const target = resolve(base, path);
      if (!target.startsWith(REPO + "/") || !existing.has(target)) continue;
      // Rewrite the parts of the token, one by one, from where it is read.
      const parts = path.split("/");
      let at = base;
      const out = parts.map((part) => {
        if (part === "" || part === "." || part === "..") {
          at = resolve(at, part || ".");
          return part;
        }
        at = join(at, part);
        const neu = renamed.get(at);
        return neu ?? part;
      });
      const rewritten = (interpolated ? "/" : "") + out.join("/");
      if (rewritten !== plain) replacement = escaped ? rewritten.replace(/\./g, "\\.") : rewritten;
      break;
    }
    // A bare file name (`join(VUE, "jetons.css")`) that only one moved file
    // bears, wherever it is read from.
    if (replacement === undefined && !plain.includes("/")) {
      const bearers = [...renamed].filter(([old]) => old.endsWith("/" + plain));
      if (bearers.length === 1) replacement = escaped ? bearers[0]![1].replace(/\./g, "\\.") : bearers[0]![1];
    }
    if (replacement === undefined) continue;
    const start = found.index!;
    const length = escaped ? token.replace(/\.+$/, "").length : plain.length;
    edits.push({ start, end: start + length, text: replacement, why: `path ${plain}` });
  }
  return edits;
}

// A path written in pieces (`join(ressources, "app", "src", "poste",
// "enveloppe.ts")`): the run of string arguments of a `join` or a `resolve`
// is read as one path, and each piece that names a moved part is rewritten.
function segmentEdits(source: ts.SourceFile, file: string, renamed: Map<string, string>, existing: Set<string>): Edit[] {
  const edits: Edit[] = [];
  // A piece is a plain string: no escape, its text is what is written.
  const piece = (node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.getText(source).slice(1, -1) === node.text;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && /^(?:join|resolve)$/.test(ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(source))) {
      const runs: (ts.StringLiteral | ts.NoSubstitutionTemplateLiteral)[][] = [[]];
      for (const argument of node.arguments) {
        if (piece(argument)) runs.at(-1)!.push(argument);
        else if (runs.at(-1)!.length > 0) runs.push([]);
      }
      for (const run of runs.filter((candidate) => candidate.length > 1)) {
        const parts = run.flatMap((literal) => literal.text.split("/").map((text) => ({ text, literal })));
        for (const base of bases(file)) {
          if (!existing.has(resolve(base, parts.map(({ text }) => text).join("/")))) continue;
          let at = base;
          const out = new Map(run.map((literal) => [literal, [] as string[]]));
          for (const { text, literal } of parts) {
            at = text === "" || text === "." || text === ".." ? resolve(at, text || ".") : join(at, text);
            out.get(literal)!.push(text === "" || text === "." || text === ".." ? text : (renamed.get(at) ?? text));
          }
          for (const literal of run) {
            const text = out.get(literal)!.join("/");
            if (text !== literal.text) edits.push({ start: literal.getStart(source) + 1, end: literal.getEnd() - 1, text, why: `path ${literal.text}` });
          }
          break;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edits;
}

const textFiles = () =>
  tracked(...PATH_TEXT)
    .filter((file) => !under(file, PATH_TEXT_SKIPPED.map((path) => path.replace(/\/$/, ""))))
    .filter((file) => !file.startsWith("scripts/rename-code/") && !file.includes("/node_modules/"))
    .filter((file) => !/\.(?:woff2|png|jpg|gif|ico|db)$/.test(file));

// ---------------------------------------------------------------------------
// The plan: every edit and every move, computed on the original tree.

type Kept = { declared: Declared; to: string; why: string };
type Plan = { edits: Map<string, Edit[]>; renamed: Map<string, string>; renames: { declared: Declared; to: string; at: number }[]; members: Kept[]; refused: string[] };

const CONSTANT = /^[A-Z][A-Z0-9_]*$/;

function plan(): { plan: Plan; ls: ts.LanguageService; files: string[] } {
  const files = codeFiles();
  const ls = service(files);
  const program = ls.getProgram()!;
  const edits = new Map<string, Edit[]>();
  const refused: string[] = [];
  const renames: Plan["renames"] = [];
  const members: Kept[] = [];
  const seen = new Set<string>();
  const preferences: ts.UserPreferences = { providePrefixAndSuffixTextForRename: true, allowRenameOfImportPath: false };
  const { exchanged, named } = exchangedMembers(program, ls, files.map(abs), (file) => under(rel(file), [...OWN, ...FOLLOWERS]));
  // A name written as a string where it is not a property access nor a type:
  // the string is data, the member keeps the name it names.
  const inString = (location: ts.RenameLocation) => {
    const node = findNode(program.getSourceFile(location.fileName)!, location.textSpan.start);
    if (node === undefined || !(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return false;
    return !(ts.isElementAccessExpression(node.parent) || ts.isLiteralTypeNode(node.parent));
  };
  // `{ a }` is a property and a variable at once, and the language service
  // renames the variable there (`{ a: b }`). The property's own locations are
  // its references and the shorthand itself; where one is a shorthand, the
  // value keeps its name (`c: a`). Both renamed alike, `{ a }` stays a
  // shorthand (`settle`).
  const propertyOf = (declared: Declared): ts.RenameLocation[] | undefined => {
    const groups = (ls.findReferences(abs(declared.file), declared.start) ?? []).filter(({ definition }) => definition.kind === ts.ScriptElementKind.memberVariableElement || definition.kind === ts.ScriptElementKind.memberFunctionElement);
    if (groups.length === 0) return undefined;
    const spans = new Map<string, ts.RenameLocation>();
    const at = (fileName: string, start: number, length: number) => {
      const node = findNode(program.getSourceFile(fileName)!, start);
      const parent = node?.parent;
      const shorthand = parent !== undefined && ((ts.isShorthandPropertyAssignment(parent) && parent.name === node) || (ts.isBindingElement(parent) && parent.propertyName === undefined && parent.name === node));
      spans.set(`${fileName}@${start}`, { fileName, textSpan: { start, length }, ...(shorthand ? { suffixText: `: ${(node as ts.Identifier).text}` } : {}) });
    };
    at(abs(declared.file), declared.start, declared.name.length);
    for (const group of groups) for (const reference of group.references) at(reference.fileName, reference.textSpan.start, reference.textSpan.length);
    return [...spans.values()];
  };
  const all = declarations(program, files.filter((file) => under(file, OWN)));
  for (const declared of all) {
    const to = newName(declared);
    if (to === declared.name) continue;
    if (keptName(declared.name)) continue;
    const member = declared.kind === "member";
    if (member && keptMember(declared.name)) {
      members.push({ declared, to, why: "kept by the table" });
      continue;
    }
    if (member && named.has(declared.name)) {
      members.push({ declared, to, why: "named by a string type (`Pick<T, \"…\">`)" });
      continue;
    }
    if (member && CONSTANT.test(declared.name)) {
      members.push({ declared, to, why: "a constant-case member: an environment variable or a format's key" });
      continue;
    }
    const info = ls.getRenameInfo(abs(declared.file), declared.start, preferences);
    if (!info.canRename) {
      if (member) members.push({ declared, to, why: `not renamable: ${info.localizedErrorMessage}` });
      else refused.push(`${declared.file}:${declared.name}: ${info.localizedErrorMessage}`);
      continue;
    }
    const locations = (declared.syntax === "ShorthandPropertyAssignment" ? propertyOf(declared) : undefined) ?? ls.findRenameLocations(abs(declared.file), declared.start, false, false, preferences) ?? [];
    const key = locations.map((location) => `${location.fileName}:${location.textSpan.start}`).sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const outside = locations.find((location) => !under(rel(location.fileName), [...OWN, ...FOLLOWERS]));
    if (outside) {
      if (member) members.push({ declared, to, why: `declared outside the renamed code (${rel(outside.fileName)})` });
      else refused.push(`${declared.file}:${declared.name}: referenced outside the renamed code (${rel(outside.fileName)})`);
      continue;
    }
    if (member) {
      const format = locations.find((location) => exchanged.has(`${location.fileName}@${location.textSpan.start}`));
      if (format) {
        members.push({ declared, to, why: `exchanged: ${rel(format.fileName)}@${format.textSpan.start}` });
        continue;
      }
      const string = locations.find(inString);
      if (string) {
        members.push({ declared, to, why: `named by a string: ${rel(string.fileName)}@${string.textSpan.start}` });
        continue;
      }
    }
    renames.push({ declared, to, at: locations.length });
    for (const location of locations) {
      // `export { a }` would become `export { b as a }`: the export is
      // renamed too — whoever imports it under the old name fails the proof.
      const node = findNode(program.getSourceFile(location.fileName)!, location.textSpan.start);
      const reexport = (location.suffixText ?? "").startsWith(" as ") && node !== undefined && ts.isExportSpecifier(node.parent);
      const text = (location.prefixText ?? "") + to + (reexport ? "" : (location.suffixText ?? ""));
      addEdit(edits, location.fileName, { start: location.textSpan.start, end: location.textSpan.start + location.textSpan.length, text, prefix: (location.prefixText ?? "").length, why: `${declared.name} → ${to}` });
    }
  }
  const everything = tracked(...OWN, ...FOLLOWERS, ...PATH_TEXT);
  const renamed = moves(everything);
  const existing = new Set<string>();
  for (const file of everything) {
    const parts = file.split("/");
    for (let depth = 1; depth <= parts.length; depth++) existing.add(abs(parts.slice(0, depth).join("/")));
  }
  for (const file of textFiles()) {
    for (const edit of pathEdits(file, readFileSync(abs(file), "utf8"), renamed, existing)) addEdit(edits, abs(file), edit);
  }
  for (const file of files) {
    for (const edit of segmentEdits(program.getSourceFile(abs(file))!, file, renamed, existing)) addEdit(edits, abs(file), edit);
  }
  for (const [file, list] of edits) edits.set(file, settle(file, list));
  // Two files cannot land on one path, nor on a file that stays.
  const landing = new Map<string, string>();
  for (const file of everything) {
    const to = moved(abs(file), renamed);
    const before = landing.get(to);
    if (before !== undefined) refused.push(`two files would become ${rel(to)}: ${before} and ${file}`);
    landing.set(to, file);
  }
  return { plan: { edits, renamed, renames, members, refused }, ls, files };
}

// ---------------------------------------------------------------------------
// The proof: every identifier of the code resolves, after the rename, to the
// declaration it resolved to before — moved and renamed, but the same one.

// What an identifier resolves to: every declaration of its symbol (a property
// of a union has several, in an order that is not stable across programs).
type Target = { file: string; start: number; shorthand: boolean };
type Resolution = { file: string; start: number; targets: Target[]; access: boolean };

function resolutions(ls: ts.LanguageService, files: string[]): Resolution[] {
  const program = ls.getProgram()!;
  const checker = program.getTypeChecker();
  const out: Resolution[] = [];
  for (const file of files) {
    const source = program.getSourceFile(abs(file))!;
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
        const parent = node.parent;
        const symbol =
          parent && ts.isShorthandPropertyAssignment(parent) && parent.name === node ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(node);
        const targets = (symbol?.declarations ?? []).map((declaration) => ({
          file: declaration.getSourceFile().fileName,
          start: (ts.getNameOfDeclaration(declaration) ?? declaration).getStart(),
          // A shorthand property `{ a }` keeps its name where it was when only its value is renamed (`{ a: b }`).
          shorthand: ts.isShorthandPropertyAssignment(declaration),
        }));
        if (targets.length > 0) out.push({ file: abs(file), start: node.getStart(), targets, access: parent !== undefined && ts.isPropertyAccessExpression(parent) && parent.name === node });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

function prove(before: Resolution[], edits: Map<string, Edit[]>, renamed: Map<string, string>, files: string[]): string[] {
  const ls = service(files);
  const show = (targets: string[]) => targets.map((target) => rel(target)).join(" | ");
  const positions = (targets: Target[]) => targets.map(({ file, start }) => `${file}@${start}`).sort();
  const after = new Map(resolutions(ls, files).map((resolution) => [`${resolution.file}@${resolution.start}`, positions(resolution.targets)]));
  const mapPosition = (file: string, start: number, prefixed = true) => {
    const list = edits.get(file) ?? [];
    const edit = list.find((candidate) => candidate.start === start);
    const prefix = prefixed ? (edit?.prefix ?? 0) : 0;
    return `${moved(file, renamed)}@${shift(list, start, prefix)}`;
  };
  const broken: string[] = [];
  for (const resolution of before) {
    const expected = resolution.targets
      .map((target) => (target.file.startsWith(REPO + "/") && !target.file.includes("/node_modules/") ? mapPosition(target.file, target.start, !target.shorthand) : `${target.file}@${target.start}`))
      .sort();
    const where = mapPosition(resolution.file, resolution.start);
    const got = after.get(where);
    // The same declarations, or some of them: a union reduced otherwise
    // (two literal types that became one) is still the same member.
    // A property access the rename did not touch (`station.survol`) may
    // resolve to another literal of the same union: TypeScript reduces a
    // union as it likes, and the property is the one it was.
    const untouched = resolution.access && !(edits.get(resolution.file) ?? []).some((edit) => edit.start === resolution.start);
    const same = got !== undefined && got.length > 0 && (untouched || got.every((target) => expected.includes(target)));
    if (!same) broken.push(`${rel(resolution.file)}@${resolution.start}: resolved to ${show(expected)}, now ${got === undefined ? "nothing" : show(got)}`);
  }
  return broken;
}

// ---------------------------------------------------------------------------

// The check is the rename itself, run again: a glossary term left in a name
// is a rename the tool would still do. What it keeps, it says, with why.
function check(): number {
  const { plan: computed } = plan();
  const left = [
    ...computed.renames.map(({ declared, to }) => `${declared.file}: ${declared.syntax} ${declared.name} (→ ${to})`),
    ...[...computed.renamed].map(([path, to]) => `${rel(path)}: path (→ ${to})`),
    ...computed.refused,
  ];
  const kept = new Map<string, Set<string>>();
  for (const { declared, why } of computed.members) {
    const reason = why.replace(/:.*$/, "");
    const names = kept.get(reason) ?? new Set<string>();
    names.add(declared.name);
    kept.set(reason, names);
  }
  for (const [reason, names] of kept) console.log(`kept (${reason}): ${[...names].sort().join(" ")}`);
  for (const line of [...new Set(left)].sort()) console.log(`left: ${line}`);
  console.error(left.length === 0 ? "check: no glossary term left outside the table's exceptions" : `check: ${left.length} glossary term(s) left outside the table's exceptions`);
  return left.length === 0 ? 0 : 1;
}

// The rename of REPO, in place: edits, moves, the proof, then the fixups.
// What it returns is what no longer resolves to the same declaration.
function rename(computed: Plan, ls: ts.LanguageService, files: string[]): string[] {
  const before = resolutions(ls, files);
  for (const [file, list] of computed.edits) writeFileSync(file, apply(readFileSync(file, "utf8"), list));
  const all = tracked(...OWN, ...FOLLOWERS, ...PATH_TEXT);
  for (const file of all) {
    const to = moved(abs(file), computed.renamed);
    if (to === abs(file)) continue;
    mkdirSync(dirname(to), { recursive: true });
    execFileSync("git", ["mv", file, rel(to)], { cwd: REPO });
  }
  for (const path of [...computed.renamed.keys()].sort().reverse()) {
    if (existsSync(path) && readdirSync(path).length === 0) rmdirSync(path);
  }
  const newFiles = files.map((file) => rel(moved(abs(file), computed.renamed)));
  const broken = prove(before, computed.edits, computed.renamed, newFiles);
  // Last, the fixups, on the renamed tree: a string the references do not
  // carry (a test that names a function or a file in text).
  for (const fixup of FIXUPS) {
    const text = readFileSync(abs(fixup.file), "utf8");
    const count = text.split(fixup.from).length - 1;
    if (count !== (fixup.count ?? 1)) throw new Error(`fixup found ${count} time(s) in ${fixup.file}, not ${fixup.count ?? 1}: ${fixup.from}`);
    writeFileSync(abs(fixup.file), text.split(fixup.from).join(fixup.to));
  }
  return broken;
}

// What the rename does, one line per act, tab-separated, sorted: the same
// commit always gives the same lines.
function report(computed: Plan, broken: string[]): string[] {
  const lines: string[] = [];
  for (const rename of computed.renames) lines.push(`rename\t${rename.declared.file}\t${rename.declared.syntax}\t${rename.declared.name}\t${rename.to}\t${rename.at}`);
  for (const kept of computed.members) lines.push(`kept\t${kept.declared.file}\t${kept.declared.syntax}\t${kept.declared.name}\t${kept.to}\t${kept.why}`);
  for (const [path, to] of computed.renamed) lines.push(`move\t${rel(path)}\t${to}`);
  for (const [file, list] of computed.edits) for (const edit of list.filter((candidate) => candidate.why.startsWith("path "))) lines.push(`path\t${rel(file)}\t${edit.why.slice(5)}\t${edit.text}`);
  for (const fixup of FIXUPS) lines.push(`fixup\t${fixup.file}\t${fixup.from}\t${fixup.to}`);
  for (const refused of computed.refused) lines.push(`unresolved\t${refused}`);
  for (const line of broken) lines.push(`unresolved\t${line}`);
  return [...new Set(lines)].sort();
}

// The tree as it is now, untracked files included, ignored ones not: the
// hash of the result, that two runs on one commit must share.
function treeHash(): string {
  const scratch = mkdtempSync(join(tmpdir(), "rename-code-index-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(scratch, "index") };
    execFileSync("git", ["add", "-A", "."], { cwd: REPO, env });
    return execFileSync("git", ["write-tree"], { cwd: REPO, env, encoding: "utf8" }).trim();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// A copy of the commit at HOME's HEAD, as a clone at `dir` that borrows the
// repository's objects and leaves nothing in it (a worktree would register
// itself there), with the dependencies the program's types come from
// (`node_modules`, ignored by git): the copy is renamed exactly as the
// repository would be. The remote branches come along, for the gates that
// compare with the integration branch.
function copy(dir: string, commit: string) {
  const quiet = { cwd: HOME, stdio: ["ignore", "ignore", "inherit"] as ("ignore" | "inherit")[] };
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", HOME, dir], quiet);
  execFileSync("git", ["-C", dir, "fetch", "--quiet", HOME, "+refs/remotes/origin/*:refs/remotes/origin/*"], quiet);
  execFileSync("git", ["-C", dir, "checkout", "--quiet", "--detach", commit], quiet);
  for (const zone of DEPENDENCIES) {
    const modules = join(HOME, zone, "node_modules");
    if (existsSync(modules)) cpSync(modules, join(dir, zone, "node_modules"), { recursive: true, verbatimSymlinks: true });
  }
}

const USAGE = "usage: scripts/rename-code/rename.sh [--keep <dir> | --apply | --check]";

function main(args: string[]): number {
  if (args.includes("--check")) return check();
  const applying = args.includes("--apply");
  const keepAt = args.indexOf("--keep");
  const keep = keepAt === -1 ? undefined : args[keepAt + 1];
  const known = new Set(["--apply", "--keep", ...(keep === undefined ? [] : [keep])]);
  if (args.some((arg) => !known.has(arg)) || (keepAt !== -1 && keep === undefined) || (applying && keep !== undefined)) {
    console.error(USAGE);
    return 2;
  }
  for (const zone of DEPENDENCIES) {
    if (!existsSync(join(HOME, zone, "node_modules", "@types", "node"))) {
      console.error(`${zone}/node_modules is missing: the program's types come from it — run .claude/brigade/worktree-setup.sh first`);
      return 1;
    }
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: HOME, encoding: "utf8" }).trim();
  if (applying) {
    // Clean, so that a failed rename can be undone whole: nothing pending
    // anywhere, nothing untracked where the rename writes.
    const pending = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: REPO, encoding: "utf8" });
    const untracked = execFileSync("git", ["status", "--porcelain", "--", ...OWN, ...FOLLOWERS, ...PATH_TEXT], { cwd: REPO, encoding: "utf8" });
    if (pending.trim() !== "" || untracked.trim() !== "") {
      console.error("the tree is not clean: commit or set aside what is pending first");
      return 1;
    }
  }
  // A dry run renames a copy of the commit, never the repository: what it
  // says is what `--apply` would do, proof included.
  const dir = applying ? HOME : resolve(keep ?? join(mkdtempSync(join(tmpdir(), "rename-code-")), "tree"));
  if (!applying) {
    const pending = execFileSync("git", ["status", "--porcelain", "--", ...OWN, ...FOLLOWERS, ...PATH_TEXT], { cwd: HOME, encoding: "utf8" });
    if (pending.trim() !== "") console.error(`the dry run renames the commit ${commit}: what is pending in the tree is not in it`);
    if (existsSync(dir) && readdirSync(dir).length > 0) {
      console.error(`${dir} already exists and is not empty`);
      return 1;
    }
    if (existsSync(dir)) rmdirSync(dir);
    copy(dir, commit);
    REPO = dir;
  }
  let done = false;
  try {
    const { plan: computed, ls, files } = plan();
    if (computed.refused.length > 0 && applying) {
      for (const refused of computed.refused) console.error(`unresolved: ${refused}`);
      return 1;
    }
    const broken = computed.refused.length > 0 ? [] : rename(computed, ls, files);
    for (const line of report(computed, broken)) console.log(line);
    const unresolved = computed.refused.length + broken.length;
    const kept = new Set(computed.members.map(({ declared }) => declared.name));
    console.error(`${applying ? "renamed" : "dry run of"} ${commit}: ${computed.renames.length} declarations renamed, ${kept.size} member names kept as formats, ${computed.renamed.size} files and folders moved, ${computed.edits.size} files edited`);
    if (computed.refused.length === 0) console.error(`result tree: ${treeHash()}`);
    if (keep !== undefined) console.error(`renamed copy kept at ${dir} (a clone that borrows this repository's objects: \`rm -rf ${dir}\` when done)`);
    console.error(`${unresolved} unresolved identifier(s)${unresolved === 0 ? ": every identifier resolves to the same declaration as before" : ": see the `unresolved` lines"}`);
    done = unresolved === 0;
    return done ? 0 : 1;
  } finally {
    // A rename that fails is undone whole: the tree is the commit again.
    if (applying && !done) {
      execFileSync("git", ["reset", "--quiet", "--hard", "HEAD"], { cwd: REPO });
      execFileSync("git", ["clean", "-fdq", "--", ...OWN, ...FOLLOWERS, ...PATH_TEXT], { cwd: REPO });
      console.error(`nothing renamed: the tree is back at ${commit}`);
    }
    if (!applying && keep === undefined) rmSync(dirname(dir), { recursive: true, force: true });
  }
}

process.exitCode = main(process.argv.slice(2));
