// https://github.com/tailwindlabs/tailwindcss/blob/a39d03663e7b6e96e01dc68adcd407f418ac7192/packages/%40tailwindcss-node/src/compile.ts#L98

import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path, { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

import EnhancedResolve from 'enhanced-resolve'
import type { Jiti } from 'jiti'
import { createJiti } from 'jiti'

import { getModuleDependencies } from './get-module-dependencies'

type Resolver = (id: string, base: string) => Promise<string | false | undefined>

export async function loadModule(
  id: string,
  base: string,
  onDependency: (path: string) => void,
  customJsResolver?: Resolver,
) {
  if (id[0] !== '.') {
    const resolvedPath = await resolveJsId(id, base, customJsResolver)
    if (!resolvedPath) {
      throw new Error(`Could not resolve '${id}' from '${base}'`)
    }

    const module = await importModule(pathToFileURL(resolvedPath).href)
    return {
      base: dirname(resolvedPath),
      module: module.default ?? module,
    }
  }

  const resolvedPath = await resolveJsId(id, base, customJsResolver)
  if (!resolvedPath) {
    throw new Error(`Could not resolve '${id}' from '${base}'`)
  }

  const [module, moduleDependencies] = await Promise.all([
    importModule(`${pathToFileURL(resolvedPath).href}?id=${Date.now()}`),
    getModuleDependencies(resolvedPath),
  ])

  for (const file of moduleDependencies) {
    onDependency(file)
  }
  return {
    base: dirname(resolvedPath),
    module: module.default ?? module,
  }
}

export async function loadStylesheet(
  id: string,
  base: string,
  onDependency: (path: string) => void,
  cssResolver?: Resolver,
) {
  const resolvedPath = await resolveCssId(id, base, cssResolver)
  if (!resolvedPath)
    throw new Error(`Could not resolve '${id}' from '${base}'`)

  onDependency(resolvedPath)

  const file = await fsPromises.readFile(resolvedPath, 'utf-8')
  return {
    base: path.dirname(resolvedPath),
    content: file,
  }
}

// Attempts to import the module using the native `import()` function. If this
// fails, it sets up `jiti` and attempts to import this way so that `.ts` files
// can be resolved properly.
let jiti: null | Jiti = null
async function importModule(path: string): Promise<any> {
  try {
    return await import(path)
  }
  catch {
    jiti ??= createJiti(import.meta.url, { moduleCache: false, fsCache: false })
    return await jiti.import(path)
  }
}

const cssResolver = EnhancedResolve.ResolverFactory.createResolver({
  fileSystem: new EnhancedResolve.CachedInputFileSystem(fs, 4000),
  useSyncFileSystemCalls: true,
  extensions: ['.css'],
  mainFields: ['style'],
  conditionNames: ['style'],
})
async function resolveCssId(
  id: string,
  base: string,
  customCssResolver?: Resolver,
): Promise<string | false | undefined> {
  if (customCssResolver) {
    const customResolution = await customCssResolver(id, base)
    if (customResolution) {
      return customResolution
    }
  }

  return runResolver(cssResolver, id, base)
}

const esmResolver = EnhancedResolve.ResolverFactory.createResolver({
  fileSystem: new EnhancedResolve.CachedInputFileSystem(fs, 4000),
  useSyncFileSystemCalls: true,
  extensions: ['.js', '.json', '.node', '.ts'],
  conditionNames: ['node', 'import'],
})

const cjsResolver = EnhancedResolve.ResolverFactory.createResolver({
  fileSystem: new EnhancedResolve.CachedInputFileSystem(fs, 4000),
  useSyncFileSystemCalls: true,
  extensions: ['.js', '.json', '.node', '.ts'],
  conditionNames: ['node', 'require'],
})

async function resolveJsId(
  id: string,
  base: string,
  customJsResolver?: Resolver,
): Promise<string | false | undefined> {
  if (customJsResolver) {
    const customResolution = await customJsResolver(id, base)
    if (customResolution) {
      return customResolution
    }
  }

  return runResolver(esmResolver, id, base).catch(() => runResolver(cjsResolver, id, base))
}

function runResolver(
  resolver: EnhancedResolve.Resolver,
  id: string,
  base: string,
): Promise<string | false | undefined> {
  return new Promise((resolve, reject) =>
    resolver.resolve({}, base, id, {}, (err, result) => {
      if (err)
        return reject(err)
      resolve(result)
    }),
  )
}
