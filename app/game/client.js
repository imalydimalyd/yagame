user = '';
client = createClient('ws');
client.open = function () {
	client.send({ type: 'state' });
};
inGame = false;
remainInGame = false;
ended = false;
renderer = undefined;
client.receive = function (data) {
	if (ended) {
		return;
	}
	switch (data.type) {
		case 'info':
			if (inGame) {
				break;
			}
			document.getElementById('infopanel').classList.remove('nodisplay');
			printGameInfo(data.info);
			break;
		case 'data':
			if (!inGame) {
				inGame = true;
				remainInGame = true;
				document.getElementById('infopanel').classList.add('nodisplay');
				document.getElementById('game').classList.remove('nodisplay');
				const Renderer = games.find(function (x) { return x.name === data.name; }).renderer;
				renderer = new Renderer(document.getElementById('game'));
				renderer.send = function (data) {
					client.send({ type: 'move', move: data });
				};
				renderer.init(data.data, data.data.id !== -1);
			}
			renderer.render(data.data, data.data.id !== -1);
			if (remainInGame && data.data.id !== -1 && data.data.players[data.data.id].inGame === false) {
				remainInGame = false;
				yaGameAlert('很遗憾，您被淘汰了，您可以自由选择继续观战或者离开');
			}
			if (data.data.end) {
				ended = true;
				yaGameAlert('游戏结束，刷新页面以退出游戏');
			}
			break;
		case 'abort':
			ended = true;
			yaGameAlert('游戏被服主终止，刷新页面以退出游戏');
			break;
	}
};
client.close = function () {
	yaGameAlert('连接已关闭');
};
client.error = function (err) {
	yaGameAlert(err);
};

storage = createStorage('ls', 'YaGamePreference', {});
storageData = storage.load();
const params = new URLSearchParams(document.location.search);
const paramID = params.get('id');
const paramPublic = params.get('public');
if (paramPublic) {
	if (storageData.chatKey) {
		document.getElementById('loginkey').value = storageData.user;
	}
} else {
	if (storageData.chatKey) {
		document.getElementById('loginkey').value = storageData.chatKey;
	}
}
if (paramID) {
	document.getElementById('inputserverid').value = paramID;
	document.getElementById('inputserverid').ariaReadOnly = true;
	document.getElementById('inputserverid').setAttribute('readonly', true);
	if (paramPublic) {
		document.getElementById('loginkey').setAttribute('type', 'text');
		document.getElementById('loginkeylabel').innerText = '请输入用户名：';
		document.getElementById('publichint').innerText = '注意：用户名不是Key！';
	}
} else {
	if (storageData.serverID) {
		document.getElementById('inputserverid').value = storageData.serverID;
	}
}
document.getElementById('loginbutton').addEventListener('click', function () {
	const serverID = document.getElementById('inputserverid').value;
	const key = document.getElementById('loginkey').value;
	storageData.serverID = serverID;
	if (paramPublic) {
		storageData.user = key;
	} else {
		storageData.chatKey = key;
	}
	storage.save();
	client.connect(serverID, key);
	document.getElementById('login').close();
});
document.getElementById('joingame').addEventListener('click', function () {
	client.send({ type: 'join' });
});
document.getElementById('quitgame').addEventListener('click', function () {
	client.send({ type: 'quit' });
});
onClosePage(function () { });