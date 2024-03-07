import path from 'node:path'

import fg from 'fast-glob'
import * as vscode from 'vscode'

import { Decoration } from './decoration'
import { DecorationV4 } from './decoration-v4'

export async function activate(extContext: vscode.ExtensionContext) {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  if (!workspacePath)
    return

  const configPath = fg
    .globSync(
      './**/tailwind.config.{js,cjs,mjs,ts}',
      {
        cwd: workspacePath,
        ignore: ['**/node_modules/**'],
      },
    )
    .map(p => path.join(workspacePath, p))

  const configration = vscode.workspace.getConfiguration()
  const cssPath = configration.get<string>('tailwindcss-classname-highlight.cssPath') ?? ''

  const isV4 = cssPath !== ''
  const isV3 = !isV4 && configPath.length > 0

  if (!isV3 && !isV4)
    return

  const decoration = isV3
    ? new Decoration(extContext, workspacePath)
    : new DecorationV4(extContext, workspacePath, cssPath)

  if (!decoration.checkContext())
    return

  const decorate = decoration.decorate.bind(decoration)

  // on activation
  const openEditors = vscode.window.visibleTextEditors
  for (const element of openEditors) {
    decorate(element)
  }

  // on editor change
  extContext.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(decorate),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'Log')
        return
      const openEditor = vscode.window.visibleTextEditors.find(
        editor => editor.document.uri === event.document.uri,
      )
      decorate(openEditor)
    }),
  )
}
