# Error.exe

Error.exe is a vintage desktop computer companion for Visual Studio Code. It watches workspace diagnostics and changes its screen, expression, and status as issues appear and disappear.

The companion is available in two places: as an independently collapsible **secondary view below the file tree in Explorer**, and as a dedicated **Error.exe Activity Bar view** containing only the companion. Both views show the same live state and controls.

## Features

- Monitors VS Code diagnostics across workspace folders and supported languages.
- Counts errors and warnings separately; informational messages and hints do not affect its state.
- Uses the supplied computer artwork for success, warning, multiple-error, and overload states.
- Celebrates successful builds and test runs with temporary achievement illustrations.
- Recognizes supported ML evaluation metrics and configurable project-specific output patterns.
- Shows live counts and contextual screen messages; messages rotate only while the view is visible.
- Opens the Problems view from the computer or diagnostic counts.
- Supports refresh, pause/resume, reset, and show/hide commands.
- Includes settings for warning behavior, message rotation, animation, and refresh interval.

## Screenshots

No screenshots of the running extension are available yet. The state artwork used by the companion is included in [`assets/`](assets/).

## Installation

The extension is not yet published to the Visual Studio Marketplace. To run it from source:

1. Clone or download this repository.
2. Run `npm install`.
3. Run `npm run compile`.
4. Open the project in VS Code and press **F5** to launch the Extension Development Host.

## Commands

| Command | Description |
| --- | --- |
| `Error.exe: Show Companion` | Enable the views and reveal the dedicated Error.exe Activity Bar view. |
| `Error.exe: Hide Companion` | Disable and hide the view. |
| `Error.exe: Toggle Companion` | Toggle the companion's visibility. |
| `Error.exe: Refresh Diagnostics` | Recount current workspace diagnostics. |
| `Error.exe: Pause Reactions` | Pause automatic visual updates and message rotation. |
| `Error.exe: Resume Reactions` | Resume updates with the latest diagnostic counts. |
| `Error.exe: Reset Companion` | Resume reactions and immediately refresh diagnostics. |

Clicking the computer opens Problems. Clicking either count opens Problems focused on that severity.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `errorExe.enabled` | `true` | Show the companion in both the Explorer and Activity Bar views. |
| `errorExe.showWarnings` | `true` | Let warnings influence the character's state. Warning counts remain visible when disabled. |
| `errorExe.messageRotation` | `true` | Rotate contextual messages while the view is visible. |
| `errorExe.animationEnabled` | `true` | Enable subtle screen effects. |
| `errorExe.refreshInterval` | `30` | Seconds between message rotations (5–3600). |
| `errorExe.testAccuracyThreshold` | `0.80` | Model metric must be strictly greater than this decimal threshold (0–1). |
| `errorExe.achievementDuration` | `8` | Seconds to display each queued achievement (2–60). |
| `errorExe.enableBuildAchievements` | `true` | Enable successful build, compile, training, and export celebrations. |
| `errorExe.enableTestAchievements` | `true` | Enable successful test and evaluation celebrations. |
| `errorExe.customMetricPatterns` | `[]` | Regex patterns for custom evaluation output; each must capture named groups `metric` and `value`. |

The Explorer view coexists with the file tree. Select the Error.exe Activity Bar icon to open the dedicated companion view; neither view replaces the other.

## How diagnostic monitoring works

Error.exe uses `vscode.languages.onDidChangeDiagnostics` and `vscode.languages.getDiagnostics()` rather than polling. It also refreshes on document open, edit, save, and close events. Only diagnostics for open documents in workspace folders are counted. Exact duplicate diagnostics are counted once. Errors and warnings are counted separately; information and hint severities are ignored.

The state rules are:

- **Success:** no errors and no warnings that are enabled to influence state.
- **Warning:** one error, or warnings with no errors when warnings are enabled.
- **Multiple errors:** two to five errors.
- **System overload:** six or more errors.

Warnings alone never trigger overload. The overload screen's CPU-temperature text is a visual joke; the extension does not inspect hardware temperatures.

## Build, test, and model achievements

Achievements temporarily overlay the current diagnostic illustration. Diagnostic counts and state continue updating underneath; when the animation ends, Error.exe returns to the **latest** diagnostic state. Achievements queue in order and each completed event is celebrated once.

Successful process-backed VS Code tasks are detected through `vscode.tasks.onDidEndTaskProcess`. Build/Test task groups are preferred; otherwise recognized build, compile, test, and evaluation task names are used. A zero exit code is required. Integrated-terminal commands can also be detected when VS Code shell integration is available; unrecognized or unsuccessful commands do not produce achievements. Tasks with custom executions that do not report a process exit code cannot be confirmed.

For TensorFlow/Keras, PyTorch, and scikit-learn workflows, Error.exe can inspect a bounded amount of output from completed shell-integrated Python, Jupyter, and related interpreter commands. It recognizes `accuracy`, `test_accuracy`, and `val_accuracy`, accepts decimal values (`0.85`) and percentages (`85%`), and only celebrates results strictly above `errorExe.testAccuracyThreshold`. A generic `accuracy` result must come from an evaluation/test-like command. `val_accuracy` is shown as a **validation** result and is never described as test accuracy. Epoch output alone does not trigger an achievement; a qualifying metric must be present when the command completes successfully.

Custom patterns should be JavaScript regular expressions with named captures, for example:

```json
"errorExe.customMetricPatterns": [
  "(?<metric>macro_f1)\\s*[:=]\\s*(?<value>\\d+(?:\\.\\d+)?%?)"
]
```

Output metric detection requires VS Code shell integration and a recognized interpreter command. Task execution APIs expose exit codes but not arbitrary task output. VS Code's Test Explorer does not expose a global event for other extensions' test runs, so tests must run through a process-backed Test task or a shell-integrated, recognized test command. Notebook-cell output and unsupported/custom execution providers cannot be observed. Custom regexes are applied to a bounded output buffer; they are not executed against arbitrary files or uploaded anywhere.

All six computer illustrations are included in [`assets/computer/`](assets/computer/). If an achievement illustration is unavailable at runtime, the webview falls back to the corresponding diagnostic illustration.

## Supported platforms

Windows, Linux, and macOS with a compatible Visual Studio Code version. The extension uses the built-in VS Code API and introduces no runtime dependencies.

## Development

- `npm run compile` — type-check, lint, and bundle the extension.
- `npm test` — compile and run the VS Code extension tests.

## Contributing

Issues and pull requests are welcome. Please keep changes focused, include tests for behavior changes, and update the documentation when user-facing behavior changes.
