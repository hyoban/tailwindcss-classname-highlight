export const defaultIdeMatchInclude = [
  // String literals
  /(["'`])(.*?)\1/g,
  // CSS directives
  /(@apply)[^;]*;/g,
]

export function hash(str: string): string | null {
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
