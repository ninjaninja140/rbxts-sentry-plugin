import type { Hint, Integration as IntegrationType, SentryEvent } from 'Defaults';
const Players = game.GetService('Players');

type HubLike = {
	options?: { SendDefaultPII?: boolean };
};

function getPlayerNames(): string[] {
	const names: string[] = [];

	for (const player of Players.GetPlayers()) {
		names.push(player.Name);
	}

	names.sort((a, b) => a.size() < b.size());
	return names;
}

function scrubTable(tbl: object, playerName: string, replacement: string): boolean {
	let didReplace = false;

	for (const [key, value] of pairs(tbl)) {
		if (typeIs(value, 'string')) {
			const [newVal, occurrences] = string.gsub(value as string, playerName, replacement);
			if (occurrences > 0) {
				(tbl as Record<string, unknown>)[key as string] = newVal;
				didReplace = true;
			}
		} else if (typeIs(value, 'table')) {
			if (scrubTable(value as object, playerName, replacement)) {
				didReplace = true;
			}
		}
	}

	return didReplace;
}

const Integration: IntegrationType = {
	Name: 'PlayerNameScrubber',

	SetupOnce(
		addGlobalEventProcessor: (processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined) => void,
		currentHub: HubLike
	) {
		const sendDefaultPII = currentHub.options?.SendDefaultPII ?? false;

		addGlobalEventProcessor((event: SentryEvent, _hint: Hint) => {
			const eventUser = event.user?.username;
			const playerNames = getPlayerNames();
			const occurringPlayers: string[] = [];

			for (const playerName of playerNames)
				if (scrubTable(event as unknown as object, playerName, `<PLAYER${occurringPlayers.size() + 1}>`))
					occurringPlayers.push(playerName);

			if (sendDefaultPII && occurringPlayers.size() === 1) {
				scrubTable(event as unknown as object, '<PLAYER1>', '<PLAYER>');

				if (event.user) event.user.username = occurringPlayers[0];
				else {
					const player = Players.FindFirstChild(occurringPlayers[0]);
					if (!player?.IsA('Player')) return event;

					const parts = string.split(player.LocaleId, '-');
					const countryCode = parts[1] !== undefined ? string.upper(parts[1]) : undefined;

					event.user = {
						id: player.UserId,
						username: player.Name,
						geo: {
							city: 'Unknown',
							country_code: countryCode ?? 'XX',
							region: countryCode,
						},
					};
				}
			} else if (sendDefaultPII && eventUser) {
				const idx = occurringPlayers.indexOf(eventUser);
				scrubTable(event as unknown as object, `<PLAYER${idx >= 0 ? idx : 0}>`, '<PLAYER>');
			}

			return event;
		});
	},
};

export = Integration;
