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

    expect(getClassNames(dedent`
      import { Slot } from "@radix-ui/react-slot"
      import { cva } from "class-variance-authority"
      import * as React from "react"
      
      import { cn } from "~/lib/utils"
      
      import type { VariantProps } from "class-variance-authority"
      
      const buttonVariants = cva(
        "inline-flex items-center",
        {
          variants: {
            variant: {
              default: "bg-primary text-primary-foreground",
              destructive:
                "bg-destructive text-destructive-foreground",
            },
            size: {
              default: "h-10 px-4",
              sm: "h-9 px-3",
            },
          },
          defaultVariants: {
            variant: "default",
            size: "default",
          },
        },
      )
      
      export interface ButtonProps
        extends React.ButtonHTMLAttributes<HTMLButtonElement>,
          VariantProps<typeof buttonVariants> {
        asChild?: boolean
      }
      
      const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
        ({ className, variant, size, asChild = false, ...props }, ref) => {
          const Comp = asChild ? Slot : "button"
          return (
            <Comp
              className={cn('flex', buttonVariants({ variant, size, className }))}
              ref={ref}
              {...props}
            />
          )
        },
      )
      Button.displayName = "Button"
      
      export { Button, buttonVariants }
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 250,
          "value": "inline-flex",
        },
        {
          "start": 262,
          "value": "items-center",
        },
        {
          "start": 332,
          "value": "bg-primary",
        },
        {
          "start": 343,
          "value": "text-primary-foreground",
        },
        {
          "start": 401,
          "value": "bg-destructive",
        },
        {
          "start": 416,
          "value": "text-destructive-foreground",
        },
        {
          "start": 487,
          "value": "h-10",
        },
        {
          "start": 492,
          "value": "px-4",
        },
        {
          "start": 512,
          "value": "h-9",
        },
        {
          "start": 516,
          "value": "px-3",
        },
        {
          "start": 578,
          "value": "default",
        },
        {
          "start": 601,
          "value": "default",
        },
        {
          "start": 1003,
          "value": "flex",
        },
      ]
    `)

    expect(getClassNames(dedent`
      <Link
        className="py-4 px-8
        hover:text-white"
        target="_blank"
      >
        了解更多
      </Link>
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 19,
          "value": "py-4",
        },
        {
          "start": 24,
          "value": "px-8",
        },
        {
          "start": 31,
          "value": "hover:text-white",
        },
      ]
    `)

    expect(getClassNames(dedent`
      <div
        className={cn(
          "size-8",
          list.length > 2 && "size-16",
          list.length > 6 && "size-24",
          className,
        )}
      >
        {list.length}
      </div>
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 27,
          "value": "size-8",
        },
        {
          "start": 60,
          "value": "size-16",
        },
        {
          "start": 94,
          "value": "size-24",
        },
      ]
    `)

    expect(getClassNames(dedent`
      <div
        className={\`h-20 w-[1px] bg-gradient-to-b mx-auto text-feature-\${feature.title.toLocaleLowerCase()}\`}
        style={
          {
            "--tw-gradient-from": "transparent",
          } as any
        }
      ></div>
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 19,
          "value": "h-20",
        },
        {
          "start": 24,
          "value": "w-[1px]",
        },
        {
          "start": 32,
          "value": "bg-gradient-to-b",
        },
        {
          "start": 49,
          "value": "mx-auto",
        },
      ]
    `)

    expect(getClassNames(dedent`
      <main
        // eslint-disable-next-line tailwindcss/no-custom-classname
        className={cn(
          \`xlog-post-id-\${page?.characterId}-\${page?.noteId}\`,
          "xlog-deprecated-class xlog-post-area max-w-screen-md mx-auto px-5 pt-12 relative",
        )}
      >
      </main>
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 147,
          "value": "xlog-deprecated-class",
        },
        {
          "start": 169,
          "value": "xlog-post-area",
        },
        {
          "start": 184,
          "value": "max-w-screen-md",
        },
        {
          "start": 200,
          "value": "mx-auto",
        },
        {
          "start": 208,
          "value": "px-5",
        },
        {
          "start": 213,
          "value": "pt-12",
        },
        {
          "start": 219,
          "value": "relative",
        },
      ]
    `)

    expect(getClassNames(dedent`
      <div
        className={cn(
          \`\${isMobileLayout ? "pt-16 flex-1" : "flex-1 min-w-0"}\`,
          "bg-white w-full h-full lg:rounded-xl lg:drop-shadow overflow-y-auto",
        )}
      >
        {children}
      </div>
    `)).toMatchInlineSnapshot(`
      [
        {
          "start": 47,
          "value": "pt-16",
        },
        {
          "start": 53,
          "value": "flex-1",
        },
        {
          "start": 64,
          "value": "flex-1",
        },
        {
          "start": 71,
          "value": "min-w-0",
        },
        {
          "start": 88,
          "value": "bg-white",
        },
        {
          "start": 97,
          "value": "w-full",
        },
        {
          "start": 104,
          "value": "h-full",
        },
        {
          "start": 111,
          "value": "lg:rounded-xl",
        },
        {
          "start": 125,
          "value": "lg:drop-shadow",
        },
        {
          "start": 140,
          "value": "overflow-y-auto",
        },
      ]
    `)
  })
})
