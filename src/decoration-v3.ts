/* eslint-disable @typescript-eslint/consistent-type-imports */

/* eslint-disable @typescript-eslint/no-var-requires */

/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path'

import micromatch from 'micromatch'
import * as vscode from 'vscode'

import { defaultExtractor } from './default-extractor'
import { loadConfig } from './load-config'
import { defaultIdeMatchInclude } from './utils'

const CHECK_CONTEXT_MESSAGE_PREFIX = 'Check context failed: '
const LIMITED_CACHE_SIZE = 50

type GenerateRules = Array<[
  Record<string, unknown>,
  {
    raws: {
      tailwind: {
        candidate: string,
      },
    },
  },
]>

type NumberRange = {
  start: number,
  end: number,
}

export class DecorationV3 {
  tailwindConfigFolderPath = ''
  tailwindContext: any

  textContentHashCache: Array<[string, NumberRange[]]> = []

  constructor(
    private workspacePath: string,
    private logger: vscode.OutputChannel,
    private decorationType: vscode.TextEditorDecorationType,
    private tailwindLibPath: string,
    private tailwindConfigPath: string,
  ) {
    this.tailwindConfigFolderPath = path.dirname(this.tailwindConfigPath)
    try {
      this.updateTailwindContext()
    }
    catch (error) {
      if (error instanceof Error)
        this.logger.appendLine(`Error updating Tailwind CSS context: ${error.message}`)
    }
  }

  updateTailwindContext() {
    const now = Date.now()
    this.logger.appendLine('Updating Tailwind CSS context')

    delete require.cache[require.resolve(this.tailwindConfigPath)]
    const { createContext } = require(`${this.tailwindLibPath}/lib/lib/setupContextUtils.js`)
    const resolveConfig = require(`${this.tailwindLibPath}/resolveConfig.js`)
    this.tailwindContext = createContext(resolveConfig(loadConfig(this.tailwindConfigPath)))
    this.textContentHashCache = []

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
    if (path.extname(filePath) === '.css')
      return true
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

    const { generateRules } = require(`${this.tailwindLibPath}/lib/lib/generateRules.js`)
    const extracted = defaultExtractor(this.tailwindContext.tailwindConfig.separator)(
      /(@apply)[^;]*?;/g.test(text)
      // rewrite @apply border-border; -> @apply border-border ;
      // add space before the final semicolon
        ? text.replaceAll(/(@apply[^;]*?)(;)/g, '$1 ;')
        : text,
    ) as string[]
    const generatedRules = generateRules(extracted, this.tailwindContext) as GenerateRules
    const generatedCandidates = new Set(generatedRules.map(([, { raws: { tailwind: { candidate } } }]) => candidate))

    const result: NumberRange[] = []
    let index = 0
    for (const value of extracted) {
      const start = text.indexOf(value, index)
      const end = start + value.length
      if (
        generatedCandidates.has(value)
        && includedTextWithRange.some(({ range }) => range.start <= start && range.end >= end)
      )
        result.push({ start, end })
      index = end
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
