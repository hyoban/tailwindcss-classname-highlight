import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Ignore } from 'ignore'
import ignore from 'ignore'
import { createJiti } from 'jiti'
import { resolveModule } from 'local-pkg'
import * as vscode from 'vscode'

import { defaultExtractor } from './default-extractor'
import { resolveCssFrom, resolveJsFrom } from './resolve'
import { logger, useWorkspaceFsPath } from './state'
import { defaultIdeMatchInclude } from './utils'

const LIMITED_CACHE_SIZE = 50

interface NumberRange {
  start: number
  end: number
}

export class DecorationV4 {
  tailwindContext: any
  textContentHashCache = new Map<string, NumberRange[]>()

  ig: Ignore | undefined

  constructor(
    private tailwindLibPath: string,
    private cssPath: string,
  ) {}

  async updateTailwindContext() {
    const now = Date.now()
    logger.appendLine('Updating Tailwind CSS context')

    const { __unstable__loadDesignSystem } = require(this.tailwindLibPath)
    const workspaceFsPath = useWorkspaceFsPath()
    const presetThemePath = resolveModule('tailwindcss/theme.css', {
      paths: [workspaceFsPath.value],
    })
    if (!presetThemePath) {
      logger.appendLine('Preset theme not found')
      return
    }

    logger.appendLine(
      `Loading css from ${presetThemePath} and ${this.cssPath}`,
    )
    const css = `${fs.readFileSync(presetThemePath, 'utf8')}\n${fs.readFileSync(this.cssPath, 'utf8')}`

    const entryPoint = this.cssPath
    const importBasePath = path.dirname(entryPoint)

    this.tailwindContext = await __unstable__loadDesignSystem(
      css,
      {
        base: importBasePath,

        // v4.0.0-alpha.25+
        loadModule: createLoader({
          legacy: false,
          filepath: entryPoint,
          onError: (id, err, resourceType) => {
            console.error(`Unable to load ${resourceType}: ${id}`, err)

            if (resourceType === 'config') {
              return {}
            }
            else if (resourceType === 'plugin') {
              return () => {}
            }
          },
        }),

        loadStylesheet: async (id: string, base: string) => {
          const resolved = resolveCssFrom(base, id)

          return {
            base: path.dirname(resolved),
            content: await fsp.readFile(resolved, 'utf-8'),
          }
        },

        // v4.0.0-alpha.24 and below
        loadPlugin: createLoader({
          legacy: true,
          filepath: entryPoint,
          onError(id, err) {
            console.error(`Unable to load plugin: ${id}`, err)

            return () => {}
          },
        }),

        loadConfig: createLoader({
          legacy: true,
          filepath: entryPoint,
          onError(id, err) {
            console.error(`Unable to load config: ${id}`, err)

            return {}
          },
        }),
      },
    )
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

    const extracted = defaultExtractor(':')(
      // rewrite @apply border-border; -> @apply border-border ;
      // add space before the final semicolon
      /@apply[^;]*;/.test(text)
        ? text.replaceAll(/(@apply[^;]*)(;)/g, '$1 ;')
        : text,
    ) as string[]

    const generatedRules = this.tailwindContext.candidatesToCss(
      extracted,
    ) as Array<string | null>
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

    if (!this.tailwindContext) {
      logger.appendLine(
        'Tailwind context not found, this extension will not work',
      )
      return false
    }

    return true
  }
}

/**
 * Create a loader function that can load plugins and config files relative to
 * the CSS file that uses them. However, we don't want missing files to prevent
 * everything from working so we'll let the error handler decide how to proceed.
 */
function createLoader<T>({
  legacy,
  filepath,
  onError,
}: {
  legacy: boolean
  filepath: string
  onError: (id: string, error: unknown, resourceType: string) => T
}) {
  const cacheKey = `${+Date.now()}`

  async function loadFile(id: string, base: string, resourceType: string) {
    try {
      const resolved = resolveJsFrom(base, id)

      const url = pathToFileURL(resolved)
      url.searchParams.append('t', cacheKey)

      // return await import(url.href).then(m => m.default ?? m)
      const jiti = createJiti(base)
      return await jiti.import(url.href)
    }
    catch (err) {
      return onError(id, err, resourceType)
    }
  }

  if (legacy) {
    const baseDir = path.dirname(filepath)
    return (id: string) => loadFile(id, baseDir, 'module')
  }

  return async (id: string, base: string, resourceType: string) => ({
    base,
    module: await loadFile(id, base, resourceType),
  })
}
