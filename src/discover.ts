import * as cheerio from "cheerio";
import { parse } from "./parser.js";
import { execute } from "./executor.js";
import { lint } from "./linter.js";

export interface LLMProvider {
  call(prompt: string): Promise<string>;
}

export interface DiscoverOptions {
  fields?: string[];
  description?: string;
  provider: LLMProvider;
  tokenBudget?: number;
  maxRepairAttempts?: number;
  onProgress?: (event: string) => void;
}

export interface SelectorDiagnostic {
  field: string;
  selector: string;
  matches: number;
  confidence: number;
  alternatives: string[];
  warnings: string[];
}

export interface DiscoverResult {
  psl: string;
  confidence: number;
  diagnostics: SelectorDiagnostic[];
  preview: any;
  validationErrors: string[];
}

interface CompressedNode {
  id: number;
  tag: string;
  classes?: string[];
  attributes?: Record<string, string>;
  text?: string;
  children?: CompressedNode[];
}

export interface RepeatedStructure {
  selector: string;
  itemCount: number;
  confidence: number;
  tagName: string;
  className?: string;
}

export interface CandidateField {
  fieldName: string;
  nodeId: number;
  confidence: number;
  selector: string;
}

// ----------------------------------------------------
// 1. DOM Cleanup
// ----------------------------------------------------
export function cleanDOM(html: string): cheerio.CheerioAPI {
  const $ = cheerio.load(html);

  // Remove useless tags
  $("script, style, svg, noscript, iframe, link[rel='stylesheet']").remove();

  // Remove comments
  $("*").contents().each((_, el) => {
    if (el.type === "comment") {
      $(el).remove();
    }
  });

  // Remove hidden nodes
  $("*").each((_, el) => {
    const $el = $(el);
    const style = $el.attr("style") || "";
    if (
      $el.attr("hidden") !== undefined ||
      /display:\s*none/i.test(style) ||
      /visibility:\s*hidden/i.test(style)
    ) {
      $el.remove();
    }
  });

  // Remove common ads and analytics elements
  $("*").each((_, el) => {
    const $el = $(el);
    const id = $el.attr("id") || "";
    const className = $el.attr("class") || "";
    const combined = (id + " " + className).toLowerCase();

    if (
      /ad-?container|ad-?wrapper|banner-?ad|adsbygoogle|analytics|google-tag|gtm|tracking|pixel/i.test(
        combined
      )
    ) {
      $el.remove();
    }
  });

  // Clean attributes and normalize whitespace
  const allowedAttributes = [
    "class",
    "id",
    "href",
    "src",
    "srcset",
    "itemprop",
    "role",
    "name",
    "rel"
  ];

  $("*").each((_, el) => {
    const $el = $(el);
    const attribs = (el as any).attribs || {};
    
    // Remove disallowed attributes
    for (const attr of Object.keys(attribs)) {
      const isAllowed = allowedAttributes.includes(attr) || attr.startsWith("data-") || attr.startsWith("aria-");
      if (!isAllowed) {
        $el.removeAttr(attr);
      }
    }

    // Normalize text content if it's a text node child
    $el.contents().each((_, child) => {
      if (child.type === "text") {
        let text = $(child).text();
        text = text.normalize("NFC");
        text = text.replace(/\s+/g, " ");
        child.data = text;
      }
    });
  });

  return $;
}

// ----------------------------------------------------
// 2. DOM Compression & Node ID Mapping
// ----------------------------------------------------
export class DOMCompressor {
  private nextId = 1;
  public idToElementMap = new Map<number, any>();
  public elementToIdMap = new Map<any, number>();

  constructor(private $: cheerio.CheerioAPI) {}

