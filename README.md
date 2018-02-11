# VS Code Auto Attach

The VS Code Auto Attach extensions shows all child processes of VS Code in a custom view in the VS Code Explorer.

From the context menu of a process node you can terminate the process or attach a debugger to it.

## Installing VS Code Auto Attach

This extension is still a prototype and so it is not yet available on the Marketplace but you can easily build the vsix with these commands:

```
  git clone https://github.com/weinand/vscode-auto-attach
  cd vscode-auto-attach
  npm install
  npm run package
```

Then use VS Code's **Install from VSIX...** command to install the extension.

## Using VS Code Auto Attach

