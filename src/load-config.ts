// https://github.com/tailwindlabs/tailwindcss/blob/d86fd0bb5b69c9aa5c75d4e78f8fe78969d6ff50/src/lib/load-config.ts

import jitiFactory from 'jiti'
import { transform } from 'sucrase'

let jiti: ReturnType<typeof jitiFactory> | null = null

// @internal
// This WILL be removed in some future release
// If you rely on this your stuff WILL break
export function useCustomJiti(_jiti: () => ReturnType<typeof jitiFactory>) {
  jiti = _jiti()
}

function lazyJiti() {
  return (
    jiti
    // eslint-disable-next-line unicorn/prefer-module
    ?? (jiti = jitiFactory(__filename, {
      interopDefault: true,
      transform: (opts) => {
        return transform(opts.source, {
          transforms: ['typescript', 'imports'],
        })
      },
    }))
  )
}

export function loadConfig(path: string) {
  const config = (function () {
    try {
      // eslint-disable-next-line unicorn/prefer-module
      return path ? require(path) : {}
    }
    catch {
      return lazyJiti()(path)
    }
  })()

  return config.default ?? config
}
