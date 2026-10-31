(function () {
	const vscode = acquireVsCodeApi();
	const messages = {
		success: ['LOOKING GOOD.', 'ALL SYSTEMS NORMAL.', 'BUILD SUCCESSFUL.', "WE'RE DOING GREAT."],
		warning: ['I HAVE CONCERNS.', 'SOMETHING LOOKS OFF.', 'PLEASE CHECK THAT LINE.', 'ONE LITTLE PROBLEM.'],
		'multiple-errors': ['WHY ARE THERE SO MANY?', 'WE NEED TO TALK.', 'THIS IS GETTING OUT OF HAND.', 'PLEASE REVIEW YOUR CODE.'],
		'system-overload': ['I NEED A RESTART.', 'PLEASE STOP.', 'SYSTEM OVERLOAD.', "I CAN'T PROCESS THIS.", 'THIS IS FINE. PROBABLY.'],
	};
	const statusLabels = {
		success: 'SYSTEM STATUS: ONLINE',
		warning: 'SYSTEM STATUS: WARNING',
		'multiple-errors': 'SYSTEM STATUS: ERROR',
		'system-overload': 'SYSTEM STATUS: CRITICAL',
	};
	const expressions = {
		success: ':)',
		warning: ':/',
		'multiple-errors': '>:(',
		'system-overload': 'D:',
	};
	const achievementLabels = {
		'perfect-build': 'PERFECT BUILD!',
		'tests-passed': 'TESTS PASSED!',
	};
	let currentState;
	let messageIndex = 0;
	const image = document.getElementById('computer-image');

	function metricText(metric) {
		const percent = (metric.value * 100).toFixed(1).replace(/\.0$/, '');
		return `${metric.name}: ${percent}%`;
	}

	function getAchievementLabel(achievement) {
		if (!achievement || achievement.kind === 'perfect-build' || !achievement.metric) {
			return achievement ? achievementLabels[achievement.kind] : '';
		}
		if (achievement.metric.name.toLowerCase().startsWith('val_')) {
			return 'VALIDATION PASSED';
		}
		if (achievement.metric.name.toLowerCase() === 'test_accuracy') {
			return achievementLabels['tests-passed'];
		}
		return 'EVALUATION PASSED';
	}

	function render(state) {
		currentState = state;
		const achievement = state.achievement;
		if (currentState.state !== render.previousState || achievement?.id !== render.previousAchievement) {
			messageIndex = 0;
			render.previousState = currentState.state;
			render.previousAchievement = achievement?.id;
		}

		const root = document.getElementById('companion');
		root.className = `state-${state.state}${achievement ? ` achievement-active achievement-${achievement.kind}` : ''}${state.settings.animationEnabled ? ' animations-enabled' : ''}`;
		image.dataset.fallbackApplied = 'false';
		image.onerror = () => {
			if (image.dataset.fallbackApplied !== 'true') {
				image.dataset.fallbackApplied = 'true';
				image.src = window.errorExeFallbackImages[state.state];
			}
		};
		image.src = window.errorExeImages[achievement?.kind ?? state.state];
		const status = achievement ? getAchievementLabel(achievement) : statusLabels[state.state];
		const screenMessage = achievement
			? (achievement.metric ? metricText(achievement.metric) : achievement.kind === 'perfect-build' ? 'WE DID IT!' : 'ALL TESTS PASSED!')
			: messages[state.state][messageIndex];
		document.getElementById('status-label').textContent = status;
		document.getElementById('terminal-status').textContent = status;
		document.getElementById('terminal-message').textContent = screenMessage;
		document.getElementById('terminal-counts').textContent = achievement
			? (achievement.metric ? metricText(achievement.metric) : 'BUILD COMPLETE')
			: `ERRORS: ${state.errors}  WARNINGS: ${state.warnings}`;
		document.getElementById('expression').textContent = achievement
			? (achievement.kind === 'perfect-build' ? '^_^' : ':)')
			: expressions[state.state];
		document.getElementById('message').textContent = achievement
			? (achievement.kind === 'perfect-build' ? 'WE DID IT!' : screenMessage)
			: messages[state.state][messageIndex];
		document.getElementById('error-count').textContent = state.errors;
		document.getElementById('warning-count').textContent = state.warnings;
		document.getElementById('paused-label').hidden = !state.paused;
		document.getElementById('disabled-label').hidden = state.settings.enabled;
		document.getElementById('pause').textContent = state.paused ? 'Resume reactions' : 'Pause reactions';
	}

	document.getElementById('open-all').addEventListener('click', () => {
		vscode.postMessage({ type: 'open-problems', filter: 'all' });
	});
	document.getElementById('errors').addEventListener('click', () => {
		vscode.postMessage({ type: 'open-problems', filter: 'errors' });
	});
	document.getElementById('warnings').addEventListener('click', () => {
		vscode.postMessage({ type: 'open-problems', filter: 'warnings' });
	});
	document.getElementById('refresh').addEventListener('click', () => {
		vscode.postMessage({ type: 'refresh' });
	});
	document.getElementById('pause').addEventListener('click', () => {
		vscode.postMessage({ type: 'toggle-pause' });
	});
	window.addEventListener('message', event => {
		if (event.data?.type === 'state') {
			render(event.data.state);
		} else if (event.data?.type === 'rotate-message' && currentState && !currentState.achievement) {
			messageIndex = (messageIndex + 1) % messages[currentState.state].length;
			render(currentState);
		}
	});

	vscode.postMessage({ type: 'ready' });
})();
