export enum TokenType {
  Whitespace = 'Whitespace',
  CommentSingle = 'CommentSingle',
  CommentMulti = 'CommentMulti',
  String = 'String',
  Number = 'Number',
  Keyword = 'Keyword',
  Identifier = 'Identifier',
  Operator = 'Operator',
  Symbol = 'Symbol',
  Unknown = 'Unknown'
}

export interface Token {
  type: TokenType;
  text: string;
  line: number;
  column: number;
  offset: number;
}

// Oracle PL/SQL keywords (case insensitive)
export const KEYWORDS = new Set([
  'ABORT', 'ACCEPT', 'ACCESS', 'ADD', 'ALL', 'ALTER', 'AND', 'ANY', 'ARRAY', 'AS', 'ASC', 'ASSERT', 'ASSIGN', 'AT', 'AUTHORIZATION',
  'AVG', 'BASE_TABLE', 'BEGIN', 'BETWEEN', 'BINARY_INTEGER', 'BODY', 'BOOLEAN', 'BY', 'CASE', 'CHAR', 'CHAR_BASE', 'CHECK', 'CLOSE',
  'CLUSTER', 'CLUSTERS', 'COALESCE', 'COLAUTH', 'COLUMNS', 'COMMENT', 'COMMIT', 'COMPRESS', 'CONNECT', 'CONSTANT', 'CREATE', 'CURRENT',
  'CURRVAL', 'CURSOR', 'DATABASE', 'DATA_BASE', 'DATE', 'DBA', 'DEBUGOFF', 'DEBUGON', 'DECLARE', 'DEFAULT', 'DEFINITION', 'DELAY',
  'DELETE', 'DESC', 'DIGITS', 'DISPOSE', 'DISTINCT', 'DO', 'DROP', 'ELSE', 'ELSIF', 'END', 'ENTRY', 'EXCEPTION', 'EXCEPTION_INIT',
  'EXCLUSIVE', 'EXISTS', 'EXIT', 'FALSE', 'FETCH', 'FILE', 'FLOAT', 'FOR', 'FORM', 'FROM', 'FUNCTION', 'GENERIC', 'GOTO', 'GRANT',
  'GROUP', 'HAVING', 'IDENTIFIED', 'IF', 'IMMEDIATE', 'IN', 'INCREMENT', 'INDEX', 'INDEXES', 'INDICATOR', 'INITIAL', 'INSERT',
  'INTEGER', 'INTERSECT', 'INTO', 'IS', 'LEVEL', 'LIKE', 'LIMIT', 'LOCK', 'LOOP', 'MAX', 'MAXEXTENTS', 'MIN', 'MINUS', 'MLSLABEL',
  'MOD', 'MODE', 'MONITOR', 'NATURAL', 'NATURALN', 'NEW', 'NEXTVAL', 'NOCOMPRESS', 'NOT', 'NOWAIT', 'NULL', 'NUMBER', 'NUMBER_BASE',
  'OF', 'OFFLINE', 'ON', 'ONLINE', 'OPEN', 'OPTION', 'OR', 'ORDER', 'OTHERS', 'OUT', 'PACKAGE', 'PARTITION', 'PCTFREE', 'PLS_INTEGER',
  'POSITIVE', 'POSITIVEN', 'PRAGMA', 'PRIOR', 'PRIVATE', 'PRIVILEGES', 'PROCEDURE', 'PUBLIC', 'RAISE', 'RANGE', 'REAL', 'RECORD',
  'REF', 'RELEASE', 'RENAME', 'REPLACE', 'RESOURCE', 'RETURN', 'RETURNING', 'REVERSE', 'REVOKE', 'ROWID', 'ROWNUM', 'ROWS', 'ROWTYPE',
  'RUN', 'SAVEPOINT', 'SCHEMA', 'SELECT', 'SEPARATE', 'SESSION', 'SET', 'SHARE', 'SIZE', 'SMALLINT', 'SPACE', 'SQL', 'SQLCODE',
  'SQLERRM', 'START', 'STATEMENT', 'STDDEV', 'SUBTYPE', 'SUCCESSFUL', 'SUM', 'SYNONYM', 'SYSDATE', 'TABAUTH', 'TABLE', 'TABLES',
  'TASK', 'THEN', 'TO', 'TRIGGER', 'TRUE', 'TYPE', 'UID', 'UNION', 'UNIQUE', 'UPDATE', 'USE', 'USER', 'VALIDATE', 'VALUES',
  'VARCHAR', 'VARCHAR2', 'VARIANCE', 'VIEW', 'VIEWS', 'WHEN', 'WHENEVER', 'WHILE', 'WITH', 'WORK', 'WRITE', 'XOR'
]);

