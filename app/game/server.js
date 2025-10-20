globalServerID = '';
isPublic = false;

function generateServerID() {
	key = 'GAME_';
	for (let i = 0; i < 6; ++i) {
		key += String.fromCodePoint(Math.floor(Math.random() * 26) + 65);
	}
	return key;
}

storage = createStorage('ls', 'YaGameGameroom', {
	currentGame: {
		created: false,
		started: false,
		ended: false,
		name: '',
		players: [],
	},
	currentGameState: {},
	currentGameHistory: [],
	historyGame: [],
});
storageData = storage.load();
abortGameEnabled = false;
startGameEnabled = false;


client = createClient('ws');
client.connect('YaGameHall250925', 'VISITOR');

function updateServerGameInfo() {
	try {
		client.send({ type: 'room', room: storageData.currentGame });
	} catch {
		// Do nothing.
	}
	printGameInfo(storageData.currentGame, true);
	abortGameEnabled = storageData.currentGame.created && !storageData.currentGame.ended;
	if (abortGameEnabled) {
		document.getElementById('abortgame').classList.remove('disabled');
	} else {
		document.getElementById('abortgame').classList.add('disabled');
	}
	startGameEnabled = storageData.currentGame.created && !storageData.currentGame.started && !storageData.currentGame.ended;
	if (startGameEnabled) {
		document.getElementById('startgame').classList.remove('disabled');
		document.getElementById('enterroom').classList.remove('disabled');
	} else {
		document.getElementById('startgame').classList.add('disabled');
		document.getElementById('enterroom').classList.add('disabled');
	}
}

server = createServer('ws');
server.open = function (id) {
	globalServerID = id;
	storageData.currentGame.id = id;
	document.getElementById('serverid').classList.remove('red')
	document.getElementById('serverid').innerText = `服务器ID：${id}`;
	document.getElementById('serverinfo').classList.remove('hidden');
	document.getElementById('infopanel').classList.remove('hidden');
	if (storageData.currentGame.created) {
		const Rule = games.find(function (x) { return x.name === storageData.currentGame.name; }).rule;
		gameRule = new Rule();
		gameRule.send = function (data, id, err = false) {
			server.send(err ? data : {
				type: 'data',
				name: storageData.currentGame.name,
				data: data,
			}, storageData.currentGame.players[id].user, err);
		};
		gameRule.updateState = function () {
			storageData.currentGameState = gameRule.state;
			storageData.currentGameHistory = gameRule.history;
			if (gameRule.state.end) {
				endGame();
			}
			updateServerGameInfo();
		};
		server.send({
			type: 'info',
			info: storageData.currentGame,
		});
		if (storageData.currentGame.started) {
			gameRule.load(storageData.currentGameState, storageData.currentGameHistory);
		}
	}
	storage.save();
	updateServerGameInfo();
	// createMessage({ type: 'system', content: `服务器已启动，ID：${id}` });
	document.getElementById('serverinfo').addEventListener('click', function () {
		copyText(id);
	});
};
server.receive = function (data, user) {
	if (typeof data !== 'object' || typeof data.type !== 'string') {
		server.send('Incorrect data format', user, true);
		return;
	}
	switch (data.type) {
		case 'state':
			const id1 = storageData.currentGame.players.findIndex(function (x) { return x.user === user; });
			if (storageData.currentGame.started && !storageData.currentGame.ended && id1 >= 0) {
				gameRule.resend(id1);
			} else {
				server.send({
					type: 'info',
					info: storageData.currentGame,
				}, user);
			}
			break;
		case 'join':
			if (!storageData.currentGame.created) {
				server.send('还没有游戏，请耐心等待', user, true);
				break;
			}
			if (storageData.currentGame.started || storageData.currentGame.ended) {
				server.send('游戏已经开始/结束了，请等待下一轮游戏', user, true);
				break;
			}
			if (storageData.currentGame.players.some(function (x) { return x.user === user; })) {
				server.send(`您已经加入游戏了`, user, true);
				break;
			}
			if (storageData.currentGame.players.length >= gameRule.maxN) {
				server.send(`当前游戏规则最多允许${gameRule.maxN}名玩家`, user, true);
				break;
			}
			storageData.currentGame.players.push({
				user: user,
			});
			updateServerGameInfo();
			server.send({
				type: 'info',
				info: storageData.currentGame,
			});
			break;
		case 'quit':
			if (!storageData.currentGame.created) {
				server.send('还没有游戏，请耐心等待', user, true);
				break;
			}
			if (storageData.currentGame.started || storageData.currentGame.ended) {
				server.send('游戏已经开始/结束了，请等待下一轮游戏', user, true);
				break;
			}
			if (storageData.currentGame.players.some(function (x) { return x.user === user; })) {
				storageData.currentGame.players = storageData.currentGame.players.filter(function (x) { return x.user !== user; });
				updateServerGameInfo();
				server.send({
					type: 'info',
					info: storageData.currentGame,
				});
			}
			break;
		case 'move':
			if (!storageData.currentGame.started || storageData.currentGame.ended) {
				server.send('游戏尚未开始或已经结束', user, true);
				break;
			}
			const id = storageData.currentGame.players.findIndex(function (x) { return x.user === user; });
			if (id < 0) {
				server.send('您不在游戏内，请耐心等待下一轮游戏', user, true);
				break;
			}
			gameRule.receive(data.move, id);
			break;
		default:
			server.send(`Unknown data type ${data.type}`, user, true);
			break;
	}
	storage.save();
	updateServerGameInfo();
};
server.close = function () {
	document.getElementById('serverid').classList.add('red')
	document.getElementById('serverid').innerText = '服务器已关闭';
	yaGameAlert('服务器已关闭');
};
server.error = function (err) {
	yaGameAlert(err);
};
onClosePage(function () {
	server.disconnect();
	client.send({ type: 'room', room: { id: storageData.currentGame.id, ended: true } });
});
document.getElementById('startbutton').addEventListener('click', function () {
	const serverID = document.getElementById('inputserverid').value;
	isPublic = document.getElementById('inputispublic').checked;
	if (!serverID) {
		yaGameAlert('错误：服务器ID不能为空');
		return;
	}
	storageData.currentGame.isPublic = isPublic;
	if (isPublic) {
		server.connect({
			server: {
				id: serverID,
			},
			isPublic: true,
		});
	} else {
		server.connect({
			server: {
				id: serverID,
			},
			keys: SECRETS.KEYS,
		});
	}
	document.getElementById('startserver').close();
});
document.getElementById('inputserverid').value = generateServerID();
document.getElementById('inputispublic').checked = true;
if (!window.SECRETS) {
	document.getElementById('inputispublic').disabled = true;
}

