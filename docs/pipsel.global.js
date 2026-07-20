"use strict";
var Pipsel = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    format: () => format,
    lint: () => lint,
    parse: () => parse
  });

  // src/lexer.ts
  var Lexer = class {
    constructor(source) {
      __publicField(this, "source");
      __publicField(this, "offset", 0);
      __publicField(this, "line", 1);
      __publicField(this, "column", 1);
      __publicField(this, "skippedComments", []);
      this.source = source;
    }
    peek() {
      if (this.offset >= this.source.length) return "";
      return this.source[this.offset];
    }
    nextChar() {
      const char = this.peek();
      if (char) {
        this.offset++;
        if (char === "\n") {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
      }
      return char;
    }
    currentPos() {
      return {
        line: this.line,
        column: this.column,
        offset: this.offset
      };
    }
    nextToken() {
      this.skipWhitespaceAndComments();
      const start = this.currentPos();
      const char = this.peek();
      if (!char) {
        return { type: "EOF", value: "", start, end: start };
      }
      if (char === ">" && this.source[this.offset + 1] === "=") {
        this.nextChar();
        this.nextChar();
        return { type: "OPERATOR", value: ">=", start, end: this.currentPos() };
      }
      if (char === "<" && this.source[this.offset + 1] === "=") {
        this.nextChar();
        this.nextChar();
        return { type: "OPERATOR", value: "<=", start, end: this.currentPos() };
      }
      if (char === "=" && this.source[this.offset + 1] === "=") {
        this.nextChar();
        this.nextChar();
        return { type: "OPERATOR", value: "==", start, end: this.currentPos() };
      }
      if (char === "!" && this.source[this.offset + 1] === "=") {
        this.nextChar();
        this.nextChar();
        return { type: "OPERATOR", value: "!=", start, end: this.currentPos() };
      }
      if (char === ">") {
        this.nextChar();
        return { type: "OPERATOR", value: ">", start, end: this.currentPos() };
      }
      if (char === "<") {
        this.nextChar();
        return { type: "OPERATOR", value: "<", start, end: this.currentPos() };
      }
      if (char === "=") {
        this.nextChar();
        return { type: "OPERATOR", value: "=", start, end: this.currentPos() };
      }
      if (char === "?" && this.source[this.offset + 1] === "?") {
        this.nextChar();
        this.nextChar();
        return { type: "COALESCE", value: "??", start, end: this.currentPos() };
      }
      if (char === "?" && this.source[this.offset + 1] === ":") {
        this.nextChar();
        this.nextChar();
        return { type: "OPTIONAL_COLON", value: "?:", start, end: this.currentPos() };
      }
      if (char === "[" && this.source[this.offset + 1] === "]" && this.source[this.offset + 2] === ":") {
        this.nextChar();
        this.nextChar();
        this.nextChar();
        return { type: "LIST_COLON", value: "[]:", start, end: this.currentPos() };
      }
      if (char === "$") {
        this.nextChar();
        return { type: "ROOT", value: "$", start, end: this.currentPos() };
      }
      if (char === ".") {
        this.nextChar();
        if (this.peek() === ".") {
          this.nextChar();
          return { type: "PARENT", value: "..", start, end: this.currentPos() };
        }
        return { type: "SELF", value: ".", start, end: this.currentPos() };
      }
      if (char === ":") {
        this.nextChar();
        return { type: "COLON", value: ":", start, end: this.currentPos() };
      }
      if (char === "|") {
        this.nextChar();
        return { type: "PIPE", value: "|", start, end: this.currentPos() };
      }
      if (char === "{") {
        this.nextChar();
        return { type: "LBRACE", value: "{", start, end: this.currentPos() };
      }
      if (char === "}") {
        this.nextChar();
        return { type: "RBRACE", value: "}", start, end: this.currentPos() };
      }
      if (char === "(") {
        this.nextChar();
        return { type: "LPAREN", value: "(", start, end: this.currentPos() };
      }
      if (char === ")") {
        this.nextChar();
        return { type: "RPAREN", value: ")", start, end: this.currentPos() };
      }
      if (char === ",") {
        this.nextChar();
        return { type: "COMMA", value: ",", start, end: this.currentPos() };
      }
      if (char === '"' || char === "'") {
        return this.scanString(char);
      }
      if (char === "@") {
        this.nextChar();
        const nameStart = this.currentPos();
        const nameToken = this.scanIdentifierOrKeyword();
        if (nameToken.value === "") {
          throw new Error(
            `Lexical error: Expected identifier after '@' at line ${start.line}, column ${start.column}`
          );
        }
        return {
          type: "META",
          value: "@" + nameToken.value,
          start,
          end: nameToken.end
        };
      }
      if (this.isDigit(char)) {
        return this.scanNumber();
      }
      if (this.isAlpha(char) || char === "_") {
        return this.scanIdentifierOrKeyword();
      }
      throw new Error(
        `Lexical error: Unexpected character '${char}' at line ${start.line}, column ${start.column}`
      );
    }
    skipWhitespaceAndComments() {
      while (true) {
        const char = this.peek();
        if (!char) break;
        if (char === " " || char === "	" || char === "\r" || char === "\n") {
          this.nextChar();
          continue;
        }
        if (char === "#") {
          const commentStart = this.offset;
          this.nextChar();
          while (this.peek() && this.peek() !== "\n") {
            this.nextChar();
          }
          const text = this.source.substring(commentStart, this.offset);
          this.skippedComments.push(text);
          continue;
        }
        if (char === "/" && this.source[this.offset + 1] === "/") {
          const commentStart = this.offset;
          this.nextChar();
          this.nextChar();
          while (this.peek() && this.peek() !== "\n") {
            this.nextChar();
          }
          const text = this.source.substring(commentStart, this.offset);
          this.skippedComments.push(text);
          continue;
        }
        break;
      }
    }
    scanString(quoteChar) {
      const start = this.currentPos();
      this.nextChar();
      let value = "";
      while (this.peek() && this.peek() !== quoteChar) {
        const char = this.peek();
        if (char === "\\") {
          this.nextChar();
          const next = this.peek();
          if (next === "n") {
            value += "\n";
            this.nextChar();
          } else if (next === "t") {
            value += "	";
            this.nextChar();
          } else if (next === "r") {
            value += "\r";
            this.nextChar();
          } else {
            value += next;
            this.nextChar();
          }
        } else {
          value += this.nextChar();
        }
      }
      if (!this.peek()) {
        throw new Error(
          `Lexical error: Unterminated string literal starting at line ${start.line}, column ${start.column}`
        );
      }
      this.nextChar();
      return {
        type: "STRING",
        value,
        start,
        end: this.currentPos()
      };
    }
    scanNumber() {
      const start = this.currentPos();
      let value = "";
      while (this.isDigit(this.peek())) {
        value += this.nextChar();
      }
      if (this.peek() === "." && this.isDigit(this.source[this.offset + 1])) {
        value += this.nextChar();
        while (this.isDigit(this.peek())) {
          value += this.nextChar();
        }
      }
      return {
        type: "NUMBER",
        value,
        start,
        end: this.currentPos()
      };
    }
    scanIdentifierOrKeyword() {
      const start = this.currentPos();
      let value = "";
      while (this.isAlphaNumeric(this.peek()) || this.peek() === "_" || this.peek() === "-") {
        value += this.nextChar();
      }
      return {
        type: "IDENTIFIER",
        value,
        start,
        end: this.currentPos()
      };
    }
    isDigit(char) {
      return char >= "0" && char <= "9";
    }
    isAlpha(char) {
      return char >= "a" && char <= "z" || char >= "A" && char <= "Z";
    }
    isAlphaNumeric(char) {
      return this.isAlpha(char) || this.isDigit(char);
    }
  };

  // src/parser.ts
  var Parser = class {
    constructor(source) {
      __publicField(this, "lexer");
      __publicField(this, "currentToken");
      this.lexer = new Lexer(source);
      this.nextToken();
    }
    nextToken() {
      this.currentToken = this.lexer.nextToken();
    }
    consume(expectedType) {
      const tok = this.currentToken;
      if (tok.type !== expectedType) {
        throw new Error(
          `Syntax error: Expected token of type ${expectedType}, but got ${tok.type} ('${tok.value}') at line ${tok.start.line}, column ${tok.start.column}`
        );
      }
      this.nextToken();
      return tok;
    }
    parseProgram() {
      const start = this.currentToken.start;
      const body = [];
      while (this.currentToken.type !== "EOF") {
        body.push(this.parseDefinition());
      }
      const trailingComments = [...this.lexer.skippedComments];
      this.lexer.skippedComments = [];
      const end = this.currentToken.end;
      return {
        type: "Program",
        body,
        trailingComments,
        loc: { start, end }
      };
    }
    parseSourceNode() {
      const startNode = this.parseSourceNodeRaw();
      if (this.currentToken.type === "COALESCE") {
        const sources = [startNode];
        let end = startNode.loc.end;
        while (this.currentToken.type === "COALESCE") {
          this.consume("COALESCE");
          const nextNode = this.parseSourceNodeRaw();
          sources.push(nextNode);
          end = nextNode.loc.end;
        }
        return {
          type: "Coalesce",
          sources,
          loc: { start: startNode.loc.start, end }
        };
      }
      return startNode;
    }
    parseSourceNodeRaw() {
      const token = this.currentToken;
      const start = token.start;
      if (token.type === "STRING") {
        this.consume("STRING");
        return {
          type: "Selector",
          value: token.value,
          loc: { start, end: token.end }
        };
      }
      if (token.type === "SELF") {
        this.consume("SELF");
        return {
          type: "Self",
          loc: { start, end: token.end }
        };
      }
      if (token.type === "PARENT") {
        this.consume("PARENT");
        return {
          type: "Parent",
          loc: { start, end: token.end }
        };
      }
      if (token.type === "ROOT") {
        this.consume("ROOT");
        return {
          type: "Root",
          loc: { start, end: token.end }
        };
      }
      if (token.type === "META") {
        if (token.value === "@match") {
          this.consume("META");
          this.consume("LPAREN");
          const valueToken = this.consume("STRING");
          const rparenToken = this.consume("RPAREN");
          return {
            type: "MatchSelector",
            value: valueToken.value,
            loc: { start, end: rparenToken.end }
          };
        }
        this.consume("META");
        const name = token.value.substring(1);
        return {
          type: "Meta",
          name,
          loc: { start, end: token.end }
        };
      }
      if (token.type === "IDENTIFIER") {
        const val = token.value;
        if (val === "self") {
          this.consume("IDENTIFIER");
          return {
            type: "Self",
            loc: { start, end: token.end }
          };
        }
        if (val === "parent") {
          this.consume("IDENTIFIER");
          return {
            type: "Parent",
            loc: { start, end: token.end }
          };
        }
        if (val === "root") {
          this.consume("IDENTIFIER");
          return {
            type: "Root",
            loc: { start, end: token.end }
          };
        }
      }
      throw new Error(
        `Syntax error: Expected selector, self, parent, root, or meta variable at line ${token.start.line}, column ${token.start.column}`
      );
    }
    parseDefinition() {
      const leadingComments = [...this.lexer.skippedComments];
      this.lexer.skippedComments = [];
      const def = this.parseDefinitionRaw();
      def.leadingComments = leadingComments;
      return def;
    }
    parseDefinitionRaw() {
      const nameToken = this.consume("IDENTIFIER");
      const name = nameToken.value;
      const start = nameToken.start;
      const colonToken = this.currentToken;
      if (colonToken.type === "COLON") {
        this.consume("COLON");
        const source = this.parseSourceNode();
        const pipes = this.parsePipes();
        const end = pipes.length > 0 ? pipes[pipes.length - 1].loc.end : source.loc.end;
        if (source.type === "Meta" && pipes.length === 0) {
          return {
            type: "MetaDefinition",
            name,
            metaVariable: "@" + source.name,
            loc: { start, end }
          };
        }
        return {
          type: "FieldDefinition",
          name,
          isOptional: false,
          source,
          pipes,
          loc: { start, end }
        };
      } else if (colonToken.type === "OPTIONAL_COLON") {
        this.consume("OPTIONAL_COLON");
        const source = this.parseSourceNode();
        const pipes = this.parsePipes();
        const end = pipes.length > 0 ? pipes[pipes.length - 1].loc.end : source.loc.end;
        return {
          type: "FieldDefinition",
          name,
          isOptional: true,
          source,
          pipes,
          loc: { start, end }
        };
      } else if (colonToken.type === "LIST_COLON") {
        this.consume("LIST_COLON");
        const source = this.parseSourceNode();
        if (this.currentToken.type === "LBRACE") {
          this.consume("LBRACE");
          const body = [];
          while (this.currentToken.type !== "RBRACE" && this.currentToken.type !== "EOF") {
            body.push(this.parseDefinition());
          }
          const rbraceToken = this.consume("RBRACE");
          return {
            type: "ListDefinition",
            name,
            source,
            body,
            loc: { start, end: rbraceToken.end }
          };
        } else {
          const pipes = this.parsePipes();
          const end = pipes.length > 0 ? pipes[pipes.length - 1].loc.end : source.loc.end;
          return {
            type: "ListDefinition",
            name,
            source,
            pipes,
            loc: { start, end }
          };
        }
      } else {
        throw new Error(
          `Syntax error: Expected ':', '?:', or '[]:' after identifier '${name}' at line ${colonToken.start.line}, column ${colonToken.start.column}`
        );
      }
    }
    parsePipes() {
      const pipes = [];
      while (this.currentToken.type === "PIPE") {
        this.consume("PIPE");
        pipes.push(this.parsePipe());
      }
      return pipes;
    }
    parsePipe() {
      const isOperator = this.currentToken.type === "OPERATOR";
      const pipeNameToken = this.consume(isOperator ? "OPERATOR" : "IDENTIFIER");
      const name = pipeNameToken.value;
      const start = pipeNameToken.start;
      const args = [];
      let end = pipeNameToken.end;
      if (isOperator) {
        const literal = this.parseLiteral();
        args.push(literal);
        end = literal.loc.end;
      } else {
        if (this.currentToken.type === "LPAREN") {
          this.consume("LPAREN");
          if (this.currentToken.type !== "RPAREN") {
            args.push(this.parseLiteral());
            while (this.currentToken.type === "COMMA") {
              this.consume("COMMA");
              args.push(this.parseLiteral());
            }
          }
          const rparenToken = this.consume("RPAREN");
          end = rparenToken.end;
        }
      }
      return {
        type: "Pipe",
        name,
        args,
        loc: { start, end }
      };
    }
    parseLiteral() {
      const token = this.currentToken;
      const start = token.start;
      if (token.type === "STRING") {
        this.consume("STRING");
        return {
          type: "StringLiteral",
          value: token.value,
          loc: { start, end: token.end }
        };
      }
      if (token.type === "NUMBER") {
        this.consume("NUMBER");
        const num = Number(token.value);
        return {
          type: "NumberLiteral",
          value: num,
          loc: { start, end: token.end }
        };
      }
      if (token.type === "IDENTIFIER" && (token.value === "true" || token.value === "false")) {
        this.consume("IDENTIFIER");
        const val = token.value === "true";
        return {
          type: "BooleanLiteral",
          value: val,
          loc: { start, end: token.end }
        };
      }
      throw new Error(
        `Syntax error: Expected a literal value (string, number, or boolean) at line ${token.start.line}, column ${token.start.column}`
      );
    }
  };
  function parse(source) {
    return new Parser(source).parseProgram();
  }

  // src/formatter.ts
  function format(source) {
    const ast = parse(source);
    return formatProgram(ast);
  }
  function formatProgram(program) {
    let result = formatScope(program.body, 0);
    const trailing = program.trailingComments;
    if (trailing && trailing.length > 0) {
      if (result.length > 0 && !result.endsWith("\n")) {
        result += "\n";
      }
      result += trailing.join("\n");
    }
    return result;
  }
  function formatScope(definitions, indentLevel) {
    const formattedParts = [];
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
      const leading = current.leadingComments;
      if (leading && leading.length > 0) {
        const indent = " ".repeat(indentLevel * 2);
        const commentsStr = leading.map((c) => indent + c).join("\n");
        formatted = commentsStr + "\n" + formatted;
      }
      if (i > 0) {
        const prev = definitions[i - 1];
        const shouldSeparate = prev.type === "ListDefinition" || current.type === "ListDefinition" || prev.type !== current.type;
        if (shouldSeparate) {
          formattedParts.push("");
        }
      }
      formattedParts.push(formatted);
    }
    return formattedParts.join("\n");
  }
  function formatSourceNode(source) {
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
      case "MatchSelector":
        return `@match("${escapeString(source.value)}")`;
      case "Coalesce":
        return source.sources.map(formatSourceNode).join(" ?? ");
    }
  }
  function formatField(def, indent) {
    const optionalSign = def.isOptional ? "?" : "";
    const sourceStr = formatSourceNode(def.source);
    const pipesStr = def.pipes.map(formatPipe).join("");
    return `${indent}${def.name}${optionalSign}: ${sourceStr}${pipesStr}`;
  }
  function formatList(def, indentLevel) {
    const indent = " ".repeat(indentLevel * 2);
    const sourceStr = formatSourceNode(def.source);
    if (def.body) {
      if (def.body.length === 0) {
        return `${indent}${def.name}[]: ${sourceStr} {}`;
      }
      const formattedBody = formatScope(def.body, indentLevel + 1);
      return `${indent}${def.name}[]: ${sourceStr} {
${formattedBody}
${indent}}`;
    } else {
      const pipesStr = def.pipes ? def.pipes.map(formatPipe).join("") : "";
      return `${indent}${def.name}[]: ${sourceStr}${pipesStr}`;
    }
  }
  function formatMeta(def, indent) {
    return `${indent}${def.name}: ${def.metaVariable}`;
  }
  function formatPipe(pipe) {
    const OPERATORS = [">", "<", ">=", "<=", "==", "=", "!="];
    if (OPERATORS.includes(pipe.name)) {
      return ` | ${pipe.name} ${formatLiteral(pipe.args[0])}`;
    }
    if (pipe.args.length === 0) {
      return ` | ${pipe.name}`;
    }
    const formattedArgs = pipe.args.map(formatLiteral).join(", ");
    return ` | ${pipe.name}(${formattedArgs})`;
  }
  function formatLiteral(lit) {
    if (lit.type === "StringLiteral") {
      return `"${escapeString(lit.value)}"`;
    }
    return String(lit.value);
  }
  function escapeString(str) {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // src/linter.ts
  var BUILT_IN_PIPES = {
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
    jsonLd: { minArgs: 0, maxArgs: 1, isExtractor: true, isTraversal: false }
  };
  var ALLOWED_METAS = ["@url", "@timestamp", "@paginate"];
  function lint(source) {
    const diagnostics = [];
    let ast;
    try {
      ast = parse(source);
    } catch (err) {
      const match = (err.message || "").match(/at line (\d+), column (\d+)/);
      if (match) {
        diagnostics.push({
          message: err.message,
          severity: "error",
          line: parseInt(match[1], 10),
          column: parseInt(match[2], 10),
          length: 1
        });
      } else {
        diagnostics.push({
          message: err.message || "Syntax error",
          severity: "error",
          line: 1,
          column: 1,
          length: 1
        });
      }
      return diagnostics;
    }
    lintScope(ast.body, diagnostics);
    return diagnostics;
  }
  function lintScope(definitions, diagnostics) {
    const seenNames = /* @__PURE__ */ new Set();
    for (const def of definitions) {
      if (seenNames.has(def.name)) {
        diagnostics.push({
          message: `Duplicate field name '${def.name}' inside the same object block`,
          severity: "error",
          line: def.loc.start.line,
          column: def.loc.start.column,
          length: def.name.length
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
  function isDomSource(source) {
    if (source.type === "Coalesce") {
      return source.sources.some(isDomSource);
    }
    return source.type !== "Meta";
  }
  function lintSourceNode(source, name, typeLabel, diagnostics) {
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
        length: 1
      });
    }
    if (source.type === "MatchSelector" && source.value.trim() === "") {
      diagnostics.push({
        message: `Empty match selector query for ${typeLabel} '${name}'`,
        severity: "error",
        line: source.loc.start.line,
        column: source.loc.start.column,
        length: 1
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
          length: metaVar.length
        });
      }
    }
  }
  function lintField(def, diagnostics) {
    lintSourceNode(def.source, def.name, "field", diagnostics);
    const isDom = isDomSource(def.source);
    lintPipes(def.pipes, def.name, isDom, def.loc, diagnostics);
  }
  function lintPipes(pipes, name, isDomStart, defLoc, diagnostics) {
    let isDom = isDomStart;
    if (pipes.length === 0) {
      if (isDom) {
        diagnostics.push({
          message: `Field '${name}' has selector/context but is missing a content extractor (like '| text' or '| attr')`,
          severity: "warning",
          line: defLoc.start.line,
          column: defLoc.start.column,
          length: name.length
        });
      }
      return;
    }
    for (let i = 0; i < pipes.length; i++) {
      const pipe = pipes[i];
      const pipeConfig = BUILT_IN_PIPES[pipe.name];
      if (!pipeConfig) {
        diagnostics.push({
          message: `Unknown pipe function '${pipe.name}'`,
          severity: "error",
          line: pipe.loc.start.line,
          column: pipe.loc.start.column,
          length: pipe.name.length
        });
        continue;
      }
      const argCount = pipe.args.length;
      if (argCount < pipeConfig.minArgs || argCount > pipeConfig.maxArgs) {
        const expectedStr = pipeConfig.minArgs === pipeConfig.maxArgs ? `${pipeConfig.minArgs}` : `${pipeConfig.minArgs} to ${pipeConfig.maxArgs}`;
        diagnostics.push({
          message: `Wrong argument count for pipe '${pipe.name}': expected ${expectedStr}, got ${argCount}`,
          severity: "error",
          line: pipe.loc.start.line,
          column: pipe.loc.start.column,
          length: pipe.name.length
        });
      }
      if (pipeConfig.isTraversal) {
        if (!isDom) {
          diagnostics.push({
            message: `Invalid pipe order: traversal pipe '${pipe.name}' expects a DOM Selection, but current pipeline carries a primitive value`,
            severity: "error",
            line: pipe.loc.start.line,
            column: pipe.loc.start.column,
            length: pipe.name.length
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
            length: pipe.name.length
          });
        }
        isDom = false;
      } else {
        if (isDom) {
          diagnostics.push({
            message: `Invalid pipe order: transformer pipe '${pipe.name}' expects a primitive value, but current pipeline carries a DOM Selection (missing a content extractor like '| text')`,
            severity: "warning",
            line: pipe.loc.start.line,
            column: pipe.loc.start.column,
            length: pipe.name.length
          });
        }
        isDom = false;
      }
    }
  }
  function lintList(def, diagnostics) {
    lintSourceNode(def.source, def.name, "list block", diagnostics);
    if (def.body) {
      if (def.body.length === 0) {
        diagnostics.push({
          message: `List block '${def.name}' has an empty body`,
          severity: "warning",
          line: def.loc.start.line,
          column: def.loc.start.column,
          length: def.name.length
        });
      }
      lintScope(def.body, diagnostics);
    } else if (def.pipes) {
      const isDom = isDomSource(def.source);
      lintPipes(def.pipes, def.name, isDom, def.loc, diagnostics);
    }
  }
  function lintMeta(def, diagnostics) {
    if (!ALLOWED_METAS.includes(def.metaVariable)) {
      diagnostics.push({
        message: `Unknown or malformed meta variable '${def.metaVariable}'. Supported values: ${ALLOWED_METAS.join(", ")}`,
        severity: "error",
        line: def.loc.start.line,
        column: def.loc.start.column + def.name.length + 1,
        // approximate start of the meta variable
        length: def.metaVariable.length
      });
    }
  }
  return __toCommonJS(browser_exports);
})();
//# sourceMappingURL=browser.global.js.map