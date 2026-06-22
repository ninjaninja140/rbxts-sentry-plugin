import type { Event, Hint } from '../Defaults';
import type { Hub } from '../Hub';

const Players = game.GetService('Players');
const HttpService = game.GetService('HttpService');

interface Integration {
	Name: string;
	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	) => void;
}

const Module: Integration = {
	Name: 'TrackSessions',

	SetupOnce: (
		_addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	): void => {
		const userHubs = new Map<Player, Hub>();

		function startSession(player: Player): void {
			const userHub = currentHub.Clone();
			userHub.ConfigureScope((hubScope) => {
				hubScope.SetUser(player);
				if (hubScope.user) {
					hubScope.user.sid = HttpService.GenerateGUID(false);
					hubScope.user.started = DateTime.now();
				}
			});

			userHubs.set(player, userHub);
			userHub.StartSession();
		}

		for (const player of Players.GetPlayers()) {
			task.spawn(() => startSession(player));
		}

		Players.PlayerAdded.Connect(startSession);
		Players.PlayerRemoving.Connect((player: Player) => {
			const userHub = userHubs.get(player);

			userHubs.delete(player);
			if (userHub) {
				userHub.EndSession();
			}
		});
	},
};

export = Module;
