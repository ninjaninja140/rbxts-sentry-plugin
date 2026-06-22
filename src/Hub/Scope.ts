import { LocalizationService, Players, RunService } from '@rbxts/services';
import {
	AggregateDictionaries,
	type Event,
	type Hint,
	type Level,
	type SentryUser,
	type ValidJSONValues,
} from '../Defaults';

type EventProcessor = (event: Event, hint: Hint) => Event | undefined;

// Luau table helpers (available at runtime but not fully typed in roblox-ts)
const luaTable = table as unknown as {
	insert: <T>(t: Array<T>, ...args: unknown[]) => void;
	find: <T>(t: Array<T>, v: T) => number | undefined;
};
const tableInsert = (t: Array<unknown>, ...args: unknown[]) => luaTable.insert(t, ...args);
const tableFind = <T>(t: Array<T>, v: T) => luaTable.find(t, v);

/**
 * A scope holds data that should implicitly be sent with Sentry events.
 * It can hold context data, extra parameters, level overrides, fingerprints etc.
 *
 * The user can modify the current scope (to set extra, tags, current user) through
 * the global function configure_scope. configure_scope takes a callback function
 * to which it passes the current scope.
 */
class Scope {
	public extra: Record<string, string> = {};
	public contexts: Record<string, Record<string, unknown>> = {};
	public tags: Record<string, string> = {};

	public _event_processors: EventProcessor[] = [];

	public level?: Level;
	public transaction?: string;
	public fingerprint?: string[];
	public user?: SentryUser;
	public server_name?: string;
	public logger?: string;
	public release?: string;
	public environment?: string;
	public dist?: string;
	public exception?: Array<Record<string, unknown>>;

	/**
	 * @private
	 * Registers a global event processor as a BindableFunction child of the script.
	 */
	public _AddGlobalEventProcessor(fn: EventProcessor): void {
		const bindableFunction = new Instance('BindableFunction');

		bindableFunction.SetAttribute(
			'RunContext',
			(RunService.IsClient() ? Enum.RunContext.Client : Enum.RunContext.Server) as unknown as AttributeValue
		);
		bindableFunction.Name = 'GlobalEventProcessor';
		bindableFunction.OnInvoke = fn;
		bindableFunction.Parent = script;
	}

	constructor() {
		this.extra = {};
		this.contexts = {};
		this.tags = {};
		this._event_processors = [];
	}

	/**
	 * The reason for this callback-based API is efficiency. If the SDK is disabled, it
	 * should not invoke the callback, thus avoiding unnecessary work.
	 */
	public ConfigureScope(callback: (scope: this) => void): void {
		callback(this);
	}

	/**
	 * Adds information of the given player to each event sent.
	 * Only one user may be associated with a Scope at any given time.
	 * Calling this method will override the current user.
	 * When no player is provided, any existing player information is removed.
	 *
	 * The `UserId`, `Name` and country-code of the player is sent.
	 */
	public SetUser(player: Player | number | undefined): void {
		if (player === undefined) {
			this.user = undefined;
			return;
		}

		if (typeIs(player, 'Instance')) {
			const isLocal = player === Players.LocalPlayer;
			const localeId = isLocal ? LocalizationService.SystemLocaleId : player.LocaleId;
			const countryCode = string.split(localeId, '-')[1];

			this.user = {
				id: player.UserId,
				username: player.Name,
				data: {
					AccountAge: player.AccountAge,
					Character: player.Character !== undefined,
					MembershipType: player.MembershipType.Name,
					Team: player.Team ? tostring(player.Team) : undefined,
				},
				geo: {
					city: 'Unknown',
					country_code: countryCode ? string.upper(countryCode) : '',
					region: countryCode ?? undefined,
				},
			};
		} else if (typeIs(player, 'number')) {
			this.user = { id: player, username: '' };
		}
	}

	public SetExtra(key: string, value: ValidJSONValues): void {
		this.extra[key] = tostring(value);
	}

