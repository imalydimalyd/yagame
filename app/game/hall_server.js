const keys = JSON.parse(JSON.stringify(SECRETS.KEYS));
keys['VISITOR'] = {
	user: 'visitor',
};
const config = {
	server: {
		id: 'YaGameHall250925',
	},
	keys: keys,
};

storage = createStorage('ls', 'YaGameHall', {
	rooms: [],
});
storageData = storage.load();

function deleteRoom(id) {
	storageData.rooms = storageData.rooms.filter(function (x) { return x.id !== id; });
}
function updateRooms() {
	storage.save();
	server.send({
		type: 'rooms',
		rooms: storageData.rooms,
	});
	showRooms(storageData.rooms, true);
}

server = createServer('ws');
server.open = function (id) {
	document.getElementById('serverid').classList.remove('red')
	document.getElementById('serverid').innerText = `服务器ID：${id}`;
	document.getElementById('serverinfo').classList.remove('hidden');
	updateRooms();
};
server.receive = function (data, user) {
	if (typeof data !== 'object' || typeof data.type !== 'string') {
		server.send('Incorrect data format', user, true);
		return;
	}
	switch (data.type) {
		case 'rooms':
			server.send({
				type: 'rooms',
				rooms: storageData.rooms,
			}, user);
			break;
		case 'room':
			const room = data.room;
			console.log(room);
			deleteRoom(room.id);
			if (room.created && !(room.started || room.ended)) {
				storageData.rooms.push(room);
			}
			updateRooms();
			break;
		default:
			server.send(`Unknown data type ${data.type}`, user, true);
			break;
	}
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