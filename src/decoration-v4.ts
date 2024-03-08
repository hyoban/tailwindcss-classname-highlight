/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from 'node:fs'
import path from 'node:path'

import ignore, { Ignore } from 'ignore'
import {
  resolveModule,
} from 'local-pkg'
import * as vscode from 'vscode'

import { defaultExtractor } from './default-extractor'
import { defaultIdeMatchInclude } from './utils'

const LIMITED_CACHE_SIZE = 50

type NumberRange = {
  start: number
  end: number
}

export class DecorationV4 {
  tailwindContext: any
  textContentHashCache: Array<[string, NumberRange[]]> = []

  ig: Ignore | undefined

  constructor(
    private workspacePath: string,
    private logger: vscode.OutputChannel,
    private decorationType: vscode.TextEditorDecorationType,
    private tailwindLibPath: string,
    private cssPath: string,
  ) {
    try {
      this.updateTailwindContext()
    }
    catch (error) {
      if (error instanceof Error)
        this.logger.appendLine(`Error updating Tailwind CSS context${error.message}`)
    }
  }

  updateTailwindContext() {
    const now = Date.now()
    this.logger.appendLine('Updating Tailwind CSS context')

    const { __unstable__loadDesignSystem } = require(this.tailwindLibPath)
    const presetThemePath = resolveModule('tailwindcss/theme.css', { paths: [this.workspacePath] })
    if (!presetThemePath) {
      this.logger.appendLine('Preset theme not found')
      return
    }
    const cssPath = path.join(this.workspacePath, this.cssPath)

    this.logger.appendLine(`Loading css from ${presetThemePath} and ${cssPath}`)
    const css = `${fs.readFileSync(presetThemePath, 'utf8')}\n${fs.readFileSync(cssPath, 'utf8')}`
    this.tailwindContext = __unstable__loadDesignSystem(css)
    this.textContentHashCache = []

    this.logger.appendLine(`Tailwind CSS context updated in ${Date.now() - now}ms`)

    const gitignorePath = path.join(this.workspacePath, '.gitignore')
    if (!fs.existsSync(gitignorePath))
      return
    const gitignore = fs.readFileSync(gitignorePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
    this.ig = ignore().add(gitignore)
  }

  decorate(openEditor?: vscode.TextEditor | null | undefined) {
    if (!openEditor || this.isFileIgnored(openEditor.document.fileName))
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

  private isFileIgnored(filePath: string) {
    if (path.extname(filePath) === '.css')
      return false

    if (!path.isAbsolute(filePath))
      return true

    const relativeFilePath = path.relative(this.workspacePath, filePath)
    return this.ig?.ignores(relativeFilePath) ?? false
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

    const extracted = defaultExtractor(':')(
      /(@apply)[^;]*?;/g.test(text)
      // rewrite @apply border-border; -> @apply border-border ;
      // add space before the final semicolon
        ? text.replaceAll(/(@apply[^;]*?)(;)/g, '$1 ;')
        : text,
    ) as string[]

    const generatedRules = this.tailwindContext.candidatesToCss(extracted) as Array<string | null>
    const generatedCandidates = new Set(extracted.filter((_, i) => generatedRules[i]))

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
      this.logger.appendLine('Tailwind lib path not found, this extension will not work')
      return false
    }

    if (!this.tailwindContext) {
      this.logger.appendLine('Tailwind context not found, this extension will not work')
      return false
    }

    return true
  }
}
