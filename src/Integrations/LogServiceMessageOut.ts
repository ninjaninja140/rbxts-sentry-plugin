import { LogService } from '@rbxts/services';
import type { Hint, Integration as IntegrationType, Level, SentryEvent } from 'Defaults';

type HubLike = {
	options?: { CaptureWarnings?: boolean; CaptureInfos?: boolean; CaptureDebugs?: boolean };
	captureMessage(message: string, level?: Level): void;
};

function messageTypeToLevel(messageType: Enum.MessageType): Level | undefined {
	if (messageType === Enum.MessageType.MessageError) return 'error';
	if (messageType === Enum.MessageType.MessageWarning) return 'warning';
	if (messageType === Enum.MessageType.MessageInfo) return 'info';
	return undefined;
}

function shouldCapture(
	messageType: Enum.MessageType,
	options: { CaptureWarnings?: boolean; CaptureInfos?: boolean; CaptureDebugs?: boolean }
): boolean {
	if (messageType === Enum.MessageType.MessageError) return true; // errors always captured
	if (messageType === Enum.MessageType.MessageWarning) return options.CaptureWarnings ?? true;
	if (messageType === Enum.MessageType.MessageInfo) return options.CaptureInfos ?? false;
	if (messageType === Enum.MessageType.MessageOutput) return options.CaptureDebugs ?? false;
	return false;
}

const Integration: IntegrationType = {
	Name: 'LogServiceMessageOut',

	SetupOnce(
		_addGlobalEventProcessor: (processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined) => void,
		currentHub: HubLike
	) {
		LogService.MessageOut.Connect((message: string, messageType: Enum.MessageType) => {
			if ((string.find(message, 'SentrySDK') as LuaTuple<unknown[]>)[0]) return;

			const options = currentHub.options ?? {};
			if (!shouldCapture(messageType, options)) return;

			const level = messageTypeToLevel(messageType);
			currentHub.captureMessage(message, level ?? 'info');
		});
	},
};

export = Integration;
