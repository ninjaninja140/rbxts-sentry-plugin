import type { Event, Hint } from '../Defaults';
import type { Hub } from '../Hub';

interface Integration {
	Name: string;
	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		currentHub: Hub
	) => void;
}

// Luau table helpers (available at runtime but not fully typed in roblox-ts)
const luaTable = table as unknown as { insert: <T>(t: Array<T>, ...args: unknown[]) => void };
const tableInsert = (t: Array<unknown>, ...args: unknown[]) => luaTable.insert(t, ...args);

function sanitizeEnvironment(
	environment: Record<string, unknown> | undefined
): Record<string, string | number> | undefined {
	if (!environment) return undefined;

	const sanitized: Record<string, string | number> = {};

	for (const [index, value] of pairs(environment)) {
		sanitized[tostring(index)] = tonumber(value as string) ?? tostring(value);
	}

	return sanitized;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertStacktraceToFrames(event: Event, hint: Hint): Event {
	if (!hint) return event;
	if (!hint.traceback) return event;

	const stacktraceFrames: Array<Record<string, unknown>> = [];
	let index = 0;

	// Iterate over lines in the traceback using gmatch
	const gmatchIter = string.gmatch(hint.traceback, '[^\n\r]+');
	let lineMatch = gmatchIter();

	while (lineMatch.size() > 0 && lineMatch[0] !== undefined) {
		const line = lineMatch[0] as string;

		// Skip stack boundary markers
		if (line.match('^Stack Begin$')[0] !== undefined) {
			lineMatch = gmatchIter();
			continue;
		}
		if (line.match('^Stack End$')[0] !== undefined) {
			lineMatch = gmatchIter();
			continue;
		}

		index += 1;

		let path: string | undefined;
		let lineNumber: string | undefined;
		let functionName: string | undefined;
		const variables = hint.environments ? hint.environments[index - 1] : undefined;
		const sourceScript = variables ? (variables.script as Instance | undefined) : undefined;

		if (line.find('^Script ')[0] !== undefined) {
			const matches = line.match("^Script '(.-)', Line (%d+)%s?%-?%s?(.*)$");
			path = matches[0] as string | undefined;
			lineNumber = matches[1] as string | undefined;
			functionName = matches[2] as string | undefined;
		} else if (line.find(', line')[0] !== undefined) {
			const matches = line.match('^(.-), line (%d+)%s?%-?%s?(.*)$');
			path = matches[0] as string | undefined;
			lineNumber = matches[1] as string | undefined;
			functionName = matches[2] as string | undefined;
		} else {
			const matches = line.match('^(.-):(%d+)%s?%-?%s?(.*)$');
			path = matches[0] as string | undefined;
			lineNumber = matches[1] as string | undefined;
			functionName = matches[2] as string | undefined;
		}

		if (functionName) {
			functionName = (functionName as string).gsub('function ', '')[0];

			if (functionName === 'CaptureException') {
				lineMatch = gmatchIter();
				continue;
			}
		}

		if (path && lineNumber) {
			tableInsert(stacktraceFrames, 1, {
				function: functionName,
				filename: path,
				lineno: tonumber(lineNumber),
				module: sourceScript ? sourceScript.Name : select(-1, ...string.split(path, '.')),
				vars: sanitizeEnvironment(variables),
			});
		} else {
			tableInsert(stacktraceFrames, 1, {
				filename: sourceScript ? sourceScript.GetFullName() : undefined,
				module: line,
				vars: sanitizeEnvironment(variables),
			});
		}

		lineMatch = gmatchIter();
	}

	const frameCount = (stacktraceFrames as unknown as Array<unknown>).size();

	if (frameCount > 0) {
		if (event.exception && event.exception.size() > 0) {
			// Attach stacktrace to the first exception entry
			const exceptionTable = event.exception as unknown as Record<string, unknown>;
			exceptionTable.stacktrace = {
				frames: stacktraceFrames,
			};
		} else if (hint.thread) {
			event.threads = event.threads ?? [];
			tableInsert(event.threads, 1, {
				id: (tostring(hint.thread) as string).gsub('thread: ', '')[0],
				stacktrace: {
					frames: stacktraceFrames,
				},
			});
		}
	} else {
		event.errors = event.errors ?? [];
		tableInsert(event.errors, {
			type: 'native_symbolicator_failed',
			details: 'Failed to process native stacktraces.',
		});
	}

	return event;
}

const Module: Integration = {
	Name: 'StackProcessor',

	SetupOnce: (
		addGlobalEventProcessor: (fn: (event: Event, hint: Hint) => Event | undefined) => void,
		_currentHub: Hub
	): void => {
		addGlobalEventProcessor(convertStacktraceToFrames);
	},
};

export = Module;
