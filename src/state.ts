import { computed, defineConfig, defineLogger, useWorkspaceFolders } from 'reactive-vscode'

export const {
  enableHoverProvider,
  textDecoration,
} = defineConfig<{
  enableHoverProvider: boolean
  textDecoration: string
}>(
  'tailwindcss-classname-highlight',
)

export const logger = defineLogger('Tailwind CSS ClassName Highlight')

export function useWorkspaceFsPath() {
  const folders = useWorkspaceFolders()
  return computed(() => folders.value?.[0]?.uri.fsPath ?? '')
}
