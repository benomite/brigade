// The members a rename must not touch: those whose name is written somewhere
// the code does not own — a state file, the log, the box's output read by the
// app, the app's bridge, an environment variable, a command line — or read
// back from there. Their name is a format, not an identifier.
//
// A member is exchanged when its declaration is reachable, through the types,
// from a value the code hands to the outside or takes from it:
//   - an argument of what serializes, sends, prints or enumerates keys
//     (`JSON.stringify`, `console.*`, `process.send`, IPC, `Object.keys`, the
//     options of a child process, a SQLite statement, …), followed back to the
//     callers when the value is a parameter of the function that hands it out;
//   - a type asserted on a value of unknown shape (`JSON.parse(…) as T`, a row
//     `as T`), a type guard (`x is T`), followed to the callers when it is the
//     function's own type parameter;
//   - every type of the app's bridge (`app/src/vue/pont.d.ts`), the only
//     channel between the app's two processes;
//   - the right side of `"name" in value`.
import ts from "typescript";

const SINKS = new Map<string, Set<string> | "all">([
  ["JSON", new Set(["stringify"])],
  ["console", "all"],
  ["process", new Set(["send"])],
  ["Object", new Set(["keys", "entries", "values", "getOwnPropertyNames", "assign"])],
  ["Reflect", new Set(["ownKeys"])],
  ["util", new Set(["inspect", "format"])],
]);
// Library functions whose arguments leave the process, by the declaration
// file they come from.
const LEAVING: [RegExp, Set<string>][] = [
  [/sqlite/, new Set(["run", "get", "all", "iterate"])],
  [/child_process/, new Set(["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"])],
  [/electron/, new Set(["send", "invoke", "handle", "handleOnce", "on", "once", "exposeInMainWorld", "postMessage"])],
  [/\/fs\.d\.ts|\/fs\/promises\.d\.ts/, new Set(["writeFileSync", "appendFileSync", "writeFile", "appendFile"])],
  [/./, new Set(["structuredClone", "postMessage"])],
];
const leaving = (name: string, files: string[]) => LEAVING.some(([file, names]) => names.has(name) && files.some((path) => file.test(path)));

const isLib = (file: string) => file.includes("/node_modules/") || /\/lib\.[\w.]*\.d\.ts$/.test(file);