let gameRule;
function createGame(game) {
	const Rule = game.rule;
	gameRule = new Rule();
	storageData.currentGame = {
		isPublic: isPublic,
		id: globalServerID,
		created: true,
		started: false,
		ended: false,
		name: game.name,
		players: [],
		rule: gameRule.rule(),
	};
	storageData.currentGameState = {};
	storageData.currentGameHistory = [];
	server.send({
		type: 'info',
		info: storageData.currentGame,
	});
	storage.save();
	updateServerGameInfo();
}
function endGame() {
	storageData.currentGame.ended = true;
	const endTime = new Date();
	if (storageData.currentGame.started) {
		storageData.historyGame.push({
			time: endTime.toLocaleDateString() + ' ' + endTime.toLocaleTimeString(),
			game: storageData.currentGame,
			history: storageData.currentGameHistory,
		});
	}
	server.send({
		type: 'info',
		info: storageData.currentGame,
	});
	storage.save();
	updateServerGameInfo();
	loadHistory();
}
document.getElementById('abortgame').addEventListener('click', function () {
	if (!abortGameEnabled) {
		return;
	}
	yaGameConfirm('确定要终止游戏吗？').then(function (yes) {
		if (yes) {
			if (storageData.currentGame.started && !storageData.currentGame.ended) {
				gameRule.state.end = true;
				server.send({ type: 'abort' });
				updateServerGameInfo();
			}
			endGame();
		}
	});
});
document.getElementById('enterroom').addEventListener('click', function () {
	if (!startGameEnabled) {
		return;
	}
	if (storageData.currentGame.isPublic) {
		open(`client.html?id=${storageData.currentGame.id}&public=1`);
	} else {
		open(`client.html?id=${storageData.currentGame.id}`);
	}
});
document.getElementById('startgame').addEventListener('click', function () {
	if (!startGameEnabled) {
		return;
	}
	if (storageData.currentGame.players.length > gameRule.maxN) {
		yaGameAlert(`当前游戏规则最多允许${gameRule.maxN}名玩家`);
		return;
	}
	if (!gameRule.allowedN(storageData.currentGame.players.length)) {
		yaGameAlert(`当前游戏规则不允许${storageData.currentGame.players.length}名玩家`);
		return;
	}
	yaGameConfirm('确定要开始游戏吗？').then(function (yes) {
		if (yes) {
			storageData.currentGame.started = true;
			gameRule.send = function (data, id, err = false) {
				if (!storageData.currentGame.created || storageData.currentGame.ended) {
					return;
				}
				server.send(err ? data : {
					type: 'data',
					name: storageData.currentGame.name,
					data: data,
				}, storageData.currentGame.players[id].user, err);
			};
			gameRule.updateState = function () {
				if (!storageData.currentGame.created || storageData.currentGame.ended) {
					return;
				}
				storageData.currentGameState = gameRule.state;
				storageData.currentGameHistory = gameRule.history;
				if (gameRule.state.end) {
					endGame();
				}
				updateServerGameInfo();
			};
			gameRule.init(storageData.currentGame.players);
			server.send({
				type: 'info',
				info: storageData.currentGame,
			});
		}
	});
});

