import fs from 'node:fs'
import path from 'node:path'

import fg from 'fast-glob'
import { getPackageInfo, resolveModule } from 'local-pkg'
import * as vscode from 'vscode'

import { DecorationV3 } from './decoration-v3'
import { DecorationV4 } from './decoration-v4'

export async function activate(extContext: vscode.ExtensionContext) {
  const workspacePath
    = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  if (!workspacePath)
    return

  const logger = vscode.window.createOutputChannel(
    'Tailwind CSS ClassName Highlight',
  )
  const decorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: 'none; border-bottom: 1px dashed;',
  })
  extContext.subscriptions.push(logger, decorationType)

  // handle multiple tailwind v3 config files
  let tailwindV3ConfigPathList: string[] = fg
    .globSync('./**/tailwind.config.{js,cjs,mjs,ts}', {
      cwd: workspacePath,
      ignore: ['**/node_modules/**'],
    })
    .map(p => path.join(workspacePath, p))
  let tailwindV3PackageEntryList: string[] = tailwindV3ConfigPathList.map(p =>
    resolveModule('tailwindcss', { paths: [p] }),
  ) as string[]
  if (tailwindV3PackageEntryList.length > 0) {
    tailwindV3ConfigPathList = tailwindV3ConfigPathList.filter(
      (_, index) => tailwindV3PackageEntryList[index],
    )
    tailwindV3PackageEntryList = tailwindV3PackageEntryList.filter(Boolean)
  }

  const workspaceTailwindPackageInfo = await getPackageInfo('tailwindcss', {
    paths: [workspacePath],
  })
  if (
    (!workspaceTailwindPackageInfo?.version
    || !workspaceTailwindPackageInfo?.rootPath)
    && tailwindV3ConfigPathList.length === 0
  ) {
    logger.appendLine('Tailwind CSS package not found')
    return
  }

  if (tailwindV3ConfigPathList.length > 1) {
    logger.appendLine(
      `Multiple Tailwind CSS config files found: ${tailwindV3ConfigPathList.map(p => p).join(', ')}`,
    )
  }
  else {
    logger.appendLine(
      `Detected Tailwind CSS version: ${workspaceTailwindPackageInfo?.version}`,
    )
  }

  const isV4 = workspaceTailwindPackageInfo?.version?.startsWith('4') ?? false
  const globalTailwindPackageEntry = resolveModule('tailwindcss', {
    paths: [workspacePath],
  })!
  if (isV4 && !globalTailwindPackageEntry) {
    logger.appendLine('Tailwind CSS package entry not found')
    return
  }

  const tailwindConfigPath: string[] = tailwindV3ConfigPathList
  let cssFilePath = ''

  if (isV4) {
    const configPath = fg
      .globSync('./**/*.css', {
        cwd: workspacePath,
        ignore: ['**/node_modules/**'],
      })
      .map(p => path.join(workspacePath, p))
      .filter(p => fs.existsSync(p))
      .filter((p) => {
        const content = fs.readFileSync(p, 'utf8')
        const tailwindCSSRegex = [
          /^@import (["'])tailwindcss\1;/,
          /^@import (["'])tailwindcss\/preflight\1/,
          /^@import (["'])tailwindcss\/utilities\1/,
          /^@import (["'])tailwindcss\/theme\1/,
        ]
        return tailwindCSSRegex.some(regex => regex.test(content))
      })
    if (configPath.length === 0) {
      logger.appendLine('Tailwind CSS config file not found')
      return
    }
    logger.appendLine(`Tailwind CSS config file found at ${configPath}`)
    cssFilePath = configPath.at(0)!
  }

  const decorationList = isV4
    ? [
        new DecorationV4(
          workspacePath,
          logger,
          decorationType,
          globalTailwindPackageEntry.replaceAll('.mjs', '.js'),
          cssFilePath,
        ),
      ]
    : tailwindV3PackageEntryList.map(
      (tailwindcssPackageEntry, index) =>
        new DecorationV3(
          workspacePath,
          logger,
          decorationType,
          path.resolve(tailwindcssPackageEntry, '../../'),
          tailwindConfigPath.at(index)!,
        ),
    )

  if (!decorationList.some(i => i.checkContext()))
    return

  const onReload = () => {
    for (const i of decorationList)
      i.updateTailwindContext()

    for (const element of vscode.window.visibleTextEditors) {
      for (const i of decorationList)
        i.decorate(element)
    }
  }

  const fileWatcherList = [...tailwindConfigPath, cssFilePath].filter(Boolean)
  for (const file of fileWatcherList) {
    const fileWatcher = vscode.workspace.createFileSystemWatcher(file)
    fileWatcher.onDidChange(onReload)
    extContext.subscriptions.push(fileWatcher)
  }

  extContext.subscriptions.push(
    vscode.commands.registerCommand(
      'tailwindcss-classname-highlight.reload',
      onReload,
    ),
  )

  // on activation
  const openEditors = vscode.window.visibleTextEditors
  for (const element of openEditors) {
    for (const i of decorationList)
      i.decorate(element)
  }

  // on editor change
  extContext.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor)
        return
      for (const i of decorationList)
        i.decorate(editor)
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'Log')
        return
      const openEditor = vscode.window.visibleTextEditors.find(
        editor => editor.document.uri === event.document.uri,
      )
      if (!openEditor)
        return
      for (const i of decorationList)
        i.decorate(openEditor)
    }),
  )
}
