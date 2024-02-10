/* eslint-disable ts/no-require-imports */
/* eslint-disable ts/no-var-requires */
import path from 'node:path'
import fs from 'node:fs'
import * as vscode from 'vscode'
import micromatch from 'micromatch'
import fg from 'fast-glob'

const CHECK_CONTEXT_MESSAGE_PREFIX = 'Check context failed: '

export class Decoration {
  workspacePath: string
  tailwindConfigPath: string = ''
  tailwindConfigFolderPath: string = ''
  tailwindContext: any
  tailwindLibPath: string = ''

  extContext: vscode.ExtensionContext
  decorationType = vscode.window.createTextEditorDecorationType({
    // dashed underline
    textDecoration: 'none; border-bottom: 1px dashed;',
  })

  logger = vscode.window.createOutputChannel('Tailwind CSS ClassName Highlight')

  constructor(extContext: vscode.ExtensionContext) {
    this.extContext = extContext
    this.extContext.subscriptions.push(this.decorationType)
    this.extContext.subscriptions.push(this.logger)

    this.workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
    if (!this.workspacePath)
      throw new Error('No workspace found')

    this.updateTailwindConfigPath()

    if (this.locateTailwindLibPath()) {
      this.updateTailwindContext()
      this.setupFileWatcher()
    }
  }

  private updateTailwindConfigPath() {
    const configPath = fg
      .globSync(
        './**/tailwind.config.{js,cjs,mjs,ts}',
        {
          cwd: this.workspacePath,
          ignore: ['**/node_modules/**'],
        },
      )
      .map(p => path.join(this.workspacePath, p))
      .find(p => fs.existsSync(p))!

    this.logger.appendLine(`Tailwind CSS config file found at ${configPath}`)
    this.tailwindConfigPath = configPath
    this.tailwindConfigFolderPath = path.dirname(this.tailwindConfigPath)
  }

  private locateTailwindLibPath() {
    try {
      require(`${this.workspacePath}/node_modules/tailwindcss/resolveConfig.js`)
      this.tailwindLibPath = this.workspacePath
    }
    catch {
      try {
        require(`${this.tailwindConfigFolderPath}/node_modules/tailwindcss/resolveConfig.js`)
        this.tailwindLibPath = this.tailwindConfigFolderPath
      }
      catch {
        this.logger.appendLine('Tailwind CSS library path not found, you may need to install Tailwind CSS in your workspace')
        return false
      }
    }
    return true
  }

  private updateTailwindContext() {
    const now = Date.now()
    this.logger.appendLine('Updating Tailwind CSS context')

    delete require.cache[require.resolve(this.tailwindConfigPath)]
    const { createContext } = require(`${this.tailwindLibPath}/node_modules/tailwindcss/lib/lib/setupContextUtils.js`)
    const { loadConfig } = require(`${this.tailwindLibPath}/node_modules/tailwindcss/lib/lib/load-config.js`)
    const resolveConfig = require(`${this.tailwindLibPath}/node_modules/tailwindcss/resolveConfig.js`)
    this.tailwindContext = createContext(resolveConfig(loadConfig(this.tailwindConfigPath)))

    this.logger.appendLine(`Tailwind CSS context updated in ${Date.now() - now}ms`)
  }

  private setupFileWatcher() {
    this.extContext.subscriptions.push(
      vscode.workspace.createFileSystemWatcher(this.tailwindConfigPath)
        .onDidChange(() => {
          this.logger.appendLine('Tailwind CSS config file changed, trying to update context')
          this.updateTailwindContext()
        }),
    )
  }

  decorate(openEditor?: vscode.TextEditor | null | undefined) {
    if (!openEditor || !this.isFileMatched(openEditor.document.uri.fsPath))
      return

    const text = openEditor.document.getText()
    const extracted = this.extract(text)

    const decorations = extracted.map(({ start, value }) => ({
      range: new vscode.Range(
        openEditor.document.positionAt(start),
        openEditor.document.positionAt(start + value.length),
      ),
    }))
    openEditor.setDecorations(this.decorationType, decorations)
  }

  private isFileMatched(filePath: string) {
    const relativeFilePath = path.relative(this.tailwindConfigFolderPath, filePath)
    const contentFilesPath = this.tailwindContext?.tailwindConfig?.content?.files ?? [] as string[]
    return micromatch.isMatch(relativeFilePath, contentFilesPath)
  }

  private extract(text: string) {
    const { defaultExtractor } = require(`${this.tailwindLibPath}/node_modules/tailwindcss/lib/lib/defaultExtractor.js`)
    const { generateRules } = require(`${this.tailwindLibPath}/node_modules/tailwindcss/lib/lib/generateRules.js`)
    const extracted = defaultExtractor(this.tailwindContext)(text) as Array<string>
    const generated = generateRules(extracted, this.tailwindContext) as Array<[
      {
        layer: string
      },
      {
        raws: {
          tailwind: {
            candidate: string
          }
        }
      },
    ]>

    const validClassNames = new Set<string>()
    for (const [_, { raws: { tailwind: { candidate } } }] of generated)
      validClassNames.add(candidate)

    let index = 0
    const result: Array<{ start: number, value: string }> = []
    for (const value of extracted) {
      const start = text.indexOf(value, index)

      if (validClassNames.has(value))
        result.push({ start, value })
      index = start + value.length
    }
    return result
  }

  checkContext() {
    if (!this.tailwindLibPath) {
      this.logger.appendLine(`${CHECK_CONTEXT_MESSAGE_PREFIX}Tailwind CSS library path not found`)
      return false
    }

    if (!this.tailwindContext) {
      this.logger.appendLine(`${CHECK_CONTEXT_MESSAGE_PREFIX}Tailwind CSS context not found`)
      return false
    }

    return true
  }
}
