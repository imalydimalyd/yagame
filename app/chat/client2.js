chatStorage = createStorage('ls', 'YaGameChatroomClient', { timestamp: -1, timestamp2: -1, msgs: [], msgs2: [] });
chatStorageData = chatStorage.load();

currentDisplayMessages = 0;
user = '';
client = createClient('ws');
client.open = function () {
	client.send({ type: 'state2', timestamp: chatStorageData.timestamp2 });
	document.getElementById('send').classList.remove('disabled');
};
const historyMessageList = JSON.parse(JSON.stringify(chatStorageData.msgs2));
function prependMoreMessages(messages = 10) {
	if (currentDisplayMessages < historyMessageList.length) {
		const nextDisplayMessages = Math.min(currentDisplayMessages + messages, historyMessageList.length);
		for (let i = currentDisplayMessages + 1; i <= nextDisplayMessages; ++i) {
			const msg = historyMessageList[historyMessageList.length - i];
			prependMessage(msg, msg.user === user);
		}
		currentDisplayMessages = nextDisplayMessages;
	}
}
client.receive = function (data) {
	switch (data.type) {
		case 'msg2':
			printMessage(data.msg, data.msg.user === user);
			chatStorageData.msgs2.push(data.msg);
			chatStorageData.timestamp2 = data.msg.timestamp;
			chatStorage.save();
			break;
		case 'state2':
			user = data.user;
			document.getElementById('useravatar').src = data.avatar;
			document.getElementById('username').innerText = user;
			document.getElementById('userinfo').classList.remove('hidden');
			clearMessages();
			for (const msg of data.history) {
				chatStorageData.msgs2.push(msg);
				// printMessage(msg, msg.user === user);
			}
			currentDisplayMessages = 0;
			prependMoreMessages(30);
			messagesElement.addEventListener('scroll', function (e) {
				if (messagesElement.scrollTop <= 0) {
					const firstMessageElement = messagesElement.firstChild;
					prependMoreMessages();
					if (firstMessageElement) {
						firstMessageElement.scrollIntoView();
					}
				}
			});
			const prompt = data.history.length ? `共有${data.history.length}条未读消息` : ''
			printMessage({ type: 'system', content: `欢迎来到茉茉的家！${prompt}` });
			chatStorageData.timestamp2 = data.timestamp;
			chatStorage.save();
			break;
		case 'msg':
		case 'state':
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
			type: 'msg2',
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