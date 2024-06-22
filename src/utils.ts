export const defaultIdeMatchInclude = [
  // String literals
  // eslint-disable-next-line no-control-regex
  /(["'`])[^\u0001]*?\1/g,
  // CSS directives
  /(@apply)[^;]*;/g,
]

export function hash(str: string): string | null {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let crypto: typeof import('node:crypto') | undefined
  try {
    crypto = require('node:crypto')
  }
  catch {
    /* empty */
  }

  return crypto
    ? crypto.createHash('md5').update(str).digest('hex')
    : null
}
