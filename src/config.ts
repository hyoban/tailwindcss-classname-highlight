import { defineConfigs } from 'reactive-vscode'

export const { enableHoverProvider } = defineConfigs(
  'tailwindcss-classname-highlight',
  {
    enableHoverProvider: Boolean,
  },
)
