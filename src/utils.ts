/* eslint-disable ts/no-require-imports */
/* eslint-disable ts/no-var-requires */
import fs from 'node:fs'
import path from 'node:path'
import { workspace } from 'vscode'

export function getClassNames(
  targetText: string,
) {
  const arr: Array<{ start: number, value: string }> = []

  const regexes = [
    /(?:\b(?:class(?:Name)?|tw)\s*=\s*(?:(?:{([^>}]+)})|(["'`][^"'`]+["'`])))/,
    /(?:(clsx|classnames)\()([^)]+)\)/,
  ]
  const regex = new RegExp(regexes.map(r => r.source).join('|'), 'gm')
  const classNameMatches = targetText.matchAll(regex)
  for (const classNameMatch of classNameMatches) {
    const stringMatches = classNameMatch[0].matchAll(
      /(?:["'`]([\s\S.:/${}()[\]"']+)["'`])/g,
    )
    for (const stringMatch of stringMatches) {
      if (classNameMatch.index != null && stringMatch.index != null) {
        stringMatch[0] = stringMatch[0].replace(/["'`]/g, '')

        let start = classNameMatch.index! + stringMatch.index! + 1
        for (const value of stringMatch[0].split(' ')) {
          arr.push({
            start,
            value,
          })
          start += value.length + 1
        }
      }
    }
  }
  return arr
}

const defaultConfigFiles = [
  './tailwind.config.js',
  './tailwind.config.cjs',
  './tailwind.config.mjs',
  './tailwind.config.ts',
]

export function isValidClassName(
  className: string,
) {
  const workspacePath = workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspacePath)
    return

  const { generateRules } = require(`${workspacePath}/node_modules/tailwindcss/lib/lib/generateRules.js`)
  const { createContext } = require(`${workspacePath}/node_modules/tailwindcss/lib/lib/setupContextUtils.js`)
  const { loadConfig } = require(`${workspacePath}/node_modules/tailwindcss/lib/lib/load-config.js`)
  const resolveConfig = require(`${workspacePath}/node_modules/tailwindcss/resolveConfig.js`)

  let configPath: string | null = null

  for (const configFile of defaultConfigFiles) {
    try {
      const fullPath = path.join(workspacePath, configFile)
      if (fs.existsSync(fullPath))
        configPath = fullPath
    }
    catch {

    }
  }

  function isValidClassName(className: string | string[], context: any) {
    const candidate = Array.isArray(className)
      ? className
      : typeof className === 'string'
        ? className.split(' ')
        : []

    const gen = generateRules(candidate, context)
    return gen.length !== 0
  }

  return isValidClassName(
    className,
    createContext(resolveConfig(loadConfig(configPath))),
  )
}
