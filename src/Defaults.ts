import { RunService } from '@rbxts/services';
import { Transport } from './Transport';

// -- Types

export type ValidJSONValues = string | number | boolean;
export type Level = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export interface Hint {
	[key: string]: unknown;
	event_id?: string;
	message?: string;
	traceback?: string;
	environments?: Array<Record<string, unknown> | undefined>;
	memory_category?: string;
	thread?: thread;
	thread_id?: string;
	origin?: unknown;
}

export type Filter<T> = (value: T, hint: Hint) => T | undefined;

export interface Options {
	DSN?: string;
	debug?: boolean;

	DefaultIntegrations?: boolean;
	Integrations: ModuleScript[];

	Release?: string;
	Environment?: string;

	SendClientEvents?: boolean;
	SendStudioEvents?: boolean;

	SampleRate?: number;
	MaxBreadcrumbs?: number;
	AttachStacktrace?: boolean;
	SendDefaultPII?: boolean;

	ServerName?: string;

	InAppInclude?: string[];
	InAppExclude?: string[];

	WithLocals?: boolean;

	BeforeSend?: Filter<unknown>;
	BeforeBreadcrumb?: Filter<unknown>;

	Transport: typeof Transport;
	ShutdownTimeout?: number;
}

export interface SdkInterface {
	name: string;
	version: string;
}

export interface StackFrame {
	function?: string;
	filename?: string;
	lineno?: number;
	module?: string;
	vars?: Record<string, string | number | undefined>;
}

export interface Stacktrace {
	frames: StackFrame[];
	registers?: Record<string, string>;
}

export interface Mechanism {
	data?: Record<string, unknown>;
	description?: string;
	handled?: boolean;
	help_link?: string;
	synthetic?: boolean;
	type?: string;
}

export interface ExceptionEntry {
	type?: string;
	value?: string;
	module?: string;
	thread_id?: string;
	mechanism?: Mechanism;
	stacktrace?: Stacktrace;
}

export interface Geo {
	city?: string;
	country_code: string;
	region?: string;
}

export interface SentryUser {
	id: number;
	username: string;
	geo?: Geo;
	data?: Record<string, unknown>;
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
	name?: string;
}

export interface SentryThread {
	id: string;
	stacktrace?: Stacktrace;
}

export interface Event {
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
	contexts?: Record<string, Record<string, unknown>>;
	sdk?: SdkInterface & { integrations?: string[]; packages?: Array<{ name: string; version: string }> };
	exception?: ExceptionEntry[];
	user?: SentryUser;
	message?: SentryMessage;
	errors?: SentryError[];
	threads?: SentryThread[];
	_event_processors?: Array<(event: Event, hint: Hint) => Event | undefined>;
	[key: string]: unknown;
}

// -- Default Options

export const DefaultOptions: Options = {
	debug: false,

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

	ServerName: game.JobId !== '' ? game.JobId : 'local',

	InAppInclude: [],
	InAppExclude: [],

	WithLocals: true,

	Transport: Transport as unknown as typeof Transport,
	ShutdownTimeout: 2,
};

export const Levels: Level[] = ['fatal', 'error', 'warning', 'info', 'debug'];

// -- Utility Functions

export function IsValidLevel(level: Level | unknown): number | undefined {
	const luaTable = table as unknown as { find: <T>(t: Array<T>, v: T) => number | undefined };
	return luaTable.find(Levels, level as Level);
}

export function AggregateDictionaries(...dictionaries: Array<Record<string, unknown>>): Record<string, unknown> {
	const aggregate: Record<string, unknown> = {};

	for (const dictionary of dictionaries) {
		for (const [index, value] of pairs(dictionary)) {
			if (typeOf(value) === 'table' && typeOf(aggregate[index]) === 'table') {
				aggregate[index] = AggregateDictionaries(
					aggregate[index] as Record<string, unknown>,
					value as Record<string, unknown>
				);
			} else {
				aggregate[index] = value;
			}
		}
	}

	return aggregate;
}

export function DeepCopy<T>(tbl: T): T {
	if (type(tbl) === 'table') {
		const copied = setmetatable(
			table.clone(tbl as unknown as object),
			getmetatable(tbl as unknown as object) as never
		) as T;

		for (const [index, value] of pairs(copied as unknown as object)) {
			(copied as Record<string, unknown>)[DeepCopy(index) as string] = DeepCopy(value);
		}

		return copied;
	}

	return tbl;
}

export function OverlapTables<B extends object, F extends object>(background: B, foreground?: F): F & B {
	return setmetatable((foreground ?? {}) as object, {
		__index: background as unknown as (self: object, index: unknown) => void,
	}) as unknown as F & B;
}
