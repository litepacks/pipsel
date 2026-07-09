import { Lexer, Token, TokenType } from "./lexer.js";
import {
  Program,
  Definition,
  FieldDefinition,
  ListDefinition,
  MetaDefinition,
  Pipe,
  Literal,
  Position,
  SourceLocation,
  SourceNode
} from "./types.js";

export class Parser {
  private lexer: Lexer;
  private currentToken!: Token;

  constructor(source: string) {
    this.lexer = new Lexer(source);
    this.nextToken();
  }

  private nextToken(): void {
    this.currentToken = this.lexer.nextToken();
  }

  private consume(expectedType: TokenType): Token {
    const tok = this.currentToken;
    if (tok.type !== expectedType) {
      throw new Error(
        `Syntax error: Expected token of type ${expectedType}, but got ${tok.type} ('${tok.value}') at line ${tok.start.line}, column ${tok.start.column}`
      );
    }
    this.nextToken();
    return tok;
  }

  public parseProgram(): Program {
    const start = this.currentToken.start;
    const body: Definition[] = [];

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
      loc: { start, end },
    };
  }

  private parseSourceNode(): SourceNode {
    const token = this.currentToken;
    const start = token.start;

    if (token.type === "STRING") {
      this.consume("STRING");
      return {
        type: "Selector",
        value: token.value,
        loc: { start, end: token.end },
      };
    }
    if (token.type === "SELF") {
      this.consume("SELF");
      return {
        type: "Self",
        loc: { start, end: token.end },
      };
    }
    if (token.type === "PARENT") {
      this.consume("PARENT");
      return {
        type: "Parent",
        loc: { start, end: token.end },
      };
    }
    if (token.type === "ROOT") {
      this.consume("ROOT");
      return {
        type: "Root",
        loc: { start, end: token.end },
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
          loc: { start, end: rparenToken.end },
        };
      }
      this.consume("META");
      const name = token.value.substring(1); // strip '@'
      return {
        type: "Meta",
        name,
        loc: { start, end: token.end },
      };
    }
    if (token.type === "IDENTIFIER") {
      const val = token.value;
      if (val === "self") {
        this.consume("IDENTIFIER");
        return {
          type: "Self",
          loc: { start, end: token.end },
        };
      }
      if (val === "parent") {
        this.consume("IDENTIFIER");
        return {
          type: "Parent",
          loc: { start, end: token.end },
        };
      }
      if (val === "root") {
        this.consume("IDENTIFIER");
        return {
          type: "Root",
          loc: { start, end: token.end },
        };
      }
    }

    throw new Error(
      `Syntax error: Expected selector, self, parent, root, or meta variable at line ${token.start.line}, column ${token.start.column}`
    );
  }

  private parseDefinition(): Definition {
    const leadingComments = [...this.lexer.skippedComments];
    this.lexer.skippedComments = [];

    const def = this.parseDefinitionRaw();
    def.leadingComments = leadingComments;
    return def;
  }

  private parseDefinitionRaw(): Definition {
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
          loc: { start, end },
        };
      }

      return {
        type: "FieldDefinition",
        name,
        isOptional: false,
        source,
        pipes,
        loc: { start, end },
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
        loc: { start, end },
      };
    } else if (colonToken.type === "LIST_COLON") {
      this.consume("LIST_COLON");
      
      const source = this.parseSourceNode();

      if (this.currentToken.type === "LBRACE") {
        this.consume("LBRACE");
        const body: Definition[] = [];
        while ((this.currentToken.type as string) !== "RBRACE" && (this.currentToken.type as string) !== "EOF") {
          body.push(this.parseDefinition());
        }
        const rbraceToken = this.consume("RBRACE");

        return {
          type: "ListDefinition",
          name,
          source,
          body,
          loc: { start, end: rbraceToken.end },
        };
      } else {
        const pipes = this.parsePipes();
        const end = pipes.length > 0 ? pipes[pipes.length - 1].loc.end : source.loc.end;
        return {
          type: "ListDefinition",
          name,
          source,
          pipes,
          loc: { start, end },
        };
      }
    } else {
      throw new Error(
        `Syntax error: Expected ':', '?:', or '[]:' after identifier '${name}' at line ${colonToken.start.line}, column ${colonToken.start.column}`
      );
    }
  }

  private parsePipes(): Pipe[] {
    const pipes: Pipe[] = [];
    while (this.currentToken.type === "PIPE") {
      this.consume("PIPE");
      pipes.push(this.parsePipe());
    }
    return pipes;
  }

  private parsePipe(): Pipe {
    const pipeNameToken = this.consume("IDENTIFIER");
    const name = pipeNameToken.value;
    const start = pipeNameToken.start;
    const args: Literal[] = [];

    let end = pipeNameToken.end;

    if (this.currentToken.type === "LPAREN") {
      this.consume("LPAREN");
      if ((this.currentToken.type as any) !== "RPAREN") {
        args.push(this.parseLiteral());
        while ((this.currentToken.type as any) === "COMMA") {
          this.consume("COMMA");
          args.push(this.parseLiteral());
        }
      }
      const rparenToken = this.consume("RPAREN");
      end = rparenToken.end;
    }

    return {
      type: "Pipe",
      name,
      args,
      loc: { start, end },
    };
  }

  private parseLiteral(): Literal {
    const token = this.currentToken;
    const start = token.start;
    if (token.type === "STRING") {
      this.consume("STRING");
      return {
        type: "StringLiteral",
        value: token.value,
        loc: { start, end: token.end },
      };
    }
    if (token.type === "NUMBER") {
      this.consume("NUMBER");
      const num = Number(token.value);
      return {
        type: "NumberLiteral",
        value: num,
        loc: { start, end: token.end },
      };
    }
    if (
      token.type === "IDENTIFIER" &&
      (token.value === "true" || token.value === "false")
    ) {
      this.consume("IDENTIFIER");
      const val = token.value === "true";
      return {
        type: "BooleanLiteral",
        value: val,
        loc: { start, end: token.end },
      };
    }
    throw new Error(
      `Syntax error: Expected a literal value (string, number, or boolean) at line ${token.start.line}, column ${token.start.column}`
    );
  }
}

export function parse(source: string): Program {
  return new Parser(source).parseProgram();
}
