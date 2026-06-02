import { Tokenizer, Token, TokenType } from './tokenizer';
import { FormatterConfig, DEFAULT_CONFIG } from './config';

interface Scope {
  type: 'declare' | 'begin' | 'exception' | 'if' | 'loop' | 'case' | 'when' | 'paren' | 'select' | 'from' | 'where' | 'insert' | 'update' | 'delete' | 'values' | 'set';
}

export class PLSQLFormatter {
  private config: FormatterConfig;

  constructor(config: Partial<FormatterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public format(code: string): string {
    const tokenizer = new Tokenizer(code);
    const tokens = tokenizer.tokenize();

    // 1. Group tokens into logical lines
    const lines = this.splitIntoLines(tokens);

    // 2. Format line by line while tracking scopes
    const formattedLines: string[] = [];
    const scopeStack: Scope[] = [];
    let expectingIsAs = false;
    let consecutiveEmptyLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineTokens = lines[i];

      // Handle consecutive empty lines
      if (lineTokens.length === 0) {
        consecutiveEmptyLines++;
        if (consecutiveEmptyLines <= 1) {
          formattedLines.push('');
        }
        continue;
      }
      consecutiveEmptyLines = 0;

      // Check if the line has comments or is entirely a comment/string
      const isPlainLine = lineTokens.some(t => 
        t.type !== TokenType.Whitespace && 
        t.type !== TokenType.CommentSingle && 
        t.type !== TokenType.CommentMulti
      );

      if (!isPlainLine) {
        // Line is only comments or whitespace
        const indentStr = this.getIndentString(this.calculateIndentLevel(scopeStack));
        const lineContent = lineTokens
          .filter(t => t.type !== TokenType.Whitespace)
          .map(t => t.text)
          .join(' ');
        formattedLines.push(indentStr + lineContent);
        continue;
      }

      // Filter out all whitespace tokens from the active tokens list for formatting and structural analysis
      const activeTokens = lineTokens.filter(t => t.type !== TokenType.Whitespace);

      if (activeTokens.length === 0) {
        continue;
      }

      // Check for opening dedents before formatting this line
      const firstTokenText = activeTokens[0].text.toUpperCase();
      const firstTwoTokensText = activeTokens.length > 1 
        ? (activeTokens[0].text + ' ' + activeTokens[1].text).toUpperCase()
        : '';

      let handledTokensCount = 0;
      let postFormatPush: Scope['type'] | null = null;

      if (firstTwoTokensText === 'END IF') {
        this.popScope(scopeStack, ['if']);
        handledTokensCount = 2;
      } else if (firstTwoTokensText === 'END LOOP') {
        this.popScope(scopeStack, ['loop']);
        handledTokensCount = 2;
      } else if (firstTwoTokensText === 'END CASE') {
        if (this.getTopScope(scopeStack)?.type === 'when') {
          scopeStack.pop();
        }
        this.popScope(scopeStack, ['case']);
        handledTokensCount = 2;
      } else if (firstTokenText === ')' || firstTokenText === ');') {
        this.popScope(scopeStack, ['paren']);
        handledTokensCount = 1;
      } else if (firstTokenText === 'END') {
        if (this.getTopScope(scopeStack)?.type === 'when') {
          scopeStack.pop();
        }
        this.popScope(scopeStack, ['begin', 'exception', 'declare', 'case']);
        handledTokensCount = 1;
      } else if (firstTokenText === 'BEGIN') {
        if (this.getTopScope(scopeStack)?.type === 'declare') {
          scopeStack.pop();
        }
        postFormatPush = 'begin';
        handledTokensCount = 1;
      } else if (firstTokenText === 'EXCEPTION') {
        this.popScope(scopeStack, ['begin']);
        postFormatPush = 'exception';
        handledTokensCount = 1;
      } else if (firstTokenText === 'ELSE' || firstTokenText === 'ELSIF') {
        const top = this.getTopScope(scopeStack);
        if (top?.type === 'when') {
          scopeStack.pop();
          postFormatPush = 'when';
        } else if (top?.type === 'if') {
          scopeStack.pop();
          postFormatPush = 'if';
        }
        handledTokensCount = 1;
      } else if (firstTokenText === 'WHEN') {
        if (this.getTopScope(scopeStack)?.type === 'when') {
          scopeStack.pop();
        }
        postFormatPush = 'when';
        handledTokensCount = 1;
      } else if (firstTokenText === 'FROM') {
        this.popScope(scopeStack, ['select']);
        postFormatPush = 'from';
        handledTokensCount = 1;
      } else if (firstTokenText === 'WHERE') {
        this.popScope(scopeStack, ['from', 'select']);
        postFormatPush = 'where';
        handledTokensCount = 1;
      } else if (firstTokenText === 'ORDER' || firstTokenText === 'GROUP' || firstTokenText === 'HAVING' || firstTokenText === 'UNION') {
        this.popScope(scopeStack, ['where', 'from', 'select']);
        handledTokensCount = 1;
      } else if (firstTokenText === 'SET') {
        this.popScope(scopeStack, ['update']);
        postFormatPush = 'set';
        handledTokensCount = 1;
      } else if (firstTokenText === 'VALUES') {
        this.popScope(scopeStack, ['insert']);
        postFormatPush = 'values';
        handledTokensCount = 1;
      }

      // Calculate current indent
      const currentIndentLevel = this.calculateIndentLevel(scopeStack);
      const indentStr = this.getIndentString(currentIndentLevel);

      // Format individual tokens inside the line
      const formattedText = this.formatLineTokens(activeTokens);
      formattedLines.push(indentStr + formattedText);

      // Now process the line tokens to update the scope stack for SUBSEQUENT lines
      expectingIsAs = this.updateScopeStack(activeTokens, scopeStack, expectingIsAs, handledTokensCount);

      // Apply post-format push if any
      if (postFormatPush) {
        const sqlTypes = ['select', 'from', 'where', 'insert', 'update', 'delete', 'values', 'set'];
        const isSQLScope = sqlTypes.includes(postFormatPush);
        const hasSemicolon = activeTokens.some(t => t.text === ';');
        if (!(isSQLScope && hasSemicolon)) {
          scopeStack.push({ type: postFormatPush });
        }
      }
    }

    return formattedLines.join('\n');
  }

