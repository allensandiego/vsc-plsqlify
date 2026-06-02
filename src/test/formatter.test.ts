import * as assert from 'assert';
import { Tokenizer, TokenType } from '../formatter/tokenizer';
import { PLSQLFormatter } from '../formatter/formatter';

suite('PL/SQL Formatter Unit Tests', () => {

  suite('Tokenizer', () => {
    test('Tokenizes basic statements', () => {
      const code = 'DECLARE v_num NUMBER := 10;';
      const tokenizer = new Tokenizer(code);
      const tokens = tokenizer.tokenize().filter(t => t.type !== TokenType.Whitespace);

      assert.strictEqual(tokens.length, 6);
      assert.strictEqual(tokens[0].type, TokenType.Keyword);
      assert.strictEqual(tokens[0].text, 'DECLARE');
      assert.strictEqual(tokens[1].type, TokenType.Identifier);
      assert.strictEqual(tokens[1].text, 'v_num');
      assert.strictEqual(tokens[2].type, TokenType.Keyword);
      assert.strictEqual(tokens[2].text, 'NUMBER');
      assert.strictEqual(tokens[3].type, TokenType.Operator);
      assert.strictEqual(tokens[3].text, ':=');
      assert.strictEqual(tokens[4].type, TokenType.Number);
      assert.strictEqual(tokens[4].text, '10');
      assert.strictEqual(tokens[5].type, TokenType.Symbol);
      assert.strictEqual(tokens[5].text, ';');
    });

    test('Identifies comments and strings', () => {
      const code = `-- comment\n'string literal' /* multi-line */`;
      const tokenizer = new Tokenizer(code);
      const tokens = tokenizer.tokenize().filter(t => t.type !== TokenType.Whitespace);

      assert.strictEqual(tokens.length, 3);
      assert.strictEqual(tokens[0].type, TokenType.CommentSingle);
      assert.strictEqual(tokens[1].type, TokenType.String);
      assert.strictEqual(tokens[2].type, TokenType.CommentMulti);
    });

    test('Identifies Q-strings', () => {
      const code = "q'[hello world's string]'";
      const tokenizer = new Tokenizer(code);
      const tokens = tokenizer.tokenize();

      assert.strictEqual(tokens.length, 1);
      assert.strictEqual(tokens[0].type, TokenType.String);
      assert.strictEqual(tokens[0].text, "q'[hello world's string]'");
    });
  });

  suite('Formatter', () => {
    test('Applies upper case formatting', () => {
      const code = 'declare v_x number; begin null; end;';
      const formatter = new PLSQLFormatter({ keywordCase: 'upper', indentSize: 2 });
      const expected = 'DECLARE\n  v_x NUMBER;\nBEGIN\n  NULL;\nEND;';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Applies lower case formatting', () => {
      const code = 'DECLARE v_x NUMBER; BEGIN NULL; END;';
      const formatter = new PLSQLFormatter({ keywordCase: 'lower', indentSize: 2 });
      const expected = 'declare\n  v_x number;\nbegin\n  null;\nend;';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Handles procedures and parameters indentation', () => {
      const code = 'procedure p(id number) is val varchar2(10); begin null; end;';
      const formatter = new PLSQLFormatter({ keywordCase: 'upper', indentSize: 2 });
      const expected = 'PROCEDURE p(id NUMBER) IS\n  val VARCHAR2(10);\nBEGIN\n  NULL;\nEND;';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Nested loops and blocks maintain correct indentation', () => {
      const code = 'begin if x then loop null; end loop; end if; end;';
      const formatter = new PLSQLFormatter({ keywordCase: 'upper', indentSize: 2 });
      const expected = 'BEGIN\n  IF x THEN\n    LOOP\n      NULL;\n    END LOOP;\n  END IF;\nEND;';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Aligns commas trailing (default)', () => {
      const code = 'SELECT a, b, c FROM tab;';
      const formatter = new PLSQLFormatter({ wrapComma: 'always', commaPosition: 'trailing', indentSize: 2 });
      const expected = 'SELECT\n  a,\n  b,\n  c\nFROM tab;';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Aligns commas leading', () => {
      const code = 'SELECT a, b, c FROM tab;';
      const formatter = new PLSQLFormatter({ wrapComma: 'always', commaPosition: 'leading', indentSize: 2 });
      const expected = 'SELECT\n  a\n  , b\n  , c\nFROM tab;';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Aligns commas leading with preserve mode', () => {
      const code = 'SELECT a,\nb,\nc FROM tab;';
      const formatter = new PLSQLFormatter({ wrapComma: 'preserve', commaPosition: 'leading', indentSize: 2 });
      const expected = 'SELECT\n  a\n  , b\n  , c\nFROM tab;';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Params fit in limit stays on one line', () => {
      const code = 'my_proc(p1, p2, p3);';
      const formatter = new PLSQLFormatter({ paramsLineLengthLimit: 50, commaPosition: 'trailing' });
      const expected = 'my_proc(p1, p2, p3);';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Params exceed limit wraps each to new line (trailing comma)', () => {
      const code = 'my_proc(p1, p2, p3);';
      const formatter = new PLSQLFormatter({ paramsLineLengthLimit: 15, commaPosition: 'trailing', indentSize: 2 });
      const expected = 'my_proc(\n  p1,\n  p2,\n  p3\n);';
      assert.strictEqual(formatter.format(code), expected);
    });

    test('Params exceed limit wraps each to new line (leading comma)', () => {
      const code = 'my_proc(p1, p2, p3);';
      const formatter = new PLSQLFormatter({ paramsLineLengthLimit: 15, commaPosition: 'leading', indentSize: 2 });
      const expected = 'my_proc(\n  p1\n  , p2\n  , p3\n);';
      assert.strictEqual(formatter.format(code), expected);
    });
  });
});