  public compress(element: cheerio.Cheerio<any>): CompressedNode[] {
    const nodes: CompressedNode[] = [];

    element.each((_, el) => {
      if (el.type === "root") {
        const children = this.$(el).children();
        nodes.push(...this.compress(children));
        return;
      }
      if (el.type !== "tag") return;

      const id = this.nextId++;
      this.idToElementMap.set(id, el);
      this.elementToIdMap.set(el, id);

      const $el = this.$(el);
      const tag = el.name.toLowerCase();
      
      const classes = $el.attr("class")
        ? $el.attr("class")!.split(/\s+/).filter(Boolean)
        : undefined;

      const attributes: Record<string, string> = {};
      const attrsToKeep = ["id", "href", "src", "itemprop", "role", "name"];
      for (const attr of attrsToKeep) {
        const val = $el.attr(attr);
        if (val) attributes[attr] = val.trim();
      }

      // Add data-attributes
      for (const [key, val] of Object.entries((el as any).attribs || {})) {
        if (key.startsWith("data-")) {
          attributes[key] = val as string;
        }
      }

      // Get direct text content
      let directText = "";
      $el.contents().each((_, child) => {
        if (child.type === "text") {
          directText += this.$(child).text();
        }
      });
      directText = directText.trim();

      const compressedNode: CompressedNode = {
        id,
        tag,
        classes,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        text: directText || undefined
      };

      const children = $el.children();
      if (children.length > 0) {
        const compressedChildren = this.compress(children);
        if (compressedChildren.length > 0) {
          compressedNode.children = compressedChildren;
        }
      }

      nodes.push(compressedNode);
    });

    return nodes;
  }

  public serialize(nodes: CompressedNode[], depth = 0): string {
    let result = "";
    const indent = "  ".repeat(depth);
    for (const node of nodes) {
      const classStr = node.classes && node.classes.length > 0 ? `.${node.classes.join(".")}` : "";
      const attrParts: string[] = [];
      if (node.attributes) {
        for (const [k, v] of Object.entries(node.attributes)) {
          attrParts.push(`${k}="${v}"`);
        }
      }
      const attrStr = attrParts.length > 0 ? ` [${attrParts.join(" ")}]` : "";
      const textStr = node.text ? ` text="${node.text.slice(0, 50)}${node.text.length > 50 ? "..." : ""}"` : "";

      result += `${indent}[${node.id}] ${node.tag}${classStr}${attrStr}${textStr}\n`;
      if (node.children) {
        result += this.serialize(node.children, depth + 1);
      }
    }
    return result;
  }
}

// ----------------------------------------------------
// 3. Repeated Structure Detection
// ----------------------------------------------------
export function detectRepeatedStructures($: cheerio.CheerioAPI): RepeatedStructure[] {
  const structures: RepeatedStructure[] = [];

  $("*").each((_, parentEl) => {
    const children = $(parentEl).children();
    if (children.length < 3) return;

    // Group direct children by tag name + first class name
    const groups: Record<string, any[]> = {};
    children.each((_, child) => {
      if (child.type !== "tag") return;
      const tag = child.name.toLowerCase();
      const firstClass = $(child).attr("class")?.split(/\s+/)[0] || "";
      const key = firstClass ? `${tag}.${firstClass}` : tag;
      if (!groups[key]) groups[key] = [];
      groups[key].push(child);
    });

    for (const [key, items] of Object.entries(groups)) {
      if (items.length >= 3) {
        const parts = key.split(".");
        const tagName = parts[0];
        const className = parts[1];

        // Evaluate structural similarity: check if item children templates match
        const templates = items.map(item => {
          const childrenTags: string[] = [];
          $(item).find("*").each((_, sub) => {
            if (sub.type === "tag") childrenTags.push(sub.name);
          });
          return childrenTags.sort().join(",");
        });

        // Compare templates
        const freqMap: Record<string, number> = {};
        for (const t of templates) {
          freqMap[t] = (freqMap[t] || 0) + 1;
        }

        const maxFreq = Math.max(...Object.values(freqMap));
        const confidence = maxFreq / items.length;

        if (confidence >= 0.6) {
          const selector = className ? `${tagName}.${className}` : tagName;
          structures.push({
            selector,
            itemCount: items.length,
            confidence: Math.round(confidence * 100) / 100,
            tagName,
            className
          });
        }
      }
    }
  });

  return structures.sort((a, b) => b.itemCount - a.itemCount || b.confidence - a.confidence);
}

