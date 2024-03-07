import fs from 'node:fs'
import path from 'node:path'

import fg from 'fast-glob'
import { getPackageInfo, resolveModule } from 'local-pkg'
import * as vscode from 'vscode'

import { Decoration } from './decoration-v3'
import { DecorationV4 } from './decoration-v4'

export async function activate(extContext: vscode.ExtensionContext) {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  if (!workspacePath)
    return
  const logger = vscode.window.createOutputChannel('Tailwind CSS ClassName Highlight')
  const decorationType = vscode.window.createTextEditorDecorationType({ textDecoration: 'none; border-bottom: 1px dashed;' })
  extContext.subscriptions.push(logger, decorationType)

  const tailwindcssPackageInfo = await getPackageInfo('tailwindcss', { paths: [workspacePath] })
  if (!tailwindcssPackageInfo?.version || !tailwindcssPackageInfo?.rootPath) {
    logger.appendLine('Tailwind CSS package not found')
    return
  }
  logger.appendLine(`Detected Tailwind CSS version: ${tailwindcssPackageInfo.version}`)

  const isV4 = tailwindcssPackageInfo.version.startsWith('4')
  const configration = vscode.workspace.getConfiguration()
  const cssPath = configration.get<string>('tailwindcss-classname-highlight.cssPath') ?? ''
  if (isV4 && !cssPath) {
    logger.appendLine('You must set tailwindcss-classname-highlight.cssPath in your settings to use Tailwind CSS v4')
    return
  }

  const tailwindcssPackageEntry = resolveModule('tailwindcss', { paths: [workspacePath] })
  if (!tailwindcssPackageEntry) {
    logger.appendLine('Tailwind CSS package entry not found')
    return
  }

  let tailwindConfigPath = ''

  if (!isV4) {
    const configPath = fg
      .globSync(
        './**/tailwind.config.{js,cjs,mjs,ts}',
        {
          cwd: workspacePath,
          ignore: ['**/node_modules/**'],
        },
      )
      .map(p => path.join(workspacePath, p))
      .find(p => fs.existsSync(p))
    if (!configPath) {
      logger.appendLine('Tailwind CSS config file not found')
      return
    }
    logger.appendLine(`Tailwind CSS config file found at ${configPath}`)
    tailwindConfigPath = configPath
  }

  const decoration = isV4
    ? new DecorationV4(
      workspacePath,
      logger,
      decorationType,
      tailwindcssPackageEntry.replaceAll('.mjs', '.js'),
      cssPath,
    )
    : new Decoration(
      workspacePath,
      logger,
      decorationType,
      path.resolve(tailwindcssPackageEntry, '../../'),
      tailwindConfigPath,
    )

  if (!decoration.checkContext())
    return

  const decorate = decoration.decorate.bind(decoration)

  // on activation
  const openEditors = vscode.window.visibleTextEditors
  for (const element of openEditors)
    decorate(element)

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
