import path from 'node:path'

import micromatch from 'micromatch'
import { TailwindUtils } from 'tailwind-api-utils'
import * as vscode from 'vscode'

import { logger, useWorkspaceFsPath } from './state'
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
    nodes?: Node[]
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
    nodes?: Node[]
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
      ?.map((node) => {
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
  tailwindUtils: TailwindUtils = new TailwindUtils()

  resultCache = new Map<string, Result[]>()

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

  async updateTailwindContext() {
    const now = Date.now()
    logger.appendLine('Updating Tailwind CSS context')

    delete require.cache[require.resolve(this.tailwindConfigPath)]

    const workspaceFsPath = useWorkspaceFsPath()
    await this.tailwindUtils.loadConfig(
      this.tailwindConfigPath,
      {
        pwd: workspaceFsPath.value,
      },
    )
    this.resultCache.clear()

    logger.appendLine(`Tailwind CSS context updated in ${Date.now() - now}ms`)
  }

  decorate(openEditor?: vscode.TextEditor | null | undefined, editorText?: string) {
    if (!openEditor || !this.isFileMatched(openEditor.document.uri.fsPath))
      return

    const text = editorText ?? openEditor.document.getText()
    const textHash = hash(text)

    let numberRange: Result[] = []

    if (textHash) {
      const cached = this.resultCache.get(textHash)
      if (cached) {
        numberRange = cached
      }
      else {
        numberRange = this.extract(text)
        this.resultCache.set(textHash, numberRange)
        if (this.resultCache.size > LIMITED_CACHE_SIZE) {
          const { value } = this.resultCache.keys().next()
          if (value)
            this.resultCache.delete(value)
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
    document: vscode.TextDocument,
    position: vscode.Position,
  ) {
    const text = document.getText()
    const textHash = hash(text)
    const cache = this.resultCache.get(textHash!)
    if (!cache)
      return

    const cachedResult = cache.find(
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
    const contentFilesPath = this.tailwindUtils.context?.tailwindConfig?.content?.files ?? ([] as string[])
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
    const extracted = this.tailwindUtils.extract(
      // rewrite @apply border-border; -> @apply border-border ;
      // add space before the final semicolon
      /@apply[^;]*;/.test(text)
        ? text.replaceAll(/(@apply[^;]*)(;)/g, '$1 ;')
        : text,
    ) as string[]
    const generatedRules = generateRules(
      extracted,
      this.tailwindUtils.context,
    ) as GenerateRules

    const generatedRuleMap = new Map<string, GenerateRules>()
    for (const rule of generatedRules) {
      const key = rule[1].raws.tailwind.candidate
      if (!generatedRuleMap.has(key)) {
        generatedRuleMap.set(key, [])
      }
      generatedRuleMap.get(key)!.push(rule)
    }

    const result: Result[] = []
    let index = 0
    for (const value of extracted) {
      const start = text.indexOf(value, index)
      const end = start + value.length
      const generatedRule = generatedRuleMap.get(value)?.[0]
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

    if (!this.tailwindUtils.context) {
      logger.appendLine(`${CHECK_CONTEXT_MESSAGE_PREFIX}Tailwind CSS context not found`)
      return false
    }

    return true
  }
}
