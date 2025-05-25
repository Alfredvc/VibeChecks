![Vibe checks logo](assets/logo.png)

**Natural-Language Linter for Your Codebase**

Vibe Checks lets you define review rules in plain Markdown and then uses GitHub Copilot to enforce them—no more wrestling with arcane config files. Think of it as a _**vibe check**_ for your code: set the mood, set the rules, and let Copilot do the rest.

---

## Getting Started

### Requirements
You must have Github Copilot configured in your VSCode.

### 1. Install the Extension

- Install "Vibe Checks" from the VSCode Marketplace or load as a development extension.

### 2. Configure Your Language Model

- Run `Vibe Checks: Choose Model` from the Command Palette (`Ctrl+Shift+P`)
- Select your preferred language model
- The model is saved in your workspace settings

### 3. Add Review Instructions

- Create a `.vibe-checks` folder in your workspace root (or set a custom path)
- Add one or more `.md` files with your review rules
- You can organize rules by topic (e.g., `style-guide.md`, `security.md`)
- Use markdown headings (e.g., `## JavaScript/TypeScript`) for language-specific rules

**Example: `.vibe-checks/style-guide.md`**
```markdown
# Code Style Guidelines

## JavaScript/TypeScript
- Use camelCase for variables and functions
- Use PascalCase for classes and interfaces
- Always use semicolons
- Maximum line length of 100 characters
```

---

## Usage

- **Manual Check**: Run `Vibe Checks: Vibe check file` to check the active file
- **Automatic Check**: Configure checks to run
- **File explorer**: Simply right click a file and `Vibe check file`

## Configuration

Configure via VSCode settings (`.vscode/settings.json` or Command Palette):

```json
{
  "vibeChecks.instructionsFolder": "${workspaceFolder}/.vibe-checks",
  "vibeChecks.modelId": "copilot-gpt-4",
  "vibeChecks.inEditorFeedback": true,
  "vibeChecks.runOn": "onCommand", // or "onSave", "onOpen", "onChange"
  "vibeChecks.scope": "wholeFile" // or "changedLines"
}
```

**Settings:**
- `vibeChecks.instructionsFolder`: Path to your markdown instruction files
- `vibeChecks.modelId`: ID of the language model to use
- `vibeChecks.inEditorFeedback`: Show feedback as diagnostics in the editor
- `vibeChecks.runOn`: When to run checks (`onCommand`, `onSave`, `onOpen`, `onChange`)
- `vibeChecks.scope`: Check the whole file or only changed lines

---

## How It Works

1. **Instruction Gathering**: Reads and concatenates all markdown files in your instructions folder
2. **Diff Analysis**: Captures git diffs (staged/unstaged) or file content
3. **AI Review**: Sends instructions and diff to your configured language model
4. **Result Processing**: Parses the AI's JSON response for pass/fail, errors, and warnings
5. **User Feedback**: Displays results in the output panel, notifications, and as diagnostics
6. **Caching**: Skips re-analysis if nothing has changed

---

## Example Instruction Files

**`.vibe-checks/security.md`**
```markdown
# Security Guidelines
- Never commit API keys, passwords, or secrets
- Use environment variables for sensitive data
- Validate all user inputs
- Use parameterized queries for database operations
```

**`.vibe-checks/performance.md`**
```markdown
# Performance Guidelines
- Avoid nested loops where possible
- Use efficient data structures
- Consider lazy loading for large datasets
- Profile database queries for optimization opportunities
```

---
## From the context menu
![ContextMenuExample](assets/context-menu.png)

---

## Commands

- `Vibe Checks: Vibe check file` — Run check on the active file
- `Vibe Checks: Choose Model` — Select a language model
- `Vibe Checks: Clear Vibe Checks Cache` — Clear cached results

---

## Features

- [x] **Customizable Review Criteria**: Define your own review rules in markdown files
- [x] **In-Editor Feedback**: Errors and warnings appear as diagnostics in the editor
- [x] **Smart Caching**: Avoids redundant analysis by caching results
- [x] **Automatic Triggers**: Run checks on command, save, open, or change
- [x] **Model Selection**: Easily choose from available language models
- [ ] **Check all changes since last commit**: Soon!
- [ ] **Check multiple files at once**: 

---

## Troubleshooting

- **"Language Model API not available"**: Update VSCode and ensure you have access to language models (e.g., Copilot subscription)
- **"Instructions folder not found"**: Create `.vibe-checks` in your workspace.
- **"No instructions found"**: Add at least one `.md` instruction file to your `.vibe-checks`.
- **Model not found**: Use `Vibe Checks: Choose Model` to select an available model

---

## Development

1. Clone the repository
2. Run `npm install`
3. Open in VSCode and press F5 to launch the development host
4. Edit `src/extension.ts` and reload to test changes

---

## License

MIT License — see [License](LICENSE) file for details.