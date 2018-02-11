/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext) {
	startAutoAttach();
}

export function deactivate() {
}

//---- Node.js Auto Attach

const POLL_INTERVAL = 1000;

const DEBUG_PORT_PATTERN = /\s--(inspect|debug)-port=(\d+)/;
const DEBUG_FLAGS_PATTERN = /\s--(inspect|debug)(-brk)?(=(\d+))?/;

function startAutoAttach() {

	const rootPid = parseInt(process.env['VSCODE_PID']);

	const defaultLaunchConfig = {
		type: 'node',
		name: 'Auto-Attach-Default',
		request: 'attach'
	};

	const pids = new Set<number>();

	pollChildProcesses(rootPid, (pid, cmd) => {
		if (!pids.has(pid)) {
			pids.add(pid);
			if (cmd.indexOf('node ') >= 0) {
				attachChildProcess(pid, cmd, defaultLaunchConfig);
			}
		}
	});
}

/**
 * Poll for all subprocesses of given root process.
 */
function pollChildProcesses(rootPid: number, processFoundCallback: (pid: number, cmd: string) => void) {
	setInterval(() => {
		findChildProcesses(rootPid, processFoundCallback);
	}, POLL_INTERVAL);
}

/**
 * Attach debugger to given process.
 */
function attachChildProcess(pid: number, cmd: string, baseConfig: vscode.DebugConfiguration) {

	const config: vscode.DebugConfiguration = {
		type: 'node',
		request: 'attach',
		name: localize('childProcessWithPid', "Process {0}", pid)
	};

	// selectively copy attributes
	if (baseConfig.timeout) {
		config.timeout = baseConfig.timeout;
	}
	if (baseConfig.sourceMaps) {
		config.sourceMaps = baseConfig.sourceMaps;
	}
	if (baseConfig.outFiles) {
		config.outFiles = baseConfig.outFiles;
	}
	if (baseConfig.sourceMapPathOverrides) {
		config.sourceMapPathOverrides = baseConfig.sourceMapPathOverrides;
	}
	if (baseConfig.smartStep) {
		config.smartStep = baseConfig.smartStep;
	}
	if (baseConfig.skipFiles) {
		config.skipFiles = baseConfig.skipFiles;
	}
	if (baseConfig.showAsyncStacks) {
		config.sourceMaps = baseConfig.showAsyncStacks;
	}
	if (baseConfig.trace) {
		config.trace = baseConfig.trace;
	}

	// match --debug, --debug=1234, --debug-brk, debug-brk=1234, --inspect, --inspect=1234, --inspect-brk, --inspect-brk=1234
	let matches = DEBUG_FLAGS_PATTERN.exec(cmd);
	if (matches && matches.length >= 2) {
		// attach via port
		if (matches.length === 5 && matches[4]) {
			config.port = parseInt(matches[4]);
		}
		config.protocol = matches[1] === 'debug' ? 'legacy' : 'inspector';
	} else {
		// no port -> try to attach via pid (send SIGUSR1)
		config.processId = String(pid);
	}

	// a debug-port=1234 or --inspect-port=1234 overrides the port
	matches = DEBUG_PORT_PATTERN.exec(cmd);
	if (matches && matches.length === 3) {
		// override port
		config.port = parseInt(matches[2]);
	}

	//log(`attach: ${config.protocol} ${config.port}`);

	vscode.debug.startDebugging(undefined, config);
}

/**
 * Find all subprocesses of the given root process
 */
function findChildProcesses(rootPid: number, processFoundCallback: (pid: number, cmd: string) => void) {

	const set = new Set<number>();

	if (!isNaN(rootPid) && rootPid > 0) {
		set.add(rootPid);
	}

	function oneProcess(pid: number, ppid: number, cmd: string) {

		if (set.size === 0) {
			// try to find the root process
			const matches = DEBUG_PORT_PATTERN.exec(cmd);
			if (matches && matches.length >= 3) {
				// since this is a child we add the parent id as the root id
				set.add(ppid);
			}
		}

		if (set.has(ppid)) {
			set.add(pid);
			const matches = DEBUG_PORT_PATTERN.exec(cmd);
			const matches2 = DEBUG_FLAGS_PATTERN.exec(cmd);
			if ((matches && matches.length >= 3) || (matches2 && matches2.length >= 5)) {
				processFoundCallback(pid, cmd);
			}
		}
	}

	if (process.platform === 'win32') {

		const CMD = 'wmic process get CommandLine,ParentProcessId,ProcessId';
		const CMD_PAT = /^(.+)\s+([0-9]+)\s+([0-9]+)$/;

		cp.exec(CMD, { maxBuffer: 1000 * 1024 }, (err, stdout, stderr) => {
			if (!err && !stderr) {
				const lines = stdout.split('\r\n');
				for (let line of lines) {
					let matches = CMD_PAT.exec(line.trim());
					if (matches && matches.length === 4) {
						oneProcess(parseInt(matches[3]), parseInt(matches[2]), matches[1].trim());
					}
				}
			}
		});
	} else {	// OS X & Linux

		const CMD = 'ps -ax -o pid=,ppid=,command=';
		const CMD_PAT = /^\s*([0-9]+)\s+([0-9]+)\s+(.+)$/;

		cp.exec(CMD, { maxBuffer: 1000 * 1024 }, (err, stdout, stderr) => {
			if (!err && !stderr) {
				const lines = stdout.toString().split('\n');
				for (const line of lines) {
					let matches = CMD_PAT.exec(line.trim());
					if (matches && matches.length === 4) {
						oneProcess(parseInt(matches[1]), parseInt(matches[2]), matches[3]);
					}
				}
			}
		});
	}
}
