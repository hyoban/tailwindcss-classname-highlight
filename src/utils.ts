export const defaultIdeMatchInclude = [
  // String literals
  // eslint-disable-next-line regexp/strict
  /(["'`])[^\1]*?\1/g,
  // CSS directives
  /(@apply)[^;]*;/g,
]
