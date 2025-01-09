import { computed, defineConfigs, defineLogger, useWorkspaceFolders } from 'reactive-vscode'

export const {
  enableHoverProvider,
  textDecoration,
} = defineConfigs(
  'tailwindcss-classname-highlight',
  {
    enableHoverProvider: Boolean,
    textDecoration: String,
  },
)

export const logger = defineLogger('Tailwind CSS ClassName Highlight')

export function useWorkspaceFsPath() {
  const folders = useWorkspaceFolders()
  return computed(() => folders.value?.[0]?.uri.fsPath ?? '')
}
