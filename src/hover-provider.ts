import type * as vscode from 'vscode'

import type { DecorationV3 } from './decoration-v3'
import type { DecorationV4 } from './decoration-v4'
import { enableHoverProvider } from './state'

export class GeneratedCSSHoverProvider implements vscode.HoverProvider {
  constructor(public decoration: DecorationV3 | DecorationV4) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    if (!enableHoverProvider)
      return
    return this.decoration.hover(document, position)
  }
}
