# Plsqlify

A premium, lightweight formatter for Oracle PL/SQL stored procedures and SQL queries in Visual Studio Code. Built in TypeScript with a custom robust tokenizer and block-scoped layout engine.

![Plsqlify Icon](icon.png)

## Features

- **Standardized Spacing & Casing**: Transform all Oracle PL/SQL keywords to `UPPERCASE` or `lowercase` while preserving literal string content (including Oracle Q-quotes like `q'[hello world]'`) and comments.
- **Smart Indentation**: Fully tracks nested blocks (`DECLARE`, `BEGIN`, `EXCEPTION`, `IF/ELSIF/ELSE`, `LOOP`, `CASE/WHEN`) using a scope stack to guarantee zero-drift alignment.
- **SQL Query Scoping**: Beautifies SQL query boundaries (`SELECT`, `FROM`, `WHERE`, `INSERT`, `UPDATE`, `DELETE`, `VALUES`, `SET`) with correct structural alignments and cleanly formats subqueries.
- **Flexible Comma Positioning**: Choose between standard `trailing` commas (e.g., `col1,`) or SQL-style `leading` commas (e.g., `, col2`) at the start of new lines.
- **Smart Parameter List Wrapping**: Automatically keeps parameter lists on a single line if they fit within a configurable character length limit (e.g., 200 characters), or splits each parameter onto its own line if the limit is exceeded.
- **Project Configuration Files**: Load settings from a `.plsqlurc` or `plsql-formatter.json` file in your project workspace root to share formatting styles with your team.

## Extension Settings

This extension contributes the following settings:

* `plsql.format.keywordCase`: Transform keywords to `upper` (default), `lower`, or `preserve`.
* `plsql.format.commaPosition`: Place commas at the end of formatted lines (`trailing`, default) or start of new lines (`leading`).
* `plsql.format.wrapComma`: Break list items at commas (`always`), keep on one line (`never`), or respect original formatting (`preserve`, default).
* `plsql.format.paramsLineLengthLimit`: Maximum length for parameters list below which it stays on 1 line, and above which it wraps each parameter to a new line (default is 200).
* `plsql.format.maxLineLength`: Maximum line length limit (default is 120).

## Workspace Configuration File

You can create a `.plsqlurc` or `plsql-formatter.json` file in your workspace root:

```json
{
  "keywordCase": "upper",
  "commaPosition": "leading",
  "wrapComma": "always",
  "paramsLineLengthLimit": 120,
  "maxLineLength": 120
}
```

## Enjoy!
