import { describe, it, expect } from "vitest";
import { parse, format, lint, execute } from "../src/index.js";
import "../src/browser.js";

const mockHtml = `
<!DOCTYPE html>
<html>
<body>
  <h1 id="title">   Welcome to Pipsel   </h1>
  <div class="card">
    <h2>Apple</h2>
    <span class="price">$1.50</span>
    <span class="desc">Fresh red apple</span>
  </div>
  <div class="card">
    <h2>Banana</h2>
    <span class="price">$0.80</span>
    <!-- missing description -->
  </div>
  <div class="empty-card">
    <h2>No-name</h2>
  </div>
</body>
</html>
`;

describe("Pipsel DSL Parser", () => {
  it("should parse fields, lists, meta variables, and pipes", () => {
    const source = `
      url: @url
      time: @timestamp
      title: "h1" | text | trim
      items[]: ".card" {
        name: "h2" | text
        price?: ".price" | text | float
        desc?: ".desc" | text | fallback("No description")
      }
    `;

    const ast = parse(source);
    expect(ast.type).toBe("Program");
    expect(ast.body).toHaveLength(4);

    const [urlDef, timeDef, titleDef, itemsDef] = ast.body;

    expect(urlDef.type).toBe("MetaDefinition");
    expect(urlDef.name).toBe("url");
    expect((urlDef as any).metaVariable).toBe("@url");

    expect(titleDef.type).toBe("FieldDefinition");
    expect(titleDef.name).toBe("title");
    expect((titleDef as any).source.type).toBe("Selector");
    expect((titleDef as any).source.value).toBe("h1");
    expect((titleDef as any).pipes).toHaveLength(2);
    expect((titleDef as any).pipes[0].name).toBe("text");
    expect((titleDef as any).pipes[1].name).toBe("trim");

    expect(itemsDef.type).toBe("ListDefinition");
    expect(itemsDef.name).toBe("items");
    expect((itemsDef as any).source.type).toBe("Selector");
    expect((itemsDef as any).source.value).toBe(".card");
    expect((itemsDef as any).body).toHaveLength(3);
  });

  it("should throw syntax errors for malformed DSL", () => {
    expect(() => parse(`title "h1" | text`)).toThrow("Syntax error");
    expect(() => parse(`title: "h1" | unknownFunc(`)).toThrow("Syntax error");
  });
});