  private splitIntoLines(tokens: Token[]): Token[][] {
    const lines: Token[][] = [];
    let currentLine: Token[] = [];
    let expectingIsAs = false;
    let parenDepth = 0;
    const parenSingleLineStack: boolean[] = [];

    const wrapComma = this.config.wrapComma;
    const commaPosition = this.config.commaPosition;
    const paramsLimit = this.config.paramsLineLengthLimit;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const textUpper = token.text.toUpperCase();

      if (textUpper === '(') {
        parenDepth++;
        // Find matching close paren and check single-line length
        const closeIdx = this.findMatchingCloseParen(tokens, i);
        let forceSingleLine = true;
        if (closeIdx !== -1) {
          let nameIdx = i;
          for (let k = i - 1; k >= 0; k--) {
            if (tokens[k].type !== TokenType.Whitespace) {
              if (tokens[k].type === TokenType.Identifier || tokens[k].type === TokenType.Keyword) {
                nameIdx = k;
              }
              break;
            }
          }
          const slice = tokens.slice(nameIdx, closeIdx + 1);
          const singleLineLen = this.getTokensLengthOnSingleLine(slice);
          forceSingleLine = singleLineLen <= paramsLimit;
          parenSingleLineStack.push(forceSingleLine);
        } else {
          parenSingleLineStack.push(true); // default to single line if malformed
        }

        currentLine.push(token);
        if (!forceSingleLine) {
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          currentLine = [];
          // Skip any immediate subsequent whitespace to prevent empty lines
          while (i + 1 < tokens.length && tokens[i + 1].type === TokenType.Whitespace) {
            i++;
          }
        }
        continue;
      } else if (textUpper === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        const forceSingleLine = parenSingleLineStack.pop() ?? true;
        if (!forceSingleLine) {
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          currentLine = [token];
          continue;
        }
      }

      if (token.type === TokenType.Keyword) {
        if (['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'].includes(textUpper)) {
          expectingIsAs = true;
        }
      }
      if (textUpper === ';') {
        expectingIsAs = false;
      }

      // Check if we should break BEFORE this token
      const shouldBreakBefore = currentLine.length > 0 && parenDepth === 0 && (
        ['BEGIN', 'END', 'EXCEPTION', 'ELSE', 'ELSIF', 'WHEN', 'DECLARE'].includes(textUpper) ||
        (token.type === TokenType.Keyword && ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'VALUES', 'SET', 'ORDER', 'GROUP', 'HAVING', 'UNION'].includes(textUpper))
      );

