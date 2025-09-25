const config = {
	server: {
		id: 'YaGameQuint250913',
	},
	keys: SECRETS.KEYS,
	maxRanklist: 10,
	initialHP: 10,
	initialHPFirst: 20,
	bonus: [20, 10, 5, 3, 1, -1, -1],
};

storage = createStorage('ls', 'YaGameQuint', {
	today: '',
	players: {},
	ranklist: {
		today: { count: 0, ranklist: [] },
		all: { count: 0, ranklist: [] },
	},
});
storageData = storage.load();
updateRanklists(storageData.ranklist);

server = createServer('ws');
function addMessage(msg) {
	server.send({ type: 'msg', msg: msg });
	printMessage(msg);
}
server.open = function (id) {
	document.getElementById('serverid').classList.remove('red')
	document.getElementById('serverid').innerText = `服务器ID：${id}`;
	document.getElementById('serverinfo').classList.remove('hidden');
};
function drawCards() {
	const pile = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];
	const cards = [];
	for (let i = 0; i < 5; ++i) {
		const p = Math.floor(Math.random() * (25 - i));
		cards.push(pile[p]);
		pile[p] = pile[24 - i];
	}
	return cards;
}
function calc(cards) {
	let number = 1;
	const count = [0, 0, 0, 0, 0];
	for (const card of cards) {
		number *= 5 - count[card];
		++count[card];
	}
	const ranks = count.map(function (e, i) {
		return [i, e];
	});
	ranks.sort(function (a, b) { return a[1] === b[1] ? a[0] - b[0] : b[1] - a[1]; });
	let comb;
	if (ranks[4][1]) {
		comb = [3, 0, 0, 0, 0];
	} else if (ranks[3][1]) {
		comb = [6, ranks[0][0], ranks[1][0], ranks[2][0], ranks[3][0]];
	} else if (ranks[2][1]) {
		comb = [ranks[1][1] == 1 ? 4 : 5, ranks[0][0], ranks[1][0], ranks[2][0], 0];
	} else if (ranks[1][1]) {
		comb = [ranks[1][1] == 1 ? 1 : 2, ranks[0][0], ranks[1][0], 0, 0];
	} else {
		comb = [0, ranks[0][0], 0, 0, 0];
	}
	return [comb, number];
}
function calcLuck(comb) {
	let luck = 0;
	for (let a = 0; a < 5; ++a) {
		for (let b = 0; b < 5; ++b) {
			for (let c = 0; c < 5; ++c) {
				for (let d = 0; d < 5; ++d) {
					for (let e = 0; e < 5; ++e) {
						const result = calc([a, b, c, d, e]);
						if (result[0] <= comb) {
							luck += result[1];
						}
					}
				}
			}
		}
	}
	return luck <= 120 ? 1 : luck;
}
function cardResult(cards) {
	const result = calc(cards);
	return {
		luck: calcLuck(result[0]),
		comb: result[0][0],
		cards: cards,
	};
}
function drawResult() {
	return cardResult(drawCards());
}
function addToRanklist(ranklist, record) {
	let notAppeared = true;
	for (let i = 0; i < ranklist.length; ++i) {
		if (ranklist[i].user === record.user) {
			notAppeared = false;
			if (record.luck < ranklist[i].luck) {
				ranklist[i] = record;
				break;
			} else {
				return;
			}
		}
	}
	if (notAppeared) {
		if (ranklist.length < config.maxRanklist) {
			ranklist.push(record);
		} else if (record.luck < ranklist[ranklist.length - 1].luck) {
			ranklist[ranklist.length - 1] = record;
		} else {
			return;
		}
	}
	ranklist.sort(function (a, b) { return a.luck - b.luck; });
}
function storeRecord(record) {
	++storageData.ranklist.today.count;
	++storageData.ranklist.all.count;
	addToRanklist(storageData.ranklist.today.ranklist, record);
	addToRanklist(storageData.ranklist.all.ranklist, record);
}
server.receive = function (data, user) {
	if (typeof data !== 'object' || typeof data.type !== 'string') {
		server.send('Incorrect data format', user, true);
		return;
	}
	if (!storageData.players.hasOwnProperty(user)) {
		storageData.players[user] = { hp: config.initialHP };
	}
	const today = new Date().toLocaleDateString();
	if (storageData.today !== today) {
		for (const player of Object.values(storageData.players)) {
			if (player.hp < config.initialHP) {
				player.hp = config.initialHP;
			}
		}
		storageData.today = today;
		storageData.ranklist.today = { count: 0, ranklist: [] };
	}
	switch (data.type) {
		case 'state':
			server.send({
				type: 'state',
				user: user,
				info: storageData.players[user],
				ranklist: storageData.ranklist,
			}, user);
			break;
		case 'quint':
			const player = storageData.players[user];
			let first = 0;
			if (!storageData.ranklist.today.count) {
				first = config.initialHPFirst;
				if (player.hp < config.initialHPFirst) {
					player.hp = config.initialHPFirst;
				}
			}
			if (player.hp <= 0) {
				server.send('Not enough HP', user, true);
				break;
			}
			const record = drawResult();
			record.user = user;
			record.bonus = config.bonus[record.comb];
			storeRecord(record);
			server.send({
				type: 'ranklist',
				ranklist: storageData.ranklist,
			});
			player.hp += record.bonus;
			server.send({
				type: 'quint',
				first: first,
				record: record,
				info: player,
			}, user);
			break;
		default:
			server.send(`Unknown data type ${data.type}`, user, true);
			break;
	}
	storage.save();
	updateRanklists(storageData.ranklist);
};
server.close = function () {
	document.getElementById('serverid').classList.add('red')
	document.getElementById('serverid').innerText = '服务器已关闭';
	alert('服务器已关闭');
};
server.error = function (err) {
	alert(err);
};
onClosePage(function () {
	server.disconnect();
});
server.connect(config);