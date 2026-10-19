// The mechanical rename of #1003: the glossary terms of `runtime/` and `app/`
// identifiers and file names become English, everywhere at once, by following
// the references the TypeScript language service finds — never by rewriting a
// file by hand. Usage and replay: README.md.
//
//   node rename.ts            rename, then prove that every name still resolves
//                             to the same declaration as before
//   node rename.ts --plan     print what would be renamed, write nothing
//   node rename.ts --check    list the glossary terms left in identifiers and
//                             file names that the table does not keep: exit 1
//                             if there is one
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { exchangedMembers, findNode } from "./exchanged.ts";
import { FIXUPS, KEPT_FILES, KEPT_MEMBERS, KEPT_NAMES, NAMES, PATHS, WORDS } from "./table.ts";
import { translate } from "./words.ts";

const REPO = resolve(import.meta.dirname, "../..");
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
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...texts.keys()],
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) => {
      const text = texts.get(file) ?? (existsSync(file) ? readFileSync(file, "utf8") : undefined);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => REPO,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (file) => texts.has(file) || ts.sys.fileExists(file),
    readFile: (file) => texts.get(file) ?? ts.sys.readFile(file),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
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
    let replacement: string | undefined;
    for (const base of bases(file)) {
      const target = resolve(base, plain);
      if (!target.startsWith(REPO + "/") || !existing.has(target)) continue;
      // Rewrite the parts of the token, one by one, from where it is read.
      const parts = plain.split("/");
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
      const rewritten = out.join("/");
      if (rewritten !== plain) replacement = escaped ? rewritten.replace(/\./g, "\\.") : rewritten;
      break;
    }
    if (replacement === undefined) continue;
    const start = found.index!;
    const length = escaped ? token.replace(/\.+$/, "").length : plain.length;
    edits.push({ start, end: start + length, text: replacement, why: `path ${plain}` });
  }
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
  const exchanged = exchangedMembers(program, ls, files.map(abs), (file) => under(rel(file), [...OWN, ...FOLLOWERS]));
  // A name written as a string where it is not a property access nor a type:
  // the string is data, the member keeps the name it names.
  const inString = (location: ts.RenameLocation) => {
    const node = findNode(program.getSourceFile(location.fileName)!, location.textSpan.start);
    if (node === undefined || !(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return false;
    return !(ts.isElementAccessExpression(node.parent) || ts.isLiteralTypeNode(node.parent));
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
    const locations = ls.findRenameLocations(abs(declared.file), declared.start, false, false, preferences) ?? [];
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
      const text = (location.prefixText ?? "") + to + (location.suffixText ?? "");
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
  for (const fixup of FIXUPS) {
    const text = readFileSync(abs(fixup.file), "utf8");
    const start = text.indexOf(fixup.from);
    if (start === -1 || text.indexOf(fixup.from, start + 1) !== -1) throw new Error(`fixup not found once in ${fixup.file}: ${fixup.from}`);
    addEdit(edits, abs(fixup.file), { start, end: start + fixup.from.length, text: fixup.to, why: fixup.why });
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
type Resolution = { file: string; start: number; targets: Target[] };

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
        if (targets.length > 0) out.push({ file: abs(file), start: node.getStart(), targets });
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
    if (got === undefined || got.join(",") !== expected.join(",")) broken.push(`${rel(resolution.file)}@${resolution.start}: resolved to ${show(expected)}, now ${got === undefined ? "nothing" : show(got)}`);
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

function main(args: string[]): number {
  if (args.includes("--check")) return check();
  const { plan: computed, ls, files } = plan();
  if (args.includes("--plan")) {
    for (const rename of computed.renames) console.log(`rename\t${rename.declared.file}\t${rename.declared.syntax}\t${rename.declared.name}\t${rename.to}\t${rename.at}`);
    for (const kept of computed.members) console.log(`member\t${kept.declared.file}\t${kept.declared.syntax}\t${kept.declared.name}\t${kept.to}\t${kept.why}`);
    for (const [path, to] of [...computed.renamed].sort()) console.log(`move\t${rel(path)}\t${to}`);
    for (const refused of computed.refused) console.log(`refused\t${refused}`);
    for (const [file, list] of [...computed.edits].sort()) for (const edit of list.filter((candidate) => candidate.why.startsWith("path "))) console.log(`path\t${rel(file)}\t${edit.why.slice(5)}\t${edit.text}`);
    return 0;
  }
  if (computed.refused.length > 0) {
    for (const refused of computed.refused) console.error(`refused: ${refused}`);
    return 1;
  }
  const status = execFileSync("git", ["status", "--porcelain", "--", "runtime", "app", "scripts/capture-ecran", "docs", ".claude"], { cwd: REPO, encoding: "utf8" });
  if (status.trim() !== "") {
    console.error("the tree is not clean: commit or set aside what is pending first");
    return 1;
  }
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
  console.error(`renamed ${computed.renames.length} declarations, moved ${computed.renamed.size} files and folders, edited ${computed.edits.size} files`);
  if (broken.length > 0) {
    for (const line of broken) console.error(`changed resolution: ${line}`);
    console.error(`${broken.length} identifier(s) no longer resolve to the same declaration`);
    return 1;
  }
  console.error("every identifier resolves to the same declaration as before");
  return 0;
}

process.exitCode = main(process.argv.slice(2));