      if (shouldBreakBefore) {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [];
      }

      // Handle comma breaks explicitly
      if (textUpper === ',') {
        let shouldBreak = false;
        if (parenSingleLineStack.length > 0) {
          const forceSingleLine = parenSingleLineStack[parenSingleLineStack.length - 1];
          shouldBreak = !forceSingleLine;
        } else {
          const hasNlBefore = this.hasNewlineBeforeToken(tokens, i);
          const hasNlAfter = this.hasNewlineAfterToken(tokens, i);
          shouldBreak = wrapComma === 'always' || (wrapComma === 'preserve' && (hasNlBefore || hasNlAfter));
        }

        if (shouldBreak) {
          if (commaPosition === 'leading') {
            if (currentLine.length > 0) {
              lines.push(currentLine);
            }
            currentLine = [token];
          } else {
            currentLine.push(token);
            lines.push(currentLine);
            currentLine = [];
          }
          // Skip any immediate subsequent whitespace
          while (i + 1 < tokens.length && tokens[i + 1].type === TokenType.Whitespace) {
            i++;
          }
          continue;
        }
      }

      // Handle whitespace and skip adding it to currentLine
      if (token.type === TokenType.Whitespace) {
        // If it is adjacent to a comma, we let the comma break logic handle the break
        if (this.isWhitespaceAdjacentToComma(tokens, i)) {
          continue;
        }

        if (token.text.includes('\n')) {
          const parts = token.text.split('\n');
          for (let j = 0; j < parts.length; j++) {
            if (j > 0) {
              if (currentLine.length > 0) {
                lines.push(currentLine);
              }
              currentLine = [];
            }
          }
        }
        continue;
      }

      currentLine.push(token);

      // Check if we should break AFTER this token
      const nextRealToken = this.getNextRealToken(tokens, i);
      const nextTextUpper = nextRealToken?.text.toUpperCase() || '';

      const shouldBreakAfter = currentLine.length > 0 && parenDepth === 0 && (
        textUpper === ';' ||
        textUpper === 'DECLARE' ||
        textUpper === 'BEGIN' ||
        textUpper === 'EXCEPTION' ||
        textUpper === 'THEN' ||
        textUpper === 'ELSE' ||
        textUpper === 'LOOP' ||
        ((textUpper === 'IS' || textUpper === 'AS') && expectingIsAs) ||
        (token.type === TokenType.Keyword && ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(textUpper))
      );

      if (shouldBreakAfter && nextTextUpper !== ';') {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [];
        if (textUpper === 'IS' || textUpper === 'AS') {
          expectingIsAs = false;
        }
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }

  private trimLineTokens(tokens: Token[]): Token[] {
    let start = 0;
    while (start < tokens.length && tokens[start].type === TokenType.Whitespace) {
      start++;
    }
    let end = tokens.length - 1;
    while (end >= start && tokens[end].type === TokenType.Whitespace) {
      end--;
    }
    return tokens.slice(start, end + 1);
  }

  private getIndentString(level: number): string {
    const char = this.config.indentStyle === 'space' ? ' ' : '\t';
    const size = this.config.indentStyle === 'space' ? this.config.indentSize : 1;
    return char.repeat(level * size);
  }

  private calculateIndentLevel(stack: Scope[]): number {
    let level = 0;
    for (const scope of stack) {
      if (scope.type !== 'case') {
        level++;
      }
    }
    return level;
  }

  private getTopScope(stack: Scope[]): Scope | null {
    return stack.length > 0 ? stack[stack.length - 1] : null;
  }

  private popScope(stack: Scope[], types: string[]): boolean {
    if (stack.length > 0 && types.includes(stack[stack.length - 1].type)) {
      stack.pop();
      return true;
    }
    return false;
  }

  private formatLineTokens(tokens: Token[]): string {
    let result = '';
    let prev: Token | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let text = token.text;

      // Handle keyword case
      if (token.type === TokenType.Keyword) {
        if (this.config.keywordCase === 'upper') {
          text = text.toUpperCase();
        } else if (this.config.keywordCase === 'lower') {
          text = text.toLowerCase();
        }
      }

      if (prev) {
        const nextRealToken = this.getNextRealToken(tokens, i);
        const space = this.shouldHaveSpaceBetween(prev, token, nextRealToken);
        if (space) {
          result += ' ';
        }
      }

      result += text;
      prev = { ...token, text }; // use formatted text for subsequent spacing decisions
    }

