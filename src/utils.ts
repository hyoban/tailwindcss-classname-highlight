export const defaultIdeMatchInclude = [
  // String literals
  // eslint-disable-next-line no-control-regex
  /(["'`])[^\u0001]*?\1/g,
  // CSS directives
  /(@apply)[^;]*;/g,
]
