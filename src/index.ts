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

import type { Hint, Integration, SentryEvent, SentryOptions } from './Defaults';
import type { Hub } from './Hub';
import type { Scope } from './Hub/Scope';

function _getMod(name: string): ModuleScript {
	return assert(script.FindFirstChild(name), `[SentrySDK] Missing module: ${name}`) as unknown as ModuleScript;
}
const _DefaultsMod = require(_getMod('Defaults')) as typeof import('./Defaults');
const { DEFAULT_OPTIONS, mergeOptions } = _DefaultsMod;
const _HubMod = require(_getMod('Hub')) as typeof import('./Hub');
const _Hub = _HubMod.Hub;
const _hubFolder = _getMod('Hub');
const _ScopeMod = require(
	assert(_hubFolder.FindFirstChild('Scope'), '[SentrySDK] Missing module: Hub/Scope') as unknown as ModuleScript
) as typeof import('./Hub/Scope');
const _Scope = _ScopeMod.Scope;
const _TransportMod = require(_getMod('Transport')) as typeof import('./Transport');
const _Transport = _TransportMod.Transport;
const _ClientMod = require(
	assert(_hubFolder.FindFirstChild('Client'), '[SentrySDK] Missing module: Hub/Client') as unknown as ModuleScript
) as typeof import('./Hub/Client');

const RunService = game.GetService('RunService');

const SENTRY_PROTOCOL_VERSION = 7;
const SENTRY_CLIENT = `sentry.roblox/1.0.0`;
const currentHub = new _Hub();

function init(options?: SentryOptions): void {
	if (!options) return;
	if (!options.DSN) return warn('[SentrySD] No DSN provided. Sentry will not be initialized.');
	if (!RunService.IsServer()) return warn('[SentrySDK] Sentry must be initialized from the server.');

	const mergedOptions = mergeOptions(DEFAULT_OPTIONS, options);
	currentHub.options = mergedOptions;
	_Transport.init(mergedOptions, SENTRY_PROTOCOL_VERSION, SENTRY_CLIENT);
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
	const integrationsFolder = script.FindFirstChild('Integrations');
	if (options.DefaultIntegrations && integrationsFolder)
		for (const child of integrationsFolder.GetChildren()) {
			if (!child.IsA('ModuleScript')) continue;
			const integration = require(child) as Integration;
			if (integration.SetupOnce !== undefined)
				task.spawn(() =>
					integration.SetupOnce((processor) => _Scope.addGlobalEventProcessor(processor), currentHub)
				);
		}
}

function getCurrentHub(): Hub {
	return currentHub;
}
function captureEvent(event: SentryEvent, hint?: Hint): void {
	currentHub.captureEvent(event, hint);
}
function captureMessage(message: string, level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'): void {
	currentHub.captureMessage(message, level);
}
function captureException(errorMessage?: string): undefined | ((...args: unknown[]) => void) {
	return currentHub.captureException(errorMessage);
}
function configureScope(callback: (scope: Scope) => void): Hub {
	return currentHub.configureScope(callback);
}
function pushScope(): LuaTuple<[Hub, () => void]> {
	return currentHub.pushScope();
}
function popScope(): Hub {
	return currentHub.popScope();
}
function setUser(player: Player | number | undefined): void {
	currentHub.scope.setUser(player);
}
function setTag(key: string, value: string): void {
	currentHub.scope.setTag(key, value);
}
function setExtra(key: string, value: string | number | boolean): void {
	currentHub.scope.setExtra(key, value);
}
function setFingerprint(fingerprint: string[]): void {
	currentHub.scope.setFingerprint(fingerprint);
}
function startSession(): void {
	currentHub.startSession();
}
function endSession(): void {
	currentHub.endSession();
}

const SentrySDK = {
	init,
	getCurrentHub,
	captureEvent,
	captureMessage,
	captureException,
	configureScope,
	pushScope,
	popScope,
	setUser,
	setTag,
	setExtra,
	setFingerprint,
	startSession,
	endSession,
	Hub: _Hub,
	Client: _ClientMod.Client,
	Scope: _Scope,
	Transport: _Transport,
} as { [key: string]: unknown };
export = SentrySDK as {
	init: typeof init;
	getCurrentHub: typeof getCurrentHub;
	captureEvent: typeof captureEvent;
	captureMessage: typeof captureMessage;
	captureException: typeof captureException;
	configureScope: typeof configureScope;
	pushScope: typeof pushScope;
	popScope: typeof popScope;
	setUser: typeof setUser;
	setTag: typeof setTag;
	setExtra: typeof setExtra;
	setFingerprint: typeof setFingerprint;
	startSession: typeof startSession;
	endSession: typeof endSession;
	Hub: typeof import('./Hub').Hub;
	Client: typeof import('./Hub/Client').Client;
	Scope: typeof import('./Hub/Scope').Scope;
	Transport: typeof import('./Transport').Transport;
};

// Types are accessible via the SentrySDK object or through type queries