describe("Pipsel DSL Linter", () => {
  it("should catch unknown pipe functions", () => {
    const source = `title: "h1" | text | wrongfunc`;
    const diagnostics = lint(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Unknown pipe function 'wrongfunc'");
    expect(diagnostics[0].severity).toBe("error");
  });

  it("should catch wrong function argument count", () => {
    const source = `title: "h1" | text | trim("unexpected")`;
    const diagnostics = lint(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Wrong argument count for pipe 'trim'");
  });

  it("should catch invalid pipe order", () => {
    const source = `title: "h1" | trim | text`;
    const diagnostics = lint(source);
    expect(diagnostics).toHaveLength(2); // first is invalid order (trim), second is extractor after start (text)
    expect(diagnostics[0].message).toContain("transformer pipe 'trim' expects a primitive value");
    expect(diagnostics[1].message).toContain("extractor pipe 'text' expects a DOM Selection");
  });

  it("should catch empty selectors", () => {
    const source = `title: "" | text`;
    const diagnostics = lint(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Empty selector for field 'title'");
  });

  it("should catch duplicate field names in same scope", () => {
    const source = `
      title: "h1" | text
      title: "h2" | text
    `;
    const diagnostics = lint(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Duplicate field name 'title'");
  });

  it("should catch malformed meta variable usage", () => {
    const source = `url: @unknownMeta`;
    const diagnostics = lint(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Unknown or malformed meta variable");
  });
});

describe("Pipsel DSL Formatter", () => {
  it("should format source code with correct indentation and spacing", () => {
    const source = `
      url:@url
      title:"h1"|text|trim
      items[]:".card"{
      name:"h2"|text
      price?:".price"|text|float
      }
    `;

    const expected = [
      'url: @url',
      'title: "h1" | text | trim',
      'items[]: ".card" {',
      '  name: "h2" | text',
      '  price?: ".price" | text | float',
      '}'
    ].join("\n");

    const formatted = format(source);
    expect(formatted).toBe(expected);
  });

  it("should handle parsing and formatting a very large DSL file with thousands of fields", () => {
    let source = "title: \"h1\" | text | trim\n";
    for (let i = 0; i < 2000; i++) {
      source += `field_${i}?: ".class-${i}" | text | trim | fallback("Default Value ${i}")\n`;
    }
    const startTime = Date.now();
    const ast = parse(source);
    const parseDuration = Date.now() - startTime;
    
    expect(ast.type).toBe("Program");
    expect(ast.body).toHaveLength(2001);
    expect(parseDuration).toBeLessThan(500); // Should parse 2000 rules in less than 500ms

    const formatted = format(source);
    expect(formatted).toContain('field_1999?: ".class-1999" | text | trim | fallback("Default Value 1999")');
  });
});

describe("Pipsel DSL Executor (Node.js/Cheerio)", () => {
  it("should execute DSL rules against HTML using Cheerio, including optional null-omission", () => {
    const source = `
      url: @url
      title: "h1" | text | trim
      items[]: ".card" {
        name: "h2" | text | trim
        price?: ".price" | text | float
        desc?: ".desc" | text | trim
      }
    `;

    const ast = parse(source);
    const result = execute(ast, {
      html: mockHtml,
      url: "https://example.com/test"
    });

    expect(result.url).toBe("https://example.com/test");
    expect(result.title).toBe("Welcome to Pipsel");
    expect(result.items).toHaveLength(2);

    // Apple details (all present)
    expect(result.items[0].name).toBe("Apple");
    expect(result.items[0].price).toBe(1.5);
    expect(result.items[0].desc).toBe("Fresh red apple");

    // Banana details (desc optional and null, so omitted)
    expect(result.items[1].name).toBe("Banana");
    expect(result.items[1].price).toBe(0.8);
    expect(result.items[1].desc).toBeUndefined(); // Omitted!
    expect("desc" in result.items[1]).toBe(false);
  });
});

describe("Additional Coverage Tests", () => {
  it("should cover parser and lexer edge cases", () => {
    // Comma parsing and decimal numbers
    const ast1 = parse('title: "h1" | replace("a", "b") | fallback(12.34)');
    expect(ast1.body).toHaveLength(1);

    // Boolean parsing
    const ast2 = parse('flag: "div" | fallback(true) | fallback(false)');
    expect(ast2.body).toHaveLength(1);

    // Lexer comments and whitespaces
    const ast3 = parse(`
      # hash comment
      // double slash comment
      title: "h1"
    `);
    expect(ast3.body).toHaveLength(1);

    // Lexer escaped string sequences
    const ast4 = parse('val: "escaped\\n\\t\\r\\"\\\\chars"');
    expect(ast4.body).toHaveLength(1);

    // Lexer exceptions
    expect(() => parse('title: @')).toThrow("Expected identifier after '@'");
    expect(() => parse('title: "h1" % text')).toThrow("Unexpected character '%'");
    expect(() => parse('title: "h1')).toThrow("Unterminated string");

    // Parser exceptions
    expect(() => parse('title')).toThrow("Expected ':', '?:', or '[]:'");
    expect(() => parse('title: "h1" | text(1')).toThrow("Expected token of type RPAREN");
    expect(() => parse('title: "h1" | fallback(invalid)')).toThrow("Expected a literal value");

    // Optional field without pipes
    expect(parse('domain?: ".sitestr"')).toBeDefined();
  });

  it("should cover formatter edge cases", () => {
    // Empty list body
    expect(format('items[]: ".card" {}')).toBe('items[]: ".card" {}');
    
    // Number and boolean literal formatting in arguments
    expect(format('price: ".price" | fallback(100)')).toBe('price: ".price" | fallback(100)');
    expect(format('flag: ".flag" | fallback(true)')).toBe('flag: ".flag" | fallback(true)');
  });

  it("should cover linter edge cases", () => {
    // Parsing error formatting
    expect(lint('title')).toHaveLength(1);
    // Non-string parser error formatting
    expect(lint(null as any)[0].message).toContain("Cannot read properties of null");
    expect(lint({ get length() { throw "error"; } } as any)[0].message).toBe("Syntax error");

    // Valid list and empty list selector/body warning
    expect(lint('items[]: ".card" { name: "h2" | text }')).toHaveLength(0);
    expect(lint('items[]: "" { name: "h2" | text }')).toHaveLength(1); // empty list selector
    
    const bodyWarning = lint('items[]: ".card" {}');
    expect(bodyWarning).toHaveLength(1);
    expect(bodyWarning[0].severity).toBe("warning");

    // Warning when field is missing content extractor
    const missingExtractor = lint('title: "h1"');
    expect(missingExtractor).toHaveLength(1);
    expect(missingExtractor[0].severity).toBe("warning");

    // Split min/max arguments config check (1 to 2 arguments)
    expect(lint('title: "h1" | text | split(",")')).toHaveLength(0);
    expect(lint('title: "h1" | text | split(",", 2)')).toHaveLength(0);
    expect(lint('title: "h1" | text | split(",", 2, 3)')).toHaveLength(1); // too many args
  });

  it("should cover executor pipe and fallback edge cases", async () => {
    // HTML pipe
    const astHtml = parse('content: "body" | html');
    const resHtml = execute(astHtml, { html: "<body><div>test</div></body>" });
    expect(resHtml.content).toContain("div");

    // Attr pipe
    const astAttr = parse('href: "a" | attr("href")');
    const resAttr = execute(astAttr, { html: '<a href="/link">test</a>' });
    expect(resAttr.href).toBe("/link");

    // Missing selector fallback / fallback when node is absent
    const astFallback = parse('missing: ".absent" | fallback("Default")');
    const resFallback = execute(astFallback, { html: "<body></body>" });
    expect(resFallback.missing).toBe("Default");

    // Default to text if no pipes specified
    const astNoPipes = parse('content: "div"');
    const resNoPipes = execute(astNoPipes, { html: "<div>   test   </div>" });
    expect(resNoPipes.content).toBe("test");

    // Split with limit
    const astSplit = parse('items: "div" | text | split("-", 2)');
    const resSplit = execute(astSplit, { html: "<div>a-b-c-d</div>" });
    expect(resSplit.items).toEqual(["a", "b"]);

    // Integer and float parsing filters
    const astNumbers = parse(`
      intVal: ".num" | text | int
      floatVal: ".num" | text | float
      nullInt: ".absent" | int
      badInt: "div" | text | int
      badFloat: "div" | text | float
    `);
    const resNumbers = execute(astNumbers, { html: '<div class="num">$12.34 USD</div>' });
    expect(resNumbers.intVal).toBe(12);
    expect(resNumbers.floatVal).toBe(12.34);
    expect(resNumbers.nullInt).toBeNull();

    const resNumbersFail = execute(astNumbers, { html: '<div>abc</div>' });
    expect(resNumbersFail.badInt).toBeNull();
    expect(resNumbersFail.badFloat).toBeNull();

    // Regex group fallback, splits, filter with regex
    const astRegex = parse(`
      matched: "div" | text | regex("([a-z]+)")
      regexNoGroup: "div" | text | regex("[a-z]+")
      noMatch: "div" | text | regex("([0-9]+)")
      regexErr: "div" | text | regex("[")
      filtered: "div" | text | split(",") | filter("b")
      filterErr: "div" | text | split(",") | filter("[")
      replaceInvalid: ".absent" | fallback(123) | replace("a", "b")
      replaceValid: "div" | text | replace("a", "x")
      fallbackEmpty: "div" | text | trim | fallback("Default")
      regexFallback: "div" | text | regex("([0-9]+)") | fallback("No digits")
      regexReplace: "div" | text | regex("([0-9]+)") | replace("a", "b")
      intReplace: "span" | text | int | replace("a", "b")
      regexInt: "span" | text | int | regex("([0-9]+)")
      splitInt: "span" | text | int | split(",")
      filterMatch: "div" | text | filter("a")
      filterNoMatch: "div" | text | filter("z")
      trimInt: "span" | text | int | trim
    `);
    const resRegex = execute(astRegex, { html: "<div>a,b,c</div><span class='num'>123</span>" });
    expect(resRegex.matched).toBe("a");
    expect(resRegex.regexNoGroup).toBe("a");
    expect(resRegex.noMatch).toBeNull();
    expect(resRegex.regexErr).toBeNull();
    expect(resRegex.filtered).toEqual(["b"]);
    expect(resRegex.filterErr).toBeNull();
    expect(resRegex.replaceInvalid).toBe(123);
    expect(resRegex.replaceValid).toBe("x,b,c");
    expect(resRegex.regexFallback).toBe("No digits");
    expect(resRegex.regexReplace).toBeNull();
    expect(resRegex.intReplace).toBe(123);
    expect(resRegex.regexInt).toBeNull();
    expect(resRegex.splitInt).toEqual([123]);
    expect(resRegex.filterMatch).toBe("a,b,c");
    expect(resRegex.filterNoMatch).toBeNull();
    expect(resRegex.trimInt).toBe(123);
    
    const resEmpty = execute(astRegex, { html: "<div>   </div>" });
    expect(resEmpty.fallbackEmpty).toBe("Default");

    // Empty URL branch execute test
    const astUrlEmpty = parse('title: "div"');
    const resUrlEmpty = execute(astUrlEmpty, { html: "<div>test</div>" });
    expect(resUrlEmpty.title).toBe("test");

    // Mocked HTML returning null from Cheerio
    const htmlNullAst = {
      type: "Program" as const,
      body: [{
        type: "FieldDefinition" as const,
        name: "field",
        isOptional: false,
        source: {
          type: "Selector" as const,
          value: "div",
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        },
        pipes: [{
          type: "Pipe" as const,
          name: "html",
          args: [],
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        }],
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
      }],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
    };
    const cheerio = await import("cheerio");
    const $mock = cheerio.load("<div></div>");
    const originalFind = $mock.fn.find;
    $mock.fn.find = function(this: any, selector: string) {
      const res = originalFind.call(this, selector);
      if (selector === "div") {
        res.html = () => null as any;
      }
      return res;
    };
    const resHtmlNull = execute(htmlNullAst, { html: "<div></div>" });
    expect(resHtmlNull.field).toBe("");

    // Empty selector execute test
    const astSelectorEmpty = {
      type: "Program" as const,
      body: [{
        type: "FieldDefinition" as const,
        name: "title",
        isOptional: false,
        source: {
          type: "Selector" as const,
          value: "",
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        },
        pipes: [],
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
      }],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
    };
    expect(execute(astSelectorEmpty, { html: "<div>test</div>" }).title).toBeNull();

    // Attr missing branch test
    const astAttrMissing = parse('href: "a" | attr("href")');
    const resAttrMissing = execute(astAttrMissing, { html: '<a>test</a>' });
    expect(resAttrMissing.href).toBeNull();

    // Programmatic execution of bad/unknown pipes (default fallback in evaluateTransformer)
    const badPipeAst = {
      type: "Program" as const,
      body: [{
        type: "FieldDefinition" as const,
        name: "field",
        isOptional: false,
        source: {
          type: "Selector" as const,
          value: "div",
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        },
        pipes: [{
          type: "Pipe" as const,
          name: "unknown_pipe",
          args: [],
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        }],
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
      }],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
    };
    const resBadPipe = execute(badPipeAst, { html: "<div>test</div>" });
    expect(resBadPipe.field).toBe("test");

    // Programmatic execution of empty args list fallback
    const emptyFallbackAst = {
      type: "Program" as const,
      body: [{
        type: "FieldDefinition" as const,
        name: "field",
        isOptional: false,
        source: {
          type: "Selector" as const,
          value: ".absent",
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        },
        pipes: [{
          type: "Pipe" as const,
          name: "fallback",
          args: [],
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        }],
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
      }],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
    };
    expect(execute(emptyFallbackAst, { html: "<body></body>" }).field).toBeNull();

    // Meta Default case and Timestamp cover
    const metaAst = parse(`
      time: @timestamp
    `);
    const resMeta = execute(metaAst, { html: "<div>test</div>" });
    expect(resMeta.time).toBeDefined();

    const badMetaAst = {
      type: "Program" as const,
      body: [{
        type: "MetaDefinition" as const,
        name: "unknown",
        metaVariable: "@unknown",
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
      }],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
    };
    const resBadMeta = execute(badMetaAst, { html: "<div>test</div>" });
    expect(resBadMeta.unknown).toBeNull();

    // Format check for context sources
    const formatInput = `
a: self
b: parent
c: root
d: @url
`;
    expect(format(formatInput).trim()).toBe(formatInput.trim());

    // Context execution & traversal pipes tests
    const htmlSnippet = `
      <div id="root">
        <h1>Root Title</h1>
        <div class="category-section">
          <h2>Category H2</h2>
          <div class="product-card">
            <span class="title">Product A</span>
            <span class="price">123.45</span>
            <a href="/prod-a">Link</a>
            <div class="sibling">Sibling El</div>
          </div>
          <div class="post-card">Post A</div>
          <div class="post-card">Post B</div>
        </div>
      </div>
    `;

    const dslSnippet = `
      name: ".product-card" | find(".title") | text | trim
      price: ".product-card" | find(".price") | text | float
      category: ".product-card" | parent | closest(".category-section") | find("h2") | text | trim
      rootTitle: root | find("h1") | text | trim
      urlVal: @url | trim
      
      # Traversal methods
      selfText: ".product-card" | text | trim
      childrenTest: ".category-section" | children(".post-card") | eq(1) | text | trim
      siblingsTest: ".product-card" | siblings(".post-card") | first | text | trim
      nextTest: ".product-card" | next(".post-card") | text | trim
      prevTest: ".product-card" | prev | text | trim
      firstTest: ".post-card" | first | text | trim
      lastTest: ".post-card" | last | text | trim
      prevWithSelectorTest: ".post-card" | last | prev(".post-card") | text | trim
    `;

    const astDsl = parse(dslSnippet);
    const executionRes = execute(astDsl, { html: htmlSnippet, url: "https://my-store.com " });
    expect(executionRes.name).toBe("Product A");
    expect(executionRes.price).toBe(123.45);
    expect(executionRes.category).toBe("Category H2");
    expect(executionRes.rootTitle).toBe("Root Title");
    expect(executionRes.urlVal).toBe("https://my-store.com");
    expect(executionRes.childrenTest).toBe("Post B");
    expect(executionRes.siblingsTest).toBe("Post A");
    expect(executionRes.nextTest).toBe("Post A");
    expect(executionRes.prevTest).toBe("Category H2");
    expect(executionRes.firstTest).toBe("Post A");
    expect(executionRes.lastTest).toBe("Post B");
    expect(executionRes.prevWithSelectorTest).toBe("Post A");

    // Traversal default arguments / selector checks
    const dslDefaultTraversals = `
      childrenDefault: ".category-section" | children | eq(2) | text | trim
      siblingsDefault: ".product-card" | siblings | first | text | trim
      nextDefault: ".product-card" | next | text | trim
    `;
    const resDefaults = execute(parse(dslDefaultTraversals), { html: htmlSnippet });
    expect(resDefaults.childrenDefault).toBe("Post A");
    expect(resDefaults.siblingsDefault).toBe("Category H2");
    expect(resDefaults.nextDefault).toBe("Post A");

    // Symbol parse check (., .., $)
    const astSymbols = parse(`
      selfSym: . | text | trim
      parentSym: .. | text | trim
      rootSym: $ | text | trim
    `);
    expect(astSymbols.body[0].source.type).toBe("Self");
    expect(astSymbols.body[1].source.type).toBe("Parent");
    expect(astSymbols.body[2].source.type).toBe("Root");

    // Meta list source check
    const listMetaAst = {
      type: "Program" as const,
      body: [{
        type: "ListDefinition" as const,
        name: "items",
        source: {
          type: "Meta" as const,
          name: "url" as const,
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        },
        body: [],
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
      }],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
    };
    expect(execute(listMetaAst, { html: "<div></div>" }).items).toEqual([]);

    // Parser error cases
    expect(() => parse('field: || text')).toThrow("Syntax error: Expected selector, self, parent, root, or meta variable");

    // Empty parens parse case
    const emptyParensAst = parse('field: "div" | children()');
    expect(emptyParensAst.body[0].pipes[0].args).toHaveLength(0);

    // Linter warnings and errors
    const lintDiagnostics = lint(`
      badOrder: "h1" | text | find("span")
      badOrder2: "h1" | text | text
      badMeta: @bad | trim
      items[]: @bad {
        field: "div" | text
      }
      emptyList[]: "" {}
      validMeta1: @url
      validMeta2: @url | trim
      optionalMeta: @url
      optionalMetaWithZeroPipes?: @url
      listMetaUrl[]: @url {
        field: "div" | text
      }
    `);
    expect(lintDiagnostics).toHaveLength(6);
    expect(lintDiagnostics[0].message).toContain("traversal pipe 'find' expects a DOM Selection");
    expect(lintDiagnostics[1].message).toContain("extractor pipe 'text' expects a DOM Selection");
    expect(lintDiagnostics[2].message).toContain("Unknown or malformed meta variable '@bad'");
    expect(lintDiagnostics[3].message).toContain("Unknown or malformed meta variable '@bad'");
    expect(lintDiagnostics[4].message).toContain("Empty selector for list block 'emptyList'");
    expect(lintDiagnostics[5].message).toContain("has an empty body");

    // Format piped meta
    const pipedMetaFormat = 'field: @url | trim';
    expect(format(pipedMetaFormat).trim()).toBe(pipedMetaFormat);

    // Context symbol execute checks
    const resSymbolsExec = execute(astSymbols, { html: "<div>test</div>" });
    expect(resSymbolsExec.selfSym).toBe("test");
    expect(resSymbolsExec.parentSym).toBeNull();
    expect(resSymbolsExec.rootSym).toContain("test");

    // Field Meta evaluations (timestamp and defaults)
    const timestampFieldAst = parse('time: @timestamp | trim');
    const resTimestampField = execute(timestampFieldAst, { html: "<div>test</div>" });
    expect(resTimestampField.time).toBeDefined();

    const invalidMetaSourceAst = {
      type: "Program" as const,
      body: [{
        type: "FieldDefinition" as const,
        name: "field",
        isOptional: false,
        source: {
          type: "Meta" as const,
          name: "invalid_name",
          loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
        },
        pipes: [],
        loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
      }],
      loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
    };
    expect(execute(invalidMetaSourceAst, { html: "<div>test</div>" }).field).toBeNull();

    // Explicit parser keywords assertions
    expect((parse('field: self').body[0] as any).source.type).toBe("Self");
    expect((parse('field: parent').body[0] as any).source.type).toBe("Parent");
    expect((parse('field: root').body[0] as any).source.type).toBe("Root");

    // Import browser entry to cover its export statements
    await import("../src/browser.js");
  });
});