    return result;
  }

  private getNextRealToken(tokens: Token[], startIndex: number): Token | null {
    for (let i = startIndex + 1; i < tokens.length; i++) {
      if (tokens[i].type !== TokenType.Whitespace) {
        return tokens[i];
      }
    }
    return null;
  }

  private shouldHaveSpaceBetween(prev: Token, curr: Token, next: Token | null): boolean {
    // No spaces around whitespace
    if (prev.type === TokenType.Whitespace || curr.type === TokenType.Whitespace) {
      return false;
    }

    // No space before semicolon, comma, close parenthesis, dot, percent, colon, or link symbol
    if (curr.type === TokenType.Symbol) {
      if ([';', ',', ')', '.', '%', ':', '@'].includes(curr.text)) {
        return false;
      }
      if (curr.text === '(') {
        // No space before parenthesis for identifiers (function calls / method calls)
        if (prev.type === TokenType.Identifier || prev.type === TokenType.Keyword) {
          // Allow space for flow control keywords like IF, WHILE, FOR, VALUES, IN
          const prevUpper = prev.text.toUpperCase();
          if (['IF', 'WHILE', 'FOR', 'VALUES', 'IN', 'AND', 'OR', 'CASE'].includes(prevUpper)) {
            return true;
          }
          return false;
        }
        if (prev.text === ')' || prev.text === ']') {
          return false;
        }
      }
    }

    // No space after dot, percent, open parenthesis, colon, or link symbol
    if (prev.type === TokenType.Symbol) {
      if (['.', '%', '(', ':', '@'].includes(prev.text)) {
        return false;
      }
      if (prev.text === ',') {
        return true;
      }
      if (prev.text === ')') {
        if (curr.type === TokenType.Symbol && [';', ',', '.', '%', ')'].includes(curr.text)) {
          return false;
        }
        return true;
      }
    }

    // Unary Operators (+ / -)
    if (curr.type === TokenType.Operator && (curr.text === '-' || curr.text === '+')) {
      // If preceded by operator or symbol that indicates unary context: e.g. "x := -1", "my_func(-5)", "and -1"
      if (prev.type === TokenType.Operator || (prev.type === TokenType.Symbol && ['(', ',', ':=', '='].includes(prev.text))) {
        return true; // We want space BEFORE the minus
      }
    }
    if (prev.type === TokenType.Operator && (prev.text === '-' || prev.text === '+')) {
      return false; // No space after unary operator
    }

    // Operators always have spaces on both sides
    if (prev.type === TokenType.Operator || curr.type === TokenType.Operator) {
      return true;
    }

    return true;
  }

  private updateScopeStack(tokens: Token[], scopeStack: Scope[], wasExpectingIsAs: boolean, skipTokensCount: number): boolean {
    let expectingIsAs = wasExpectingIsAs;

    for (let i = skipTokensCount; i < tokens.length; i++) {
      const token = tokens[i];
      const textUpper = token.text.toUpperCase();

      if (token.type === TokenType.Keyword) {
        if (['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'].includes(textUpper)) {
          expectingIsAs = true;
        }
      }

      if (textUpper === ';') {
        expectingIsAs = false;
        this.popSQLScopes(scopeStack);
      }

      if (textUpper === '(') {
        scopeStack.push({ type: 'paren' });
      } else if (textUpper === ')') {
        this.popSQLScopes(scopeStack);
        this.popScope(scopeStack, ['paren']);
      } else if (textUpper === 'DECLARE') {
        scopeStack.push({ type: 'declare' });
      } else if (textUpper === 'BEGIN') {
        if (this.getTopScope(scopeStack)?.type === 'declare') {
          scopeStack.pop();
        }
        scopeStack.push({ type: 'begin' });
      } else if (textUpper === 'EXCEPTION') {
        if (this.getTopScope(scopeStack)?.type === 'begin') {
          scopeStack.pop();
        }
        scopeStack.push({ type: 'exception' });
      } else if (textUpper === 'IF') {
        scopeStack.push({ type: 'if' });
      } else if (textUpper === 'ELSIF') {
        if (this.getTopScope(scopeStack)?.type === 'if') {
          scopeStack.pop();
        }
        scopeStack.push({ type: 'if' });
      } else if (textUpper === 'ELSE') {
        if (this.getTopScope(scopeStack)?.type === 'if') {
          scopeStack.pop();
        }
        scopeStack.push({ type: 'if' });
      } else if (textUpper === 'LOOP') {
        scopeStack.push({ type: 'loop' });
      } else if (textUpper === 'CASE') {
        if (i > 0 && tokens[i - 1].text.toUpperCase() === 'END') {
          continue;
        }
        scopeStack.push({ type: 'case' });
      } else if (textUpper === 'WHEN') {
        const top = this.getTopScope(scopeStack);
        if (top?.type === 'case' || top?.type === 'exception') {
          scopeStack.push({ type: 'when' });
        }
      } else if (textUpper === 'SELECT') {
        scopeStack.push({ type: 'select' });
      } else if (textUpper === 'FROM') {
        this.popScope(scopeStack, ['select']);
        scopeStack.push({ type: 'from' });
      } else if (textUpper === 'WHERE') {
        this.popScope(scopeStack, ['from', 'select']);
        scopeStack.push({ type: 'where' });
      } else if (textUpper === 'INSERT') {
        scopeStack.push({ type: 'insert' });
      } else if (textUpper === 'UPDATE') {
        scopeStack.push({ type: 'update' });
      } else if (textUpper === 'DELETE') {
        scopeStack.push({ type: 'delete' });
      } else if (textUpper === 'SET') {
        this.popScope(scopeStack, ['update']);
        scopeStack.push({ type: 'set' });
      } else if (textUpper === 'VALUES') {
        this.popScope(scopeStack, ['insert']);
        scopeStack.push({ type: 'values' });
      } else if (textUpper === 'END') {
        const nextToken = this.getNextRealToken(tokens, i);
        const nextText = nextToken?.text.toUpperCase() || '';

        if (nextText === 'IF') {
          this.popScope(scopeStack, ['if', 'paren']);
          i++;
        } else if (nextText === 'LOOP') {
          this.popScope(scopeStack, ['loop', 'paren']);
          i++;
        } else if (nextText === 'CASE') {
          this.popScope(scopeStack, ['case', 'paren']);
          i++;
        } else {
          this.popScope(scopeStack, ['begin', 'exception', 'declare', 'case', 'paren']);
        }
      } else if ((textUpper === 'IS' || textUpper === 'AS') && expectingIsAs) {
        scopeStack.push({ type: 'declare' });
        expectingIsAs = false;
      }
    }

    return expectingIsAs;
  }

  private hasNewlineBeforeToken(tokens: Token[], index: number): boolean {
    for (let i = index - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t.type === TokenType.Whitespace) {
        if (t.text.includes('\n')) {
          return true;
        }
      } else {
        break;
      }
    }
    return false;
  }

  private hasNewlineAfterToken(tokens: Token[], index: number): boolean {
    for (let i = index + 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === TokenType.Whitespace) {
        if (t.text.includes('\n')) {
          return true;
        }
      } else {
        break;
      }
    }
    return false;
  }

  private isWhitespaceAdjacentToComma(tokens: Token[], index: number): boolean {
    // Check previous real token
    for (let i = index - 1; i >= 0; i--) {
      if (tokens[i].type !== TokenType.Whitespace) {
        if (tokens[i].text === ',') {
          return true;
        }
        break;
      }
    }
    // Check next real token
    for (let i = index + 1; i < tokens.length; i++) {
      if (tokens[i].type !== TokenType.Whitespace) {
        if (tokens[i].text === ',') {
          return true;
        }
        break;
      }
    }
    return false;
  }

  private popSQLScopes(scopeStack: Scope[]) {
    const sqlTypes = ['select', 'from', 'where', 'insert', 'update', 'delete', 'values', 'set'];
    while (scopeStack.length > 0 && sqlTypes.includes(scopeStack[scopeStack.length - 1].type)) {
      scopeStack.pop();
    }
  }

  private findMatchingCloseParen(tokens: Token[], startIndex: number): number {
    let depth = 0;
    for (let i = startIndex; i < tokens.length; i++) {
      const text = tokens[i].text;
      if (text === '(') {
        depth++;
      } else if (text === ')') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  private getTokensLengthOnSingleLine(tokens: Token[]): number {
    let len = 0;
    let prev: Token | null = null;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === TokenType.Whitespace) {
        continue;
      }
      if (prev) {
        if (this.shouldHaveSpaceBetween(prev, token, null)) {
          len += 1;
        }
      }
      len += token.text.length;
      prev = token;
    }
    return len;
  }
}
