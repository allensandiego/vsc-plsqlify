import * as vscode from 'vscode';
import { PLSQLFormatter } from './formatter/formatter';
import { FormatterConfig, loadConfigFile } from './formatter/config';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "vsc-plsqlify" is now active!');

  const formatterProvider = vscode.languages.registerDocumentFormattingEditProvider(
    [
      { language: 'sql' },
      { language: 'plsql' },
      { language: 'oracle-plsql' },
      { language: 'oracle_sql' },
      { language: 'oraclesql' },
      { language: 'oracle-sql' },
      { language: 'oracle-package' },
      { language: 'oracle-package-body' },
      { language: 'oracle-package-spec' },
      { language: 'oracle_package_body' },
      { language: 'oracle_package_spec' }
    ],
    {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
      ): vscode.ProviderResult<vscode.TextEdit[]> {
        
        // 1. Get configurations from VS Code settings
        const vscodeConfig = vscode.workspace.getConfiguration('plsql.format');
        
        // 2. Load configurations from workspace file (.plsqlifyrc / plsqlify.json)
        let fileConfig = {};
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
          const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
          fileConfig = loadConfigFile(rootPath);
        }

        // 3. Resolve options (VS Code settings vs config file vs default values)
        // VS Code formatting options also provide tabSize and insertSpaces
        const mergedConfig: FormatterConfig = {
          keywordCase: (fileConfig as any).keywordCase || vscodeConfig.get<'upper'|'lower'|'preserve'>('keywordCase') || 'upper',
          indentStyle: (fileConfig as any).indentStyle || (options.insertSpaces ? 'space' : 'tab'),
          indentSize: (fileConfig as any).indentSize || options.tabSize || 2,
          maxLineLength: (fileConfig as any).maxLineLength || vscodeConfig.get<number>('maxLineLength') || 120,
          commaPosition: (fileConfig as any).commaPosition || vscodeConfig.get<'trailing'|'leading'>('commaPosition') || 'trailing',
          wrapComma: (fileConfig as any).wrapComma || vscodeConfig.get<'always'|'never'|'preserve'>('wrapComma') || 'preserve',
          paramsLineLengthLimit: (fileConfig as any).paramsLineLengthLimit || vscodeConfig.get<number>('paramsLineLengthLimit') || 200
        };

        // 4. Run formatter
        try {
          const formatter = new PLSQLFormatter(mergedConfig);
          const fullText = document.getText();
          const formattedText = formatter.format(fullText);

          // Return TextEdit that replaces the entire document
          const firstLine = document.lineAt(0);
          const lastLine = document.lineAt(document.lineCount - 1);
          const textRange = new vscode.Range(
            firstLine.range.start,
            lastLine.range.end.with(lastLine.range.end.line, lastLine.text.length)
          );

          return [vscode.TextEdit.replace(textRange, formattedText)];
        } catch (err: any) {
          vscode.window.showErrorMessage(`PL/SQL formatting failed: ${err.message}`);
          return [];
        }
      }
    }
  );

  context.subscriptions.push(formatterProvider);
}

export function deactivate() {}

