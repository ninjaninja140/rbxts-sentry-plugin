import { HttpService, Players } from '@rbxts/services';
import type { Hint, Integration as IntegrationType, SentryEvent } from 'Defaults';

type HubLike = {
	clone(): HubLike;
	configureScope(
		callback: (scope: { setUser(player: Player): void; user?: { sid?: string; started?: DateTime } }) => void
	): void;
	startSession(): void;
	endSession(): void;
};

const Integration: IntegrationType = {
	Name: 'TrackSessions',

	SetupOnce(
		_addGlobalEventProcessor: (processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined) => void,
		currentHub: HubLike
	) {
		const userHubs = new Map<Player, HubLike>();

		const startSession = (player: Player) => {
			const userHub = currentHub.clone();
			userHub.configureScope(
				(scope: { setUser(player: Player): void; user?: { sid?: string; started?: DateTime } }) => {
					scope.setUser(player);
					if (scope.user) {
						scope.user.sid = HttpService.GenerateGUID(false);
						scope.user.started = DateTime.now();
					}
				}
			);

			userHubs.set(player, userHub);
			userHub.startSession();
		};

		// track existing players
		for (const player of Players.GetPlayers()) task.spawn(() => startSession(player));

		// Track future players
		Players.PlayerAdded.Connect(startSession);
		Players.PlayerRemoving.Connect((player) => {
			const userHub = userHubs.get(player);
			if (userHub) {
				userHubs.delete(player);
				userHub.endSession();
			}
		});
	},
};

export = Integration;
