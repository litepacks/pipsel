import { parse } from "./parser.js";
import { Program, Definition, Diagnostic, FieldDefinition, ListDefinition, MetaDefinition, Pipe } from "./types.js";

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
  replace: { minArgs: 2, maxArgs: 2, isExtractor: false, isTraversal: false },
  regex: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  split: { minArgs: 1, maxArgs: 2, isExtractor: false, isTraversal: false },
  int: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  float: { minArgs: 0, maxArgs: 0, isExtractor: false, isTraversal: false },
  fallback: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
  filter: { minArgs: 1, maxArgs: 1, isExtractor: false, isTraversal: false },
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
function lintField(def: FieldDefinition, diagnostics: Diagnostic[]): void {
  // 1. Check empty source selector
  if (def.source.type === "Selector" && def.source.value.trim() === "") {
    diagnostics.push({
      message: `Empty selector for field '${def.name}'`,
      severity: "error",
      line: def.loc.start.line,
      column: def.loc.start.column,
      length: def.name.length,
    });
  }

  // 1b. Check meta source variable
  if (def.source.type === "Meta") {
    const metaVar = "@" + def.source.name;
    if (!ALLOWED_METAS.includes(metaVar)) {
      diagnostics.push({
        message: `Unknown or malformed meta variable '${metaVar}'. Supported values: ${ALLOWED_METAS.join(", ")}`,
        severity: "error",
        line: def.source.loc.start.line,
        column: def.source.loc.start.column,
        length: metaVar.length,
      });
    }
  }

  // 2. Check pipe functions
  const pipes = def.pipes;
  let isDom = def.source.type !== "Meta";

  if (pipes.length === 0) {
    if (isDom) {
      diagnostics.push({
        message: `Field '${def.name}' has selector/context but is missing a content extractor (like '| text' or '| attr')`,
        severity: "warning",
        line: def.loc.start.line,
        column: def.loc.start.column,
        length: def.name.length,
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
  // Check empty selector
  if (def.source.type === "Selector" && def.source.value.trim() === "") {
    diagnostics.push({
      message: `Empty selector for list block '${def.name}'`,
      severity: "error",
      line: def.loc.start.line,
      column: def.loc.start.column,
      length: def.name.length,
    });
  }

  // Check meta source variable
  if (def.source.type === "Meta") {
    const metaVar = "@" + def.source.name;
    if (!ALLOWED_METAS.includes(metaVar)) {
      diagnostics.push({
        message: `Unknown or malformed meta variable '${metaVar}'. Supported values: ${ALLOWED_METAS.join(", ")}`,
        severity: "error",
        line: def.source.loc.start.line,
        column: def.source.loc.start.column,
        length: metaVar.length,
      });
    }
  }

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
