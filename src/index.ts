/**
 * @nrbx/sentry-plugin
 * A Sentry SDK for Roblox TypeScript projects, ported from devSparkle/sentry-roblox.
 *
 * @example
 * ```ts
 * import SentrySDK from "@nrbx/sentry-plugin";
 *
 * SentrySDK.init({
 *   DSN: "https://your-key@sentry.io/project-id",
 *   Environment: "production",
 *   Release: "1.0.0",
 *   SampleRate: 1.0,
 * });
 *
 * SentrySDK.captureMessage("Hello, Sentry!");
 *
 * try {
 *   riskyOperation();
 * } catch (err) {
 *   SentrySDK.captureException(tostring(err));
 * }
 *
 * SentrySDK.configureScope((scope) => {
 *   scope.setTag("feature", "combat");
 *   scope.setUser(somePlayer);
 * });
 * ```
 *
 * @packageDocumentation
 */

import { RunService } from '@rbxts/services';
import type { Hint, Integration, SentryEvent, SentryOptions } from './Defaults';
import { DEFAULT_OPTIONS, mergeOptions } from './Defaults';
import { Hub } from './Hub';
import { Scope } from './Hub/Scope';
import { Transport } from './Transport';

const SENTRY_PROTOCOL_VERSION = 7;
const SENTRY_CLIENT = `sentry.roblox/1.0.0`;
const currentHub = new Hub();

export function init(options?: SentryOptions): void {
	if (!options) return;
	if (!options.DSN) return warn('[SentrySD] No DSN provided. Sentry will not be initialized.');
	if (!RunService.IsServer()) return warn('[SentrySDK] Sentry must be initialized from the server.');

	const mergedOptions = mergeOptions(DEFAULT_OPTIONS, options);
	currentHub.options = mergedOptions;
	Transport.init(mergedOptions, SENTRY_PROTOCOL_VERSION, SENTRY_CLIENT);
	currentHub.configureScope((scope) => {
		scope.server_name = mergedOptions.ServerName;
		scope.logger = 'server';
		scope.release = mergedOptions.Release;
		scope.environment = mergedOptions.Environment;
		scope.dist = tostring(game.PlaceVersion);
	});
	loadIntegrations(mergedOptions);
}

function loadIntegrations(options: SentryOptions): void {
	const integrationsFolder = script.Parent?.WaitForChild('Integrations');
	if (options.DefaultIntegrations && integrationsFolder)
		for (const child of integrationsFolder.GetChildren()) {
			if (!child.IsA('ModuleScript')) continue;
			const integration = require(child) as Integration;
			if (integration.SetupOnce !== undefined)
				task.spawn(() =>
					integration.SetupOnce((processor) => Scope.addGlobalEventProcessor(processor), currentHub)
				);
		}
}

export function getCurrentHub(): Hub {
	return currentHub;
}
export function captureEvent(event: SentryEvent, hint?: Hint): void {
	currentHub.captureEvent(event, hint);
}
export function captureMessage(message: string, level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'): void {
	currentHub.captureMessage(message, level);
}
export function captureException(errorMessage?: string): undefined | ((...args: unknown[]) => void) {
	return currentHub.captureException(errorMessage);
}
export function configureScope(callback: (scope: Scope) => void): Hub {
	return currentHub.configureScope(callback);
}
export function pushScope(): LuaTuple<[Hub, () => void]> {
	return currentHub.pushScope();
}
export function popScope(): Hub {
	return currentHub.popScope();
}
export function setUser(player: Player | number | undefined): void {
	currentHub.scope.setUser(player);
}
export function setTag(key: string, value: string): void {
	currentHub.scope.setTag(key, value);
}
export function setExtra(key: string, value: string | number | boolean): void {
	currentHub.scope.setExtra(key, value);
}
export function setFingerprint(fingerprint: string[]): void {
	currentHub.scope.setFingerprint(fingerprint);
}
export function startSession(): void {
	currentHub.startSession();
}
export function endSession(): void {
	currentHub.endSession();
}

export type {
	Hint,
	Integration,
	SentryEvent,
	SentryException,
	SentryOptions,
	SentryStackFrame,
	SentryUser,
} from './Defaults';
export { Hub } from './Hub';
export { Client } from './Hub/Client';
export { Scope } from './Hub/Scope';
export { Transport } from './Transport';
