/* eslint-disable unicorn/prefer-module */
// @ts-check
const hyoban = require('eslint-config-hyoban').default

module.exports = hyoban({ react: false, next: false, typescript: { typeChecked: false } })
