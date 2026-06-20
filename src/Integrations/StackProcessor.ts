import type { Hint, Integration as IntegrationType, SentryEvent, SentryStackFrame } from 'Defaults';

function sanitizeEnvironment(env: unknown): Record<string, string | number> | undefined {
	if (!env) return undefined;
	const sanitized: Record<string, string | number> = {};
	for (const [key, value] of pairs(env as object)) {
		sanitized[tostring(key)] = tonumber(tostring(value)) ?? tostring(value);
	}
	return sanitized;
}

function convertStacktraceToFrames(event: SentryEvent, hint: Hint): SentryEvent {
	if (!hint?.traceback) return event;
	const traceback = hint.traceback as string;
	const stacktraceFrames: SentryStackFrame[] = [];
	let index = 0;

	const gmatchLines = string.gmatch(traceback, '[^\n\r]+') as unknown as () => string | undefined;
	while (true) {
		const line = gmatchLines();
		if (line === undefined) break;
		if ((string.match(line, '^Stack Begin$') as LuaTuple<unknown[]>)[0]) continue;
		if ((string.match(line, '^Stack End$') as LuaTuple<unknown[]>)[0]) continue;
		index++;

		const variables = hint.environments ? (hint.environments as defined[])[index - 1] : undefined;
		const sourceScript = variables ? (variables as { script?: Script }).script : undefined;

		let path: string | undefined;
		let lineNumberStr: string | undefined;
		let functionName: string | undefined;

		if ((string.find(line, '^Script ') as LuaTuple<unknown[]>)[0]) {
			const match = string.match(line, "^Script '(.+)', Line (%d+)%s?%-?%s?(.*)$") as LuaTuple<
				(string | number)[]
			>;
			path = match[0] as string;
			lineNumberStr = match[1] as string;
			functionName = match[2] as string;
		} else if ((string.find(line, ', line') as LuaTuple<unknown[]>)[0]) {
			const match = string.match(line, '^(.+), line (%d+)%s?%-?%s?(.*)$') as LuaTuple<(string | number)[]>;
			path = match[0] as string;
			lineNumberStr = match[1] as string;
			functionName = match[2] as string;
		} else {
			const match = string.match(line, '^(.+):(%d+)%s?%-?%s?(.*)$') as LuaTuple<(string | number)[]>;
			path = match[0] as string;
			lineNumberStr = match[1] as string;
			functionName = match[2] as string;
		}

		if (functionName) {
			functionName = string.gsub(functionName, 'function ', '')[0];
			if (functionName === 'CaptureException') continue;
		}

		if (path && lineNumberStr) {
			const parts = string.split(path, '.');
			const moduleName = sourceScript ? sourceScript.Name : parts[parts.size() - 1];
			stacktraceFrames.insert(0, {
				function: functionName,
				filename: path,
				lineno: tonumber(lineNumberStr),
				module: moduleName,
				vars: sanitizeEnvironment(variables),
			});
		} else {
			stacktraceFrames.insert(0, {
				filename: sourceScript ? sourceScript.GetFullName() : undefined,
				module: line as unknown as string,
				vars: sanitizeEnvironment(variables),
			});
		}
	}

	if (stacktraceFrames.size() > 0) {
		if (event.exception) event.exception.stacktrace = { frames: stacktraceFrames };
		else if (hint.thread) {
			event.threads = event.threads ?? [];
			event.threads.insert(0, {
				id: string.gsub(tostring(hint.thread), 'thread: ', '')[0],
				stacktrace: { frames: stacktraceFrames },
			});
		}
	} else {
		event.errors = event.errors ?? [];
		event.errors.push({ type: 'native_symbolicator_failed', details: 'Failed to process native stacktraces.' });
	}
	return event;
}

const Integration: IntegrationType = {
	Name: 'StackProcessor',
	SetupOnce(
		addGlobalEventProcessor: (processor: (event: SentryEvent, hint: Hint) => SentryEvent | undefined) => void
	) {
		addGlobalEventProcessor((event, hint) => convertStacktraceToFrames(event, hint));
	},
};

export = Integration;
