const gameInfoElement = document.getElementById('gameinfo');

function showGames() {
	gameInfoElement.innerHTML = '请选择游戏：';
	for (const game of games) {
		const createGameElement = document.createElement('div');
		createGameElement.className = 'button';
		createGameElement.innerText = `${game.name}`;
		createGameElement.addEventListener('click', function () {
			createGame(game);
		});
		gameInfoElement.appendChild(createGameElement);
	}
}

function printGameInfo(currentGame, isServer = false) {
	if (!currentGame.created || (currentGame.ended && isServer)) {
		if (isServer) {
			showGames();
		} else {
			gameInfoElement.innerHTML = '请等待服主创建游戏';
		}
		return;
	}
	const statusText = currentGame.ended ? '已结束' : (currentGame.started ? '已开始' : '未开始');
	const statusClass = currentGame.ended ? 'red' : (currentGame.started ? 'blue' : 'green');

	const gameRuleElement = document.createElement('div');
	gameRuleElement.className = 'tertiary padded box';
	gameRuleElement.innerHTML = currentGame.rule;

	const gameBreakLineElement = document.createElement('br');

	const gameStatusElement = document.createElement('div');
	gameStatusElement.innerText = `${currentGame.name}（${statusText}，人数：${currentGame.players.length}）`;
	gameStatusElement.className = statusClass;

	const gamePlayersElement = document.createElement('ul');
	for (const player of currentGame.players) {
		const gamePlayerElement = document.createElement('li');
		gamePlayerElement.innerText = player.user;
		gamePlayersElement.appendChild(gamePlayerElement);
	}

	gameInfoElement.innerHTML = '';
	gameInfoElement.appendChild(gameRuleElement);
	gameInfoElement.appendChild(gameBreakLineElement);
	gameInfoElement.appendChild(gameStatusElement);
	gameInfoElement.appendChild(gamePlayersElement);
}

const roomsElement = document.getElementById('rooms');

function showRooms(rooms, isServer = false) {
	if (!rooms.length) {
		roomsElement.innerHTML = '暂时没有可加入的游戏房间';
		return;
	}
	roomsElement.innerHTML = '';
	for (const room of rooms) {
		const roomSummaryElement = document.createElement('summary');
		const roomPublicHint = room.isPublic ? '【公开】' : '';
		roomSummaryElement.innerText = `${room.id}：${room.name}（${room.players.length}人）${roomPublicHint}`;
		if (room.isPublic) {
			roomSummaryElement.classList.add('blue');
		}

		const roomRuleElement = document.createElement('div');
		roomRuleElement.innerHTML = room.rule;

		const roomPlayersTitleElement = document.createElement('div');
		roomPlayersTitleElement.className = 'bold';
		roomPlayersTitleElement.innerText = '当前玩家：';

		const roomPlayersElement = document.createElement('ul');
		for (const player of room.players) {
			const playerElement = document.createElement('li');
			playerElement.innerText = player.user;
			roomPlayersElement.appendChild(playerElement);
		}

		const roomElement = document.createElement('details');
		roomElement.appendChild(roomSummaryElement);
		roomElement.appendChild(roomRuleElement);
		roomElement.appendChild(roomPlayersTitleElement);
		roomElement.appendChild(roomPlayersElement);

		if (isServer) {
			const roomDeleteElement = document.createElement('div');
			roomDeleteElement.className = 'red-bordered red button';
			roomDeleteElement.innerText = '移除房间';
			roomDeleteElement.addEventListener('click', function () {
				yaGameConfirm('确定要从大厅中移除房间吗？').then(function (yes) {
					if (yes) {
						deleteRoom(room.id);
						updateRooms();
					}
				});
			});
			roomElement.appendChild(roomDeleteElement);
		} else {
			const roomJoinElement = document.createElement('div');
			roomJoinElement.className = 'button';
			roomJoinElement.innerText = '进入房间';
			roomJoinElement.addEventListener('click', function () {
				if (room.isPublic) {
					open(`client.html?id=${room.id}&public=1`);
				} else {
					open(`client.html?id=${room.id}`);
				}
			});
			roomElement.appendChild(roomJoinElement);
		}

		roomsElement.appendChild(roomElement);
	}
}