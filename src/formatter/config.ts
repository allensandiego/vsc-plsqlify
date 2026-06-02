import * as fs from 'fs';
import * as path from 'path';

export interface FormatterConfig {
  keywordCase: 'upper' | 'lower' | 'preserve';
  indentStyle: 'space' | 'tab';
  indentSize: number;
  maxLineLength: number;
  commaPosition: 'trailing' | 'leading';
  wrapComma: 'always' | 'never' | 'preserve';
  paramsLineLengthLimit: number;
}

export const DEFAULT_CONFIG: FormatterConfig = {
  keywordCase: 'upper',
  indentStyle: 'space',
  indentSize: 2,
  maxLineLength: 120,
  commaPosition: 'trailing',
  wrapComma: 'preserve',
  paramsLineLengthLimit: 200
};

export function loadConfigFile(workspaceRoot: string): Partial<FormatterConfig> {
  const possiblePaths = [
    path.join(workspaceRoot, '.plsqlifyrc'),
    path.join(workspaceRoot, 'plsqlify.json'),
    path.join(workspaceRoot, '.plsqlurc'),
    path.join(workspaceRoot, 'plsql-formatter.json')
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      } catch (err) {
        console.error(`Failed to parse config file at ${filePath}:`, err);
      }
    }
  }
  return {};
}

