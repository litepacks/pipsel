import { parse } from "./parser.js";
import { Program, Definition, Diagnostic, FieldDefinition, ListDefinition, MetaDefinition, Pipe, SourceNode } from "./types.js";

const BUILT_IN_PIPES = {
  // Extractors (DOM Selection -> Primitive)
  text: { minArgs: 0, maxArgs: 0, isExtractor: true, isTraversal: false },
  html: { minArgs: 0, maxArgs: 0, isExtractor: true, isTraversal: false },
  attr: { minArgs: 1, maxArgs: 1, isExtractor: true, isTraversal: false },

  // Traversal (DOM Selection -> DOM Selection)
  find: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: true },
  closest: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: true },
  parent: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: true },
  children: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: true },
  siblings: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: true },
  next: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: true },
  prev: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: true },
  eq: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: true },
  first: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: true },
  last: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: true },

  // Transformers (Primitive -> Primitive)
  trim: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  trim_start: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  trimStart: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  trim_end: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  trimEnd: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  lowercase: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  lower: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  uppercase: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  upper: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  titlecase: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  title: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  slugify: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  clean: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  prefix: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  suffix: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  substring: { minArgs: 1, maxArgs: 2, isExtractor: false, isTraversal: false },
  slice: { minArgs: 1, maxArgs: 2, isExtractor: false, isTraversal: false },
  replace: { minArgs: 2, maxArgs: 2, isExtractor: false, isTraversal: false },
  regex: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  split: { minArgs: 1, maxArgs: 2, isExtractor: false, isTraversal: false },
  int: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  float: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  abs: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  round: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: false },
  ceil: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  floor: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  add: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  subtract: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  multiply: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  divide: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  min: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  max: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  sum: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  avg: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  average: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  bool: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  boolean: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  fallback: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  filter: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  url_parse: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlParse: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_protocol: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlProtocol: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_hostname: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlHostname: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_port: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlPort: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_pathname: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlPathname: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_path: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlPath: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_search: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlSearch: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_query: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlQuery: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_hash: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlHash: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_origin: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  urlOrigin: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  url_param: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  urlParam: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  url_resolve: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: false },
  urlResolve: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: false },
  url_join: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: false },
  urlJoin: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: false },
  unique: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: false },
  json_parse: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  jsonParse: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  json: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  ">": { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  "<": { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  ">=": { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  "<=": { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  "==": { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  "=": { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  "!=": { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  required: { minArgs: 0, maxArgs: 1, isExtractor: false, isTraversal: false },
  date_format: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  dateFormat: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  date_parse: { minArgs: 1, maxArgs: 2, isExtractor: false, isTraversal: false },
  dateParse: { minArgs: 1, maxArgs: 2, isExtractor: false, isTraversal: false },
  json_ld: { minArgs: 0, maxArgs: 1, isExtractor: true, isTraversal: false },
  jsonLd: { minArgs: 0, maxArgs: 1, isExtractor: true, isTraversal: false },
};

const ALLOWED_METAS = ["@url", "@timestamp", "@paginate"];

export function lint(source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  let ast: Program;

  try {
    ast = parse(source);
  } catch (err: any) {
    // If it's a parse error, parse it and extract line/column details
    const match = (err.message || "").match(/at line (\d+), column (\d+)/);
    if (match) {
      diagnostics.push({
        message: err.message,
        severity: "error",
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
        length: 1,
      });
    } else {
      diagnostics.push({
        message: err.message || "Syntax error",
        severity: "error",
        line: 1,
        column: 1,
        length: 1,
      });
    }
    return diagnostics;
  }

  // Lint the AST
  lintScope(ast.body, diagnostics);

  return diagnostics;
}

function lintScope(definitions: Definition[], diagnostics: Diagnostic[]): void {
  const seenNames = new Set<string>();

  for (const def of definitions) {
    // 1. Check duplicate field names
    if (seenNames.has(def.name)) {
      diagnostics.push({
        message: `Duplicate field name '${def.name}' inside the same object block`,
        severity: "error",
        line: def.loc.start.line,
        column: def.loc.start.column,
        length: def.name.length,
      });
    } else {
      seenNames.add(def.name);
    }

    if (def.type === "FieldDefinition") {
      lintField(def, diagnostics);
    } else if (def.type === "ListDefinition") {
      lintList(def, diagnostics);
    } else if (def.type === "MetaDefinition") {
      lintMeta(def, diagnostics);
    }
  }
}
function isDomSource(source: SourceNode): boolean {
  if (source.type === "Coalesce") {
    return source.sources.some(isDomSource);
  }
  return source.type !== "Meta";
}

function lintSourceNode(source: SourceNode, name: string, typeLabel: "field" | "list block", diagnostics: Diagnostic[]): void {
  if (source.type === "Coalesce") {
    for (const sub of source.sources) {
      lintSourceNode(sub, name, typeLabel, diagnostics);
    }
    return;
  }

  if (source.type === "Selector" && source.value.trim() === "") {
    diagnostics.push({
      message: `Empty selector for ${typeLabel} '${name}'`,
      severity: "error",
      line: source.loc.start.line,
      column: source.loc.start.column,
      length: 1,
    });
  }

  if (source.type === "MatchSelector" && source.value.trim() === "") {
    diagnostics.push({
      message: `Empty match selector query for ${typeLabel} '${name}'`,
      severity: "error",
      line: source.loc.start.line,
      column: source.loc.start.column,
      length: 1,
    });
  }

  if (source.type === "Meta") {
    const metaVar = "@" + source.name;
    if (!ALLOWED_METAS.includes(metaVar)) {
      diagnostics.push({
        message: `Unknown or malformed meta variable '${metaVar}'. Supported values: ${ALLOWED_METAS.join(", ")}`,
        severity: "error",
        line: source.loc.start.line,
        column: source.loc.start.column,
        length: metaVar.length,
      });
    }
  }
}

function lintField(def: FieldDefinition, diagnostics: Diagnostic[]): void {
  lintSourceNode(def.source, def.name, "field", diagnostics);

  // 2. Check pipe functions
  const isDom = isDomSource(def.source);
  lintPipes(def.pipes, def.name, isDom, def.loc, diagnostics);
}

function lintPipes(pipes: Pipe[], name: string, isDomStart: boolean, defLoc: any, diagnostics: Diagnostic[]): void {
  let isDom = isDomStart;

  if (pipes.length === 0) {
    if (isDom) {
      diagnostics.push({
        message: `Field '${name}' has selector/context but is missing a content extractor (like '| text' or '| attr')`,
        severity: "warning",
        line: defLoc.start.line,
        column: defLoc.start.column,
        length: name.length,
      });
    }
    return;
  }

  for (let i = 0; i < pipes.length; i++) {
    const pipe = pipes[i];
    const pipeConfig = BUILT_IN_PIPES[pipe.name as keyof typeof BUILT_IN_PIPES];

    // Check unknown function
    if (!pipeConfig) {
      diagnostics.push({
        message: `Unknown pipe function '${pipe.name}'`,
        severity: "error",
        line: pipe.loc.start.line,
        column: pipe.loc.start.column,
        length: pipe.name.length,
      });
      continue;
    }

    // Check wrong function argument count
    const argCount = pipe.args.length;
    if (argCount < pipeConfig.minArgs || argCount > pipeConfig.maxArgs) {
      const expectedStr =
        pipeConfig.minArgs === pipeConfig.maxArgs
          ? `${pipeConfig.minArgs}`
          : `${pipeConfig.minArgs} to ${pipeConfig.maxArgs}`;
      diagnostics.push({
        message: `Wrong argument count for pipe '${pipe.name}': expected ${expectedStr}, got ${argCount}`,
        severity: "error",
        line: pipe.loc.start.line,
        column: pipe.loc.start.column,
        length: pipe.name.length,
      });
    }

    // Type safety rules
    if (pipeConfig.isTraversal) {
      if (!isDom) {
        diagnostics.push({
          message: `Invalid pipe order: traversal pipe '${pipe.name}' expects a DOM Selection, but current pipeline carries a primitive value`,
          severity: "error",
          line: pipe.loc.start.line,
          column: pipe.loc.start.column,
          length: pipe.name.length,
        });
      }
      isDom = true;
    } else if (pipeConfig.isExtractor) {
      if (!isDom) {
        diagnostics.push({
          message: `Invalid pipe order: extractor pipe '${pipe.name}' expects a DOM Selection, but current pipeline carries a primitive value`,
          severity: "error",
          line: pipe.loc.start.line,
          column: pipe.loc.start.column,
          length: pipe.name.length,
        });
      }
      isDom = false;
    } else {
      // Transformer
      if (isDom) {
        diagnostics.push({
          message: `Invalid pipe order: transformer pipe '${pipe.name}' expects a primitive value, but current pipeline carries a DOM Selection (missing a content extractor like '| text')`,
          severity: "warning",
          line: pipe.loc.start.line,
          column: pipe.loc.start.column,
          length: pipe.name.length,
        });
      }
      isDom = false;
    }
  }
}

function lintList(def: ListDefinition, diagnostics: Diagnostic[]): void {
  lintSourceNode(def.source, def.name, "list block", diagnostics);

  if (def.body) {
    // Check invalid list blocks (empty body)
    if (def.body.length === 0) {
      diagnostics.push({
        message: `List block '${def.name}' has an empty body`,
        severity: "warning",
        line: def.loc.start.line,
        column: def.loc.start.column,
        length: def.name.length,
      });
    }

    // Lint the nested body
    lintScope(def.body, diagnostics);
  } else if (def.pipes) {
    // Lint pipes for primitive list
    const isDom = isDomSource(def.source);
    lintPipes(def.pipes, def.name, isDom, def.loc, diagnostics);
  }
}

function lintMeta(def: MetaDefinition, diagnostics: Diagnostic[]): void {
  // Check malformed meta variable usage
  if (!ALLOWED_METAS.includes(def.metaVariable)) {
    diagnostics.push({
      message: `Unknown or malformed meta variable '${def.metaVariable}'. Supported values: ${ALLOWED_METAS.join(", ")}`,
      severity: "error",
      line: def.loc.start.line,
      column: def.loc.start.column + def.name.length + 1, // approximate start of the meta variable
      length: def.metaVariable.length,
    });
  }
}
