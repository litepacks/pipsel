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
    case "MatchSelector":
      return resolveMatchSelectorCheerio(source.value, scope, context);
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
    if (fallbackPipe && fallbackPipe.args.length > 0) {
      return fallbackPipe.args[0].value;
    }
    const hasBoolPipe = def.pipes.some(p => p.name === 'bool' || p.name === 'boolean');
    if (hasBoolPipe) {
      return false;
    }
    return null;
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

  if (def.body) {
    elements.each((_, el) => {
      const itemResult = evaluateScope(def.body!, context.$(el), context);
      listResult.push(itemResult);
    });
  } else if (def.pipes && def.pipes.length > 0) {
    elements.each((_, el) => {
      let val: any = context.$(el);
      let isSelection = true;
      for (let i = 0; i < def.pipes!.length; i++) {
        const pipe = def.pipes![i];
        val = evaluatePipe(pipe, val, isSelection, context);
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
      if (val !== null && val !== undefined) {
        listResult.push(val);
      }
    });
  } else {
    elements.each((_, el) => {
      listResult.push(context.$(el).text().trim());
    });
  }

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
    if (pipe.name === "bool" || pipe.name === "boolean") {
      return false;
    }
    return null;
  }

  switch (pipe.name) {
    case "trim":
      return typeof val === "string" ? val.trim() : val;
    case "trim_start":
    case "trimStart":
      return typeof val === "string" ? val.trimStart() : String(val).trimStart();
    case "trim_end":
    case "trimEnd":
      return typeof val === "string" ? val.trimEnd() : String(val).trimEnd();
    case "lowercase":
    case "lower":
      return typeof val === "string" ? val.toLowerCase() : String(val).toLowerCase();
    case "uppercase":
    case "upper":
      return typeof val === "string" ? val.toUpperCase() : String(val).toUpperCase();
    case "titlecase":
    case "title": {
      const s = String(val);
      return s.replace(/\b\w/g, c => c.toUpperCase());
    }
    case "slugify": {
      const s = String(val);
      return s
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }
    case "clean": {
      const s = String(val);
      return s.replace(/\s+/g, " ").trim();
    }
    case "prefix": {
      const pref = pipe.args[0]?.value as string;
      return pref + String(val);
    }
    case "suffix": {
      const suff = pipe.args[0]?.value as string;
      return String(val) + suff;
    }
    case "substring":
    case "slice": {
      const s = String(val);
      const start = pipe.args[0]?.value as number;
      const end = pipe.args[1]?.value as number;
      return s.slice(start, end);
    }
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
    case "abs": {
      const num = Number(val);
      return isNaN(num) ? null : Math.abs(num);
    }
    case "round": {
      const num = Number(val);
      if (isNaN(num)) return null;
      const decimals = (pipe.args[0]?.value as number) || 0;
      return Number(num.toFixed(decimals));
    }
    case "ceil": {
      const num = Number(val);
      return isNaN(num) ? null : Math.ceil(num);
    }
    case "floor": {
      const num = Number(val);
      return isNaN(num) ? null : Math.floor(num);
    }
    case "add": {
      const num = Number(val);
      const adder = Number(pipe.args[0]?.value);
      if (isNaN(num) || isNaN(adder)) return null;
      return num + adder;
    }
    case "subtract": {
      const num = Number(val);
      const subber = Number(pipe.args[0]?.value);
      if (isNaN(num) || isNaN(subber)) return null;
      return num - subber;
    }
    case "multiply": {
      const num = Number(val);
      const factor = Number(pipe.args[0]?.value);
      if (isNaN(num) || isNaN(factor)) return null;
      return num * factor;
    }
    case "divide": {
      const num = Number(val);
      const divisor = Number(pipe.args[0]?.value);
      if (isNaN(num) || isNaN(divisor) || divisor === 0) return null;
      return num / divisor;
    }
    case "min": {
      const arr = Array.isArray(val) ? val : [val];
      const nums = arr.map(Number).filter(n => !isNaN(n));
      return nums.length === 0 ? null : Math.min(...nums);
    }
    case "max": {
      const arr = Array.isArray(val) ? val : [val];
      const nums = arr.map(Number).filter(n => !isNaN(n));
      return nums.length === 0 ? null : Math.max(...nums);
    }
    case "sum": {
      const arr = Array.isArray(val) ? val : [val];
      const nums = arr.map(Number).filter(n => !isNaN(n));
      return nums.reduce((acc, curr) => acc + curr, 0);
    }
    case "avg":
    case "average": {
      const arr = Array.isArray(val) ? val : [val];
      const nums = arr.map(Number).filter(n => !isNaN(n));
      return nums.length === 0 ? null : nums.reduce((acc, curr) => acc + curr, 0) / nums.length;
    }
    case "bool":
    case "boolean": {
      if (typeof val === "boolean") return val;
      if (typeof val === "number") return !isNaN(val) && val !== 0;
      if (typeof val === "string") {
        const s = val.trim().toLowerCase();
        if (s === "false" || s === "no" || s === "0" || s === "off" || s === "") return false;
        if (s === "true" || s === "yes" || s === "1" || s === "on") return true;
        return s.length > 0;
      }
      if (Array.isArray(val)) return val.length > 0;
      return !!val;
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

const SYNONYMS: Record<string, string[]> = {
  title: ["name", "heading", "header", "headline", "label"],
  price: ["amount", "cost", "value", "price-amount", "sale"],
  description: ["desc", "summary", "text", "body", "content"],
  image: ["img", "src", "photo", "pic", "thumbnail", "avatar"],
  url: ["href", "link", "path", "website"],
};

function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function resolveMatchSelectorCheerio(query: string, scope: cheerio.Cheerio<any>, context: any): cheerio.Cheerio<any> {
  const qNorm = normalizeName(query);
  const synonyms = SYNONYMS[qNorm] || [];
  
  let bestElements: any[] = [];
  let bestScore = 0;

  const elements = scope.find("*");
  const allElements = [scope, ...elements.toArray().map((el: any) => context.$(el))];

  for (const el of allElements) {
    const node = el[0];
    if (!node || node.type !== "tag") continue;

    const attributes = node.attribs || {};
    const candidateTypes = [
      { type: "id", val: attributes["id"], base: 100 },
      { type: "class", val: attributes["class"], base: 98 },
      { type: "data-testid", val: attributes["data-testid"], base: 96 },
      { type: "data-test", val: attributes["data-test"], base: 94 },
      { type: "data-cy", val: attributes["data-cy"], base: 92 },
      { type: "aria-label", val: attributes["aria-label"], base: 90 },
      { type: "name", val: attributes["name"], base: 88 },
      { type: "itemprop", val: attributes["itemprop"], base: 86 },
      { type: "role", val: attributes["role"], base: 84 }
    ];

    let elementMaxScore = 0;

    for (const cand of candidateTypes) {
      if (!cand.val) continue;

      const valNorm = normalizeName(cand.val);
      if (!valNorm) continue;

      let score = 0;
      if (valNorm === qNorm) {
        score = cand.base;
      } else {
        const valWords = valNorm.split(" ");
        if (valWords.includes(qNorm)) {
          score = cand.base * 0.9;
        } else if (synonyms.some((syn: string) => valWords.includes(syn))) {
          score = cand.base * 0.8;
        } else if (valNorm.includes(qNorm)) {
          score = cand.base * 0.6;
        } else if (synonyms.some((syn: string) => valNorm.includes(syn))) {
          score = cand.base * 0.5;
        }
      }

      if (score > elementMaxScore) {
        elementMaxScore = score;
      }
    }

    if (elementMaxScore > 0) {
      if (elementMaxScore > bestScore) {
        bestScore = elementMaxScore;
        bestElements = [node];
      } else if (elementMaxScore === bestScore) {
        bestElements.push(node);
      }
    }
  }

  return bestElements.length > 0 ? context.$(bestElements) : context.$();
}
