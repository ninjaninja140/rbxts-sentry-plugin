import { Players, RunService } from '@rbxts/services';
import type { Hint, SentryEvent } from 'Defaults';

function addGlobalEventProcessor(processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined): void {
	const bindableFunction = new Instance('BindableFunction');
	bindableFunction.SetAttribute(
		'RunContext',
		RunService.IsClient()
			? (Enum.RunContext.Client as unknown as AttributeValue)
			: (Enum.RunContext.Server as unknown as AttributeValue)
	);
	bindableFunction.Name = 'GlobalEventProcessor';
	bindableFunction.OnInvoke = processor;
	bindableFunction.Parent = script;
}

const remoteEvent = script.Parent?.WaitForChild('RemoteEvent') as RemoteEvent | undefined;

const integrationsToLoad = ['ScriptContextError', 'LogServiceMessageOut', 'StackProcessor'];
const integrationsFolder = script.Parent?.Parent;

if (integrationsFolder) {
	for (const name of integrationsToLoad) {
		const mod = integrationsFolder.WaitForChild(name) as ModuleScript | undefined;
		if (mod) {
			const integration = require(mod) as {
				SetupOnce: (
					addFn: (p: (e: SentryEvent, h: Hint) => SentryEvent | undefined) => void,
					hub: unknown
				) => void;
			};
			if (integration.SetupOnce !== undefined) {
				const addGlobalProcessor = (processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined) => {
					addGlobalEventProcessor(processor);
				};
				integration.SetupOnce(addGlobalProcessor, undefined as unknown);
			}
		}
	}
}

export function setupClientRelay(hub: unknown): void {
	(
		hub as {
			configureScope: (
				cb: (scope: {
					configureScope(
						cb: (s: { setExtra(key: string, value: string): void; setUser(player: Player): void }) => void
					): void;
					addEventProcessor(processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined): void;
				}) => void
			) => void;
		}
	).configureScope((scope) => {
		scope.configureScope((s) => {
			s.setExtra('logger', 'client');
			s.setUser(Players.LocalPlayer);
		});

		scope.addEventProcessor((_event: SentryEvent, _hint: Hint) => {
			remoteEvent?.FireServer(_event, _hint);
			return undefined; // Don't send from client directly
		});
	});
}
