import path from 'node:path'

import micromatch from 'micromatch'
import * as vscode from 'vscode'

import { defaultExtractor } from './default-extractor'
import { loadConfig } from './load-config'
import { logger } from './state'
import { defaultIdeMatchInclude, hash } from './utils'

const CHECK_CONTEXT_MESSAGE_PREFIX = 'Check context failed: '
const LIMITED_CACHE_SIZE = 50

type RootNode = (
  | {
    type: 'rule'
    selector: string
    raws: {
      tailwind: {
        candidate: string
      }
    }
    nodes: Node[]
  }
  | {
    type: 'atrule'
    name: string
    params: string
    raws: {
      tailwind: {
        candidate: string
      }
    }
    nodes: Node[]
  }
)

type Node = (
  | RootNode
  | { type: 'decl', prop: string, value: string }
)

type GenerateRules = Array<
  [
    Record<string, unknown>,
    RootNode,
  ]
>

function rgbToHex(r: number, g: number, b: number) {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

function withHelperComment(value: string) {
  // rgb(0 112 224 / var(--tw-text-opacity));
  const match = value.match(/^rgb\((?<r>\d{1,3}) (?<g>\d{1,3}) (?<b>\d{1,3}) \/ var\(--tw-text-opacity\)\)$/)
  if (match && match.groups && match.groups.r && match.groups.g && match.groups.b) {
    // with hex color
    // rgb(0 112 224 / var(--tw-text-opacity)) /* #0070e0 */

    return `${value} /* ${rgbToHex(
      Number.parseInt(match.groups.r),
      Number.parseInt(match.groups.g),
      Number.parseInt(match.groups.b),
    )} */`
  }

  return value
}

function generateCSS(root: RootNode): string {
  return `${root.type === 'rule' ? root.selector : `@${root.name} ${root.params}`} {\n${
    root.nodes
      .map((node) => {
        if (node.type === 'decl') {
          return `  ${node.prop}: ${withHelperComment(node.value)};`
        }
        return generateCSS(node).split('\n').map(line => `  ${line}`).join('\n')
      })
      .join('\n')
  }\n}`
}

interface Result {
  start: number
  end: number
  generateCSS: string
}

export class DecorationV3 {
  tailwindContext: any

  resultCache: Array<[string, Result[]]> = []

  constructor(
    private tailwindLibPath: string,
    private tailwindConfigPath: string,
  ) {
    try {
      this.updateTailwindContext()
    }
    catch (error) {
      if (error instanceof Error) {
        logger.appendLine(`Error updating Tailwind CSS context: ${error.message}`)
      }
    }
  }

  updateTailwindContext() {
    const now = Date.now()
    logger.appendLine('Updating Tailwind CSS context')

    delete require.cache[require.resolve(this.tailwindConfigPath)]
    const { createContext } = require(
      `${this.tailwindLibPath}/lib/lib/setupContextUtils.js`,
    )
    const resolveConfig = require(`${this.tailwindLibPath}/resolveConfig.js`)
    this.tailwindContext = createContext(
      resolveConfig(loadConfig(this.tailwindConfigPath)),
    )
    this.resultCache = []

    logger.appendLine(`Tailwind CSS context updated in ${Date.now() - now}ms`)
  }

  decorate(openEditor?: vscode.TextEditor | null | undefined) {
    if (!openEditor || !this.isFileMatched(openEditor.document.uri.fsPath))
      return

    const text = openEditor.document.getText()
    const textHash = hash(text)

    let numberRange: Result[] = []

    if (textHash) {
      const cached = this.resultCache.find(([hash]) => hash === textHash)
      if (cached) {
        numberRange = cached[1]
      }
      else {
        numberRange = this.extract(text)
        this.resultCache.unshift([textHash, numberRange])
        this.resultCache.length = Math.min(this.resultCache.length, LIMITED_CACHE_SIZE)
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
    document: vscode.TextDocument,
    position: vscode.Position,
  ) {
    const text = document.getText()
    const textHash = hash(text)
    const cache = this.resultCache.find(([hash]) => hash === textHash)
    if (!cache)
      return

    const cachedResult = cache[1].find(
      ({ start, end }) =>
        start <= document.offsetAt(position)
        && end >= document.offsetAt(position),
    )
    if (!cachedResult)
      return

    const { start, end, generateCSS } = cachedResult
    if (!generateCSS)
      return

    return new vscode.Hover(
      new vscode.MarkdownString(`\`\`\`css\n${generateCSS}\n\`\`\``),
      new vscode.Range(document.positionAt(start), document.positionAt(end)),
    )
  }

  private isFileMatched(filePath: string) {
    if (path.extname(filePath) === '.css')
      return true
    const relativeFilePath = path.relative(
      path.dirname(this.tailwindConfigPath),
      filePath,
    )
    const contentFilesPath = this.tailwindContext?.tailwindConfig?.content?.files ?? ([] as string[])
    return micromatch.isMatch(relativeFilePath, contentFilesPath)
  }

  private extract(text: string) {
    const includedTextWithRange: Array<{ text: string, range: { start: number, end: number } }> = []

    for (const regex of defaultIdeMatchInclude) {
      for (const match of text.matchAll(regex)) {
        includedTextWithRange.push({
          text: match[0],
          range: { start: match.index!, end: match.index! + match[0].length },
        })
      }
    }

    const { generateRules } = require(`${this.tailwindLibPath}/lib/lib/generateRules.js`)
    const extracted = defaultExtractor(
      this.tailwindContext.tailwindConfig.separator,
    )(
      // rewrite @apply border-border; -> @apply border-border ;
      // add space before the final semicolon
      /@apply[^;]*;/.test(text)
        ? text.replaceAll(/(@apply[^;]*)(;)/g, '$1 ;')
        : text,
    ) as string[]
    const generatedRules = generateRules(
      extracted,
      this.tailwindContext,
    ) as GenerateRules

    const result: Result[] = []
    let index = 0
    for (const value of extracted) {
      const start = text.indexOf(value, index)
      const end = start + value.length
      const generatedRule = generatedRules.find(i => i[1].raws.tailwind.candidate === value)
      if (
        generatedRule
        && includedTextWithRange.some(({ range }) => range.start <= start && range.end >= end)
      ) {
        result.push({
          start,
          end,
          generateCSS: generateCSS(generatedRule[1]),
        })
      }
      index = end
    }
    return result
  }

  checkContext() {
    if (!this.tailwindLibPath) {
      logger.appendLine(`${CHECK_CONTEXT_MESSAGE_PREFIX}Tailwind CSS library path not found`)
      return false
    }

    if (!this.tailwindContext) {
      logger.appendLine(`${CHECK_CONTEXT_MESSAGE_PREFIX}Tailwind CSS context not found`)
      return false
    }

    return true
  }
}
