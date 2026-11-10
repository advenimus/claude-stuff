# claude-stuff

My Claude Code add-ons, kept in one place. Each one installs from this repository with one line.

| Kind | Status |
| --- | --- |
| [Mods](#mods) | Available |
| [Plugins](#plugins) | Coming soon |
| [Skills](#skills) | Coming soon |
| [Agents and hooks](#agents-and-hooks) | Coming soon |

## Mods

A mod changes how Claude Code looks or behaves, for example a bar above the prompt box. Mods need a Claude Code version that supports them. They draw in the terminal and the desktop app. They do not draw in the VS Code extension.

### prompt-enhancer

A bar above the prompt box that improves your draft before you send it. It never sends anything on its own.

- **Enhance:** rewrites your draft using your CLAUDE.md files, the start of the README, package.json, git state, recent chat messages and the skills that match your words. The new version lands in the prompt box. You read it, then press Enter or Send.
- **Questions:** if the draft has gaps, it asks up to three pick-one questions first. Your answers go into the rewrite as decisions already made. You can skip them.
- **Undo:** puts your original draft back.
- **Send:** sends what is in the box.
- **Reset:** clears the questions, answers and status. The bar also resets by itself when you send a prompt.
- **Gear:** opens settings. Pick the model (follow your session, Haiku, Sonnet or Opus), and turn questions or project files on or off. Choices are saved between sessions.
- **Theme:** the bar uses your Claude Code theme colors, so it fits light and dark mode.

**Cost and privacy.** Each Enhance makes one extra model call, and one more when it asks questions. By default it sends your draft, project files and recent chat messages to the model you picked. Turn off "Send project files" in the gear to stop sending project files.

**Install**

At the prompt of a terminal session:

```text
/plugin install prompt-enhancer --marketplace advenimus/claude-stuff
```

From a shell:

```sh
claude plugin install prompt-enhancer --marketplace advenimus/claude-stuff
```

In the desktop app, `/plugin` does not run. Click + next to the prompt box, then Plugins, then Add marketplace with `advenimus/claude-stuff`, then Add plugin.

A mod is code that runs with your permissions and can see your prompts. Read the source in [mods/prompt-enhancer](mods/prompt-enhancer) before you install it.

## Plugins

Coming soon.

## Skills

Coming soon.

## Agents and hooks

Coming soon.
