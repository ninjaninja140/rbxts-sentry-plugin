import type { SentryOptions } from 'Defaults';
const HttpService = game.GetService('HttpService');
const RunService = game.GetService('RunService');

// handles sending events to the Sentry API

interface HttpResponse {
	Body: string;
	Headers: Record<string, string>;
	StatusCode: number;
	StatusMessage: string;
	Success: boolean;
}

class TransportImpl {
	private baseUrl = '';
	private authHeader = '';
	private initThread = false;
	private rateLimitUntil = 0;

	public init(options: SentryOptions, protocolVersion: number, sentryClient: string): void {
		if (this.initThread) return;
		this.initThread = true;

		const dsn = options.DSN;
		if (!dsn) throw 'Invalid Sentry DSN: DSN not provided.';

		const match = string.match(dsn, '^(([^:]+)://([^:]+)@([^/]+)/([^/]+))$');
		assert(match, 'Invalid Sentry DSN: Scheme not found.');

		const [_, schemeRaw, publicKeyRaw, authorityRaw, projectIdRaw] = match;
		const scheme = schemeRaw as string;
		const publicKey = publicKeyRaw as string;
		const authority = authorityRaw as string;
		const projectId = projectIdRaw as string;

		assert(scheme, 'Invalid Sentry DSN: Scheme not found.');
		assert(string.lower(scheme) === 'http' || string.lower(scheme) === 'https', 'Invalid Sentry DSN: Scheme not valid.');
		assert(publicKey, 'Invalid Sentry DSN: Public Key not found.');
		assert(authority, 'Invalid Sentry DSN: Authority not found.');
		assert(projectId, 'Invalid Sentry DSN: Project ID not found.');

		this.baseUrl = `${scheme}://${authority}/api/${projectId}/`;
		this.authHeader = `Sentry sentry_key=${publicKey},sentry_version=${protocolVersion},sentry_client=${sentryClient}`;

		this.createRelays();
	}

	public captureEvent(encodedPayload: string): HttpResponse {
		if (!this.initThread) return this.relayCall('CaptureEvent', encodedPayload) as HttpResponse;
		return this.request({
			Url: `${this.baseUrl}store/`,
			Method: 'POST',
			Headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': this.authHeader },
			Body: encodedPayload,
		});
	}

	public captureEnvelope(payload: unknown): HttpResponse {
		if (!this.initThread) return this.relayCall('CaptureEnvelope', payload) as HttpResponse;
		const payloadStr = HttpService.JSONEncode(payload);
		const envelope = HttpService.JSONEncode({ event_id: HttpService.GenerateGUID(false) });
		const item = HttpService.JSONEncode({ type: 'session', length: payloadStr.size() });
		return this.request({
			Url: `${this.baseUrl}envelope/`,
			Method: 'POST',
			Headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': this.authHeader },
			Body: `${envelope}\n${item}\n${payloadStr}`,
		});
	}

	private request(requestOptions: RequestAsyncRequest): HttpResponse {
		if (DateTime.now().UnixTimestamp < this.rateLimitUntil)
			return { Body: '', Headers: {}, StatusCode: 429, StatusMessage: 'Too Many Requests', Success: false };
		const [callSuccess, response] = pcall(() => HttpService.RequestAsync(requestOptions));
		const result: HttpResponse = callSuccess
			? (response as HttpResponse)
			: { Body: '', Headers: {}, StatusCode: 400, StatusMessage: 'InternalError', Success: false };
		const rateLimitReset = result.Headers[string.lower('X-Sentry-Rate-Limit-Reset')];
		const remaining = result.Headers[string.lower('X-Sentry-Rate-Limit-Remaining')];
		if (rateLimitReset && remaining) this.rateLimitUntil = tonumber(remaining) ?? 0;
		else if (result.StatusCode === 429)
			this.rateLimitUntil =
				DateTime.now().UnixTimestamp + (tonumber(result.Headers[string.lower('Retry-After')]) ?? 60);

		return result;
	}

	private relayCall(functionName: string, ...args: unknown[]): unknown {
		const relay = this.getRelay();
		if (!relay) return;
		if (relay.IsA('RemoteFunction')) return relay.InvokeServer(functionName, ...args);
		return (relay as BindableFunction).Invoke(functionName, ...args);
	}

	private getRelay(): RemoteFunction | BindableFunction | undefined {
		if (RunService.IsClient()) return undefined;
		return script.FindFirstChild('ServerRelay') as BindableFunction;
	}

	private createRelays(): void {
		const serverRelay = new Instance('BindableFunction');
		serverRelay.Name = 'ServerRelay';
		serverRelay.Parent = script;
		serverRelay.OnInvoke = (functionName: string, ...args: unknown[]) => {
			const transportSelf = this as unknown as Record<string, Callback>;
			const fn = transportSelf[functionName as string];
			if (fn) return fn(...args);
		};
		const clientRelay = new Instance('RemoteFunction');
		clientRelay.Name = 'ClientRelay';
		clientRelay.Parent = script;
		clientRelay.OnServerInvoke = (_player: Player, ...args: unknown[]) => serverRelay.Invoke(...args);
	}
}

export const Transport = new TransportImpl();