// ----------------------------------------------------
// 4. Candidate Field Detection (Deterministic)
// ----------------------------------------------------
export function detectCandidateFields($: cheerio.CheerioAPI, targetFields: string[]): CandidateField[] {
  const candidates: CandidateField[] = [];

  for (const field of targetFields) {
    const fNorm = field.toLowerCase().trim();

    $("*").each((_, el) => {
      if (el.type !== "tag") return;
      const $el = $(el);
      const id = $el.attr("id") || "";
      const className = $el.attr("class") || "";
      const nameAttr = $el.attr("name") || "";
      const itemprop = $el.attr("itemprop") || "";
      const role = $el.attr("role") || "";
      const combined = `${id} ${className} ${nameAttr} ${itemprop} ${role}`.toLowerCase();

      let score = 0;
      if (combined.includes(fNorm)) {
        score += 0.5;
        if (id.toLowerCase() === fNorm || itemprop.toLowerCase() === fNorm) {
          score += 0.4;
        }
      }

      // Extra semantic hints
      if (fNorm === "title" || fNorm === "name") {
        if (["h1", "h2", "h3"].includes(el.name)) {
          score += 0.3;
        }
        if ($el.attr("property") === "og:title") {
          score += 0.9;
        }
      }

      if (fNorm === "price") {
        const text = $el.text().trim();
        if (/[\$\£\€\d]/.test(text) && text.length < 20) {
          score += 0.2;
        }
      }

      if (fNorm === "image" || fNorm === "img") {
        if (el.name === "img") {
          score += 0.4;
        }
        if ($el.attr("property") === "og:image") {
          score += 0.9;
        }
      }

      if (fNorm === "url" || fNorm === "link") {
        if (el.name === "a") {
          score += 0.4;
        }
        if ($el.attr("property") === "og:url") {
          score += 0.9;
        }
      }

      if (score > 0.3) {
        let selector = el.name;
        if (id) {
          selector += `#${id}`;
        } else if (itemprop) {
          selector += `[itemprop="${itemprop}"]`;
        } else if (className) {
          selector += `.${className.trim().replace(/\s+/g, ".")}`;
        }

        candidates.push({
          fieldName: field,
          nodeId: 0,
          confidence: Math.round(Math.min(score, 1.0) * 100) / 100,
          selector
        });
      }
    });
  }

  return candidates;
}

// ----------------------------------------------------
// 5. DOM Chunking & Ranking
// ----------------------------------------------------
interface DOMChunk {
  element: cheerio.Cheerio<any>;
  score: number;
  id: number;
}

export function chunkDOM($: cheerio.CheerioAPI, tokenBudget = 8000): cheerio.Cheerio<any>[] {
  const chunks: DOMChunk[] = [];
  let chunkId = 1;

  const selectors = ["main", "article", "section", ".content", ".main", "#content", "#main", "body"];
  let chosenSelector = "body";

  for (const sel of selectors) {
    const el = $(sel);
    if (el.length > 0) {
      chosenSelector = sel;
      break;
    }
  }

  const container = $(chosenSelector);
  const candidates = container.find("article, section, div[class*='content'], div[class*='main'], div[id*='content'], div[id*='main']");
  
  if (candidates.length === 0) {
    container.children().each((_, child) => {
      if (child.type === "tag") {
        chunks.push({ element: $(child), score: 0, id: chunkId++ });
      }
    });
  } else {
    candidates.each((_, el) => {
      chunks.push({ element: $(el), score: 0, id: chunkId++ });
    });
  }

  for (const chunk of chunks) {
    const $el = chunk.element;
    let score = 0;

    score += $el.find("h1, h2, h3").length * 5;
    score += $el.find("[class*='card'], [class*='item'], [class*='product']").length * 3;
    score += $el.find("[itemprop], [role], [data-testid]").length * 4;

    const text = $el.text().toLowerCase();
    if (/footer|copyright|all rights reserved|cookie|privacy policy/i.test(text)) {
      score -= 20;
    }
    if ($el.is("footer") || $el.is("header") || $el.is("nav") || $el.is("aside")) {
      score -= 30;
    }

    chunk.score = score;
  }

  chunks.sort((a, b) => b.score - a.score);

  const selected: cheerio.Cheerio<any>[] = [];
  let currentEstimatedTokens = 0;

  for (const chunk of chunks) {
    const serializedLength = chunk.element.html()?.length || 0;
    const estTokens = serializedLength / 4;

    if (currentEstimatedTokens + estTokens <= tokenBudget || selected.length === 0) {
      selected.push(chunk.element);
      currentEstimatedTokens += estTokens;
    }

    if (currentEstimatedTokens >= tokenBudget) break;
  }

  return selected;
}

