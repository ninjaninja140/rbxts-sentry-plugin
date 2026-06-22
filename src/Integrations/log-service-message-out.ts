import type { Event, Hint } from '../Defaults';
import type { Hub } from '../Hub';

const LogService = game.GetService('LogService');

interface Integration {
	Name: string;
	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	) => void;
}

const Module: Integration = {
	Name: 'LogServiceMessageOut',

	SetupOnce: (
		_addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	): void => {
		LogService.MessageOut.Connect((message: string, messageType: Enum.MessageType) => {
			if (string.find(message, 'SentrySDK')[0] !== undefined) {
				return;
			}

			if (messageType === Enum.MessageType.MessageWarning) {
				currentHub.CaptureMessage(message, 'warning');
				// } else if (messageType === Enum.MessageType.MessageInfo) {
				// 	currentHub.CaptureMessage(message, "info");
				// } else if (messageType === Enum.MessageType.MessageOutput) {
				// 	currentHub.CaptureMessage(message, "debug");
			}
		});
	},
};

export = Module;
