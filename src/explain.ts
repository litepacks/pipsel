import { Program, Definition, FieldDefinition, ListDefinition, MetaDefinition, Pipe, SourceNode } from "./types.js";

interface TreeNode {
  label: string;
  children: TreeNode[];
}

function getSourceLabel(source: SourceNode): string {
  switch (source.type) {
    case "Selector":
      return source.value;
    case "MatchSelector":
      return `@match("${source.value}")`;
    case "Self":
      return "self";
    case "Parent":
      return "parent";
    case "Root":
      return "root";
    case "Meta":
      return "@" + source.name;
    case "Coalesce":
      return source.sources.map(getSourceLabel).join(" ?? ");
    default:
      return "";
  }
}

function pipeToTreeNode(pipe: Pipe): TreeNode {
  const OPERATORS = [">", "<", ">=", "<=", "==", "=", "!="];
  if (OPERATORS.includes(pipe.name)) {
    const arg = pipe.args[0];
    const argStr = arg.type === "StringLiteral" ? `"${arg.value}"` : String(arg.value);
    return {
      label: `${pipe.name} ${argStr}`,
      children: []
    };
  }

  let label = pipe.name;
  if (pipe.args.length > 0) {
    const argsStr = pipe.args.map(arg => {
      if (arg.type === "StringLiteral") {
        return `"${arg.value}"`;
      }
      return String(arg.value);
    }).join(",");
    label += `(${argsStr})`;
  }
  return {
    label,
    children: []
  };
}

function fieldToTreeNode(def: FieldDefinition): TreeNode {
  const sourceLabel = getSourceLabel(def.source);
  const sourceNode: TreeNode = {
    label: sourceLabel,
    children: def.pipes.map(pipeToTreeNode)
  };
  return {
    label: def.name + (def.isOptional ? "?" : ""),
    children: [sourceNode]
  };
}

function listToTreeNode(def: ListDefinition): TreeNode {
  const sourceLabel = getSourceLabel(def.source);
  let sourceNodeChildren: TreeNode[] = [];
  if (def.body) {
    sourceNodeChildren = def.body.map(definitionToTreeNode);
  } else if (def.pipes) {
    sourceNodeChildren = def.pipes.map(pipeToTreeNode);
  }
  
  const sourceNode: TreeNode = {
    label: sourceLabel,
    children: sourceNodeChildren
  };
  
  return {
    label: def.name + "[]",
    children: [sourceNode]
  };
}

function metaToTreeNode(def: MetaDefinition): TreeNode {
  return {
    label: def.name,
    children: [{
      label: def.metaVariable,
      children: []
    }]
  };
}

function definitionToTreeNode(def: Definition): TreeNode {
  if (def.type === "FieldDefinition") {
    return fieldToTreeNode(def);
  } else if (def.type === "ListDefinition") {
    return listToTreeNode(def);
  } else {
    return metaToTreeNode(def);
  }
}

function renderNode(node: TreeNode, prefixes: string[] = []): string[] {
  const lines: string[] = [];
  lines.push(node.label);
  
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const isLast = i === node.children.length - 1;
    const childPrefix = isLast ? "└── " : "├── ";
    const childLinesPrefixes = [...prefixes, isLast ? "    " : "│   "];
    const childLines = renderNode(child, childLinesPrefixes);
    
    const parentPrefixStr = prefixes.join("");
    lines.push(parentPrefixStr + childPrefix + childLines[0]);
    for (let j = 1; j < childLines.length; j++) {
      lines.push(childLines[j]);
    }
  }
  
  return lines;
}

export function explain(ast: Program): string {
  const trees = ast.body.map(def => {
    const node = definitionToTreeNode(def);
    return renderNode(node).join("\n");
  });
  return trees.join("\n\n");
}
