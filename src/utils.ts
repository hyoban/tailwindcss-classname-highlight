export const defaultIdeMatchInclude = [
  // String literals
  /(["'`])[^\1]*?\1/g,
  // CSS directives
  /(@apply)[^;]*?;/g,
];
