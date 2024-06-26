# Tailwind CSS ClassName Highlight

<a href="https://marketplace.visualstudio.com/items?itemName=hyoban.tailwindcss-classname-highlight&ssr=false#overview" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/v/hyoban.tailwindcss-classname-highlight.svg?color=eee&amp;label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="Visual Studio Marketplace Version" /></a>

![ScreenShot 2024-02-08 15 11 36](https://github.com/hyoban/tailwindcss-classname-highlight/assets/38493346/81cf883b-67a5-4db8-84b8-f1ae4121a0fc)

Highlight valid Tailwind CSS class names in your code, idea from [UnoCSS VS Code Extension](https://unocss.dev/integrations/vscode)

## Q & A

> [!NOTE]
> You may need reload the plugin after installing dependencies or changing configuration.

### I don't see any highlighting?

- [ ] Ensure [Tailwind](https://tailwindcss.com/docs/installation) is installed.
- [ ] [Tailwind configuration file](https://tailwindcss.com/docs/configuration) exists in workspace.
- [ ] [Content Configuration](https://tailwindcss.com/docs/content-configuration) is set up correctly.

### I see highlighting but some classes should not be highlighted?

This is [how Tailwind works](https://tailwindcss.com/docs/content-configuration#class-detection-in-depth) when detecting in your code. And we have already applied [the same filtering strategy](https://github.com/unocss/unocss/issues/3278) as UnoCSS.

### Does it support Tailwind V4?

Yes, it does.

### Does it work with monorepo?

Yes. It will detect all tailwind configurations in your workspace and use different configurations for different packages.

Currently, it does not support tailwind V4.

### limitation

This extension can not detect valid className that doesn't generate any CSS. Like `group`, `prose`.
