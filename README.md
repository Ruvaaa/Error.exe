# Error.exe

**A vintage computer companion for Visual Studio Code.** Error.exe watches workspace diagnostics, reacts to successful builds and tests, and keeps its latest diagnostic state up to date.

It is available in two places:

- **Explorer:** an independently collapsible view below the file tree.
- **Activity Bar:** a dedicated Error.exe view containing only the companion.

Both views show the same state and controls.

## Features

- Displays success, warning, multiple-error, and system-overload states.
- Shows workspace error and warning counts and opens the corresponding Problems view.
- Celebrates successful process-backed build and test tasks with temporary artwork.
- Detects selected model evaluation metrics from supported shell-integrated output.
- Lets you configure a model-metric threshold and add project-specific metric patterns.
- Offers refresh, pause/resume, reset, and visibility commands.

## Install

When published, install **Error.exe** from the Visual Studio Marketplace by searching for its name in the Extensions view.

To install a locally packaged VSIX:

```sh
code --install-extension error-exe-0.0.1.vsix
```

## Use

Open the **Error.exe** icon in the Activity Bar, or expand the **Error.exe** view in Explorer. Click the computer to open Problems; click an error or warning count to focus Problems on that severity.

Use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to run:

| Command | Description |
| --- | --- |
| `Error.exe: Show Companion` | Enable Error.exe and open its Activity Bar view. |
| `Error.exe: Hide Companion` | Hide Error.exe from Explorer and the Activity Bar. |
| `Error.exe: Toggle Companion` | Toggle Error.exe visibility. |
| `Error.exe: Refresh Diagnostics` | Recount current workspace diagnostics. |
| `Error.exe: Pause Reactions` | Pause automatic visual updates and message rotation. |
| `Error.exe: Resume Reactions` | Resume reactions using the latest diagnostics. |
| `Error.exe: Reset Companion` | Resume reactions and refresh diagnostics. |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `errorExe.enabled` | `true` | Show Error.exe in Explorer and the Activity Bar. |
| `errorExe.showWarnings` | `true` | Let warnings affect the displayed state. Counts remain visible when disabled. |
| `errorExe.messageRotation` | `true` | Rotate contextual messages while a view is visible. |
| `errorExe.animationEnabled` | `true` | Enable subtle screen effects. |
| `errorExe.refreshInterval` | `30` | Seconds between message rotations (5–3600). |
| `errorExe.testAccuracyThreshold` | `0.80` | Required model metric threshold. The metric must be strictly greater (0–1). |
| `errorExe.achievementDuration` | `8` | Seconds each queued achievement is displayed (2–60). |
| `errorExe.enableBuildAchievements` | `true` | Celebrate successful build, compile, training, or export tasks and commands. |
| `errorExe.enableTestAchievements` | `true` | Celebrate successful test tasks and qualifying evaluation results. |
| `errorExe.customMetricPatterns` | `[]` | JavaScript regex patterns with named `metric` and `value` capture groups. |

## Diagnostic states

Error.exe uses VS Code's diagnostics API and document events; it does not poll. It counts diagnostics for open documents in workspace folders, counting exact duplicates once. Informational messages and hints do not affect the state.

| State | Condition |
| --- | --- |
| **Success** | No errors and no enabled warnings. |
| **Warning** | One error, or warnings with no errors when warning reactions are enabled. |
| **Multiple errors** | Two to five errors. |
| **System overload** | Six or more errors. |

Warnings alone never cause system overload. The temperature readout in the overload artwork is decorative; Error.exe does not inspect hardware.

## Build, test, and model achievements

Achievements temporarily overlay the current diagnostic illustration. Diagnostic monitoring continues underneath, and the latest diagnostic state is restored after the achievement. Multiple achievements are queued, and duplicate events are suppressed.

Successful process-backed VS Code tasks are detected through the Tasks API. Build and Test task groups are preferred; otherwise, recognized task names are used. A zero exit code is required. Integrated-terminal detections require VS Code shell integration. Failed or unrecognized commands do not trigger achievements. Custom task providers that do not report a process exit code cannot be confirmed.

For TensorFlow/Keras, PyTorch, and scikit-learn workflows, Error.exe can inspect bounded output from completed, recognized shell-integrated Python, Jupyter, and related interpreter commands. Built-in metric names are `accuracy`, `test_accuracy`, and `val_accuracy`. Values can be decimals (`0.85`) or percentages (`85%`), and must be strictly above `errorExe.testAccuracyThreshold`. A generic `accuracy` metric requires test/evaluation context. Validation accuracy is shown as validation accuracy, not test accuracy. Training epoch output by itself does not trigger an achievement.

To recognize another output format, add JavaScript regex patterns with named `metric` and `value` groups:

```json
"errorExe.customMetricPatterns": [
  "(?<metric>macro_f1)\\s*[:=]\\s*(?<value>\\d+(?:\\.\\d+)?%?)"
]
```

Detection is best-effort, not universal. VS Code exposes task exit codes but not arbitrary task output, and it has no global API for observing other extensions' Test Explorer runs. Notebook-cell output, unsupported task providers, and output that does not match a recognized command or metric format cannot be detected. Custom patterns run only against a bounded terminal-output buffer; Error.exe does not scan project files or upload output.

## Development

Requirements: Node.js and npm, plus a compatible Visual Studio Code version.

```sh
npm install
npm run compile
npm test
```

Open the project in VS Code and press **F5** to launch the Extension Development Host. `npm run package` performs the production type-check, lint, and bundle used by `vscode:prepublish`.

## Artwork

The six companion illustrations and Activity Bar icon are in [`assets/`](assets/). The webview uses fallback artwork if an achievement image cannot be loaded.

## License

This project is distributed under the [MIT License](LICENSE).

## Feedback

Report bugs and request features in the [GitHub issue tracker](https://github.com/Ruvaaa/Error.exe/issues).
