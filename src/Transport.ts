import { HttpService, RunService } from '@rbxts/services';
import type { Options } from './Defaults';

/**
 * The transport is an internal construct of the client that abstracts away
 * the event sending. Typically the transport runs in a separate thread and
 * gets events to send via a queue.
 *
 * The transport is responsible for sending, retrying and handling rate
 * limits. The transport might also persist unsent events across restarts
 * if needed.
 */
export class Transport {
	public static BaseUrl = '';
	public static AuthHeader = '';
	public static InitThread = false;

	private static limitUntil = 0;

	private static requestAsync(requestOptions: RequestAsyncRequest): RequestAsyncResponse {
		if (DateTime.now().UnixTimestamp < Transport.limitUntil) {
			return {
				Body: '',
				Headers: {},
				StatusCode: 429,
				StatusMessage: 'Too Many Requests',
				Success: false,
			};
		}

		const [callSuccess, response] = pcall(() => HttpService.RequestAsync(requestOptions));
		const finalResponse: RequestAsyncResponse = callSuccess
			? (response as RequestAsyncResponse)
			: {
					Body: '',
					Headers: {},
					StatusCode: 400,
					StatusMessage: 'InternalError',
					Success: false,
				};

		const rateLimitReset = finalResponse.Headers[string.lower('X-Sentry-Rate-Limit-Reset')];
		const remaining = finalResponse.Headers[string.lower('X-Sentry-Rate-Limit-Remaining')] ?? math.huge;

		if (rateLimitReset !== undefined && remaining !== undefined) {
			Transport.limitUntil = remaining as unknown as number;
		} else if (finalResponse.StatusCode === 429) {
			Transport.limitUntil =
				DateTime.now().UnixTimestamp +
				((finalResponse.Headers[string.lower('Retry-After')] as unknown as number) ?? 60);
		}

		return finalResponse;
	}

	public static _GetRelay(): RemoteFunction | BindableFunction | undefined {
		if (RunService.IsClient()) {
			// return script.FindFirstChild("ClientRelay") as RemoteFunction;
		} else {
			return script.FindFirstChild('ServerRelay') as BindableFunction;
		}

		return undefined;
	}

	public static _Relay(...args: unknown[]): void {
		const relay = Transport._GetRelay();
		if (!relay) return;

		if (relay.IsA('RemoteFunction')) {
			relay.InvokeServer(...args);
		} else {
			relay.Invoke(...args);
		}
	}

	public static CaptureEvent(encodedPayload: string): RequestAsyncResponse | undefined {
		if (!Transport.InitThread) {
			Transport._Relay('CaptureEvent', encodedPayload);
			return undefined;
		}

		return Transport.requestAsync({
			Url: `${Transport.BaseUrl}store/`,
			Method: 'POST',
			Headers: {
				'Content-Type': 'application/json',
				'X-Sentry-Auth': Transport.AuthHeader,
			},
			Body: encodedPayload,
		});
	}

	public static CaptureEnvelope(payload: unknown): RequestAsyncResponse | undefined {
		if (!Transport.InitThread) {
			Transport._Relay('CaptureEnvelope', payload);
			return undefined;
		}

		const encodedPayload = HttpService.JSONEncode(payload);
		const envelope = HttpService.JSONEncode({ event_id: HttpService.GenerateGUID(false) });
		const item = HttpService.JSONEncode({ type: 'session', length: encodedPayload.size() });

		return Transport.requestAsync({
			Url: `${Transport.BaseUrl}envelope/`,
			Method: 'POST',
			Headers: {
				'Content-Type': 'application/x-sentry-envelope',
				'X-Sentry-Auth': Transport.AuthHeader,
			},
			Body: `${envelope}\n${item}\n${encodedPayload}`,
		});
	}

	public static Init(options: Options, sentryProtocolVersion: number, sentryClient: string): void {
		assert(
			!script.FindFirstChildWhichIsA('BindableFunction'),
			'The SentrySDK Transport can only be initialized once!'
		);
		assert(
			!script.FindFirstChildWhichIsA('RemoteFunction'),
			'The SentrySDK Transport can only be initialized once!'
		);

		Transport.InitThread = true;

		// Process DSN
		const dsn = options.DSN ?? '';
		const [scheme, publicKey, authority, projectId] = string.match(dsn, '^([^:]+)://([^:]+)@([^/]+)/(.+)$');

		assert(scheme, 'Invalid Sentry DSN: Scheme not found.');
		assert(
			(string.lower(scheme as string) as string).match('^https?$')[0] !== undefined,
			'Invalid Sentry DSN: Scheme not valid.'
		);
		assert(publicKey, 'Invalid Sentry DSN: Public Key not found.');
		assert(authority, 'Invalid Sentry DSN: Authority not found.');
		assert(projectId, 'Invalid Sentry DSN: Project ID not found.');

		Transport.BaseUrl = `${scheme}://${authority}/api/${projectId}/`;
		Transport.AuthHeader = `Sentry sentry_key=${publicKey},sentry_version=${sentryProtocolVersion},sentry_client=${sentryClient}`;

		// Set up relays
		const serverRelay = new Instance('BindableFunction');
		serverRelay.Name = 'ServerRelay';
		serverRelay.Parent = script;

		serverRelay.OnInvoke = (functionName: string, ...args: unknown[]) => {
			return (Transport as unknown as Record<string, Callback>)[functionName](Transport, ...args);
		};

		const clientRelay = new Instance('RemoteFunction');
		clientRelay.Name = 'ClientRelay';
		clientRelay.Parent = script;

		clientRelay.OnServerInvoke = (_player: Player, ...args: unknown[]) => {
			// TODO: Player input validation
			// TODO: Forced user scope
			return serverRelay.Invoke(...args);
		};
	}
}