// ----------------------------------------------------
// 6. Selector Generation & Refinement
// ----------------------------------------------------
export function generateRobustSelector($: cheerio.CheerioAPI, el: any, isListContainer = false): string {
  const $el = $(el);
  if ($el.attr("id")) {
    const id = $el.attr("id")!.trim();
    if ($(`#${id}`).length === 1) {
      return `#${id}`;
    }
  }

  const testAttrs = ["data-testid", "data-cy", "data-qa", "itemprop", "name"];
  for (const attr of testAttrs) {
    const val = $el.attr(attr);
    if (val) {
      const sel = `[${attr}="${val}"]`;
      if ($(sel).length === 1) {
        return sel;
      }
    }
  }

  const path: string[] = [];
  let current: any | null = el;
  while (current && current.type === "tag") {
    const $curr = $(current);
    const tagName = current.name.toLowerCase();
    let step = tagName;

    if ($curr.attr("id")) {
      const id = $curr.attr("id")!.trim();
      if ($(`#${id}`).length === 1) {
        path.unshift(`#${id}`);
        break;
      }
    }

    let foundDataAttr = false;
    for (const attr of testAttrs) {
      const val = $curr.attr(attr);
      if (val) {
        step = `${tagName}[${attr}="${val}"]`;
        foundDataAttr = true;
        break;
      }
    }

    if (!foundDataAttr && $curr.attr("class")) {
      const classes = $curr.attr("class")!.split(/\s+/).filter(c => c && !/^\d|abc|xyz/.test(c));
      if (classes.length > 0) {
        step = `${tagName}.${classes.join(".")}`;
      }
    }

    const parent = current.parent;
    if (parent && parent.type === "tag") {
      const isTargetElement = current === el;
      if (!(isTargetElement && isListContainer)) {
        const siblings = $(parent).children(tagName);
        if (siblings.length > 1) {
          const index = siblings.toArray().indexOf(current) + 1;
          step += `:nth-child(${index})`;
        }
      }
    }

    path.unshift(step);
    current = parent as any;
  }

  return path.join(" > ");
}

export function generateRelativeSelector($: cheerio.CheerioAPI, container: any, target: any): string {
  if (container === target) return "self";

  const path: string[] = [];
  let current: any | null = target;
  while (current && current !== container && current.type === "tag") {
    const $curr = $(current);
    const tagName = current.name.toLowerCase();
    let step = tagName;

    if ($curr.attr("id")) {
      step = `${tagName}#${$curr.attr("id")!.trim()}`;
    } else if ($curr.attr("class")) {
      const classes = $curr.attr("class")!.split(/\s+/).filter(c => c && !/^\d|abc|xyz/.test(c));
      if (classes.length > 0) {
        step = `${tagName}.${classes.join(".")}`;
      }
    }

    const parent = current.parent;
    if (parent && parent !== container && parent.type === "tag") {
      const siblings = $(parent).children(tagName);
      if (siblings.length > 1) {
        const index = siblings.toArray().indexOf(current) + 1;
        step += `:nth-child(${index})`;
      }
    }

    path.unshift(step);
    current = parent as any;
  }

  return path.join(" > ");
}