export function exchangedMembers(program: ts.Program, ls: ts.LanguageService, files: string[], isOwn: (file: string) => boolean): { exchanged: Set<string>; named: Set<string> } {
  const checker = program.getTypeChecker();
  const exchanged = new Set<string>();
  const named = new Set<string>();
  const seenTypes = new Set<ts.Type>();
  const seenParams = new Set<ts.Node>();
  const seenFunctions = new Set<ts.Node>();

  const keyOf = (declaration: ts.Declaration) => {
    const name = ts.getNameOfDeclaration(declaration) ?? declaration;
    return `${declaration.getSourceFile().fileName}@${name.getStart()}`;
  };

  // Every member declaration reachable from a type.
  const reach = (type: ts.Type | undefined, depth = 0): void => {
    if (type === undefined || seenTypes.has(type) || depth > 40) return;
    seenTypes.add(type);
    if (type.isUnionOrIntersection()) return type.types.forEach((part) => reach(part, depth + 1));
    const alias = type.aliasTypeArguments;
    if (alias) alias.forEach((argument) => reach(argument, depth + 1));
    // A library type (`Map`, `Promise`, `Buffer`…) has no member of ours:
    // only what it is instantiated with is followed.
    const symbol = type.aliasSymbol ?? type.getSymbol();
    const declared = symbol?.declarations ?? [];
    if (declared.length > 0 && declared.every((declaration) => isLib(declaration.getSourceFile().fileName))) {
      if (type.flags & ts.TypeFlags.Object && (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) for (const argument of checker.getTypeArguments(type as ts.TypeReference)) reach(argument, depth + 1);
      return;
    }
    if (type.flags & (ts.TypeFlags.Primitive | ts.TypeFlags.Literal | ts.TypeFlags.TypeParameter)) return;
    for (const property of checker.getPropertiesOfType(type)) {
      for (const declaration of property.declarations ?? []) {
        if (!isOwn(declaration.getSourceFile().fileName)) continue;
        exchanged.add(keyOf(declaration));
      }
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (declaration) reach(checker.getTypeOfSymbolAtLocation(property, declaration), depth + 1);
      else reach(checker.getTypeOfSymbol(property), depth + 1);
    }
    for (const info of checker.getIndexInfosOfType(type)) reach(info.type, depth + 1);
    if (type.flags & ts.TypeFlags.Object) {
      const object = type as ts.ObjectType;
      if (object.objectFlags & ts.ObjectFlags.Reference) for (const argument of checker.getTypeArguments(type as ts.TypeReference)) reach(argument, depth + 1);
      for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
        for (const parameter of signature.getParameters()) reach(checker.getTypeOfSymbol(parameter), depth + 1);
        reach(signature.getReturnType(), depth + 1);
      }
    }
  };

  // The keys of a type, only: what is looked up by value.
  const keys = (type: ts.Type) => {
    for (const part of type.isUnionOrIntersection() ? type.types : [type]) {
      for (const property of checker.getPropertiesOfType(part)) {
        for (const declaration of property.declarations ?? []) if (isOwn(declaration.getSourceFile().fileName)) exchanged.add(keyOf(declaration));
      }
    }
  };

  // The function declaring a node, if the node is one of its parameters.
  const enclosingFunction = (node: ts.Node): ts.SignatureDeclaration | undefined => {
    for (let at: ts.Node | undefined = node.parent; at; at = at.parent) if (ts.isFunctionLike(at)) return at as ts.SignatureDeclaration;
    return undefined;
  };

  // The call sites of a function, with the argument at `index` (or the call
  // itself when `index` is -1).
  const callSites = (fn: ts.SignatureDeclaration): ts.CallLikeExpression[] => {
    let nameNode: ts.Node | undefined = fn.name;
    if (!nameNode && ts.isVariableDeclaration(fn.parent)) nameNode = fn.parent.name;
    if (!nameNode && ts.isPropertyAssignment(fn.parent)) nameNode = fn.parent.name;
    if (!nameNode) return [];
    const references = ls.getReferencesAtPosition(nameNode.getSourceFile().fileName, nameNode.getStart()) ?? [];
    const out: ts.CallLikeExpression[] = [];
    for (const reference of references) {
      const source = program.getSourceFile(reference.fileName);
      if (!source) continue;
      let node = findNode(source, reference.textSpan.start);
      while (node && (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) node = node.parent;
      if (node && node.parent && (ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent)) && node.parent.expression === node) out.push(node.parent);
    }
    return out;
  };

  const fromParameter = (parameter: ts.ParameterDeclaration) => {
    if (seenParams.has(parameter)) return;
    seenParams.add(parameter);
    const fn = parameter.parent as ts.SignatureDeclaration;
    const index = fn.parameters.indexOf(parameter);
    for (const call of callSites(fn)) {
      const argument = (call as ts.CallExpression).arguments?.[index];
      if (argument) sink(argument);
    }
  };

  // A value that leaves: its type, and the parameters it comes from.
  const sink = (expression: ts.Expression) => {
    reach(checker.getTypeAtLocation(expression));
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        for (const declaration of symbol?.declarations ?? []) {
          if (ts.isParameter(declaration) && isOwn(declaration.getSourceFile().fileName)) fromParameter(declaration);
          if (ts.isBindingElement(declaration)) {
            let root: ts.Node = declaration;
            while (ts.isBindingElement(root) || ts.isObjectBindingPattern(root) || ts.isArrayBindingPattern(root)) root = root.parent;
            if (ts.isParameter(root) && isOwn(root.getSourceFile().fileName)) fromParameter(root);
          }
        }
      }
      if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
    };
    visit(expression);
  };

  // A type asserted on what comes from outside: if it is the function's own
  // type parameter, the callers' instantiations are what is read.
  const asserted = (typeNode: ts.TypeNode) => {
    const type = checker.getTypeFromTypeNode(typeNode);
    reach(type);
    if (type.flags & ts.TypeFlags.TypeParameter) {
      const declaration = type.symbol?.declarations?.[0];
      const fn = declaration?.parent;
      if (fn && ts.isFunctionLike(fn) && !seenFunctions.has(fn)) {
        seenFunctions.add(fn);
        for (const call of callSites(fn as ts.SignatureDeclaration)) reach(checker.getTypeAtLocation(call));
      }
    }
  };

  const unknownShape = (type: ts.Type) => (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;

  for (const file of files) {
    const source = program.getSourceFile(file)!;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callee = node.expression;
        const symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
        const declarations = symbol?.declarations ?? [];
        const libFiles = declarations.map((declaration) => declaration.getSourceFile().fileName);
        const fromLib = libFiles.length > 0 && libFiles.every(isLib);
        let leaves = false;
        if (ts.isPropertyAccessExpression(callee)) {
          const owner = callee.expression.getText();
          const methods = SINKS.get(owner);
          if (methods === "all" || methods?.has(callee.name.text)) leaves = true;
          if (fromLib && leaving(callee.name.text, libFiles)) leaves = true;
        } else if (ts.isIdentifier(callee) && fromLib && leaving(callee.text, libFiles)) leaves = true;
        if (leaves) for (const argument of node.arguments ?? []) sink(argument);
      }
      if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && unknownShape(checker.getTypeAtLocation(node.expression))) asserted(node.type);
      if (ts.isVariableDeclaration(node) && node.type && node.initializer && unknownShape(checker.getTypeAtLocation(node.initializer))) asserted(node.type);
      if (ts.isTypePredicateNode(node) && node.type) asserted(node.type);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InKeyword && ts.isStringLiteral(node.left)) reach(checker.getTypeAtLocation(node.right));
      if (ts.isForInStatement(node)) reach(checker.getTypeAtLocation(node.expression));
      // A key looked up by value (`mots[mot]`): the keys are data.
      if (ts.isElementAccessExpression(node) && !ts.isStringLiteralLike(node.argumentExpression) && !ts.isNumericLiteral(node.argumentExpression)) keys(checker.getTypeAtLocation(node.expression));
      // A literal given where a record is expected (`Record<string, string>`):
      // its keys are data too.
      if (ts.isObjectLiteralExpression(node)) {
        const contextual = checker.getContextualType(node);
        const context = contextual && checker.getApparentType(checker.getNonNullableType(contextual));
        if (context && checker.getIndexInfosOfType(context).length > 0) {
          for (const property of node.properties) {
            if (property.name && (ts.isIdentifier(property.name) || ts.isPrivateIdentifier(property.name)) && checker.getPropertyOfType(context, property.name.text) === undefined) exchanged.add(keyOf(property));
          }
        }
        // A literal given where `Record<"a" | "b", …>` is expected: the
        // expected properties have no declaration, their names are values.
        if (context) {
          for (const property of node.properties) {
            if (!property.name || !ts.isIdentifier(property.name)) continue;
            const expected = checker.getPropertyOfType(context, property.name.text);
            if (expected && (expected.declarations ?? []).length === 0) exchanged.add(keyOf(property));
          }
        }
      }
      // `Pick<T, "journal">`: a member named by a string type.
      if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) named.add(node.literal.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (file.endsWith("/app/src/vue/pont.d.ts")) {
      ts.forEachChild(source, (statement) => {
        if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
          const type = checker.getTypeAtLocation(statement.name);
          reach(type);
          for (const property of checker.getPropertiesOfType(type)) for (const declaration of property.declarations ?? []) exchanged.add(keyOf(declaration));
        }
      });
    }
  }
  return { exchanged, named };
}

export function findNode(source: ts.SourceFile, position: number): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (position < node.getStart(source) || position >= node.getEnd()) return;
    found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