	public SetExtras(dictionary: Record<string, ValidJSONValues>): void {
		for (const [key, value] of pairs(dictionary)) {
			this.extra[key] = tostring(value);
		}
	}

	public SetTag(key: string, value: ValidJSONValues): void {
		this.tags[key] = tostring(value);
	}

	public SetTags(dictionary: Record<string, ValidJSONValues>): void {
		for (const [key, value] of pairs(dictionary)) {
			this.tags[key] = tostring(value);
		}
	}

	public SetContext(key: string, value: Record<string, unknown>): void {
		this.contexts[key] = value;
	}

	public SetLevel(level: Level): void {
		this.level = level;
	}

	public SetTransaction(transactionName: string): void {
		this.transaction = transactionName;
	}

	public SetFingerprint(fingerprint: string[]): void {
		this.fingerprint = fingerprint;
	}

	public AddEventProcessor(processor: EventProcessor): void {
		tableInsert(this._event_processors, processor);
	}

	public Clear(): void {
		const emptyScope = new Scope();

		for (const [key] of pairs(this as unknown as Record<string, unknown>)) {
			rawset(this as unknown as object, key, rawget(emptyScope as unknown as object, key));
		}
	}

	public Clone(): Scope {
		return setmetatable(table.clone(this) as object, getmetatable(this) as never) as Scope;
	}

	public AddBreadcrumb(_breadcrumb: unknown): void {
		print('WIP: The function "Scope:AddBreadcrumb" is not yet implemented.');
	}

	public ClearBreadcrumbs(): void {
		print('WIP: The function "Scope:ClearBreadcrumbs" is not yet implemented.');
	}

	public ApplyToEvent(event: Event, hint: Hint): Event | undefined {
		for (const [index, value] of pairs(this as unknown as Record<string, unknown>)) {
			if (typeOf(value) === 'table' && typeOf(event[index]) === 'table') {
				if (index === 'exception') {
					const exceptions = (event.exception ?? []) as Array<Record<string, unknown>>;
					for (const [, exceptionValue] of ipairs(value as Array<Record<string, unknown>>)) {
						const excIdx = (tableFind(exceptions, exceptionValue) ?? exceptions.size()) - 1;
						if (excIdx >= 0 && excIdx < exceptions.size()) {
							exceptions[excIdx] = AggregateDictionaries(exceptions[excIdx], exceptionValue) as Record<
								string,
								unknown
							>;
						}
					}
				} else {
					event[index] = AggregateDictionaries(
						event[index] as Record<string, unknown>,
						value as Record<string, unknown>
					);
				}
			} else {
				event[index] = value;
			}
		}

		const eventProcessors = table.clone(this._event_processors) as EventProcessor[];
		event._event_processors = undefined;

		if (event.contexts && (event.contexts as unknown as Array<unknown>).size() === 0) {
			event.contexts = undefined;
		}

		if (event.extra && (event.extra as unknown as Array<unknown>).size() === 0) {
			event.extra = undefined;
		}

		// Collect global event processors from script children
		for (const child of script.GetChildren()) {
			if (!child.IsA('BindableFunction')) continue;
			if (child.Name !== 'GlobalEventProcessor') continue;
			if (
				RunService.IsClient() &&
				(child.GetAttribute('RunContext') as unknown as Enum.RunContext) !== Enum.RunContext.Client
			)
				continue;
			if (
				RunService.IsServer() &&
				(child.GetAttribute('RunContext') as unknown as Enum.RunContext) !== Enum.RunContext.Server
			)
				continue;

			tableInsert(eventProcessors, 1, (evt: Event, hnt: Hint) => {
				return child.Invoke(evt, hnt) as Event | undefined;
			});
		}

		for (const processor of eventProcessors) {
			const [success, response] = pcall(processor, event, hint);

			if (success) {
				event = response as Event;

				if (!event) {
					break;
				}
			} else {
				event.errors = event.errors ?? [];
				tableInsert(event.errors, {
					type: 'unknown_error',
					details: 'Encountered error when calling an EventProcessor.',
					name: response as string,
				});
			}
		}

		return event;
	}
}

export { Scope };