// ----------------------------------------------------
// 7. Structured Data Inspection
// ----------------------------------------------------
export function extractStructuredMetadata($: cheerio.CheerioAPI): any {
  const metadata: any = {
    og: {},
    twitter: {},
    jsonld: []
  };

  $("meta").each((_, el) => {
    const $el = $(el);
    const property = $el.attr("property") || $el.attr("name") || "";
    const content = $el.attr("content") || "";

    if (property.startsWith("og:")) {
      metadata.og[property.slice(3)] = content;
    } else if (property.startsWith("twitter:")) {
      metadata.twitter[property.slice(8)] = content;
    }
  });

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text().trim());
      if (parsed) {
        metadata.jsonld.push(parsed);
      }
    } catch (e) {}
  });

  return metadata;
}

// ----------------------------------------------------
// 8. Discover Orchestration Pipeline
// ----------------------------------------------------
export async function discoverHTML(html: string, options: DiscoverOptions): Promise<DiscoverResult> {
  const onProgress = options.onProgress || (() => {});
  const budget = options.tokenBudget || 8000;
  const maxRepair = options.maxRepairAttempts !== undefined ? options.maxRepairAttempts : 2;

  // Set default fields if not provided
  let targetFields = options.fields || [];
  if (targetFields.length === 0 && options.description) {
    // Generate standard fields based on description
    const desc = options.description.toLowerCase();
    if (desc.includes("product") || desc.includes("e-commerce") || desc.includes("shop")) {
      targetFields = ["title", "price", "image", "url"];
    } else if (desc.includes("article") || desc.includes("blog") || desc.includes("news")) {
      targetFields = ["title", "author", "date", "content", "url"];
    } else {
      targetFields = ["title", "description", "image", "url"];
    }
  }

  onProgress("Parsing DOM");
  const $ = cheerio.load(html);

  onProgress("Cleaning HTML");
  const $cleaned = cleanDOM(html);

  onProgress("Finding repeated structures");
  const repeated = detectRepeatedStructures($cleaned);

  onProgress("Ranking chunks");
  const chunks = chunkDOM($cleaned, budget);

  onProgress("Compressing DOM");
  const compressor = new DOMCompressor($cleaned);
  const compressedRoots: CompressedNode[] = [];
  for (const chunk of chunks) {
    compressedRoots.push(...compressor.compress(chunk));
  }
  const domTreeText = compressor.serialize(compressedRoots);

  // Map candidate fields with compressed node ids
  const candidates = detectCandidateFields($cleaned, targetFields);
  for (const cand of candidates) {
    // Attempt to match heuristic selector to a node in the element map
    for (const [id, el] of compressor.idToElementMap.entries()) {
      if ($cleaned(el).is(cand.selector)) {
        cand.nodeId = id;
        break;
      }
    }
  }

  // Extract structured metadata
  const structData = extractStructuredMetadata($cleaned);

  let attempts = 0;
  let psl = "";
  let confidence = 0.5;
  let diagnostics: SelectorDiagnostic[] = [];
  let preview: any = null;
  let validationErrors: string[] = [];

  while (attempts <= maxRepair) {
    onProgress(attempts === 0 ? "Calling provider" : `Repairing selectors (Attempt ${attempts}/${maxRepair})`);

    const prompt = `
You are a web extraction assistant that generates a DSL script (PSL) to extract data from HTML.
We have cleaned and compressed the DOM. Each tag has a unique numeric ID in brackets, like [52].

TARGET FIELDS:
${targetFields.map(f => `- ${f}`).join("\n")}

${options.description ? `USER INSTRUCTIONS:\n"${options.description}"\n` : ""}

DETECTED REPEATING STRUCTURES:
${repeated.map(r => `- Selector: ${r.selector} (${r.itemCount} items, confidence: ${r.confidence})`).join("\n")}

DRAFT CANDIDATES DETECTED DETERMINISTICALLY:
${candidates.map(c => `- Field '${c.fieldName}': maps to Node [${c.nodeId || "unknown"}] via selector '${c.selector}'`).join("\n")}

COMPRESSED DOM TREE:
\`\`\`
${domTreeText.slice(0, 30000)}
\`\`\`

OUTPUT FORMAT:
You MUST respond with a JSON object containing two fields:
1. "isList": boolean (true if the target data represents repeating items/cards, false if it's a single detail page).
2. "listSelectorId": number (the node ID of the container element representing each repeating item, required if "isList" is true).
3. "fields": an object mapping each requested field name to the target element's node ID.

EXAMPLE OUTPUT:
{
  "isList": true,
  "listSelectorId": 52,
  "fields": {
    "title": 54,
    "price": 55,
    "image": 56,
    "url": 57
  }
}

OR (for single page detail):
{
  "isList": false,
  "fields": {
    "title": 12,
    "price": 15
  }
}

${validationErrors.length > 0 ? `PREVIOUS VALIDATION ERRORS:\n${validationErrors.join("\n")}\nPlease correct the mappings to refer to valid elements.` : ""}

Only return valid JSON matching the format above. Do not include markdown code block syntax except the raw JSON.
`;

    let response = "";
    try {
      response = await options.provider.call(prompt);
    } catch (e: any) {
      validationErrors.push(`LLM provider error: ${e.message}`);
      attempts++;
      continue;
    }

    // Parse LLM response
    let mapping: any;
    try {
      const cleanJson = response.replace(/```json|```/g, "").trim();
      mapping = JSON.parse(cleanJson);
    } catch (e) {
      validationErrors.push("Invalid JSON response from LLM provider.");
      attempts++;
      continue;
    }

    if (!mapping || !mapping.fields) {
      validationErrors.push("LLM mapping object missing 'fields' field.");
      attempts++;
      continue;
    }

    // Generate PSL from mappings
    try {
      psl = compilePSL($, compressor, mapping);
    } catch (e: any) {
      validationErrors.push(`Failed to compile PSL from mappings: ${e.message}`);
      attempts++;
      continue;
    }

    onProgress("Validating PSL");
    // Parse & lint validation
    const lintErrors = lint(psl);
    if (lintErrors.length > 0) {
      validationErrors = lintErrors.map(l => `${l.severity}: ${l.message} (line ${l.line}, col ${l.column})`);
      attempts++;
      continue;
    }

    // Execution validation
    try {
      const ast = parse(psl);
      preview = execute(ast, { html });
      validationErrors = []; // Success! Clear previous errors
      break;
    } catch (e: any) {
      validationErrors.push(`PSL runtime execution failed: ${e.message}`);
      attempts++;
    }
  }

  if (validationErrors.length > 0) {
    onProgress("Done with errors");
    return {
      psl,
      confidence: 0.0,
      diagnostics,
      preview: null,
      validationErrors
    };
  }

  onProgress("Executing preview");
  // Build diagnostics & confidence metrics
  diagnostics = buildDiagnostics($, psl, targetFields);
  confidence = computeConfidence(diagnostics, repeated, targetFields, psl);

  onProgress("Done");
  return {
    psl,
    confidence,
    diagnostics,
    preview,
    validationErrors: []
  };
}

