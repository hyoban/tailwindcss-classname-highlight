// https://github.com/tailwindlabs/tailwindcss/blob/4429ab80101bdebcb3e84e817201beb69f05fc3b/src/lib/regex.js

const REGEX_SPECIAL = /[$()*+.?[\\\]^{|}]/g;
const REGEX_HAS_SPECIAL = new RegExp(REGEX_SPECIAL.source);

/**
 * @param {string|RegExp|Array<string|RegExp>} source
 */
function toSource(source) {
  source = Array.isArray(source) ? source : [source];

  source = source.map((item) => (item instanceof RegExp ? item.source : item));

  return source.join("");
}

/**
 * @param {string|RegExp|Array<string|RegExp>} source
 */
export function pattern(source) {
  return new RegExp(toSource(source), "g");
}

/**
 * @param {string|RegExp|Array<string|RegExp>} source
 */
export function withoutCapturing(source) {
  return new RegExp(`(?:${toSource(source)})`, "g");
}

/**
 * @param {Array<string|RegExp>} sources
 */
export function any(sources) {
  return `(?:${sources.map((element) => toSource(element)).join("|")})`;
}

/**
 * @param {string|RegExp} source
 */
export function optional(source) {
  return `(?:${toSource(source)})?`;
}

/**
 * @param {string|RegExp|Array<string|RegExp>} source
 */
export function zeroOrMore(source) {
  return `(?:${toSource(source)})*`;
}

/**
 * Generate a RegExp that matches balanced brackets for a given depth
 * We have to specify a depth because JS doesn't support recursive groups using ?R
 *
 * Based on https://stackoverflow.com/questions/17759004/how-to-match-string-within-parentheses-nested-in-java/17759264#17759264
 *
 * @param {string|RegExp|Array<string|RegExp>} source
 */
export function nestedBrackets(open, close, depth = 1) {
  return withoutCapturing([
    escape(open),
    /\S*/,
    depth === 1
      ? `[^${escape(open)}${escape(close)}s]*`
      : any([
          `[^${escape(open)}${escape(close)}s]*`,
          nestedBrackets(open, close, depth - 1),
        ]),
    /\S*/,
    escape(close),
  ]);
}

export function escape(string) {
  return string && REGEX_HAS_SPECIAL.test(string)
    ? string.replaceAll(REGEX_SPECIAL, "\\$&")
    : string || "";
}
