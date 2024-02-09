export function getClassNames(
  targetText: string,
  classRegex: Array<RegExp> = [],
) {
  const arr: Array<{ start: number, value: string }> = []

  const regexes = [
    /(?:\b(?:class(?:Name)?|tw)\s*=\s*(?:(?:{((?:.|\n)+?)(?<=["'`)]\s*)(?<!\${[^}]*)})|(["'`][^"'`]+["'`])))/,
    /(?:(clsx|classnames|cva)\()([^)]+)\)/,
    ...classRegex,
  ]
  const regex = new RegExp(regexes.map(r => r.source).join('|'), 'gm')
  const classNameMatches = targetText.matchAll(regex)
  for (const classNameMatch of classNameMatches) {
    const stringMatches = classNameMatch[0].matchAll(
      /(\"(?:.|\n)*?\"|\'(?:.|\n)*?\'|\`(?:.|\n)*?\`)/g,
    )
    for (const stringMatch of stringMatches) {
      if (classNameMatch.index != null && stringMatch.index != null) {
        stringMatch[0] = stringMatch[0].replace(/["'`]/g, '')

        let start = classNameMatch.index! + stringMatch.index! + 1
        for (const value of stringMatch[0].split(' ')) {
          const trimmedValue = value.trim()
          if (trimmedValue
            // check if value contains a variable
            && !/\$\{[^}]+\}/.test(trimmedValue)
          ) {
            arr.push({
              start,
              value: trimmedValue,
            })
          }
          start += value.length + 1
        }
      }
    }
  }
  return arr
}