function compilePSL($: cheerio.CheerioAPI, compressor: DOMCompressor, mapping: any): string {
  const isList = !!mapping.isList;
  let pslParts: string[] = [];

  const defaultExtractors: Record<string, string> = {
    image: 'attr("src")',
    img: 'attr("src")',
    src: 'attr("src")',
    url: 'attr("href")',
    href: 'attr("href")',
    link: 'attr("href")',
    price: 'text | trim'
  };

  if (isList) {
    const listNodeId = Number(mapping.listSelectorId);
    const listEl = compressor.idToElementMap.get(listNodeId);
    if (!listEl) {
      throw new Error(`List container node ID ${listNodeId} not found in compressed DOM.`);
    }

    const containerSelector = generateRobustSelector($, listEl, true);
    pslParts.push(`items[]: "${containerSelector}" {`);

    for (const [field, nodeIdVal] of Object.entries(mapping.fields)) {
      const nodeId = Number(nodeIdVal);
      const targetEl = compressor.idToElementMap.get(nodeId);
      if (!targetEl) {
        throw new Error(`Target node ID ${nodeId} for field '${field}' not found in compressed DOM.`);
      }

      const relSelector = generateRelativeSelector($, listEl, targetEl);
      const ext = defaultExtractors[field] || "text | trim";
      pslParts.push(`  ${field}: "${relSelector}" | ${ext}`);
    }

    pslParts.push("}");
  } else {
    for (const [field, nodeIdVal] of Object.entries(mapping.fields)) {
      const nodeId = Number(nodeIdVal);
      const targetEl = compressor.idToElementMap.get(nodeId);
      if (!targetEl) {
        throw new Error(`Target node ID ${nodeId} for field '${field}' not found in compressed DOM.`);
      }

      const absSelector = generateRobustSelector($, targetEl);
      const ext = defaultExtractors[field] || "text | trim";
      pslParts.push(`${field}: "${absSelector}" | ${ext}`);
    }
  }

  return pslParts.join("\n");
}

