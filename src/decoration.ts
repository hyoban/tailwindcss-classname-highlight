/* eslint-disable ts/no-require-imports */
/* eslint-disable ts/no-var-requires */
import path from 'node:path'
import fs from 'node:fs'
import { Range, type TextEditor, window, workspace } from 'vscode'
import { getClassNames } from './utils'

const defaultConfigFiles = [
  './tailwind.config.js',
  './tailwind.config.cjs',
  './tailwind.config.mjs',
  './tailwind.config.ts',
]

const decorationType = window.createTextEditorDecorationType({
  // dashed underline
  textDecoration: 'none; border-bottom: 1px dashed;',
})

const logger = window.createOutputChannel('Tailwind CSS ClassName Highlight')

export class Decoration {
  workspacePath: string
  tailwindConfigPath: string = ''
  tailwindContext: any
  isValidClassNameCache: Map<string, boolean> = new Map()
  classRegex: Array<RegExp> = []

  constructor() {
    this.workspacePath = workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
    if (!this.workspacePath)
      throw new Error('No workspace found')

    this.updateCustomRegExps()
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tailwindcss-classname-highlight.classRegex'))
        this.updateCustomRegExps()
    })

    this.updateTailwindConfigPath()
    this.updateTailwindContext()
    this.setupFileWatcher()
  }

  private updateCustomRegExps() {
    const config = workspace.getConfiguration().get('tailwindcss-classname-highlight.classRegex') as Array<string>
    this.classRegex = config.map(r => new RegExp(r))
  }

  private updateTailwindConfigPath() {
    let configPath = ''
    for (const configFile of defaultConfigFiles) {
      try {
        const fullPath = path.join(this.workspacePath, configFile)
        if (fs.existsSync(fullPath))
          configPath = fullPath
      }
      catch {

      }
    }
    if (!configPath)
      logger.appendLine('No Tailwind CSS config file found')
    else
      logger.appendLine(`Tailwind CSS config file found at ${configPath}`)

    this.tailwindConfigPath = configPath
  }

  private updateTailwindContext() {
    if (!this.tailwindConfigPath) {
      logger.appendLine('No Tailwind CSS config file found. Cannot update context.')
      return
    }

    const { createContext } = require(`${this.workspacePath}/node_modules/tailwindcss/lib/lib/setupContextUtils.js`)
    const { loadConfig } = require(`${this.workspacePath}/node_modules/tailwindcss/lib/lib/load-config.js`)
    const resolveConfig = require(`${this.workspacePath}/node_modules/tailwindcss/resolveConfig.js`)

    this.tailwindContext = createContext(resolveConfig(loadConfig(this.tailwindConfigPath)))
  }

  private setupFileWatcher() {
    if (!this.tailwindConfigPath)
      return

    const fileWatcher = workspace.createFileSystemWatcher(
      this.tailwindConfigPath,
    )
    fileWatcher.onDidChange(() => {
      this.updateTailwindContext()
      this.isValidClassNameCache.clear()
    })
  }

  private isValidClassName(
    className: string,
  ) {
    if (this.isValidClassNameCache.has(className))
      return this.isValidClassNameCache.get(className)

    const { generateRules } = require(`${this.workspacePath}/node_modules/tailwindcss/lib/lib/generateRules.js`)

    const isValid = generateRules([className], this.tailwindContext).length !== 0
    this.isValidClassNameCache.set(className, isValid)
    return isValid
  }

  decorate(openEditor?: TextEditor | null | undefined) {
    if (!openEditor)
      return

    const text = openEditor.document.getText()
    const classNames = getClassNames(text, this.classRegex)
    const validClassNames = classNames.filter(({ value }) => this.isValidClassName(value))
    const decorations = validClassNames.map(({ start, value }) => ({
      range: new Range(
        openEditor.document.positionAt(start),
        openEditor.document.positionAt(start + value.length),
      ),
    }))
    openEditor.setDecorations(decorationType, decorations)
  }
}
