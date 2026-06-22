import { HttpService } from '@rbxts/services';
import type { Event, Hint, SdkInterface } from '../Defaults';
import { Transport } from '../Transport';
import type { Scope } from './Scope';

/**
 * A Client is the part of the SDK that is responsible for event creation. To give
 * an example, the Client should convert an exception to a Sentry event.
 *
 * The Client should be stateless, it gets the Scope injected and delegates the
 * work of sending the event to the Transport.
 */
class Client {
	public SDK_INTERFACE?: SdkInterface;

	/**
	 * Captures the event by merging it with other data with defaults from the client.
	 *
	 * In addition, if a scope is passed to this system, the data from the scope
	 * passes it to the internal transport.
	 */
	public CaptureEvent(event: Event, hint?: Hint, scope?: Scope): void {
		if (!hint) hint = {};

		event.event_id = (hint.event_id as string) ?? string.gsub(HttpService.GenerateGUID(false), '-', '')[0];
		event.timestamp = DateTime.now().UnixTimestamp;
		event.sdk = this.SDK_INTERFACE;
		event.platform = 'other';

		if (scope) {
			event = scope.ApplyToEvent(event, hint) as Event;
		}

		if (!event) {
			return;
		}

		const [encodeSuccess, encodedPayload] = pcall(() => HttpService.JSONEncode(event));

		if (!encodeSuccess) return;

		Transport.CaptureEvent(encodedPayload as string);
	}

	/**
	 * Flushes out the queue for up to timeout seconds. If the client can guarantee
	 * delivery of events only up to the current point in time this is preferred. This
	 * might block for timeout seconds.
	 *
	 * The client is disabled after this method is called.
	 */
	public Close(_timeout?: number): void {
		// Not yet implemented
	}

	/**
	 * Same as close difference is that the client is NOT disposed after invocation.
	 */
	public Flush(_timeout?: number): void {
		// Not yet implemented
	}
}

export { Client };
