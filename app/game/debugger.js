storage = createStorage('ls', 'YaGameDebugger', {
	currentGameName: '',
	currentN: 1,
	currentGameState: '',
	currentView: -1,
	currentIsPlaying: false,
});
storageData = storage.load();

currentGameName = undefined;
currentGameId = undefined;
currentN = storageData.currentN;
currentGameState = storageData.currentGameState;
currentGameStateObject = {};
selectGameElements = [];
gameRule = undefined;
gameRenderer = undefined;
lastView = undefined;
lastIsPlaying = undefined;

function isOk() {
	if (currentGameId === undefined) {
		return false;
	}
	const game = games[currentGameId];
	const Rule = game.rule;
	gameRule = new Rule();
	return gameRule.allowedN(currentN);
}

function updateState() {
	if (isOk()) {
		document.getElementById('startbutton').classList.remove('disabled');
	} else {
		document.getElementById('startbutton').classList.add('disabled');
	}
	for (let id = 0; id < games.length; ++id) {
		if (id === currentGameId) {
			selectGameElements[id].classList.add('active');
		} else {
			selectGameElements[id].classList.remove('active');
		}
	}

}

function resetGameState() {
	const players = [];
	for (let id = 0; id < currentN; ++id) {
		players.push({ user: `玩家#${id}` });
	}
	gameRule.init(players);
	currentGameStateObject = gameRule.state;
	currentGameState = JSON.stringify(currentGameStateObject, undefined, 4);
	document.getElementById('gamestate').value = currentGameState;
	storageData.currentGameState = currentGameState;
	if (storageData.currentView > currentN) {
		storageData.currentView = currentN;
	}
	storage.save();
}

function changeGameState() {
	const view = parseInt(document.getElementById('viewnumber').value);
	const isPlaying = view === -1 ? false : (!document.getElementById('isreplay').checked);
	if (lastView !== view || lastIsPlaying !== isPlaying) {
		lastView = view;
		lastIsPlaying = isPlaying;
		storageData.currentView = view;
		storageData.currentIsPlaying = isPlaying;
		gameRule.state = currentGameStateObject;
		const game = games[currentGameId];
		const Renderer = game.renderer;
		gameRenderer = new Renderer(document.getElementById('gameinfo'));
		gameRenderer.init(gameRule.projection(storageData.currentView), storageData.currentIsPlaying);
	}
	gameRule.state = currentGameStateObject;
	gameRenderer.render(gameRule.projection(storageData.currentView), storageData.currentIsPlaying);
}

function startGame() {
	if (gameRenderer) {
		yaGameAlert('错误：调试器已经启动');
		return;
	}
	if (!isOk()) {
		yaGameAlert('错误：配置不符合要求');
		return;
	}
	currentGameName = games[currentGameId].name;
	try {
		if (storageData.currentGameName !== currentGameName || storageData.currentN !== currentN) {
			throw '';
		}
		currentGameStateObject = JSON.parse(currentGameState);
	} catch {
		storageData.currentGameName = currentGameName;
		storageData.currentN = currentN;
		resetGameState();
	}
	document.getElementById('gamestate').value = currentGameState;
	changeGameState();

	document.getElementById('debuggerinfo').innerText = `调试器（${currentN}人，${currentGameName}）`;
	document.getElementById('updatestate').classList.remove('disabled');
	document.getElementById('resetstate').classList.remove('disabled');
	document.getElementById('debugpanel').classList.remove('hidden');
	document.getElementById('startdebugger').close();
}

for (let id = 0; id < games.length; ++id) {
	const game = games[id];
	if (game.name === storageData.currentGameName) {
		currentGameId = id;
	}
	const selectGameElement = document.createElement('div');
	selectGameElement.className = 'button';
	selectGameElement.innerText = `${game.name}`;
	selectGameElement.addEventListener('click', function () {
		currentGameId = id;
		updateState();
	});
	selectGameElements.push(selectGameElement);
	document.getElementById('games').appendChild(selectGameElement);
}
document.getElementById('usernumber').addEventListener('input', function () {
	try {
		currentN = parseInt(document.getElementById('usernumber').value);
	} catch {
		currentN = -1;
	}
	updateState();
});
document.getElementById('startbutton').addEventListener('click', startGame);
document.getElementById('updatestate').addEventListener('click', function () {
	if (!gameRule) {
		return;
	}
	currentGameState = document.getElementById('gamestate').value;
	currentGameStateObject = JSON.parse(currentGameState);
	changeGameState();
	storage.save();
});
document.getElementById('resetstate').addEventListener('click', function () {
	yaGameConfirm('确定要重置状态吗？').then(function (x) {
		if (x) {
			resetGameState();
			changeGameState();
			storage.save();
		}
	});
});
updateState();
document.getElementById('usernumber').value = currentN;