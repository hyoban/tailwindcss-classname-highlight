import { describe, expect, it } from 'vitest'
import dedent from 'dedent'
import { getClassNames } from '../src/utils'

describe('should', () => {
  it('get literal string in className', () => {
    expect(getClassNames(dedent`
      export default function App() {
        return <h1 className="flex flex-col">Hello world!</h1>
      }    
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 56,
          "value": "flex",
        },
        {
          "start": 61,
          "value": "flex-col",
        },
      ]
    `)

    expect(getClassNames(dedent`
      export default function App() {
        return <h1 className={\`flex flex-col\`}>Hello world!</h1>
      }    
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 57,
          "value": "flex",
        },
        {
          "start": 62,
          "value": "flex-col",
        },
      ]
    `)

    expect(getClassNames(dedent`
      export default function App() {
        return (
          <h1
            className={\`
        flex
        flex-col\`}
          >
            Hello world!
          </h1>
        )
      }    
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 72,
          "value": "flex",
        },
        {
          "start": 79,
          "value": "flex-col",
        },
      ]
    `)

    expect(getClassNames(dedent`
      import { clsx } from "clsx"

      export default function App() {
        return <h1 className={clsx("flex", "flex-col")}>Hello world!</h1>
      }    
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 91,
          "value": "flex",
        },
        {
          "start": 99,
          "value": "flex-col",
        },
      ]
    `)
  })
})
