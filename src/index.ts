import type { TextEditor } from 'vscode'
import { Range, window, workspace } from 'vscode'
import { getClassNames, isValidClassName } from './utils'

const decorationType = window.createTextEditorDecorationType({
  // dashed underline
  textDecoration: 'none; border-bottom: 1px dashed;',
})

export async function activate() {
  // on activation
  const openEditors = window.visibleTextEditors
  openEditors.forEach(decorate)

  // on editor change
  window.onDidChangeActiveTextEditor((openEditor) => {
    decorate(openEditor)
  })

  // on text editor change
  workspace.onDidChangeTextDocument((event) => {
    const openEditor = window.visibleTextEditors.filter(
      editor => editor.document.uri === event.document.uri,
    )[0]
    decorate(openEditor)
  })
}

export function deactivate() {

}

function decorate(openEditor?: TextEditor | null | undefined) {
  if (!openEditor)
    return

  const text = openEditor.document.getText()
  const classNames = getClassNames(text)
  const validClassNames = classNames.filter(({ value }) => isValidClassName(value))
  const decorations = validClassNames.map(({ start, value }) => ({
    range: new Range(
      openEditor.document.positionAt(start),
      openEditor.document.positionAt(start + value.length),
    ),
  }))
  openEditor.setDecorations(decorationType, decorations)
}
