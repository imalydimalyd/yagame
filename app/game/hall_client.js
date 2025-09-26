client = createClient('ws');
client.open = function () {
	client.send({ type: 'rooms' });
};
client.receive = function (data) {
	switch (data.type) {
		case 'rooms':
			showRooms(data.rooms);
			break;
		default:
			printError(`未知消息类型：${data.type}`);
			break;
	}
};
client.close = function () {
	alert('连接已关闭');
};
client.error = function (err) {
	alert(err);
};
client.connect('YaGameHall250925', 'VISITOR');

document.getElementById('createserver').addEventListener('click', function () {
	open('server.html');
});