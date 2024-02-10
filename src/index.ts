import { window, workspace } from 'vscode'
import { Decoration, logger } from './decoration'

export async function activate() {
  const decoration = new Decoration()
  if (!decoration.checkContext()) {
    logger.appendLine('Tailwind CSS ClassName Highlight deactivated due to context check failure')
    return
  }

  const decorate = decoration.decorate.bind(decoration)

  // on activation
  const openEditors = window.visibleTextEditors
  openEditors.forEach(decorate)

  // on editor change
  window.onDidChangeActiveTextEditor(decorate)

  // on text editor change
  workspace.onDidChangeTextDocument((event) => {
    const openEditor = window.visibleTextEditors.find(
      editor => editor.document.uri === event.document.uri,
    )
    decorate(openEditor)
  })
}

export function deactivate() {

}
