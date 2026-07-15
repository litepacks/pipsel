import * as fs from "fs";
import * as cheerio from "cheerio";
import { parse } from "./parser.js";
import { execute, evaluatePipe, resolveSource } from "./executor.js";
import { explain, getSourceLabel } from "./explain.js";
import { Program, Definition, FieldDefinition, ListDefinition, Pipe, SourceNode } from "./types.js";

// Helper to resolve PSL source from file or inline string
function getSource(sourceOrFile: string): string {
  if (sourceOrFile.endsWith(".psl") || (fs.existsSync && fs.existsSync(sourceOrFile))) {
    return fs.readFileSync(sourceOrFile, "utf-8");
  }
  return sourceOrFile;
}

function formatPipeArgs(pipe: Pipe): string {
  if (!pipe.args || pipe.args.length === 0) return "";
  const argStrings = pipe.args.map(arg => {
    if (arg.type === "StringLiteral") return `"${arg.value}"`;
    return String(arg.value);
  });
  return `(${argStrings.join(", ")})`;
}

function describeValue(val: any): string {
  if (val === null || val === undefined) {
    return "null";
  }
  if (typeof val === "object" && "cheerio" in val) {
    const el = val as cheerio.Cheerio<any>;
    if (el.length === 0) {
      return "(empty selection)";
    }
    return el.text().trim() || el.html() || "(elements)";
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}

function debugField(def: FieldDefinition, scope: cheerio.Cheerio<any>, context: any, logs: string[]): any {
  logs.push(`✓ ${getSourceLabel(def.source)}`);
  const sourceVal = resolveSource(def.source, scope, context);
  
  let val: any = sourceVal;
  let isSelection = def.source.type !== "Meta";

  logs.push(`→ ${describeValue(val)}`);
  logs.push("");

  for (let i = 0; i < def.pipes.length; i++) {
    const pipe = def.pipes[i];
    logs.push(`✓ ${pipe.name}${formatPipeArgs(pipe)}`);
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

    logs.push(`→ ${describeValue(val)}`);
    logs.push("");
  }
  return val;
}

function evaluateScopeDebug(definitions: Definition[], scope: cheerio.Cheerio<any>, context: any, logs: string[]): void {
  for (const def of definitions) {
    if (def.type === "FieldDefinition") {
      logs.push(`=== Field: ${def.name} ===`);
      debugField(def, scope, context, logs);
    } else if (def.type === "ListDefinition") {
      logs.push(`=== List: ${def.name} ===`);
      logs.push(`✓ ${getSourceLabel(def.source)}`);
      const elements = resolveSource(def.source, scope, context) as cheerio.Cheerio<any>;
      logs.push(`→ Found ${elements.length} element(s)`);
      logs.push("");

      if (def.body) {
        elements.each((index, el) => {
          logs.push(`  --- Item #${index + 1} ---`);
          evaluateScopeDebug(def.body!, context.$(el), context, logs);
        });
      } else if (def.pipes && def.pipes.length > 0) {
        logs.push(`  --- Primitive List ---`);
        elements.each((index, el) => {
          logs.push(`  --- Item #${index + 1} ---`);
          let val: any = context.$(el);
          let isSelection = true;
          for (let i = 0; i < def.pipes!.length; i++) {
            const pipe = def.pipes![i];
            logs.push(`  ✓ ${pipe.name}${formatPipeArgs(pipe)}`);
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
            logs.push(`  → ${describeValue(val)}`);
          }
        });
      }
    }
  }
}

export interface PipselRunner<R> {
  extract<T = any>(file: string): Promise<R extends any[] ? T[] : T>;
  run<T = any>(source: string): Promise<R extends any[] ? T[] : T>;
  explain(sourceOrFile: string): Promise<string>;
  debug(sourceOrFile: string): Promise<string>;
}

class PipselPageRunner implements PipselRunner<any> {
  constructor(private page: any) {}

  async extract<T = any>(file: string): Promise<T> {
    const source = getSource(file);
    return this.run<T>(source);
  }

  async run<T = any>(source: string): Promise<T> {
    const ast = parse(source);
    const html = await this.page.content();
    const url = typeof this.page.url === "function" ? this.page.url() : "";
    return execute(ast, { html, url });
  }

  async explain(sourceOrFile: string): Promise<string> {
    const source = getSource(sourceOrFile);
    const ast = parse(source);
    const tree = explain(ast);
    console.log(tree);
    return tree;
  }

  async debug(sourceOrFile: string): Promise<string> {
    const source = getSource(sourceOrFile);
    const ast = parse(source);
    const html = await this.page.content();
    const url = typeof this.page.url === "function" ? this.page.url() : "";
    const $ = cheerio.load(html);
    const context = { $, url, timestamp: Date.now() };
    const logs: string[] = [];
    evaluateScopeDebug(ast.body, $.root(), context, logs);
    const logOutput = logs.join("\n").trim();
    console.log(logOutput);
    return logOutput;
  }
}

class PipselLocatorRunner implements PipselRunner<any[]> {
  constructor(private locator: any) {}

  async extract<T = any>(file: string): Promise<T[]> {
    const source = getSource(file);
    return this.run<T>(source);
  }

  async run<T = any>(source: string): Promise<T[]> {
    const ast = parse(source);
    const htmls: string[] = await this.locator.evaluateAll((els: any[]) => els.map(el => el.outerHTML));
    const pageObj = typeof this.locator.page === "function" ? this.locator.page() : null;
    const url = pageObj && typeof pageObj.url === "function" ? pageObj.url() : "";
    return htmls.map(html => execute(ast, { html, url }));
  }

  async explain(sourceOrFile: string): Promise<string> {
    const source = getSource(sourceOrFile);
    const ast = parse(source);
    const tree = explain(ast);
    console.log(tree);
    return tree;
  }

  async debug(sourceOrFile: string): Promise<string> {
    const source = getSource(sourceOrFile);
    const ast = parse(source);
    const htmls: string[] = await this.locator.evaluateAll((els: any[]) => els.map(el => el.outerHTML));
    const pageObj = typeof this.locator.page === "function" ? this.locator.page() : null;
    const url = pageObj && typeof pageObj.url === "function" ? pageObj.url() : "";
    const logs: string[] = [];
    
    for (let index = 0; index < htmls.length; index++) {
      logs.push(`=== Element #${index + 1} ===`);
      const $ = cheerio.load(htmls[index]);
      const context = { $, url, timestamp: Date.now() };
      evaluateScopeDebug(ast.body, $.root(), context, logs);
      logs.push("");
    }

    const logOutput = logs.join("\n").trim();
    console.log(logOutput);
    return logOutput;
  }
}

class PipselElementHandleRunner implements PipselRunner<any> {
  constructor(private element: any) {}

  async extract<T = any>(file: string): Promise<T> {
    const source = getSource(file);
    return this.run<T>(source);
  }

  async run<T = any>(source: string): Promise<T> {
    const ast = parse(source);
    const html = await this.element.evaluate((el: any) => el.outerHTML);
    return execute(ast, { html });
  }

  async explain(sourceOrFile: string): Promise<string> {
    const source = getSource(sourceOrFile);
    const ast = parse(source);
    const tree = explain(ast);
    console.log(tree);
    return tree;
  }

  async debug(sourceOrFile: string): Promise<string> {
    const source = getSource(sourceOrFile);
    const ast = parse(source);
    const html = await this.element.evaluate((el: any) => el.outerHTML);
    const $ = cheerio.load(html);
    const context = { $, url: "", timestamp: Date.now() };
    const logs: string[] = [];
    evaluateScopeDebug(ast.body, $.root(), context, logs);
    const logOutput = logs.join("\n").trim();
    console.log(logOutput);
    return logOutput;
  }
}

class PipselCollectionRunner implements PipselRunner<any[]> {
  constructor(private elements: any[]) {}

  async extract<T = any>(file: string): Promise<T[]> {
    const source = getSource(file);
    return this.run<T>(source);
  }

  async run<T = any>(source: string): Promise<T[]> {
    const ast = parse(source);
    const htmls: string[] = await Promise.all(
      this.elements.map(el => el.evaluate((node: any) => node.outerHTML))
    );
    return htmls.map(html => execute(ast, { html }));
  }

  async explain(sourceOrFile: string): Promise<string> {
    const source = getSource(sourceOrFile);
    const ast = parse(source);
    const tree = explain(ast);
    console.log(tree);
    return tree;
  }

  async debug(sourceOrFile: string): Promise<string> {
    const source = getSource(sourceOrFile);
    const ast = parse(source);
    const htmls: string[] = await Promise.all(
      this.elements.map(el => el.evaluate((node: any) => node.outerHTML))
    );
    const logs: string[] = [];

    for (let index = 0; index < htmls.length; index++) {
      logs.push(`=== Element #${index + 1} ===`);
      const $ = cheerio.load(htmls[index]);
      const context = { $, url: "", timestamp: Date.now() };
      evaluateScopeDebug(ast.body, $.root(), context, logs);
      logs.push("");
    }

    const logOutput = logs.join("\n").trim();
    console.log(logOutput);
    return logOutput;
  }
}

export function pipsel(page: any): PipselRunner<any>;
export function pipsel(locator: any): PipselRunner<any[]>;
export function pipsel(target: any): PipselRunner<any> | PipselRunner<any[]> {
  if (!target) {
    throw new Error("pipsel: target is required");
  }

  if (Array.isArray(target)) {
    return new PipselCollectionRunner(target);
  }

  if (typeof target.evaluateAll === "function") {
    return new PipselLocatorRunner(target);
  }

  if (typeof target.evaluate === "function" && typeof target.content !== "function") {
    return new PipselElementHandleRunner(target);
  }

  if (typeof target.content === "function") {
    return new PipselPageRunner(target);
  }

  throw new Error("pipsel: target must be a Playwright Page/Locator or Puppeteer Page/ElementHandle");
}
