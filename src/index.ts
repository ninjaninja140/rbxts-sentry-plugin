import { RunService } from '@rbxts/services';
import { AggregateDictionaries, DefaultOptions, type Event, type Hint, type Options } from './Defaults';
import { Hub } from './Hub';

// Luau table helpers (available at runtime but not fully typed in roblox-ts)
const luaTable = table as unknown as { insert: <T>(t: Array<T>, ...args: unknown[]) => void };
const tableInsert = (t: Array<unknown>, ...args: unknown[]) => luaTable.insert(t, ...args);

const SENTRY_PROTOCOL_VERSION = 7;

interface IntegrationModule {
	Name: string;
	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	) => void;
}

/**
 * SentrySDK - The main entry point for the Sentry SDK for Roblox.
 *
 * Forked & ported from devSparkle/sentry-roblox.
 */
class SentrySDK extends Hub {
	static SDK_INTERFACE = {
		name: 'sentry.roblox.devsparkle',
		version: '1.2.1',
	} as const;

	private static SENTRY_CLIENT = `${SentrySDK.SDK_INTERFACE.name}/${SentrySDK.SDK_INTERFACE.version}`;

	/**
	 * Initialize the Sentry SDK with the given options.
	 * Must be called on the server.
	 */
	public Init(options?: Partial<Options>): void {
		if (!options) return;
		if (!options.DSN) return;
		if (!RunService.IsServer()) return;

		// Merge with defaults and freeze
		const mergedOptions = AggregateDictionaries(
			DefaultOptions as unknown as Record<string, unknown>,
			options as unknown as Record<string, unknown>
		) as unknown as Options;

		this.Options = table.freeze(mergedOptions) as Readonly<Options>;

		// Initialize transport
		this.Options.Transport.Init(this.Options, SENTRY_PROTOCOL_VERSION, SentrySDK.SENTRY_CLIENT);

		// Configure base scope
		this.Scope.ConfigureScope((scope) => {
			scope.server_name = this.Options!.ServerName;
			scope.logger = 'server';
			scope.release = this.Options!.Release;
			scope.environment = this.Options!.Environment;
			scope.dist = tostring(game.PlaceVersion);
		});

		// Set the SDK interface on the client
		this.Client.SDK_INTERFACE = SentrySDK.SDK_INTERFACE;

		// Load built-in integrations
		if (this.Options.DefaultIntegrations) {
			const integrationModules: ModuleScript[] = [
				script.WaitForChild('Integrations')?.WaitForChild('log-service-message-out') as ModuleScript,
				script.WaitForChild('Integrations')?.WaitForChild('player-name-scrubber') as ModuleScript,
				script.WaitForChild('Integrations')?.WaitForChild('script-context-error') as ModuleScript,
				script.WaitForChild('Integrations')?.WaitForChild('stack-processor') as ModuleScript,
				script.WaitForChild('Integrations')?.WaitForChild('track-sessions') as ModuleScript,
				script.WaitForChild('Integrations')?.WaitForChild('sentry-client-relay') as ModuleScript,
			];

			for (const mod of integrationModules) {
				tableInsert(this.Options!.Integrations, mod);
			}
		}

		// Set up all integrations
		for (const integration of this.Options.Integrations) {
			task.spawn(() => {
				const mod = require(integration) as IntegrationModule;
				const scope = this.Scope;
				const addProcessor = (fn: (event: Event, hint: Hint) => Event | undefined) =>
					scope._AddGlobalEventProcessor(fn);
				mod.SetupOnce(addProcessor, this.GetCurrentHub());
			});
		}
	}
}

const SDK = new SentrySDK();
export = SDK;
