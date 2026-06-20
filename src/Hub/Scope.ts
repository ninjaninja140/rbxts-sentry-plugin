import { RunService } from '@rbxts/services';
import { type Hint, type Level, type SentryEvent, type ValidJSONValue, aggregateDictionaries } from 'Defaults';

type EventProcessor = (event: SentryEvent, hint: Hint) => SentryEvent | undefined;

export class Scope {
	public level?: Level;
	public transaction?: string;
	public fingerprint?: string[];
	public user?: SentryEvent['user'];
	public logger?: string;
	public server_name?: string;
	public release?: string;
	public environment?: string;
	public dist?: string;
	public extra: Record<string, ValidJSONValue> = {};
	public tags: Record<string, string> = {};
	public contexts: Record<string, Record<string, ValidJSONValue>> = {};
	private eventProcessors: EventProcessor[] = [];

	public static addGlobalEventProcessor(
		processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined
	): void {
		const bf = new Instance('BindableFunction');
		bf.SetAttribute(
			'RunContext',
			RunService.IsClient()
				? (Enum.RunContext.Client as unknown as AttributeValue)
				: (Enum.RunContext.Server as unknown as AttributeValue)
		);
		bf.Name = 'GlobalEventProcessor';
		bf.OnInvoke = processor;
		bf.Parent = script;
	}

	public configureScope(callback: (scope: Scope) => void): void {
		callback(this);
	}

	public setUser(player: Player | number | undefined): void {
		if (player === undefined) {
			this.user = undefined;
			return;
		}
		if (typeIs(player, 'Instance')) {
			const localPlayer = RunService.IsClient() ? game.GetService('Players').LocalPlayer : undefined;
			const isLocal = player === localPlayer;
			const localeId = isLocal
				? game.GetService('LocalizationService').SystemLocaleId
				: (player as Player).LocaleId;
			const parts = string.split(localeId, '-');
			const countryCode = parts[1] !== undefined ? string.upper(parts[1]) : undefined;
			this.user = {
				id: (player as Player).UserId,
				username: (player as Player).Name,
				data: {
					AccountAge: (player as Player).AccountAge,
					Character: (player as Player).Character !== undefined,
					MembershipType: (player as Player).MembershipType.Name,
					Team: (player as Player).Team ? tostring((player as Player).Team) : undefined,
				} as Record<string, defined>,
				geo: { city: 'Unknown', country_code: countryCode ?? 'XX', region: countryCode },
			};
		} else if (typeIs(player, 'number')) this.user = { id: player, username: '' };
	}

	public setExtra(key: string, value: ValidJSONValue): void {
		this.extra[key] = value;
	}
	public setExtras(dict: Record<string, ValidJSONValue>): void {
		for (const [k, v] of pairs(dict)) this.extra[k] = v;
	}
	public setTag(key: string, value: string): void {
		this.tags[key] = value;
	}
	public setTags(dict: Record<string, string>): void {
		for (const [k, v] of pairs(dict)) this.tags[k] = v;
	}
	public setContext(key: string, value: Record<string, ValidJSONValue>): void {
		this.contexts[key] = value;
	}
	public setLevel(level: Level): void {
		this.level = level;
	}
	public setTransaction(name: string): void {
		this.transaction = name;
	}
	public setFingerprint(fingerprint: string[]): void {
		this.fingerprint = fingerprint;
	}
	public addEventProcessor(processor: EventProcessor): void {
		this.eventProcessors.push(processor);
	}

	public clear(): void {
		const empty = new Scope();
		for (const [key] of pairs(this))
			(this as unknown as Record<string, unknown>)[key as string] = (empty as unknown as Record<string, unknown>)[
				key as string
			];
	}

	public clone(): Scope {
		const cloned = table.clone(this) as Scope;
		cloned.extra = table.clone(this.extra);
		cloned.tags = table.clone(this.tags);
		cloned.contexts = table.clone(this.contexts);
		cloned.eventProcessors = table.clone(this.eventProcessors);
		setmetatable(cloned, getmetatable(this) as LuaMetatable<Scope>);
		return cloned;
	}

	public addBreadcrumb(_breadcrumb: unknown): void {
		warn('WIP: Scope:addBreadcrumb not implemented.');
	}
	public clearBreadcrumbs(): void {
		warn('WIP: Scope:clearBreadcrumbs not implemented.');
	}

	public applyToEvent(event: SentryEvent, hint: Hint): SentryEvent | undefined {
		let mergedEvent = aggregateDictionaries<SentryEvent>(this as unknown as SentryEvent, event);
		const processors = table.clone(this.eventProcessors);
		mergedEvent._event_processors = undefined;
		if (mergedEvent.contexts && next(mergedEvent.contexts)[0] === undefined) mergedEvent.contexts = undefined;
		if (mergedEvent.extra && next(mergedEvent.extra)[0] === undefined) mergedEvent.extra = undefined;

		const globalProcessors = script.GetChildren().filter((child) => {
			if (child.Name !== 'GlobalEventProcessor') return false;
			const runContext = child.GetAttribute('RunContext') as number | undefined;
			if (RunService.IsClient() && runContext !== (Enum.RunContext.Client as unknown as number)) return false;
			if (RunService.IsServer() && runContext !== (Enum.RunContext.Server as unknown as number)) return false;
			return true;
		});

		for (const proc of globalProcessors) {
			const bindable = proc as BindableFunction;
			processors.insert(0, (e: SentryEvent, h: Hint) => bindable.Invoke(e, h) as SentryEvent | undefined);
		}

		for (const processor of processors) {
			const [success, result] = pcall(() => processor(mergedEvent, hint));
			if (success) {
				if (result === undefined) return undefined;
				mergedEvent = result as SentryEvent;
			} else {
				mergedEvent.errors = mergedEvent.errors ?? [];
				mergedEvent.errors.push({
					type: 'unknown_error',
					details: 'Encountered error when calling an EventProcessor.',
					path: result as string,
				});
			}
		}
		return mergedEvent;
	}
}
