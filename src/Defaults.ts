import { RunService } from '@rbxts/services';

export type ValidJSONValue = string | number | boolean;
export type Level = 'fatal' | 'error' | 'warning' | 'info' | 'debug';
export type Hint = Record<string, defined>;

export type Filter<T> = (value: T, hint: Hint) => T | undefined;

export interface SentryStackFrame {
	function?: string;
	filename?: string;
	lineno?: number;
	module?: string;
	vars?: Record<string, string | number>;
}

export interface SentryMechanism {
	data?: Record<string, defined>;
	description?: string;
	handled?: boolean;
	help_link?: string;
	synthetic?: boolean;
	type?: string;
}

export interface SentryException {
	type?: string;
	value?: string;
	module?: string;
	thread_id?: string;
	mechanism?: SentryMechanism;
	stacktrace?: {
		frames: SentryStackFrame[];
		registers?: Record<string, string>;
	};
}

export interface SentryThread {
	id: string;
	stacktrace: {
		frames: SentryStackFrame[];
	};
}

export interface SentryGeo {
	city?: string;
	country_code: string;
	region?: string;
}

export interface SentryUser {
	id: number;
	username: string;
	geo?: SentryGeo;
	data?: Record<string, defined>;
	sid?: string;
	started?: DateTime;
}

export interface SentryMessage {
	message: string;
	formatted?: string;
	params?: string[];
}

export interface SentryError {
	type: string;
	path?: string;
	details?: string;
}

export interface SentryEvent {
	event_id?: string;
	timestamp?: string | number;
	platform?: 'other';

	level?: Level;
	logger?: string;
	transaction?: string;
	server_name?: string;
	release?: string;
	dist?: string;

	tags?: Record<string, string>;
	environment?: string;
	modules?: Record<string, string>;
	extra?: Record<string, string>;
	fingerprint?: string[];

	contexts?: Record<string, Record<string, ValidJSONValue>>;

	sdk?: {
		name: string;
		version: string;
		integrations?: string[];
		packages?: Array<{
			name: string;
			version: string;
		}>;
	};

	exception?: SentryException;
	threads?: SentryThread[];
	user?: SentryUser;
	message?: SentryMessage;
	errors?: SentryError[];

	/** @internal Internal event processors (not serialized) */
	_event_processors?: Array<(event: SentryEvent, hint: Hint) => SentryEvent | undefined>;
}

export interface Integration {
	Name: string;
	SetupOnce(
		addGlobalEventProcessor: (processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined) => void,
		currentHub: unknown
	): void;
}

export interface SentryOptions {
	/** The DSN for the sentry project to send events to */
	DSN?: string;
	/** Whether to enable debug logging */
	Debug?: boolean;

	/** Whether to enable the built-in integrations. Defaults to true. */
	DefaultIntegrations?: boolean;
	/** Additional integration modules */
	Integrations?: ModuleScript[];

	/** The release version string */
	Release?: string;
	/** The environment name (e.g. "production", "staging") */
	Environment?: string;

	/** Whether to send events from clients */
	SendClientEvents?: boolean;
	/** Whether to send events in Studio */
	SendStudioEvents?: boolean;

	/** Sample rate (0.0 to 1.0). Defaults to 1.0. */
	SampleRate?: number;
	/** Maximum number of breadcrumbs to store. Defaults to 100. */
	MaxBreadcrumbs?: number;
	/** Whether to attach stack traces to events */
	AttachStacktrace?: boolean;
	/** Whether to send default PII (player names, etc.) */
	SendDefaultPII?: boolean;

	/** Auto-capture ScriptContext errors (e.g. script runtime errors). Defaults to true. */
	CaptureErrors?: boolean;
	/** Auto-capture LogService warnings. Defaults to true. */
	CaptureWarnings?: boolean;
	/** Auto-capture LogService info/print messages. Defaults to false (noisy). */
	CaptureInfos?: boolean;
	/** Auto-capture LogService debug/output messages. Defaults to false (very noisy). */
	CaptureDebugs?: boolean;

	/** Server name identifier. Defaults to game.JobId or "local". */
	ServerName?: string;

	/** Modules to include as in-app frames */
	InAppInclude?: string[];
	/** Modules to exclude from in-app frames */
	InAppExclude?: string[];

	/** Whether to include local variables in stack traces */
	WithLocals?: boolean;

	/** Filter called before sending an event. Return undefined to drop. */
	BeforeSend?: Filter<SentryEvent>;
	/** Filter called before adding a breadcrumb */
	BeforeBreadcrumb?: Filter<unknown>;

	/** Transport instance override */
	Transport?: unknown;
	/** Timeout in seconds for shutdown */
	ShutdownTimeout?: number;
}

export const DEFAULT_OPTIONS: Required<SentryOptions> = {
	DSN: '',
	Debug: false,

	DefaultIntegrations: true,
	Integrations: [],

	Release: `${game.Name}#${game.PlaceId}@${game.PlaceVersion}`,
	Environment: RunService.IsStudio() ? 'studio' : 'production',

	SendClientEvents: true,
	SendStudioEvents: false,

	SampleRate: 1.0,
	MaxBreadcrumbs: 100,
	AttachStacktrace: false,
	SendDefaultPII: false,

	CaptureErrors: true,
	CaptureWarnings: true,
	CaptureInfos: false,
	CaptureDebugs: false,

	ServerName: game.JobId !== '' ? game.JobId : 'local',

	InAppInclude: [],
	InAppExclude: [],

	WithLocals: true,

	BeforeSend: undefined as unknown as Filter<SentryEvent>,
	BeforeBreadcrumb: undefined as unknown as Filter<unknown>,

	Transport: undefined as unknown,
	ShutdownTimeout: 2,
};

export const LEVELS: Level[] = ['fatal', 'error', 'warning', 'info', 'debug'];

export function isValidLevel(level: unknown): level is Level {
	return LEVELS.includes(level as Level);
}

export function aggregateDictionaries<T extends object>(...dictionaries: T[]): T {
	const aggregate: Record<string, unknown> = {};

	for (const dict of dictionaries) {
		if (!dict) continue;
		for (const [key, value] of pairs(dict)) {
			const stringKey = key as string;
			if (typeIs(value, 'table') && typeIs(aggregate[stringKey], 'table'))
				aggregate[stringKey] = aggregateDictionaries(aggregate[stringKey] as object, value as object);
			else aggregate[stringKey] = value;
		}
	}

	return aggregate as T;
}

export function deepCopy<T>(source: T): T {
	if (typeIs(source, 'table')) {
		const copy = table.clone(source) as T;
		for (const [key, value] of pairs(source as object))
			(copy as Record<string, unknown>)[key as string] = deepCopy(value);

		const mt = getmetatable(source as object);
		if (mt) setmetatable(copy as object, mt);

		return copy;
	}
	return source;
}

export function mergeOptions(base: SentryOptions, overrides?: SentryOptions): SentryOptions {
	if (!overrides) return base;
	return aggregateDictionaries<SentryOptions>(base, overrides);
}
