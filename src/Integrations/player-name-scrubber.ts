import type { Event, Hint } from '../Defaults';
import type { Hub } from '../Hub';

const Players = game.GetService('Players');

// Luau table helpers (available at runtime but not fully typed in roblox-ts)
const luaTable = table as unknown as {
	insert: <T>(t: Array<T>, ...args: unknown[]) => void;
	find: <T>(t: Array<T>, v: T) => number | undefined;
};
const tableInsert = (t: Array<unknown>, ...args: unknown[]) => luaTable.insert(t, ...args);
const tableFind = <T>(t: Array<T>, v: T) => luaTable.find(t, v);

interface Integration {
	Name: string;
	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	) => void;
}

function getPlayerNames(): string[] {
	const playerNames: string[] = [];

	for (const player of Players.GetPlayers()) {
		tableInsert(playerNames, player.Name);
	}

	table.sort(playerNames, (a, b) => {
		return a.size() < b.size();
	});

	return playerNames;
}

function scrubTable(tbl: Record<string, unknown>, playerName: string, replacement: string): boolean {
	let didReplace = false;

	for (const [index, value] of pairs(tbl)) {
		if (typeOf(value) === 'string') {
			const [replaced, occurrences] = string.gsub(value as string, playerName, replacement);

			tbl[index] = replaced;

			if (occurrences > 0) {
				didReplace = true;
			}
		} else if (typeOf(value) === 'table') {
			if (scrubTable(value as Record<string, unknown>, playerName, replacement)) {
				didReplace = true;
			}
		}
	}

	return didReplace;
}

const Module: Integration = {
	Name: 'PlayerNameScrubber',

	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	): void => {
		const sendDefaultPII = currentHub.Options ? (currentHub.Options.SendDefaultPII ?? false) : false;

		addGlobalEventProcessor((event: Event, _hint: Hint) => {
			const eventUser = event.user ? event.user.username : undefined;
			const playerNames = getPlayerNames();
			const occuringPlayers: string[] = [];

			for (const playerName of playerNames) {
				if (
					scrubTable(
						event as unknown as Record<string, unknown>,
						playerName,
						`<PLAYER${occuringPlayers.size() + 1}>`
					)
				) {
					tableInsert(occuringPlayers, playerName);
				}
			}

			if (sendDefaultPII && occuringPlayers.size() === 1) {
				scrubTable(event as unknown as Record<string, unknown>, '<PLAYER1>', '<PLAYER>');

				if (event.user) {
					event.user.username = occuringPlayers[0];
				} else {
					const player = Players.FindFirstChild(occuringPlayers[0]);
					if (!player) return event;
					if (!player.IsA('Player')) return event;

					const countryCode = string.split(player.LocaleId, '-')[1];

					event.user = {
						id: player.UserId,
						username: player.Name,
						geo: {
							city: 'Unknown',
							country_code: countryCode ?? '',
							region: countryCode ?? undefined,
						},
					};
				}
			} else if (sendDefaultPII && eventUser) {
				scrubTable(
					event as unknown as Record<string, unknown>,
					`<PLAYER${tableFind(occuringPlayers, eventUser) ?? 0}>`,
					'<PLAYER>'
				);
			}

			return event;
		});
	},
};

export = Module;
