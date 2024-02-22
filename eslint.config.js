// eslint-disable-next-line unicorn/prefer-module, unicorn/no-await-expression-member
module.exports = (async () => (await import('./eslint.config.mjs')).default)()
