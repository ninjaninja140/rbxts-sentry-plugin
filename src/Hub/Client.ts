import type { Hint, SentryEvent } from 'Defaults';
import type { Scope } from 'Hub/Scope';
const HttpService = game.GetService('HttpService');
const _TransportMod = require(
	assert(script.Parent?.Parent?.FindFirstChild('Transport'), '[SentrySDK] Missing module: Transport') as unknown as ModuleScript
) as typeof import('../Transport');
const Transport = _TransportMod.Transport;
type Transport = typeof _TransportMod.Transport;

export interface SentrySDKInfo {
	name: string;
	version: string;
	integrations?: string[];
	packages?: Array<{ name: string; version: string }>;
}

export class Client {
	public readonly SDK_INTERFACE: SentrySDKInfo = { name: 'sentry.roblox', version: '1.0.0' };

	public captureEvent(event: SentryEvent, hint: Hint, scope: Scope): void {
		if (!hint) hint = {} as Hint;
		event.event_id =
			(hint.event_id as string | undefined) ??
			(string.gsub(HttpService.GenerateGUID(false), '-', '')[0] as string);
		event.timestamp = DateTime.now().UnixTimestamp;
		event.sdk = this.SDK_INTERFACE;
		event.platform = 'other';
		const processed = scope.applyToEvent(event, hint);
		if (!processed) return;
		const [encodeSuccess, encodedPayload] = pcall(() => HttpService.JSONEncode(processed));
		if (!encodeSuccess) return;
		Transport.captureEvent(encodedPayload as string);
	}

	public close(_timeout?: number): void {}
	public flush(_timeout?: number): void {}
}
