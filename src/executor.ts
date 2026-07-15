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
    case "Coalesce": {
      let finalVal: any = null;
      for (const subSource of source.sources) {
        finalVal = resolveSource(subSource, scope, context);
        if (isPresentSource(finalVal)) {
          return finalVal;
        }
      }
      return finalVal;
    }
  }
}

function isPresentSource(val: any): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "object" && "length" in val) {
    return val.length > 0;
  }
  if (typeof val === "string") {
    return val.trim() !== "";
  }
  return true;
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
    const requiredPipe = def.pipes.find(p => p.name === 'required');
    if (requiredPipe) {
      const customMsg = requiredPipe.args[0]?.value as string;
      throw new Error(customMsg || `Required field validation failed: value is nullish or empty`);
    }

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
  if (elements.length === 0 && def.pipes) {
    const requiredPipe = def.pipes.find(p => p.name === 'required');
    if (requiredPipe) {
      const customMsg = requiredPipe.args[0]?.value as string;
      throw new Error(customMsg || `Required field validation failed: value is nullish or empty`);
    }
  }

  let listResult: any[] = [];

  if (def.body) {
    elements.each((_, el) => {
      const itemResult = evaluateScope(def.body!, context.$(el), context);
      listResult.push(itemResult);
    });
  } else if (def.pipes && def.pipes.length > 0) {
    const ARRAY_PIPES = ["unique"];
    const firstArrayPipeIdx = def.pipes.findIndex(p => ARRAY_PIPES.includes(p.name));

    if (firstArrayPipeIdx === -1) {
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
      const elementPipes = def.pipes.slice(0, firstArrayPipeIdx);
      const arrayPipes = def.pipes.slice(firstArrayPipeIdx);

      elements.each((_, el) => {
        let val: any = context.$(el);
        let isSelection = true;
        for (let i = 0; i < elementPipes.length; i++) {
          const pipe = elementPipes[i];
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

      // Apply array-level pipes
      let finalVal: any = listResult;
      for (let i = 0; i < arrayPipes.length; i++) {
        const pipe = arrayPipes[i];
        finalVal = evaluateTransformer(pipe, finalVal, context);
      }
      listResult = Array.isArray(finalVal) ? finalVal : [finalVal];
    }
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
        return evaluateTransformer(pipe, el.text(), context);
    }
  }
  return evaluateTransformer(pipe, currentValue, context);
}

function tryParseURL(val: any, context?: any): URL | null {
  if (val === null || val === undefined) return null;
  const cleanVal = String(val).trim();
  const baseUrl = context?.url;
  try {
    if (baseUrl) {
      return new URL(cleanVal, baseUrl);
    }
    return new URL(cleanVal);
  } catch {
    try {
      return new URL(cleanVal);
    } catch {
      return null;
    }
  }
}

function evaluateTransformer(pipe: Pipe, val: any, context?: any): any {
  if (pipe.name === "required") {
    const isEmpty = val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0);
    if (isEmpty) {
      const customMsg = pipe.args[0]?.value as string;
      throw new Error(customMsg || `Required field validation failed: value is nullish or empty`);
    }
    return val;
  }

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
    case "url_parse":
    case "urlParse": {
      const url = tryParseURL(val, context);
      if (!url) return null;
      const params: Record<string, string> = {};
      url.searchParams.forEach((v, k) => {
        params[k] = v;
      });
      return {
        href: url.href,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        origin: url.origin,
        params
      };
    }
    case "url_protocol":
    case "urlProtocol": {
      const url = tryParseURL(val, context);
      return url ? url.protocol : null;
    }
    case "url_hostname":
    case "urlHostname": {
      const url = tryParseURL(val, context);
      return url ? url.hostname : null;
    }
    case "url_port":
    case "urlPort": {
      const url = tryParseURL(val, context);
      return url ? url.port : null;
    }
    case "url_pathname":
    case "urlPathname":
    case "url_path":
    case "urlPath": {
      const url = tryParseURL(val, context);
      return url ? url.pathname : null;
    }
    case "url_search":
    case "urlSearch":
    case "url_query":
    case "urlQuery": {
      const url = tryParseURL(val, context);
      return url ? url.search : null;
    }
    case "url_hash":
    case "urlHash": {
      const url = tryParseURL(val, context);
      return url ? url.hash : null;
    }
    case "url_origin":
    case "urlOrigin": {
      const url = tryParseURL(val, context);
      return url ? url.origin : null;
    }
    case "url_param":
    case "urlParam": {
      const url = tryParseURL(val, context);
      if (!url) return null;
      const paramName = pipe.args[0]?.value as string;
      return url.searchParams.get(paramName);
    }
    case "url_resolve":
    case "urlResolve":
    case "url_join":
    case "urlJoin": {
      if (val === null || val === undefined) return null;
      const cleanVal = String(val).trim();
      const customBase = pipe.args[0]?.value as string;
      const baseUrl = customBase || context?.url;
      try {
        if (baseUrl) {
          return new URL(cleanVal, baseUrl).href;
        }
        return new URL(cleanVal).href;
      } catch {
        return cleanVal;
      }
    }
    case "unique": {
      if (!Array.isArray(val)) return val;
      const key = pipe.args[0]?.value as string;
      if (key) {
        const seen = new Set();
        return val.filter(item => {
          if (item && typeof item === "object") {
            const kVal = (item as any)[key];
            if (seen.has(kVal)) return false;
            seen.add(kVal);
            return true;
          }
          if (seen.has(item)) return false;
          seen.add(item);
          return true;
        });
      } else {
        return Array.from(new Set(val));
      }
    }
    case "json_parse":
    case "jsonParse":
    case "json": {
      if (val === null || val === undefined) return null;
      try {
        return JSON.parse(String(val).trim());
      } catch {
        return null;
      }
    }
    case ">": {
      const right = pipe.args[0].value;
      return compare(val, right) > 0;
    }
    case "<": {
      const right = pipe.args[0].value;
      return compare(val, right) < 0;
    }
    case ">=": {
      const right = pipe.args[0].value;
      return compare(val, right) >= 0;
    }
    case "<=": {
      const right = pipe.args[0].value;
      return compare(val, right) <= 0;
    }
    case "==":
    case "=": {
      const right = pipe.args[0].value;
      return compare(val, right) === 0;
    }
    case "!=": {
      const right = pipe.args[0].value;
      return compare(val, right) !== 0;
    }
    default:
      return val;
  }
}

function compare(left: any, right: any): number {
  if (left === right) return 0;
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (!isNaN(leftNum) && !isNaN(rightNum)) {
    return leftNum - rightNum;
  }
  const leftStr = String(left);
  const rightStr = String(right);
  return leftStr.localeCompare(rightStr);
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
