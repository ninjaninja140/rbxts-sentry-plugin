<div align="center" id="top">
    <img src="https://github.com/nn140/Branding/blob/main/LogoWhite-Full.png?raw=true" alt="NN140.UK logo" width="800"/>
    <img src="https://github.com/nn140/Branding/blob/main/LogoBlack-Full.png?raw=true" alt="NN140.UK logo" width="800"/>
    <br />
    <br />
    <img src="https://img.shields.io/badge/Stripe-Donate%20to%20support%20NN140.UK-1b1b1b?style=for-the-badge&labelColor=6860ff&logo=stripe&logoColor=ffffff&logoSize=auto&link=https%3A%2F%2Fdonate.stripe.com%2F9B6eVdbTd4n1a6H1yXa3u04&link=https%3A%2F%2Fdonate.stripe.com%2F9B6eVdbTd4n1a6H1yXa3u04" alt="Badge">
    <img src="https://img.shields.io/badge/Stripe-Donate%20to%20Support%20NN140.UK%20(RECCURING)-1b1b1b?style=for-the-badge&labelColor=6860ff&logo=stripe&logoColor=ffffff&logoSize=auto&link=https%3A%2F%2Fdonate.stripe.com%2FdRm9ATe1laLpgv5b9xa3u05&link=https%3A%2F%2Fdonate.stripe.com%2FdRm9ATe1laLpgv5b9xa3u05" alt="Badge">
</div>

<hr />

## @nrbx/sentry-plugin

