import { parse } from "./parser.js";
import {
  Program,
  Definition,
  FieldDefinition,
  ListDefinition,
  MetaDefinition,
  Pipe,
  Literal,
  SourceNode
} from "./types.js";

export function format(source: string): string {
  // Parse first. If parsing fails, we cannot format, so throw the parse error.
  const ast = parse(source);
  return formatProgram(ast);
}

function formatProgram(program: Program): string {
  return formatScope(program.body, 0);
}

function formatScope(definitions: Definition[], indentLevel: number): string {
  const formattedParts: string[] = [];

  for (let i = 0; i < definitions.length; i++) {
    const current = definitions[i];
    let formatted = "";

    if (current.type === "FieldDefinition") {
      formatted = formatField(current, " ".repeat(indentLevel * 2));
    } else if (current.type === "ListDefinition") {
      formatted = formatList(current, indentLevel);
    } else {
      formatted = formatMeta(current, " ".repeat(indentLevel * 2));
    }

    if (i > 0) {
      const prev = definitions[i - 1];
      const shouldSeparate =
        prev.type === "ListDefinition" ||
        current.type === "ListDefinition" ||
        prev.type !== current.type;

      if (shouldSeparate) {
        formattedParts.push("");
      }
    }

    formattedParts.push(formatted);
  }

  return formattedParts.join("\n");
}

function formatSourceNode(source: SourceNode): string {
  switch (source.type) {
    case "Selector":
      return `"${escapeString(source.value)}"`;
    case "Self":
      return "self";
    case "Parent":
      return "parent";
    case "Root":
      return "root";
    case "Meta":
      return `@${source.name}`;
  }
}

function formatField(def: FieldDefinition, indent: string): string {
  const optionalSign = def.isOptional ? "?" : "";
  const sourceStr = formatSourceNode(def.source);
  const pipesStr = def.pipes.map(formatPipe).join("");

  return `${indent}${def.name}${optionalSign}: ${sourceStr}${pipesStr}`;
}

function formatList(def: ListDefinition, indentLevel: number): string {
  const indent = " ".repeat(indentLevel * 2);
  const sourceStr = formatSourceNode(def.source);

  if (def.body) {
    if (def.body.length === 0) {
      return `${indent}${def.name}[]: ${sourceStr} {}`;
    }

    const formattedBody = formatScope(def.body, indentLevel + 1);
    return `${indent}${def.name}[]: ${sourceStr} {\n${formattedBody}\n${indent}}`;
  } else {
    const pipesStr = def.pipes ? def.pipes.map(formatPipe).join("") : "";
    return `${indent}${def.name}[]: ${sourceStr}${pipesStr}`;
  }
}

function formatMeta(def: MetaDefinition, indent: string): string {
  return `${indent}${def.name}: ${def.metaVariable}`;
}

function formatPipe(pipe: Pipe): string {
  if (pipe.args.length === 0) {
    return ` | ${pipe.name}`;
  }

  const formattedArgs = pipe.args.map(formatLiteral).join(", ");
  return ` | ${pipe.name}(${formattedArgs})`;
}

function formatLiteral(lit: Literal): string {
  if (lit.type === "StringLiteral") {
    return `"${escapeString(lit.value as string)}"`;
  }
  return String(lit.value);
}

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
