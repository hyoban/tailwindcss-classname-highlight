import * as vscode from 'vscode'

import { Decoration } from './decoration'

export function activate(extContext: vscode.ExtensionContext) {
  const decoration = new Decoration(extContext)
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