inHistory = false;
inHistoryGame = false;
document.getElementById('toggleview').addEventListener('click', function () {
	if (inHistoryGame) {
		inHistoryGame = false;
		inHistory = true;
		loadHistory();
		document.getElementById('gameinfo').classList.add('nodisplay');
		document.getElementById('history').classList.remove('nodisplay');
		document.getElementById('toggleview').innerText = '查看当前游戏';
	} else {
		inHistory = !inHistory;
		if (inHistory) {
			loadHistory();
			document.getElementById('gameinfo').classList.add('nodisplay');
			document.getElementById('history').classList.remove('nodisplay');
			document.getElementById('toggleview').innerText = '查看当前游戏';
		} else {
			document.getElementById('history').classList.add('nodisplay');
			document.getElementById('gameinfo').classList.remove('nodisplay');
			document.getElementById('toggleview').innerText = '查看历史记录';
		}
	}
})
const historyElement = document.getElementById('history');
function loadGame(game) {
	inHistoryGame = true;
	document.getElementById('toggleview').innerText = '返回历史记录';
	historyElement.innerHTML = '';

	const stateElement = document.createElement('div');
	stateElement.style.display = 'flex';
	stateElement.style.flexDirection = 'column';
	stateElement.style.alignItems = 'center';
	stateElement.style.width = '85vw';
	stateElement.style.height = '80vh';

	const Rule = games.find(function (x) { return x.name === game.game.name; }).rule;
	const Renderer = games.find(function (x) { return x.name === game.game.name; }).renderer;
	const rule = new Rule();
	const renderer = new Renderer(stateElement);
	historyElement.appendChild(stateElement);

	rule.init(game.game.players);
	rule.load(JSON.parse(game.history[0]), []);
	renderer.init(rule.projection(-1), false);

	const maxTime = game.history.length - 1;

	const sliderElement = document.createElement('input');
	sliderElement.type = 'range';
	sliderElement.min = '0';
	sliderElement.max = maxTime;
	sliderElement.value = '0';
	sliderElement.step = '1';

	const decreaseButtonElement = document.createElement('div');
	decreaseButtonElement.className = 'button';
	decreaseButtonElement.innerHTML = '前1回合';

	const increaseButtonElement = document.createElement('div');
	increaseButtonElement.className = 'button';
	increaseButtonElement.innerHTML = '后1回合';

	let value = 0;

	function changeSlider(delta = 0) {
		value = Math.max(0, Math.min(maxTime, parseInt(sliderElement.value) + delta));
		rule.load(JSON.parse(game.history[value]), []);
		renderer.render(rule.projection(-1), false);
		sliderElement.value = value;
		if (value < maxTime) {
			increaseButtonElement.classList.remove('disabled');
		} else {
			increaseButtonElement.classList.add('disabled');
		}
		if (value > 0) {
			decreaseButtonElement.classList.remove('disabled');
		} else {
			decreaseButtonElement.classList.add('disabled');
		}
	}
	sliderElement.addEventListener('input', function () { changeSlider(); });
	increaseButtonElement.addEventListener('click', function () { changeSlider(1); });
	decreaseButtonElement.addEventListener('click', function () { changeSlider(-1); });
	changeSlider();

	const controlElement = document.createElement('div');
	controlElement.style.display = 'flex';
	controlElement.style.height = '5vh';
	controlElement.appendChild(decreaseButtonElement);
	controlElement.appendChild(sliderElement);
	controlElement.appendChild(increaseButtonElement);

	historyElement.appendChild(controlElement);
}
function loadHistory() {
	historyElement.innerHTML = '';
	for (const game of storageData.historyGame) {
		const gameElement = document.createElement('div');
		gameElement.className = 'horizontal button';
		for (const info of [
			game.time,
			game.game.name,
			game.game.players.length.toString(),
			game.game.players.map(function (x) { return x.user; }).join('，'),
		]) {
			const infoElement = document.createElement('div');
			infoElement.innerText = info;
			infoElement.style.width = 'min(15vw, 15vh)';
			infoElement.style.padding = 'min(1vw, 1vh)';
			infoElement.style.textAlign = 'center';
			gameElement.appendChild(infoElement);
		}
		gameElement.addEventListener('click', function () {
			loadGame(game);
		});
		historyElement.appendChild(gameElement);
		gameElement.scrollIntoView();
	}
}