A Sentry SDK for Roblox TypeScript projects, ported from [devSparkle/sentry-roblox](https://github.com/devSparkle/sentry-roblox).

## Installation

```bash
yarn add @nrbx/sentry-plugin
npm install @nrbx/sentry-plugin
pnpm add @nrbx/sentry-plugin
```

Then add the following to your Rojo project file, under your `node_modules` configuration.

```json
"node_modules": {
  "$className": "Folder",
  "@rbxts": {
    "$path": "node_modules/@rbxts"
  },
  "@nrbx": {
    "$path": "node_modules/@nrbx"
  }
}
```

## Quick Start

```ts
import SentrySDK from "@nrbx/sentry-plugin";

// Initialize on the server (game.ServerScriptService)
SentrySDK.init({
	DSN: "https://your-key@sentry.io/project-id",
	Environment: "production",
	Release: "1.0.0",
});

// That's it! The SDK now automatically captures:
//  ✓ All script runtime errors (with stack traces)
//  ✓ All warnings (from warn(), LogService, etc.)
//  ✓ Player names are scrubbed for privacy
```

## Automatic Error Capture

Once initialized, the SDK **automatically** captures the following without any additional code:

| Source | Level | Enabled by default |
|--------|-------|-------------------|
| Script runtime errors (`ScriptContext.Error`) | `error` | ✅ Yes |
| Warnings (`warn()`, `LogService.MessageOut`) | `warning` | ✅ Yes |
| Stack traces | attached to errors | ✅ Yes |
| Print messages (`print()`) | `info` | ❌ Opt-in |
| Debug output | `debug` | ❌ Opt-in |

To control what gets captured:

```ts
SentrySDK.init({
	DSN: "...",
	CaptureErrors: true,    // default: true  — script runtime errors
	CaptureWarnings: true,  // default: true  — warnings
	CaptureInfos: false,    // default: false — print() messages (noisy)
	CaptureDebugs: false,   // default: false — debug output (very noisy)
});
```

## API

### init(options)

Initialize the Sentry SDK. Must be called on the server.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `DSN` | `string` | — | **Required.** Your Sentry project DSN |
| `Debug` | `boolean` | `false` | Enable debug logging |
| `Environment` | `string` | `"production"` / `"studio"` | Environment name |
| `Release` | `string` | `game.Name#placeId@version` | Release identifier |
| `ServerName` | `string` | `game.JobId` | Server identifier |
| `SampleRate` | `number` | `1.0` | Sampling rate (0.0–1.0) |
| `SendDefaultPII` | `boolean` | `false` | Send player names and IDs |
| `SendClientEvents` | `boolean` | `true` | Accept events from clients |
| `SendStudioEvents` | `boolean` | `false` | Send events in Studio |
| `DefaultIntegrations` | `boolean` | `true` | Enable built-in integrations |
| `MaxBreadcrumbs` | `number` | `100` | Max breadcrumbs to store |
| `AttachStacktrace` | `boolean` | `false` | Attach stack traces |
| `WithLocals` | `boolean` | `true` | Include local variables |
| `CaptureErrors` | `boolean` | `true` | Auto-capture ScriptContext runtime errors |
| `CaptureWarnings` | `boolean` | `true` | Auto-capture LogService warnings |
| `CaptureInfos` | `boolean` | `false` | Auto-capture print/info messages |
| `CaptureDebugs` | `boolean` | `false` | Auto-capture debug/output messages |
| `ShutdownTimeout` | `number` | `2` | Timeout for graceful shutdown |
| `BeforeSend` | `(event, hint) => event` | — | Filter events before sending |

By default, the SDK **automatically captures** all script errors, warnings, and stack traces.
No manual setup required — just call `init()` and you're done.

### captureMessage(message, level?)

Capture a message event.

```ts
SentrySDK.captureMessage("User logged in", "info");
SentrySDK.captureMessage("Rate limit approaching", "warning");
```

### captureException(errorMessage?)

Capture an exception. Can also be used as an error handler:

```ts
// Direct call
SentrySDK.captureException("Failed to process payment");

// As error handler
const [success, result] = pcall(riskyFunction, SentrySDK.captureException());
```

### configureScope(callback)

Modify the current scope with context data:

```ts
SentrySDK.configureScope((scope) => {
	scope.setTag("feature", "combat");
	scope.setExtra("player_health", 100);
	scope.setUser(somePlayer);
});
```

### Scope API

| Method | Description |
|--------|-------------|
| `setUser(player)` | Set user (Player instance or UserId) |
| `setTag(key, value)` | Add a tag |
| `setTags(dict)` | Add multiple tags |
| `setExtra(key, value)` | Add extra context |
| `setExtras(dict)` | Add multiple extra values |
| `setLevel(level)` | Override event level |
| `setFingerprint(keys)` | Set deduplication fingerprint |
| `setContext(key, value)` | Set context data |
| `setTransaction(name)` | Set transaction name |
| `addEventProcessor(fn)` | Add custom event processor |
| `clear()` | Reset scope to defaults |
| `clone()` | Deep-copy the scope |

### pushScope() / popScope()

Create temporary scopes:

```ts
const [hub, pop] = SentrySDK.pushScope();
hub.configureScope((s) => s.setTag("request_id", "abc"));
// ... handle request ...
pop();
```

### startSession() / endSession()

Track user sessions for health/replay:

```ts
SentrySDK.startSession();
// ... game logic ...
SentrySDK.endSession();
```

## Built-in Integrations

| Integration | Description |
|-------------|-------------|
| `ScriptContextError` | Captures Roblox ScriptContext errors |
| `LogServiceMessageOut` | Captures `LogService.MessageOut` warnings |
| `StackProcessor` | Converts raw tracebacks to Sentry stack frames |
| `PlayerNameScrubber` | Scrubs player names for privacy |
| `TrackSessions` | Tracks player join/leave sessions |
| `SentryClientRelay` | Relays client events to server |

## Development

```bash
# Install dependencies
yarn install

# Type-check
yarn build

# Lint
yarn biome
```

## License

MIT

<hr />

<div align="center" id="top">
    <img src="https://img.shields.io/badge/Stripe-Donate%20to%20support%20NN140.UK-1b1b1b?style=for-the-badge&labelColor=6860ff&logo=stripe&logoColor=ffffff&logoSize=auto&link=https%3A%2F%2Fdonate.stripe.com%2F9B6eVdbTd4n1a6H1yXa3u04&link=https%3A%2F%2Fdonate.stripe.com%2F9B6eVdbTd4n1a6H1yXa3u04" alt="Badge">
    <img src="https://img.shields.io/badge/Stripe-Donate%20to%20Support%20NN140.UK%20(RECCURING)-1b1b1b?style=for-the-badge&labelColor=6860ff&logo=stripe&logoColor=ffffff&logoSize=auto&link=https%3A%2F%2Fdonate.stripe.com%2FdRm9ATe1laLpgv5b9xa3u05&link=https%3A%2F%2Fdonate.stripe.com%2FdRm9ATe1laLpgv5b9xa3u05" alt="Badge">
    <br />
    <br />
    <img src="https://github.com/nn140/Branding/blob/main/LogoBlack-Full.png?raw=true" alt="NN140.UK logo" width="800"/>
    <img src="https://github.com/nn140/Branding/blob/main/LogoWhite-Full.png?raw=true" alt="NN140.UK logo" width="800"/>
</div>
