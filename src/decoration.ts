/* eslint-disable @typescript-eslint/consistent-type-imports */

/* eslint-disable @typescript-eslint/no-var-requires */

/* eslint-disable @typescript-eslint/no-dynamic-delete */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs'
import path from 'node:path'

import fg from 'fast-glob'
import micromatch from 'micromatch'
import * as vscode from 'vscode'

const CHECK_CONTEXT_MESSAGE_PREFIX = 'Check context failed: '
const LIMITED_CACHE_SIZE = 50

type GenerateRules = Array<[
  Record<string, unknown>,
  {
    raws: {
      tailwind: {
        candidate: string
      }
    }
  },
]>

type NumberRange = {
  start: number
  end: number
}

type ExtractResult = {
  index: number
  result: NumberRange[]
}

const defaultIdeMatchInclude = [
  // String literals
  /(["'`])[^\1]*?\1/g,
]

export class Decoration {
  workspacePath: string
  tailwindConfigPath = ''
  tailwindConfigFolderPath = ''
  tailwindContext: any
  tailwindLibPath = ''

  textContentHashCache: Array<[string, NumberRange[]]> = []

  extContext: vscode.ExtensionContext
  decorationType = vscode.window.createTextEditorDecorationType({ textDecoration: 'none; border-bottom: 1px dashed;' })
  logger = vscode.window.createOutputChannel('Tailwind CSS ClassName Highlight')

  constructor(extContext: vscode.ExtensionContext) {
    this.extContext = extContext
    this.extContext.subscriptions.push(this.decorationType, this.logger)

    this.workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
    if (!this.workspacePath)
      throw new Error('No workspace found')

    this.updateTailwindConfigPath()

    if (this.locateTailwindLibPath()) {
      this.updateTailwindContext()
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

  decorate(openEditor?: vscode.TextEditor | null | undefined) {
    if (!openEditor || !this.isFileMatched(openEditor.document.uri.fsPath))
      return

    const text = openEditor.document.getText()

    let crypto: typeof import('node:crypto') | undefined
    try {
      crypto = require('node:crypto')
    }
    catch { /* empty */ }

    const currentTextContentHash = crypto
      ? crypto.createHash('md5').update(text).digest('hex')
      : ''

    let numberRange: NumberRange[] = []

    if (crypto) {
      const cached = this.textContentHashCache.find(([hash]) => hash === currentTextContentHash)
      if (cached) {
        numberRange = cached[1]
      }
      else {
        numberRange = this.extract(text)
        this.textContentHashCache.unshift([currentTextContentHash, numberRange])
        this.textContentHashCache.length = Math.min(this.textContentHashCache.length, LIMITED_CACHE_SIZE)
      }
    }
    else {
      numberRange = this.extract(text)
    }

    openEditor.setDecorations(
      this.decorationType,
      numberRange
        .map(({ start, end }) => new vscode.Range(
          openEditor.document.positionAt(start),
          openEditor.document.positionAt(end),
        )),
    )
  }

  private isFileMatched(filePath: string) {
    const relativeFilePath = path.relative(this.tailwindConfigFolderPath, filePath)
    const contentFilesPath = this.tailwindContext?.tailwindConfig?.content?.files ?? [] as string[]
    return micromatch.isMatch(relativeFilePath, contentFilesPath)
  }

  private extract(text: string) {
    const includedTextWithRange: Array<{ text: string, range: NumberRange }> = []

    for (const regex of defaultIdeMatchInclude) {
      for (const match of text.matchAll(regex)) {
        includedTextWithRange.push({
          text: match[0],
          range: { start: match.index!, end: match.index! + match[0].length },
        })
      }
    }

    const { defaultExtractor } = require(`${this.tailwindLibPath}/node_modules/tailwindcss/lib/lib/defaultExtractor.js`)
    const { generateRules } = require(`${this.tailwindLibPath}/node_modules/tailwindcss/lib/lib/generateRules.js`)
    const extracted = defaultExtractor(this.tailwindContext)(text) as string[]
    const generatedRules = generateRules(extracted, this.tailwindContext) as GenerateRules
    const generatedCandidates = new Set(generatedRules.map(([, { raws: { tailwind: { candidate } } }]) => candidate))

    // eslint-disable-next-line unicorn/no-array-reduce
    return extracted.reduce<ExtractResult>(
      (acc, value) => {
        const start = text.indexOf(value, acc.index)
        const end = start + value.length
        if (
          generatedCandidates.has(value)
          && includedTextWithRange.some(({ range }) => range.start <= start && range.end >= end)
        )
          acc.result.push({ start, end })
        acc.index = end
        return acc
      },
      { index: 0, result: [] },
    ).result
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
