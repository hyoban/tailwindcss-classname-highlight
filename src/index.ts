import fs from 'node:fs'
import path from 'node:path'

import fg from 'fast-glob'
import { getPackageInfo, resolveModule } from 'local-pkg'
import type { Ref } from 'reactive-vscode'
import { computed, defineConfigs, defineExtension, ref, useActiveTextEditor, useCommand, useDisposable, useEditorDecorations, useFsWatcher, useOutputChannel, useWorkspaceFolders, watchEffect } from 'reactive-vscode'
import * as vscode from 'vscode'

import { DecorationV3 } from './decoration-v3'
import { DecorationV4 } from './decoration-v4'
import { GeneratedCSSHoverProvider } from './hover-provider'

export const { enableHoverProvider } = defineConfigs(
  'tailwindcss-classname-highlight',
  {
    enableHoverProvider: Boolean,
  },
)

const { activate, deactivate } = defineExtension(async () => {
  const folders = useWorkspaceFolders()
  const workspacePath = computed(() => folders.value?.[0]?.uri.fsPath ?? '')
  if (!workspacePath.value)
    return

  const logger = useOutputChannel('Tailwind CSS ClassName Highlight')

  // handle multiple tailwind v3 config files
  let tailwindV3ConfigPathList: string[] = fg
    .globSync('./**/tailwind.config.{js,cjs,mjs,ts}', {
      cwd: workspacePath.value,
      ignore: ['**/node_modules/**'],
    })
    .map(p => path.join(workspacePath.value, p))
  let tailwindV3PackageEntryList: string[] = tailwindV3ConfigPathList.map(p =>
    resolveModule('tailwindcss', { paths: [p] }),
  ) as string[]
  if (tailwindV3PackageEntryList.length > 0) {
    tailwindV3ConfigPathList = tailwindV3ConfigPathList.filter(
      (_, index) => tailwindV3PackageEntryList[index],
    )
    tailwindV3PackageEntryList = tailwindV3PackageEntryList.filter(Boolean)
  }

  const workspaceTailwindPackageInfo = await getPackageInfo('tailwindcss', {
    paths: [workspacePath.value],
  })
  if (
    (!workspaceTailwindPackageInfo?.version
    || !workspaceTailwindPackageInfo?.rootPath)
    && tailwindV3ConfigPathList.length === 0
  ) {
    logger.appendLine('Tailwind CSS package not found')
    return
  }

  if (tailwindV3ConfigPathList.length > 1) {
    logger.appendLine(
      `Multiple Tailwind CSS config files found: ${tailwindV3ConfigPathList.map(p => p).join(', ')}`,
    )
  }
  else {
    logger.appendLine(
      `Detected Tailwind CSS version: ${workspaceTailwindPackageInfo?.version}`,
    )
  }

  const isV4 = workspaceTailwindPackageInfo?.version?.startsWith('4') ?? false
  const globalTailwindPackageEntry = resolveModule('tailwindcss', {
    paths: [workspacePath.value],
  })!
  if (isV4 && !globalTailwindPackageEntry) {
    logger.appendLine('Tailwind CSS package entry not found')
    return
  }

  const tailwindConfigPath: string[] = tailwindV3ConfigPathList
  let cssFilePath = ''

  if (isV4) {
    const configPath = fg
      .globSync('./**/*.css', {
        cwd: workspacePath.value,
        ignore: ['**/node_modules/**'],
      })
      .map(p => path.join(workspacePath.value, p))
      .filter(p => fs.existsSync(p))
      .filter((p) => {
        const content = fs.readFileSync(p, 'utf8')
        const tailwindCSSRegex = [
          /^@import (["'])tailwindcss\1;/,
          /^@import (["'])tailwindcss\/preflight\1/,
          /^@import (["'])tailwindcss\/utilities\1/,
          /^@import (["'])tailwindcss\/theme\1/,
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

  const decorationList = isV4
    ? [
        new DecorationV4(
          workspacePath.value,
          logger,
          globalTailwindPackageEntry.replaceAll('.mjs', '.js'),
          cssFilePath,
        ),
      ]
    : tailwindV3PackageEntryList.map(
      (tailwindcssPackageEntry, index) =>
        new DecorationV3(
          workspacePath.value,
          logger,
          path.resolve(tailwindcssPackageEntry, '../../'),
          tailwindConfigPath.at(index)!,
        ),
    )

  if (!decorationList.some(i => i.checkContext()))
    return

  const editor = useActiveTextEditor()
  const decorationRange: Ref<vscode.Range[]> = ref([])
  useEditorDecorations(
    editor,
    { textDecoration: 'none; border-bottom: 1px dashed;' },
    decorationRange,
  )

  const decorateAll = () => {
    for (const i of decorationList) {
      const ranges = i.decorate(editor.value)
      if (ranges)
        decorationRange.value = ranges
    }
  }
  watchEffect(() => {
    decorateAll()
  })

  const onReload = () => {
    for (const i of decorationList)
      i.updateTailwindContext()

    decorateAll()
  }

  const fileWatcherList = [...tailwindConfigPath, cssFilePath].filter(Boolean)
  for (const file of fileWatcherList) {
    const fileWatcher = useFsWatcher(file)
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
