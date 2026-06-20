import type { Hint, Integration as IntegrationType, SentryEvent } from 'Defaults';

type HubLike = {
	clone(): HubLike;
	configureScope(
		callback: (scope: {
			configureScope(
				cb: (s: { setExtra(key: string, value: string): void; setUser(player: Player): void }) => void
			): void;
		}) => void
	): HubLike;
	captureEvent(event: SentryEvent, hint: Hint): void;
};

let sentryHub: HubLike | undefined;
let remoteEvent: RemoteEvent | undefined;

const Integration: IntegrationType = {
	Name: 'SentryClientRelay',

	SetupOnce(
		_addGlobalEventProcessor: (processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined) => void,
		currentHub: HubLike
	) {
		sentryHub = currentHub;
		remoteEvent = new Instance('RemoteEvent');
		remoteEvent.Parent = script;

		remoteEvent.OnServerEvent.Connect((player: Player, ...args: unknown[]) => {
			const event = args[0] as SentryEvent;
			const hint = args[1] as Hint;
			sentryHub
				?.clone()
				.configureScope((scope) => {
					scope.configureScope((s) => {
						s.setExtra('logger', 'client');
						s.setUser(player);
					});
				})
				.captureEvent(event, hint);
		});
	},
};

export = Integration;
