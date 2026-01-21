import fs from 'node:fs'
import path from 'node:path'

import type { Ignore } from 'ignore'
import ignore from 'ignore'
import { TailwindUtils } from 'tailwind-api-utils'
import * as vscode from 'vscode'

import { logger, useWorkspaceFsPath } from './state'
import { defaultIdeMatchInclude } from './utils'

const LIMITED_CACHE_SIZE = 50

interface NumberRange {
  start: number
  end: number
}

export class DecorationV4 {
  tailwindUtils: TailwindUtils
  textContentHashCache = new Map<string, NumberRange[]>()

  ig: Ignore | undefined

  constructor(
    private tailwindLibPath: string,
    private cssPath: string,
  ) {
    const workspaceFsPath = useWorkspaceFsPath()
    this.tailwindUtils = new TailwindUtils({ paths: [workspaceFsPath.value] })
  }

  async updateTailwindContext() {
    const now = Date.now()
    logger.appendLine('Updating Tailwind CSS context')

    const workspaceFsPath = useWorkspaceFsPath()
    const entryPoint = this.cssPath

    await this.tailwindUtils.loadConfig(entryPoint)
    this.textContentHashCache.clear()

    logger.appendLine(
      `Tailwind CSS context updated in ${Date.now() - now}ms`,
    )

    const gitignorePath = path.join(workspaceFsPath.value, '.gitignore')
    if (!fs.existsSync(gitignorePath))
      return
    const gitignore = fs
      .readFileSync(gitignorePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
    this.ig = ignore().add(gitignore)
  }

  decorate(openEditor?: vscode.TextEditor | null | undefined, editorText?: string) {
    if (!openEditor || this.isFileIgnored(openEditor.document.fileName))
      return

    const text = editorText ?? openEditor.document.getText()

    let crypto: typeof import('node:crypto') | undefined
    try {
      crypto = require('node:crypto')
    }
    catch {
      /* empty */
    }

    const currentTextContentHash = crypto
      ? crypto.createHash('md5').update(text).digest('hex')
      : ''

    let numberRange: NumberRange[] = []

    if (crypto) {
      const cached = this.textContentHashCache.get(currentTextContentHash)
      if (cached) {
        numberRange = cached
      }
      else {
        numberRange = this.extract(text)
        this.textContentHashCache.set(currentTextContentHash, numberRange)
        if (this.textContentHashCache.size > LIMITED_CACHE_SIZE) {
          const { value } = this.textContentHashCache.keys().next()
          if (value) {
            this.textContentHashCache.delete(value)
          }
        }
      }
    }
    else {
      numberRange = this.extract(text)
    }

    return numberRange.map(
      ({ start, end }) =>
        new vscode.Range(
          openEditor.document.positionAt(start),
          openEditor.document.positionAt(end),
        ),
    )
  }

  hover(
    _document: vscode.TextDocument,
    _position: vscode.Position,
  ): undefined {
    // TODO: implement hover
    return
  }

  private isFileIgnored(filePath: string) {
    if (path.extname(filePath) === '.css')
      return false

    if (!path.isAbsolute(filePath))
      return true

    const workspaceFsPath = useWorkspaceFsPath()

    const relativeFilePath = path.relative(workspaceFsPath.value, filePath)
    return this.ig?.ignores(relativeFilePath) ?? false
  }

  private extract(text: string) {
    const includedTextWithRange: Array<{ text: string, range: NumberRange }>
      = []

    for (const regex of defaultIdeMatchInclude) {
      for (const match of text.matchAll(regex)) {
        includedTextWithRange.push({
          text: match[0],
          range: { start: match.index!, end: match.index! + match[0].length },
        })
      }
    }

    const extracted = this.tailwindUtils.extract(
      // rewrite @apply border-border; -> @apply border-border ;
      // add space before the final semicolon
      /@apply[^;]*;/.test(text)
        ? text.replaceAll(/(@apply[^;]*)(;)/g, '$1 ;')
        : text,
    )

    const generatedRules = this.tailwindUtils.context!.candidatesToCss(extracted)
    const generatedCandidates = new Set(
      extracted.filter((_, i) => generatedRules[i]),
    )

    const result: NumberRange[] = []
    let index = 0
    for (const value of extracted) {
      const start = text.indexOf(value, index)
      const end = start + value.length
      if (
        generatedCandidates.has(value)
        && includedTextWithRange.some(
          ({ range }) => range.start <= start && range.end >= end,
        )
      ) {
        result.push({ start, end })
      }
      index = end
    }
    return result
  }

  checkContext() {
    if (!this.tailwindLibPath) {
      logger.appendLine(
        'Tailwind lib path not found, this extension will not work',
      )
      return false
    }

    if (!this.tailwindUtils.context) {
      logger.appendLine(
        'Tailwind context not found, this extension will not work',
      )
      return false
    }

    return true
  }
}
