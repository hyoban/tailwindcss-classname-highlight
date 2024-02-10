/* eslint-disable ts/no-require-imports */
/* eslint-disable ts/no-var-requires */
import path from 'node:path'
import fs from 'node:fs'
import { Range, type TextEditor, window, workspace } from 'vscode'

import micromatch from 'micromatch'

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

  constructor() {
    this.workspacePath = workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
    if (!this.workspacePath)
      throw new Error('No workspace found')

    this.updateTailwindConfigPath()
    this.updateTailwindContext()
    this.setupFileWatcher()
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
    })
  }

  private extract(text: string) {
    const { defaultExtractor } = require(`${this.workspacePath}/node_modules/tailwindcss/lib/lib/defaultExtractor.js`)
    const { generateRules } = require(`${this.workspacePath}/node_modules/tailwindcss/lib/lib/generateRules.js`)
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

  decorate(openEditor?: TextEditor | null | undefined) {
    if (
      !openEditor || !this.isFileMatched(openEditor.document.uri.fsPath)
    )
      return

    const text = openEditor.document.getText()
    const extracted = this.extract(text)

    const decorations = extracted.map(({ start, value }) => ({
      range: new Range(
        openEditor.document.positionAt(start),
        openEditor.document.positionAt(start + value.length),
      ),
    }))
    openEditor.setDecorations(decorationType, decorations)
  }

  isFileMatched(filePath: string) {
    const contentPath = this.tailwindContext.tailwindConfig.content.files as string[]
    const relativePath = path.relative(this.workspacePath, filePath)
    const isMatch = micromatch.isMatch(relativePath, contentPath)
    return isMatch
  }
}