export class Tokenizer {
  private input: string;
  private length: number;
  private offset: number = 0;
  private line: number = 1;
  private column: number = 0;

  constructor(input: string) {
    this.input = input;
    this.length = input.length;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.offset < this.length) {
      const startOffset = this.offset;
      const startLine = this.line;
      const startColumn = this.column;

      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      } else {
        // Fallback for unexpected characters
        const char = this.input[this.offset];
        this.advance(1);
        tokens.push({
          type: TokenType.Unknown,
          text: char,
          line: startLine,
          column: startColumn,
          offset: startOffset
        });
      }
    }
    return tokens;
  }

  private nextToken(): Token | null {
    const startOffset = this.offset;
    const startLine = this.line;
    const startColumn = this.column;

    const char = this.peek();

    // 1. Whitespace
    if (/\s/.test(char)) {
      let text = '';
      while (this.offset < this.length && /\s/.test(this.peek())) {
        text += this.peek();
        this.advance(1);
      }
      return { type: TokenType.Whitespace, text, line: startLine, column: startColumn, offset: startOffset };
    }

    // 2. Comments (Single line '--' or Multi-line '/*')
    if (char === '-' && this.peek(1) === '-') {
      let text = '--';
      this.advance(2);
      while (this.offset < this.length && this.peek() !== '\n' && this.peek() !== '\r') {
        text += this.peek();
        this.advance(1);
      }
      return { type: TokenType.CommentSingle, text, line: startLine, column: startColumn, offset: startOffset };
    }

    if (char === '/' && this.peek(1) === '*') {
      let text = '/*';
      this.advance(2);
      while (this.offset < this.length) {
        if (this.peek() === '*' && this.peek(1) === '/') {
          text += '*/';
          this.advance(2);
          break;
        }
        text += this.peek();
        this.advance(1);
      }
      return { type: TokenType.CommentMulti, text, line: startLine, column: startColumn, offset: startOffset };
    }

    // 3. Q-strings (Oracle specialized Q-quote strings e.g. q'[...]' or Q'<...>')
    if ((char === 'q' || char === 'Q') && this.peek(1) === "'") {
      const qPrefix = this.peek(0) + this.peek(1);
      const delimiter = this.peek(2);
      if (delimiter && delimiter !== ' ' && delimiter !== '\t' && delimiter !== '\n' && delimiter !== '\r') {
        let closingDelimiter = delimiter;
        if (delimiter === '[') {
          closingDelimiter = ']';
        } else if (delimiter === '(') {
          closingDelimiter = ')';
        } else if (delimiter === '{') {
          closingDelimiter = '}';
        } else if (delimiter === '<') {
          closingDelimiter = '>';
        }

        let text = qPrefix + delimiter;
        this.advance(3);
        while (this.offset < this.length) {
          if (this.peek() === closingDelimiter && this.peek(1) === "'") {
            text += closingDelimiter + "'";
            this.advance(2);
            break;
          }
          text += this.peek();
          this.advance(1);
        }
        return { type: TokenType.String, text, line: startLine, column: startColumn, offset: startOffset };
      }
    }

    // 4. Standard strings
    if (char === "'") {
      let text = "'";
      this.advance(1);
      while (this.offset < this.length) {
        const c = this.peek();
        if (c === "'") {
          if (this.peek(1) === "'") {
            // Escaped quote
            text += "''";
            this.advance(2);
            continue;
          } else {
            text += "'";
            this.advance(1);
            break;
          }
        }
        text += c;
        this.advance(1);
      }
      return { type: TokenType.String, text, line: startLine, column: startColumn, offset: startOffset };
    }

    // 5. Quoted Identifiers
    if (char === '"') {
      let text = '"';
      this.advance(1);
      while (this.offset < this.length) {
        const c = this.peek();
        if (c === '"') {
          if (this.peek(1) === '"') {
            text += '""';
            this.advance(2);
            continue;
          } else {
            text += '"';
            this.advance(1);
            break;
          }
        }
        text += c;
        this.advance(1);
      }
      return { type: TokenType.Identifier, text, line: startLine, column: startColumn, offset: startOffset };
    }

    // 6. Numbers
    if (/\d/.test(char) || (char === '.' && /\d/.test(this.peek(1)))) {
      let text = '';
      let hasDot = false;
      let hasExponent = false;

      while (this.offset < this.length) {
        const c = this.peek();
        if (/\d/.test(c)) {
          text += c;
          this.advance(1);
        } else if (c === '.' && !hasDot && !hasExponent && /\d/.test(this.peek(1))) {
          hasDot = true;
          text += c;
          this.advance(1);
        } else if ((c === 'e' || c === 'E') && !hasExponent) {
          hasExponent = true;
          text += c;
          this.advance(1);
          const next = this.peek();
          if (next === '+' || next === '-') {
            text += next;
            this.advance(1);
          }
        } else {
          break;
        }
      }
      return { type: TokenType.Number, text, line: startLine, column: startColumn, offset: startOffset };
    }

    // 7. Identifiers and Keywords
    if (/[a-zA-Z]/.test(char)) {
      let text = '';
      // Oracle identifiers can start with a letter and contain letters, numbers, _, $, #
      while (this.offset < this.length && /[a-zA-Z0-9_$#]/.test(this.peek())) {
        text += this.peek();
        this.advance(1);
      }
      
      const upperText = text.toUpperCase();
      const isKeyword = KEYWORDS.has(upperText);
      return {
        type: isKeyword ? TokenType.Keyword : TokenType.Identifier,
        text,
        line: startLine,
        column: startColumn,
        offset: startOffset
      };
    }

    // 8. Multi-character Operators
    const char2 = char + this.peek(1);
    if ([':=', '!=', '<>', '<=', '>=', '=>', '||', '**'].includes(char2)) {
      this.advance(2);
      return { type: TokenType.Operator, text: char2, line: startLine, column: startColumn, offset: startOffset };
    }

    // 9. Single-character Operators
    if (['=', '<', '>', '+', '-', '*', '/', '%'].includes(char)) {
      this.advance(1);
      return { type: TokenType.Operator, text: char, line: startLine, column: startColumn, offset: startOffset };
    }

    // 10. Symbols
    if ([';', ',', '.', '(', ')', ':', '@'].includes(char)) {
      this.advance(1);
      return { type: TokenType.Symbol, text: char, line: startLine, column: startColumn, offset: startOffset };
    }

    return null;
  }

  private peek(offset: number = 0): string {
    if (this.offset + offset >= this.length) {
      return '';
    }
    return this.input[this.offset + offset];
  }

  private advance(count: number) {
    for (let i = 0; i < count; i++) {
      if (this.offset >= this.length) {
        break;
      }
      const char = this.input[this.offset];
      this.offset++;
      if (char === '\n') {
        this.line++;
        this.column = 0;
      } else {
        this.column++;
      }
    }
  }
}
