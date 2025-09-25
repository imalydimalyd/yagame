user = '';
client = createClient('ws');
client.open = function () {
	client.send({ type: 'state' });
	document.getElementById('send').classList.remove('disabled');
};
client.receive = function (data) {
	console.log(data);
	switch (data.type) {
		case 'msg':
			printMessage(data.msg, data.msg.user === user);
			break;
		case 'state':
			user = data.user;
			document.getElementById('useravatar').src = data.avatar;
			document.getElementById('username').innerText = user;
			document.getElementById('userinfo').classList.remove('hidden');
			clearMessages();
			for (const msg of data.history) {
				printMessage(msg, msg.user === user);
			}
			printMessage({ type: 'system', content: `已连接服务器，读取了最近的${data.history.length}条历史记录` });
			break;
		case 'msg2':
		case 'state2':
			break;
		default:
			printError(`未知消息类型：${data.type}`);
			break;
	}
};
client.close = function () {
	printError('连接已关闭');
};
client.error = function (err) {
	printError(err.toString());
};
const chatboxElement = document.getElementById('chatbox');
function send() {
	if (chatboxElement.value) {
		client.send({
			type: 'msg',
			msg: chatboxElement.value,
		});
		chatboxElement.value = '';
	}
}
document.getElementById('send').addEventListener('click', send);

storage = createStorage('ls', 'YaGamePreference', {});
storageData = storage.load();
if (storageData.chatKey) {
	document.getElementById('loginkey').value = storageData.chatKey;
}
document.getElementById('loginbutton').addEventListener('click', function () {
	const key = document.getElementById('loginkey').value;
	storageData.chatKey = key;
	storage.save();
	client.connect('YaGameChatroom250919', key);
	chatboxElement.addEventListener('keydown', function (event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (event.ctrlKey) {
				chatboxElement.setRangeText('\n', chatboxElement.selectionStart, chatboxElement.selectionEnd, 'end');
			} else {
				send();
			}
		}
	});
	document.getElementById('login').close();
	document.getElementById('chat').classList.remove('nodisplay');
	document.getElementById('chat').classList.add('fadeIn');
});