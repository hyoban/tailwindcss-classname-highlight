import fs from "node:fs";
import path from "node:path";

import fg from "fast-glob";
import { getPackageInfo, resolveModule } from "local-pkg";
import * as vscode from "vscode";

import { DecorationV3 } from "./decoration-v3";
import { DecorationV4 } from "./decoration-v4";

export async function activate(extContext: vscode.ExtensionContext) {
  const workspacePath =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (!workspacePath) return;
  const logger = vscode.window.createOutputChannel(
    "Tailwind CSS ClassName Highlight",
  );
  const decorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: "none; border-bottom: 1px dashed;",
  });
  extContext.subscriptions.push(logger, decorationType);

  const tailwindcssPackageInfo = await getPackageInfo("tailwindcss", {
    paths: [workspacePath],
  });
  if (!tailwindcssPackageInfo?.version || !tailwindcssPackageInfo?.rootPath) {
    logger.appendLine("Tailwind CSS package not found");
    return;
  }
  logger.appendLine(
    `Detected Tailwind CSS version: ${tailwindcssPackageInfo.version}`,
  );

  const isV4 = tailwindcssPackageInfo.version.startsWith("4");

  const tailwindcssPackageEntry = resolveModule("tailwindcss", {
    paths: [workspacePath],
  });
  if (!tailwindcssPackageEntry) {
    logger.appendLine("Tailwind CSS package entry not found");
    return;
  }

  let tailwindConfigPath = "";
  let cssFilePath = "";

  if (!isV4) {
    const configPath = fg
      .globSync("./**/tailwind.config.{js,cjs,mjs,ts}", {
        cwd: workspacePath,
        ignore: ["**/node_modules/**"],
      })
      .map((p) => path.join(workspacePath, p))
      .find((p) => fs.existsSync(p));
    if (!configPath) {
      logger.appendLine("Tailwind CSS config file not found");
      return;
    }
    logger.appendLine(`Tailwind CSS config file found at ${configPath}`);
    tailwindConfigPath = configPath;
  } else {
    const configPath = fg
      .globSync("./**/*.css", {
        cwd: workspacePath,
        ignore: ["**/node_modules/**"],
      })
      .map((p) => path.join(workspacePath, p))
      .filter((p) => fs.existsSync(p))
      .filter((p) => {
        const content = fs.readFileSync(p, "utf8");
        const tailwindCSSRegex = [
          /^@import "tailwindcss";/,
          /^@import "tailwindcss\/preflight"/,
          /^@import "tailwindcss\/utilities"/,
          /^@import "tailwindcss\/theme"/,
        ];
        return tailwindCSSRegex.some((regex) => regex.test(content));
      });
    if (configPath.length === 0) {
      logger.appendLine("Tailwind CSS config file not found");
      return;
    }
    logger.appendLine(`Tailwind CSS config file found at ${configPath}`);
    cssFilePath = configPath.at(0)!;
  }

  const decoration = isV4
    ? new DecorationV4(
        workspacePath,
        logger,
        decorationType,
        tailwindcssPackageEntry.replaceAll(".mjs", ".js"),
        cssFilePath,
      )
    : new DecorationV3(
        workspacePath,
        logger,
        decorationType,
        path.resolve(tailwindcssPackageEntry, "../../"),
        tailwindConfigPath,
      );

  if (!decoration.checkContext()) return;

  const onReload = () => {
    decoration.updateTailwindContext();
    for (const element of vscode.window.visibleTextEditors)
      decoration.decorate(element);
  };

  const fileWatcher = vscode.workspace.createFileSystemWatcher(
    isV4 ? cssFilePath : tailwindConfigPath,
  );
  fileWatcher.onDidChange(onReload);

  extContext.subscriptions.push(
    vscode.commands.registerCommand(
      "tailwindcss-classname-highlight.reload",
      onReload,
    ),
    fileWatcher,
  );

  const decorate = decoration.decorate.bind(decoration);

  // on activation
  const openEditors = vscode.window.visibleTextEditors;
  for (const element of openEditors) decorate(element);

  // on editor change
  extContext.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(decorate),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "Log") return;
      const openEditor = vscode.window.visibleTextEditors.find(
        (editor) => editor.document.uri === event.document.uri,
      );
      decorate(openEditor);
    }),
  );
}
