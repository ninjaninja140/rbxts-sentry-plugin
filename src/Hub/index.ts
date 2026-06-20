import { type Hint, type Level, type SentryEvent, type SentryOptions, deepCopy } from 'Defaults';
import { Client } from 'Hub/Client';
import { Scope } from 'Hub/Scope';
import { Transport } from 'Transport';

export class Hub {
	public client: Client;
	public scope: Scope;
	public options?: SentryOptions;

	constructor(client?: Client, scope?: Scope) {
		this.client = client ?? new Client();
		this.scope = scope ?? new Scope();
	}

	public clone(): Hub {
		return new Hub(this.client, this.scope.clone());
	}
	public getCurrentHub(): Hub {
		return this;
	}

	public captureEvent(event: SentryEvent, hint?: Hint): void {
		if (this.options) {
			if (this.options.SampleRate === 0) return;
			if (math.random() > (this.options.SampleRate ?? 1)) return;
		}
		this.client.captureEvent(event, hint ?? ({} as Hint), this.scope);
	}

	public captureMessage(message: string, level?: Level): void {
		this.captureEvent({ level: level ?? 'info', message: { formatted: message, message: message } });
	}

	public captureException(errorMessage?: string): undefined | ((...args: unknown[]) => void) {
		if (errorMessage === undefined)
			return (...args: unknown[]) => {
				const msg = args[0] !== undefined ? tostring(args[0]) : 'Unknown error';
				this.captureException(msg);
			};

		const thread = coroutine.running();
		const event: SentryEvent = {
			exception: { type: errorMessage, thread_id: string.gsub(tostring(thread), 'thread: ', '')[0] },
		};
		const envTrace: defined[] = [];
		let envCount = 1;
		while (
			pcall(() => {
				const env = getfenv(envCount) as defined;
				envTrace.push(env);
			})
		)
			envCount++;

		const originEnv = envTrace[0] as { script?: Instance } | undefined;
		if (originEnv?.script) event.exception!.module = tostring(originEnv.script);
		this.captureEvent(event, {
			message: errorMessage,
			traceback: debug.traceback(),
			environments: envTrace,
			memory_category: (debug as unknown as { getmemorycategory: () => string }).getmemorycategory(),
			thread: thread,
			thread_id: event.exception!.thread_id,
		} as Hint);
	}

	public pushScope(): LuaTuple<[Hub, () => void]> {
		const oldScope = this.scope;
		const newScope = deepCopy(oldScope);
		setmetatable(newScope, getmetatable(oldScope) as LuaMetatable<Scope>);
		this.scope = newScope;
		return $tuple(this, () => {
			this.scope = oldScope;
		});
	}

	public popScope(): Hub {
		const mt = getmetatable(this.scope);
		if (mt) this.scope = (mt as LuaMetatable<Scope> & { __index: Scope }).__index;
		return this;
	}

	public configureScope(callback: (scope: Scope) => void): Hub {
		this.scope.configureScope(callback);
		return this;
	}
	public getClient(): Client {
		return this.client;
	}
	public bindClient(client: Client): void {
		this.client = client;
	}
	public unbindClient(): void {
		this.bindClient(undefined as unknown as Client);
	}

	public startSession(): void {
		const ct = DateTime.now();
		Transport.captureEnvelope({
			sid: this.scope.user?.sid,
			did: this.scope.user?.id !== undefined ? tostring(this.scope.user.id) : undefined,
			seq: ct.UnixTimestampMillis,
			timestamp: ct.ToIsoDate(),
			started: this.scope.user?.started?.ToIsoDate() ?? ct.ToIsoDate(),
			init: true,
			status: 'ok',
			attrs: { release: this.scope.release, environment: this.scope.environment },
		});
	}

	public endSession(): void {
		const ct = DateTime.now();
		Transport.captureEnvelope({
			sid: this.scope.user?.sid,
			did: this.scope.user?.id !== undefined ? tostring(this.scope.user.id) : undefined,
			seq: ct.UnixTimestampMillis,
			timestamp: ct.ToIsoDate(),
			started: this.scope.user?.started?.ToIsoDate() ?? ct.ToIsoDate(),
			status: 'exited',
			attrs: { release: this.scope.release, environment: this.scope.environment },
		});
	}
}
