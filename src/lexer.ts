import { Position, SourceLocation } from "./types.js";

export type TokenType =
  | "IDENTIFIER"
  | "STRING"
  | "NUMBER"
  | "COLON"
  | "OPTIONAL_COLON"
  | "LIST_COLON"
  | "PIPE"
  | "LBRACE"
  | "RBRACE"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "META"
  | "SELF"
  | "PARENT"
  | "ROOT"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  start: Position;
  end: Position;
}

export class Lexer {
  private source: string;
  private offset = 0;
  private line = 1;
  private column = 1;
  public skippedComments: string[] = [];

  constructor(source: string) {
    this.source = source;
  }

  private peek(): string {
    if (this.offset >= this.source.length) return "";
    return this.source[this.offset];
  }

  private nextChar(): string {
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

  private currentPos(): Position {
    return {
      line: this.line,
      column: this.column,
      offset: this.offset,
    };
  }

  public nextToken(): Token {
    this.skipWhitespaceAndComments();

    const start = this.currentPos();
    const char = this.peek();

    if (!char) {
      return { type: "EOF", value: "", start, end: start };
    }

    // Two/three character tokens: `?:` or `[]:`
    if (char === "?" && this.source[this.offset + 1] === ":") {
      this.nextChar(); // consume '?'
      this.nextChar(); // consume ':'
      return { type: "OPTIONAL_COLON", value: "?:", start, end: this.currentPos() };
    }

    if (
      char === "[" &&
      this.source[this.offset + 1] === "]" &&
      this.source[this.offset + 2] === ":"
    ) {
      this.nextChar(); // consume '['
      this.nextChar(); // consume ']'
      this.nextChar(); // consume ':'
      return { type: "LIST_COLON", value: "[]:", start, end: this.currentPos() };
    }

    if (char === "$") {
      this.nextChar();
      return { type: "ROOT", value: "$", start, end: this.currentPos() };
    }

    if (char === ".") {
      this.nextChar(); // consume first '.'
      if (this.peek() === ".") {
        this.nextChar(); // consume second '.'
        return { type: "PARENT", value: "..", start, end: this.currentPos() };
      }
      return { type: "SELF", value: ".", start, end: this.currentPos() };
    }

    // Single character tokens
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

    // String literals
    if (char === '"' || char === "'") {
      return this.scanString(char);
    }

    // Meta variables
    if (char === "@") {
      this.nextChar(); // consume '@'
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
        end: nameToken.end,
      };
    }

    // Numbers
    if (this.isDigit(char)) {
      return this.scanNumber();
    }

    // Identifiers
    if (this.isAlpha(char) || char === "_") {
      return this.scanIdentifierOrKeyword();
    }

    throw new Error(
      `Lexical error: Unexpected character '${char}' at line ${start.line}, column ${start.column}`
    );
  }

  private skipWhitespaceAndComments() {
    while (true) {
      const char = this.peek();
      if (!char) break;

      // Skip whitespace
      if (char === " " || char === "\t" || char === "\r" || char === "\n") {
        this.nextChar();
        continue;
      }

      // Skip comments (both # and //)
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

  private scanString(quoteChar: string): Token {
    const start = this.currentPos();
    this.nextChar(); // consume open quote

    let value = "";
    while (this.peek() && this.peek() !== quoteChar) {
      const char = this.peek();
      if (char === "\\") {
        this.nextChar(); // consume escape character
        const next = this.peek();
        if (next === "n") {
          value += "\n";
          this.nextChar();
        } else if (next === "t") {
          value += "\t";
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

    this.nextChar(); // consume close quote
    return {
      type: "STRING",
      value,
      start,
      end: this.currentPos(),
    };
  }

  private scanNumber(): Token {
    const start = this.currentPos();
    let value = "";

    while (this.isDigit(this.peek())) {
      value += this.nextChar();
    }

    if (this.peek() === "." && this.isDigit(this.source[this.offset + 1])) {
      value += this.nextChar(); // consume '.'
      while (this.isDigit(this.peek())) {
        value += this.nextChar();
      }
    }

    return {
      type: "NUMBER",
      value,
      start,
      end: this.currentPos(),
    };
  }

  private scanIdentifierOrKeyword(): Token {
    const start = this.currentPos();
    let value = "";

    // Allow alphabetic, digit, underscore, and dash in identifiers (except starting character)
    while (
      this.isAlphaNumeric(this.peek()) ||
      this.peek() === "_" ||
      this.peek() === "-"
    ) {
      value += this.nextChar();
    }

    return {
      type: "IDENTIFIER",
      value,
      start,
      end: this.currentPos(),
    };
  }

  private isDigit(char: string): boolean {
    return char >= "0" && char <= "9";
  }

  private isAlpha(char: string): boolean {
    return (
      (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z")
    );
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}
