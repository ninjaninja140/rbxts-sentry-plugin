import type { Event, Hint } from '../Defaults';
import type { Hub } from '../Hub';

const ScriptContext = game.GetService('ScriptContext');

interface Integration {
	Name: string;
	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	) => void;
}

const Module: Integration = {
	Name: 'ScriptContextError',

	SetupOnce: (
		_addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	): void => {
		const hub = currentHub.Clone();

		hub.ConfigureScope((scope) => {
			scope.exception = scope.exception ?? [];
			scope.exception[0] = scope.exception[0] ?? {};
			scope.exception[0].mechanism = scope.exception[0].mechanism ?? {};

			(scope.exception[0].mechanism as Record<string, unknown>).type = 'scriptcontext.error';
			(scope.exception[0].mechanism as Record<string, unknown>).handled = false;
		});

		ScriptContext.Error.Connect((message: string, stackTrace: string, origin: unknown) => {
			const cleanedMessage = (string.match(message, ':%d+: (.+)')[0] as string) ?? message;

			hub.CaptureEvent(
				{
					exception: [
						{
							type: cleanedMessage,
						},
					],
				},
				{
					message: cleanedMessage,
					traceback: stackTrace,
					origin,
				}
			);
		});
	},
};

export = Module;
