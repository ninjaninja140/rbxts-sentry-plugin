import type { Event, Hint } from '../Defaults';
import type { Hub } from '../Hub';
import type { Scope as ScopeClass } from '../Hub/Scope';

const Players = game.GetService('Players');
const RunService = game.GetService('RunService');

const Scope = require(
	script.Parent?.Parent?.WaitForChild('Hub')?.WaitForChild('Scope') as ModuleScript
) as unknown as typeof ScopeClass;

interface Integration {
	Name: string;
	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	) => void;
}

/**
 * SentryClientRelay integration - relays client-side Sentry events to the server.
 */
const Module: Integration = {
	Name: 'SentryClientRelay',

	SetupOnce: (
		_addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	): void => {
		const remoteEvent = new Instance('RemoteEvent');
		remoteEvent.Parent = script;

		// Server-side: receive client events
		remoteEvent.OnServerEvent.Connect((player: Player, ...args: unknown[]) => {
			const event = args[0] as Event;
			const hint = args[1] as Hint;
			currentHub
				.Clone()
				.ConfigureScope((scope) => {
					scope.logger = 'client';
					scope.SetUser(player);
				})
				.CaptureEvent(event, hint);
		});

		// Client-side: set up integrations and forward events to server
		if (RunService.IsClient()) {
			// Client-side event processor: fires event to server and returns nil (cancels local send)
			const clientScope = new Scope();
			clientScope.logger = 'client';
			clientScope.SetUser(Players.LocalPlayer);
			clientScope._AddGlobalEventProcessor((evt: Event, hint: Hint) => {
				remoteEvent.FireServer(evt, hint);
				return undefined;
			});
		}
	},
};

export = Module;
