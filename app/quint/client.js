const combinationNames = [
	"Five of a kind",
	"Four of a kind",
	"Full house",
	"Straight",
	"Three of a kind",
	"Two pair",
	"One pair",
];

user = '';
hp = 0;
ready = false;
function updateHP(_hp) {
	hp = _hp;
	printHP(hp);
	if (hp > 0) {
		document.getElementById('quintbutton').classList.remove('disabled');
		ready = true;
	} else {
		document.getElementById('quintbutton').classList.add('disabled');
		ready = false;
	}
}

client = createClient('ws');
client.open = function () {
	client.send({ type: 'state' });
};
client.receive = function (data) {
	switch (data.type) {
		case 'msg':
			printMessage(data.msg);
			break;
		case 'state':
			user = data.user;
			updateHP(data.info.hp);
			printMessage({ type: 'system', content: `已连接服务器，您的用户名为【${user}】` });
			updateRanklists(data.ranklist);
			break;
		case 'ranklist':
			updateRanklists(data.ranklist);
			break;
		case 'quint':
			document.getElementById('quintbutton').classList.add('disabled');
			ready = false;
			if (data.first > 0) {
				printMessage({ type: 'first', content: `恭喜您是今天的第一位抽卡者，额外奖励${data.first}体力值！` });
			}
			setTimeout(function () {
				if (data.record.bonus > 0) {
					printMessage({ type: 'bonus', content: `恭喜您抽到${combinationNames[data.record.comb]}，额外奖励${data.record.bonus}体力值！` });
				}
				updateHP(data.info.hp);
			}, rollSlots(data.record.cards));
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
	printError(err);
};

storage = createStorage('ls', 'YaGamePreference', {});
storageData = storage.load();
if (storageData.chatKey) {
	document.getElementById('loginkey').value = storageData.chatKey;
}
document.getElementById('loginbutton').addEventListener('click', function () {
	const key = document.getElementById('loginkey').value;
	storageData.chatKey = key;
	storage.save();
	client.connect('YaGameQuint250913', key);
	document.getElementById('login').close();
	document.getElementById('quint').classList.remove('nodisplay');
	document.getElementById('quint').classList.add('fadeIn');
});
function drawIfReady() {
	if (ready) {
		ready = false;
		client.send({ type: 'quint' });
	}
}
document.getElementById('quintbutton').addEventListener('click', drawIfReady);

document.getElementById('viewRanklistToday').addEventListener('click', function () {
	document.getElementById('ranklistTodayDialog').showModal();
})
document.getElementById('viewRanklistAll').addEventListener('click', function () {
	document.getElementById('ranklistAllDialog').showModal();
})
document.getElementById('ranklistTodayClose').addEventListener('click', function () {
	document.getElementById('ranklistTodayDialog').close();
})
document.getElementById('ranklistAllClose').addEventListener('click', function () {
	document.getElementById('ranklistAllDialog').close();
})

addEventListener('keydown', function (event) {
	if (event.key === 'Enter') {
		event.preventDefault();
		drawIfReady();
	}
});