function buildDiagnostics($: cheerio.CheerioAPI, pslStr: string, fields: string[]): SelectorDiagnostic[] {
  const diagnostics: SelectorDiagnostic[] = [];
  let ast: any;
  try {
    ast = parse(pslStr);
  } catch (e) {
    return [];
  }

  const findFieldNode = (body: any[], fName: string): any => {
    for (const def of body) {
      if (def.name === fName || (def.name === "items" && def.type === "ListDefinition")) {
        return def;
      }
    }
    return null;
  };

  const itemsDef = findFieldNode(ast.body, "items");
  const isList = !!itemsDef && itemsDef.type === "ListDefinition";

  if (isList) {
    const containerSelector = itemsDef.source.value;
    const containers = $(containerSelector);

    // Diagnostics for list container
    diagnostics.push({
      field: "items[]",
      selector: containerSelector,
      matches: containers.length,
      confidence: containers.length > 0 ? 0.95 : 0.0,
      alternatives: [],
      warnings: containers.length === 0 ? ["List container selector matches 0 elements"] : []
    });

    if (itemsDef.body) {
      for (const field of fields) {
        const fieldDef = findFieldNode(itemsDef.body, field);
        if (!fieldDef) continue;

        const relSelector = fieldDef.source.value;
        let matchCount = 0;
        containers.each((_, parent) => {
          if ($(parent).find(relSelector).length > 0) {
            matchCount++;
          }
        });

        const ratio = containers.length > 0 ? matchCount / containers.length : 0;
        const confidence = Math.round(ratio * 100) / 100;

        const warnings: string[] = [];
        if (ratio === 0) warnings.push("Selector matches 0 elements relative to container");
        else if (ratio < 0.5) warnings.push(`Weak matches: only found in ${matchCount}/${containers.length} containers`);

        diagnostics.push({
          field,
          selector: relSelector,
          matches: matchCount,
          confidence,
          alternatives: [],
          warnings
        });
      }
    }
  } else {
    for (const field of fields) {
      const fieldDef = findFieldNode(ast.body, field);
      if (!fieldDef) continue;

      const selector = fieldDef.source.value;
      const matches = $(selector).length;
      const confidence = matches === 1 ? 1.0 : matches > 1 ? 0.5 : 0.0;
      const warnings: string[] = [];
      if (matches === 0) warnings.push("Selector matches 0 elements");
      else if (matches > 1) warnings.push(`Ambiguous selector: matches ${matches} elements on the page`);

      diagnostics.push({
        field,
        selector,
        matches,
        confidence,
        alternatives: [],
        warnings
      });
    }
  }

  return diagnostics;
}

function computeConfidence(
  diagnostics: SelectorDiagnostic[],
  repeated: RepeatedStructure[],
  fields: string[],
  pslStr: string
): number {
  if (diagnostics.length === 0) return 0.0;

  let totalScore = 0;
  for (const diag of diagnostics) {
    totalScore += diag.confidence;
  }
  let score = totalScore / diagnostics.length;

  // Adjust score based on PSL code size and linter warnings
  const lintErrors = lint(pslStr);
  if (lintErrors.length > 0) {
    score -= 0.2;
  }

  return Math.max(0.0, Math.min(score, 1.0));
}
