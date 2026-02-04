import fs from 'node:fs'
import path from 'node:path'

import fg from 'fast-glob'
import { getPackageInfo, resolveModule } from 'local-pkg'
import type { Ref } from 'reactive-vscode'
import {
  computed,
  defineExtension,
  ref,
  useActiveTextEditor,
  useCommand,
  useDisposable,
  useDocumentText,
  useEditorDecorations,
  useFileSystemWatcher,
  watchEffect,
} from 'reactive-vscode'
import * as vscode from 'vscode'

import { DecorationV3 } from './decoration-v3'
import { DecorationV4 } from './decoration-v4'
import { GeneratedCSSHoverProvider } from './hover-provider'
import { logger, textDecoration, useWorkspaceFsPath } from './state'

const { activate, deactivate } = defineExtension(async () => {
  const workspaceFsPath = useWorkspaceFsPath()
  if (!workspaceFsPath.value)
    return

  // handle multiple tailwind v3 config files
  let tailwindV3ConfigPaths = (
    await fg.glob('./**/tailwind.config.{js,cjs,mjs,ts}', {
      cwd: workspaceFsPath.value,
      ignore: ['**/node_modules/**'],
    })
  ).map(p => path.join(workspaceFsPath.value, p))

  let tailwindV3PackageEntries = tailwindV3ConfigPaths.map(p =>
    resolveModule('tailwindcss', { paths: [p] }),
  ) as string[]
  if (tailwindV3PackageEntries.length > 0) {
    tailwindV3ConfigPaths = tailwindV3ConfigPaths.filter(
      (_, index) => tailwindV3PackageEntries[index],
    )
    tailwindV3PackageEntries = tailwindV3PackageEntries.filter(Boolean)
  }

  const workspaceTailwindPackageInfo = await getPackageInfo(
    'tailwindcss',
    {
      paths: [workspaceFsPath.value],
    },
  )
  if (
    (!workspaceTailwindPackageInfo?.version
      || !workspaceTailwindPackageInfo?.rootPath)
    && tailwindV3ConfigPaths.length === 0
  ) {
    logger.appendLine('Tailwind CSS package not found')
    return
  }

  if (tailwindV3ConfigPaths.length > 1) {
    logger.appendLine(
      `Multiple Tailwind CSS config files found: ${tailwindV3ConfigPaths
        .map(p => p)
        .join(', ')}`,
    )
  }
  else {
    logger.appendLine(
      `Detected Tailwind CSS version: ${workspaceTailwindPackageInfo?.version}`,
    )
  }

  const isV4 = workspaceTailwindPackageInfo?.version?.startsWith('4') ?? false
  const workspaceTailwindPackageEntry = resolveModule(
    'tailwindcss',
    {
      paths: [workspaceFsPath.value],
    },
  )!
  if (isV4 && !workspaceTailwindPackageEntry) {
    logger.appendLine('Tailwind CSS package entry not found')
    return
  }

  const tailwindConfigPath = tailwindV3ConfigPaths
  let cssFilePath = ''

  if (isV4) {
    const configPath = fg
      .globSync('./**/*.css', {
        cwd: workspaceFsPath.value,
        ignore: ['**/node_modules/**'],
      })
      .map(p => path.join(workspaceFsPath.value, p))
      .filter(p => fs.existsSync(p))
      .filter((p) => {
        const content = fs.readFileSync(p, 'utf8')
        const tailwindCSSRegex = [
          /^@import (["'])tailwindcss\1.+/,
          /^@import (["'])tailwindcss\/preflight\1.+/,
          /^@import (["'])tailwindcss\/utilities\1.+/,
          /^@import (["'])tailwindcss\/theme\1.+/,
        ]
        return tailwindCSSRegex.some(regex => regex.test(content))
      })
    if (configPath.length === 0) {
      logger.appendLine('Tailwind CSS config file not found')
      return
    }
    logger.appendLine(`Tailwind CSS config file found at ${configPath}`)
    cssFilePath = configPath.at(0)!
  }

  // for nativewind preset
  process.env.TAILWIND_MODE = 'build'

  const decorationList = isV4
    ? [
        new DecorationV4(
          workspaceTailwindPackageEntry.replaceAll('.mjs', '.js'),
          cssFilePath,
        ),
      ]
    : tailwindV3PackageEntries.map(
        (tailwindcssPackageEntry, index) =>
          new DecorationV3(
            path.resolve(tailwindcssPackageEntry, '../../'),
            tailwindConfigPath.at(index)!,
          ),
      )

  for (const i of decorationList) {
    await i.updateTailwindContext()
  }

  if (!decorationList.some(i => i.checkContext()))
    return

  const textEditor = useActiveTextEditor()
  const document = computed(() => textEditor.value?.document)
  const text = useDocumentText(document)

  const decorationRange: Ref<vscode.Range[]> = ref([])
  useEditorDecorations(
    textEditor,
    { textDecoration: textDecoration },
    decorationRange,
  )

  const decorateAll = () => {
    let decorated = false
    for (const i of decorationList) {
      const ranges = i.decorate(textEditor.value, text.value)
      if (!decorated) {
        decorationRange.value = ranges ?? []
      }
      if (ranges && ranges.length > 0) {
        decorated = true
      }
    }
  }
  watchEffect(() => {
    decorateAll()
  })

  const onReload = async () => {
    for (const i of decorationList) {
      await i.updateTailwindContext()
    }

    decorateAll()
  }

  const fileWatcherList = [...tailwindConfigPath, cssFilePath].filter(Boolean)
  for (const file of fileWatcherList) {
    const fileWatcher = useFileSystemWatcher(file)
    fileWatcher.onDidChange(onReload)
  }

  useCommand('tailwindcss-classname-highlight.reload', onReload)

  decorationList.forEach((i) => {
    useDisposable(
      vscode.languages.registerHoverProvider(
        {
          scheme: 'file',
          pattern: '**/*',
        },
        new GeneratedCSSHoverProvider(i),
      ),
    )
  })
})

export { activate, deactivate }
