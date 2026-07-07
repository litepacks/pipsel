import * as cheerio from "cheerio";
import { Program, Definition, FieldDefinition, ListDefinition, MetaDefinition, Pipe, SourceNode } from "./types.js";

export interface ExecuteOptions {
  html: string;
  url?: string;
}

export function execute(ast: Program, options: ExecuteOptions): any {
  const $ = cheerio.load(options.html);
  const context = {
    $,
    url: options.url || "",
    timestamp: Date.now()
  };

  return evaluateScope(ast.body, $.root(), context);
}

function evaluateScope(definitions: Definition[], scope: cheerio.Cheerio<any>, context: any): any {
  const result: any = {};

  for (const def of definitions) {
    switch (def.type) {
      case "MetaDefinition":
        result[def.name] = evaluateMeta(def, context);
        break;
      case "FieldDefinition": {
        const val = evaluateField(def, scope, context);
        if (def.isOptional && val === null) {
          // Skip optional fields that evaluate to null
        } else {
          result[def.name] = val;
        }
        break;
      }
      case "ListDefinition":
        result[def.name] = evaluateList(def, scope, context);
        break;
    }
  }

  return result;
}

function evaluateMeta(def: MetaDefinition, context: any): any {
  switch (def.metaVariable) {
    case "@url":
      return context.url;
    case "@timestamp":
      return new Date(context.timestamp).toISOString();
    default:
      return null;
  }
}

function resolveSource(source: SourceNode, scope: cheerio.Cheerio<any>, context: any): cheerio.Cheerio<any> | any {
  switch (source.type) {
    case "Selector":
      return scope.find(source.value);
    case "Self":
      return scope;
    case "Parent":
      return scope.parent();
    case "Root":
      return context.$.root();
    case "Meta":
      switch (source.name) {
        case "url":
          return context.url;
        case "timestamp":
          return new Date(context.timestamp).toISOString();
        default:
          return null;
      }
  }
}

function evaluateField(def: FieldDefinition, scope: cheerio.Cheerio<any>, context: any): any {
  const sourceVal = resolveSource(def.source, scope, context);

  if (def.source.type === "Meta") {
    let value = sourceVal;
    for (let i = 0; i < def.pipes.length; i++) {
      const pipe = def.pipes[i];
      value = evaluatePipe(pipe, value, false, context);
    }
    return value;
  }

  const elements = sourceVal as cheerio.Cheerio<any>;
  if (elements.length === 0) {
    const fallbackPipe = def.pipes.find(p => p.name === 'fallback');
    return fallbackPipe && fallbackPipe.args.length > 0 ? fallbackPipe.args[0].value : null;
  }

  let value: any = elements;

  // Default to text if no pipes are specified
  if (def.pipes.length === 0) {
    return elements.eq(0).text().trim();
  }

  let isSelection = true;
  for (let i = 0; i < def.pipes.length; i++) {
    const pipe = def.pipes[i];
    value = evaluatePipe(pipe, value, isSelection, context);
    
    const isTraversal = ["find", "closest", "parent", "children", "siblings", "next", "prev", "eq", "first", "last"].includes(pipe.name);
    const isExtractor = ["text", "html", "attr"].includes(pipe.name);
    if (isTraversal) {
      isSelection = true;
    } else if (isExtractor) {
      isSelection = false;
    } else {
      isSelection = false;
    }
  }

  return value;
}

function evaluateList(def: ListDefinition, scope: cheerio.Cheerio<any>, context: any): any[] {
  const sourceVal = resolveSource(def.source, scope, context);
  if (def.source.type === "Meta") {
    return [];
  }

  const elements = sourceVal as cheerio.Cheerio<any>;
  const listResult: any[] = [];

  elements.each((_, el) => {
    const itemResult = evaluateScope(def.body, context.$(el), context);
    listResult.push(itemResult);
  });

  return listResult;
}

function evaluatePipe(pipe: Pipe, currentValue: any, isSelection: boolean, context: any): any {
  if (isSelection) {
    const el = currentValue as cheerio.Cheerio<any>;
    switch (pipe.name) {
      case "find":
        return el.find(pipe.args[0]?.value as string);
      case "closest":
        return el.closest(pipe.args[0]?.value as string);
      case "parent":
        return el.parent();
      case "children":
        return pipe.args.length > 0 ? el.children(pipe.args[0].value as string) : el.children();
      case "siblings":
        return pipe.args.length > 0 ? el.siblings(pipe.args[0].value as string) : el.siblings();
      case "next":
        return pipe.args.length > 0 ? el.next(pipe.args[0].value as string) : el.next();
      case "prev":
        return pipe.args.length > 0 ? el.prev(pipe.args[0].value as string) : el.prev();
      case "eq":
        return el.eq(pipe.args[0]?.value as number);
      case "first":
        return el.first();
      case "last":
        return el.last();
      case "text":
        return el.text();
      case "html":
        return el.html() || "";
      case "attr": {
        const attrName = pipe.args[0]?.value as string;
        return el.attr(attrName) || null;
      }
      default:
        // default text converter + transformer evaluation
        return evaluateTransformer(pipe, el.text());
    }
  }
  return evaluateTransformer(pipe, currentValue);
}

function evaluateTransformer(pipe: Pipe, val: any): any {
  if (val === null || val === undefined) {
    if (pipe.name === "fallback") {
      return pipe.args[0].value;
    }
    return null;
  }

  switch (pipe.name) {
    case "trim":
      return typeof val === "string" ? val.trim() : val;
    case "replace": {
      if (typeof val !== "string") return val;
      const from = pipe.args[0]?.value as string;
      const to = pipe.args[1]?.value as string;
      return val.replaceAll(from, to);
    }
    case "regex": {
      if (typeof val !== "string") return null;
      const pattern = pipe.args[0]?.value as string;
      try {
        const re = new RegExp(pattern);
        const match = val.match(re);
        if (!match) return null;
        return match[1] !== undefined ? match[1] : match[0];
      } catch {
        return null;
      }
    }
    case "split": {
      if (typeof val !== "string") return [val];
      const sep = pipe.args[0]?.value as string;
      const limit = pipe.args[1]?.value as number;
      return val.split(sep, limit);
    }
    case "int": {
      const parsed = parseInt(String(val).replace(/[^0-9.-]/g, ""), 10);
      return isNaN(parsed) ? null : parsed;
    }
    case "float": {
      const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
      return isNaN(parsed) ? null : parsed;
    }
    case "fallback":
      return val === "" ? pipe.args[0].value : val;
    case "filter": {
      const pattern = pipe.args[0]?.value as string;
      try {
        const re = new RegExp(pattern);
        if (Array.isArray(val)) {
          return val.filter(item => re.test(String(item)));
        }
        return re.test(String(val)) ? val : null;
      } catch {
        return null;
      }
    }
    default:
      return val;
  }
}
