import { DeepCopy, type Event, type Hint, type Level, type Options } from '../Defaults';
import { Client } from './Client';
import { Scope } from './Scope';

// Luau table helpers (available at runtime but not fully typed in roblox-ts)
const luaTable = table as unknown as { insert: <T>(t: Array<T>, ...args: unknown[]) => void };
const tableInsert = (t: Array<unknown>, ...args: unknown[]) => luaTable.insert(t, ...args);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const debugGetMemoryCategory = (debug as unknown as { getmemorycategory: () => string }).getmemorycategory;

/**
 * The hub consists of a stack of clients and scopes.
 *
 * The SDK maintains two variables: The main hub (a global variable) and the current
 * hub (a variable local to the current thread or execution context, also sometimes
 * known as async local or context local).
 */
class Hub {
	public Client: Client;
	public Scope: Scope;
	public Options?: Readonly<Options>;

	constructor(client?: Client, scope?: Scope) {
		this.Client = client ?? new Client();
		this.Scope = scope ?? new Scope();
	}

	public Clone(): Hub {
		return new Hub(this.Client, this.Scope.Clone());
	}

	public GetCurrentHub(): Hub {
		return this;
	}

	public CaptureEvent(event: Event, hint?: Hint): void {
		if (this.Options) {
			if (this.Options.SampleRate === 0) return;
			if (math.random() > (this.Options.SampleRate ?? 1)) {
				return;
			}
		}

		this.Client.CaptureEvent(event, hint, this.Scope);
	}

	public CaptureMessage(message: string, level?: Level): void {
		this.CaptureEvent({
			level: level ?? 'info',
			message: {
				formatted: message, // TODO: Remove PII (player names, user IDs)
				message,
			},
		});
	}

	public CaptureException(errorMessage?: string): ((...args: unknown[]) => void) | void {
		if (errorMessage === undefined) {
			return (...args: unknown[]) => {
				this.CaptureException(args[0] as string);
			};
		}

		const thread = coroutine.running();
		const threadId = string.gsub(tostring(thread), 'thread: ', '')[0];

		const event: Event = {
			exception: [
				{
					type: errorMessage,
					thread_id: threadId,
				},
			],
		};

		const envTrace: Array<Record<string, unknown> | undefined> = [];
		let envCount = 1;

		if (this.Options) {
			// Luau getfenv equivalent - collect environment tables
			while (
				pcall(() => {
					const env = getfenv(envCount);
					tableInsert(envTrace, envCount, env);
				})[0]
			) {
				envCount += 1;
			}
		}

		const originEnv = envTrace[0];

		if (originEnv) {
			if (originEnv.script) {
				event.exception![0].module = tostring(originEnv.script);
				event.exception![0].thread_id = threadId;
			}
		}

		return this.CaptureEvent(event, {
			message: errorMessage,
			traceback: debug.traceback(),
			environments: envTrace,
			memory_category: debugGetMemoryCategory(),
			thread,
			thread_id: threadId,
		});
	}

	public PushScope(): LuaTuple<[Hub, () => void]> {
		const oldScope = this.Scope;
		const newScope = setmetatable(DeepCopy(oldScope) as object, {
			__index: oldScope as unknown as (self: object, index: unknown) => void,
		}) as Scope;

		this.Scope = newScope;

		return $tuple(this, () => {
			this.Scope = oldScope;
		});
	}

	public WithScope(): void {
		// Unreleased
	}

	public PopScope(): Hub {
		this.Scope = (getmetatable(this.Scope) as { __index: Scope }).__index;

		return this;
	}

	public ConfigureScope(callback: (scope: Scope) => void): Hub {
		this.Scope.ConfigureScope(callback);

		return this;
	}

	public GetClient(): Client {
		return this.Client;
	}

	public BindClient(client: Client): void {
		this.Client = client;
	}

	public UnbindClient(): void {
		this.BindClient(undefined as unknown as Client);
	}

	public StartSession(): void {
		if (!this.Options) return;
		if (!this.Scope.user) return;

		const currentTime = DateTime.now();

		this.Options.Transport.CaptureEnvelope({
			sid: this.Scope.user.sid,
			did: tostring(this.Scope.user.id),
			seq: currentTime.UnixTimestampMillis,
			timestamp: currentTime.ToIsoDate(),
			started: this.Scope.user.started!.ToIsoDate(),
			init: true,
			status: 'ok',
			attrs: {
				release: this.Scope.release,
				environment: this.Scope.environment,
			},
		});
	}

	public EndSession(): void {
		if (!this.Options) return;
		if (!this.Scope.user) return;

		const currentTime = DateTime.now();

		this.Options.Transport.CaptureEnvelope({
			sid: this.Scope.user.sid,
			did: tostring(this.Scope.user.id),
			seq: currentTime.UnixTimestampMillis,
			timestamp: currentTime.ToIsoDate(),
			started: this.Scope.user.started!.ToIsoDate(),
			status: 'exited',
			attrs: {
				release: this.Scope.release,
				environment: this.Scope.environment,
			},
		});
	}
}

export { Hub };
