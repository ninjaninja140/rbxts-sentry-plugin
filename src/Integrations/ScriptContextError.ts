import type { Hint, Integration as IntegrationType, SentryEvent } from 'Defaults';
const ScriptContext = game.GetService('ScriptContext');

type HubLike = {
	options?: { CaptureErrors?: boolean };
	clone(): HubLike;
	configureScope(callback: (scope: { setExtra(key: string, value: string): void }) => void): void;
	captureEvent(event: SentryEvent, hint: Hint): void;
};

const Integration: IntegrationType = {
	Name: 'ScriptContextError',

	SetupOnce(
		_addGlobalEventProcessor: (processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined) => void,
		currentHub: HubLike
	) {
		// Respect CaptureErrors option (defaults to true)
		if (currentHub.options?.CaptureErrors === false) {
			return;
		}

		const hub = currentHub.clone();

		hub.configureScope((scope: { setExtra(key: string, value: string): void }) => {
			scope.setExtra('_mechanism_type', 'scriptcontext.error');
			scope.setExtra('_mechanism_handled', 'false');
		});

		let isProcessing = false;
		ScriptContext.Error.Connect((message: string, stackTrace: string, origin?: LuaSourceContainer) => {
			// Prevent re-entrancy: if capturing this error would trigger another ScriptContext.Error,
			// skip to avoid "Maximum event re-entrancy depth exceeded"
			if (isProcessing) return;
			isProcessing = true;

			const [ok, cleaned] = pcall(() => {
				const match = (string.match(message, ':%d+: (.+)') as LuaTuple<unknown[]>)[0];
				return (match ?? message) as string;
			});
			if (!ok) {
				isProcessing = false;
				return;
			}

			const [captureOk] = pcall(() =>
				hub.captureEvent(
					{
						exception: {
							type: cleaned,
							mechanism: {
								type: 'scriptcontext.error',
								handled: false,
							},
						},
					},
					{
						message: cleaned,
						traceback: stackTrace,
						origin: origin,
					} as Hint
				)
			);

			isProcessing = false;
		});
	},
};

export = Integration;
