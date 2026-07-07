export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Program {
  type: "Program";
  body: Definition[];
  loc: SourceLocation;
}

export type SourceNode =
  | { type: "Selector"; value: string; loc: SourceLocation }
  | { type: "Self"; loc: SourceLocation }
  | { type: "Parent"; loc: SourceLocation }
  | { type: "Root"; loc: SourceLocation }
  | { type: "Meta"; name: string; loc: SourceLocation };

export type ASTNode =
  | Program
  | FieldDefinition
  | ListDefinition
  | MetaDefinition
  | Pipe
  | Literal
  | SourceNode;

export type Definition = FieldDefinition | ListDefinition | MetaDefinition;

export interface FieldDefinition {
  type: "FieldDefinition";
  name: string;
  isOptional: boolean;
  source: SourceNode;
  pipes: Pipe[];
  loc: SourceLocation;
}

export interface ListDefinition {
  type: "ListDefinition";
  name: string;
  source: SourceNode;
  body: Definition[];
  loc: SourceLocation;
}

export interface MetaDefinition {
  type: "MetaDefinition";
  name: string;
  metaVariable: string;
  loc: SourceLocation;
}

export interface Pipe {
  type: "Pipe";
  name: string;
  args: Literal[];
  loc: SourceLocation;
}

export interface Literal {
  type: "StringLiteral" | "NumberLiteral" | "BooleanLiteral";
  value: string | number | boolean;
  loc: SourceLocation;
}

export interface Diagnostic {
  message: string;
  severity: "error" | "warning";
  line: number;
  column: number;
  length: number;
}


