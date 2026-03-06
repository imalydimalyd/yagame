let loading = true;
let currentTab = 'backup';

function updateTabs() {
	if (loading) {
		document.getElementById('loading').classList.remove('nodisplay');
	} else {
		document.getElementById('loading').classList.add('nodisplay');
	}
	if (!loading && currentTab === 'dashboard') {
		document.getElementById('dashboard').classList.remove('nodisplay');
		document.getElementById('dashboard').classList.add('fadeIn');
	} else {
		document.getElementById('dashboard').classList.add('nodisplay');
		document.getElementById('dashboard').classList.remove('fadeIn');
	}
	if (!loading && currentTab === 'memory') {
		document.getElementById('memory').classList.remove('nodisplay');
		document.getElementById('memory').classList.add('fadeIn');
	} else {
		document.getElementById('memory').classList.add('nodisplay');
		document.getElementById('memory').classList.remove('fadeIn');
	}
	if (!loading && currentTab === 'backup') {
		document.getElementById('backup').classList.remove('nodisplay');
		document.getElementById('backup').classList.add('fadeIn');
	} else {
		document.getElementById('backup').classList.add('nodisplay');
		document.getElementById('backup').classList.remove('fadeIn');
	}
	if (currentTab === 'dashboard') {
		document.getElementById('tabdashboard').classList.add('active');
	} else {
		document.getElementById('tabdashboard').classList.remove('active');
	}
	if (currentTab === 'memory') {
		document.getElementById('tabmemory').classList.add('active');
	} else {
		document.getElementById('tabmemory').classList.remove('active');
	}
	if (currentTab === 'backup') {
		document.getElementById('tabbackup').classList.add('active');
	} else {
		document.getElementById('tabbackup').classList.remove('active');
	}
}
updateTabs();
document.getElementById('tabdashboard').addEventListener('click', function () {
	currentTab = 'dashboard';
	updateTabs();
});
document.getElementById('tabmemory').addEventListener('click', function () {
	currentTab = 'memory';
	updateTabs();
});
document.getElementById('tabbackup').addEventListener('click', function () {
	currentTab = 'backup';
	updateTabs();
});

function updateLoadingHint(hint) {
	document.getElementById('loading').innerHTML = hint;
}

let textContent = '';
let dataContent = undefined;
let currentAgent = undefined;
let agentButtonElements = {};
let agentMemoryElements = {};

const MAX_STORAGE = 5 * 1024 * 1024;
const dashboardBodyElement = document.getElementById('dashboardbody');
const memoryElement = document.getElementById('memory');

function addDashboardKeyValue(key, value) {
	const keyElement = document.createElement('td');
	keyElement.innerText = key;

	const valueElement = document.createElement('td');
	valueElement.innerText = value;
	valueElement.style.textAlign = 'right';

	const rowElement = document.createElement('tr');
	rowElement.appendChild(keyElement);
	rowElement.appendChild(valueElement);
	dashboardBodyElement.appendChild(rowElement);
}
function updateUI() {
	// 重置仪表盘
	dashboardBodyElement.innerHTML = '';

	// 仪表盘 - 服务器ID
	addDashboardKeyValue('服务器ID', dataContent.config.server.id);

	// 仪表盘 - 存储信息
	addDashboardKeyValue('存储大小', textContent.length + ' 字符');
	addDashboardKeyValue('最大存储大小', MAX_STORAGE + ' 字符');
	addDashboardKeyValue('存储占用', ((textContent.length * 100) / MAX_STORAGE).toFixed(2) + ' %');

	// 仪表盘 - 消息
	addDashboardKeyValue('最大消息数量', dataContent.config.maxMessages + ' 条');
	addDashboardKeyValue('（聊天室）消息数量', dataContent.msgs.length + ' 条');
	addDashboardKeyValue('（聊天室）消息编号', dataContent.timestamp);
	addDashboardKeyValue('（茉茉的家）消息数量', dataContent.msgs2.length + ' 条');
	addDashboardKeyValue('（茉茉的家）消息编号', dataContent.timestamp2);

	// 仪表盘 - Agent
	addDashboardKeyValue('Agent数据大小', JSON.stringify(dataContent.agents).length + ' 字符');
	addDashboardKeyValue('Agent配置数量', Object.keys(dataContent.config.agents).length + ' 条');
	addDashboardKeyValue('Agent数据数量', Object.keys(dataContent.agents).length + ' 条');

	// 仪表盘 - 用户
	addDashboardKeyValue('用户数量', Object.keys(dataContent.config.users).length + ' 名');
	addDashboardKeyValue('管理员数量', Object.keys(dataContent.config.secretUsers).length + ' 名');
	addDashboardKeyValue('Key数量', Object.keys(dataContent.config.keys).length + ' 个');
	addDashboardKeyValue('有黑名单的用户数量', Object.keys(dataContent.config.agentBlacklist).length + ' 名');

	// 设置记忆查看器
	agentButtonElements = {};
	agentMemoryElements = {};

	if (dataContent.config.agents) {
		// 为每个 Agent 添加自己的页面
		for (const agentName in dataContent.config.agents) {
			const agentConfig = dataContent.config.agents[agentName];
			const agentData = dataContent.agents[agentName];

			const agentMemoryBallElements = [];
			const agentMemoryContentElements = [];

			const agentMemoryElement = document.createElement('div');
			agentMemoryElement.classList.add('nodisplay');
			agentMemoryElement.style.display = 'flex';
			agentMemoryElement.style.flexDirection = 'column';
			agentMemoryElement.style.alignItems = 'center';
			agentMemoryElement.style.width = '85vw';
			agentMemoryElement.style.height = '80vh';
			agentMemoryElement.style.overflowY = 'scroll';

			// 添加一个 padding
			const paddingElement = document.createElement('div');
			paddingElement.style.minHeight = 'min(2vw, 2vh)';
			agentMemoryElement.appendChild(paddingElement);

			// 添加 Agent 的头像和名称
			const agentInfoAvatarElement = document.createElement('img');
			agentInfoAvatarElement.classList.add('small');
			agentInfoAvatarElement.classList.add('round');
			agentInfoAvatarElement.classList.add('avatar');
			agentInfoAvatarElement.src = agentConfig.avatar;

			const agentInfoNameElement = document.createElement('p');
			agentInfoNameElement.style.margin = 'min(1vw, 1vh)';
			agentInfoNameElement.innerText = agentConfig.name;

			const agentInfoElement = document.createElement('div');
			agentInfoElement.style.display = 'flex';
			agentInfoElement.style.justifyContent = 'center';
			agentInfoElement.style.alignItems = 'center';
			agentInfoElement.appendChild(agentInfoAvatarElement);
			agentInfoElement.appendChild(agentInfoNameElement);
			agentMemoryElement.appendChild(agentInfoElement);

			// 添加 Agent 的详细描述
			const agentDescriptionContentElement = document.createElement('div');
			const triggerHTML = agentConfig.trigger.join('；');
			const personaHTML = agentConfig.persona.replace('\n', '<br>');
			agentDescriptionContentElement.innerHTML = `
<p><b>ID：</b>${agentName}</p>
<p><b>名称：</b>${agentConfig.name}</p>
<p><b>QQ：</b>${agentConfig.qq}</p>
<p><b>头像链接：</b>${agentConfig.avatar}</p>

<p><b>触发词：</b>${triggerHTML}</p>
<p><b>类型：</b>${agentConfig.type}</p>
<p><b>深度思考：</b>${agentConfig.reasoner}</p>
<p><b>显示思考：</b>${agentConfig.showCOT}</p>
<p><b>API Key：</b>${agentConfig.apikey}</p>
<p><b>最大消息：</b>${agentConfig.maxMessages}</p>

<p><b>睡眠时间：</b>${agentConfig.sleepTime}</p>
<p><b>做梦概率：</b>${agentConfig.dreamProb}</p>

<p><b>人设：</b>${personaHTML}</p>
`;
			agentDescriptionContentElement.style.userSelect = 'text';

			const agentDescriptionSummaryElement = document.createElement('summary');
			agentDescriptionSummaryElement.innerHTML = '详细信息';

			const agentDescriptionElement = document.createElement('details');
			agentDescriptionElement.appendChild(agentDescriptionSummaryElement);
			agentDescriptionElement.appendChild(agentDescriptionContentElement);
			agentMemoryElement.appendChild(agentDescriptionElement);

			// 添加记忆球
			let currentMemoryBallElement = undefined;
			for (let i = agentData.memories.length - 1; i >= 0; --i) {
				const memory = agentData.memories[i];
				const memoryLines = memory.split('\n')

				const agentMemoryContentElement = document.createElement('div');
				agentMemoryContentElements.push(agentMemoryContentElement);

				const memoryTitleElement = document.createElement('div');
				memoryTitleElement.classList.add('bold');
				memoryTitleElement.innerText = memoryLines[0];

				const memoryBallsElement = document.createElement('div');
				memoryBallsElement.style.display = 'flex';
				memoryBallsElement.style.flexWrap = 'wrap';
				for (let i = 1; i < memoryLines.length; ++i) {
					const memoryBall = memoryLines[i];
					const memoryBallElement = document.createElement('span');
					memoryBallElement.style.fontSize = 'min(6vw, 6vh)';
					memoryBallElement.style.width = 'min(10vw, 10vh)';
					memoryBallElement.style.height = 'min(10vw, 10vh)';
					memoryBallElement.style.borderRadius = '100%';
					memoryBallElement.style.display = 'flex';
					memoryBallElement.style.justifyContent = 'center';
					memoryBallElement.style.alignItems = 'center';
					memoryBallElement.innerText = memoryBall.split(' ')[0];
					console.log(memoryBall, memoryBall.split(' ')[0])
					agentMemoryBallElements.push(memoryBallElement);
					memoryBallsElement.appendChild(memoryBallElement);

					memoryBallElement.addEventListener('click', function () {
						for (const ball of agentMemoryBallElements) {
							ball.style.backgroundColor = '';
						}
						for (const content of agentMemoryContentElements) {
							content.innerHTML = '';
						}
						if (memoryBallElement === currentMemoryBallElement) {
							currentMemoryBallElement = undefined;
						} else {
							currentMemoryBallElement = memoryBallElement;
							memoryBallElement.style.backgroundColor = '#FFF8';
							agentMemoryContentElement.innerText = memoryBall;
						}
					});
				}
				const paddingElement = document.createElement('div');
				paddingElement.style.minHeight = 'min(5vw, 5vh)';

				agentMemoryElement.appendChild(paddingElement);
				agentMemoryElement.appendChild(memoryTitleElement);
				agentMemoryElement.appendChild(memoryBallsElement);
				agentMemoryElement.appendChild(agentMemoryContentElement);
			}

			agentMemoryElements[agentName] = agentMemoryElement;
		}

		function switchToAgent(name) {
			for (const agentName in dataContent.config.agents) {
				agentMemoryElements[agentName].classList.add('nodisplay');
			}
			agentMemoryElements[name].classList.remove('nodisplay');

			for (const agentName in dataContent.config.agents) {
				agentButtonElements[agentName].classList.remove('active');
			}
			agentButtonElements[name].classList.add('active');
		}

		const agentButtonsElement = document.createElement('div');
		agentButtonsElement.style.display = 'flex';
		agentButtonsElement.style.justifyContent = 'center';
		agentButtonsElement.style.alignItems = 'center';
		agentButtonsElement.style.height = '5vh';
		for (const agentName in dataContent.config.agents) {
			const agentButtonElement = document.createElement('div');
			agentButtonElement.classList.add('button');
			agentButtonElement.innerText = agentName;
			agentButtonElement.addEventListener('click', function () {
				switchToAgent(agentName);
			});
			agentButtonsElement.appendChild(agentButtonElement);
			agentButtonElements[agentName] = agentButtonElement;
		}
		memoryElement.appendChild(agentButtonsElement);

		for (const agentName in dataContent.config.agents) {
			memoryElement.appendChild(agentMemoryElements[agentName]);
		}

		if ('茉茉' in dataContent.config.agents) {
			switchToAgent('茉茉');
		} else if (dataContent.config.agents) {
			switchToAgent(Object.keys(dataContent.config.agents)[0]);
		}
	} else {
		// 没有 Agent
		dashboardBodyElement.innerHTML = '暂无Agent';
	}
}

client = createClient('ws');
client.open = function () {
	updateLoadingHint('同步数据中...');
	updateTabs();
	client.send({ type: 'bak' });
};
client.receive = function (data) {
	switch (data.type) {
		case 'msg2':
		case 'state2':
		case 'msg':
		case 'state':
			break;
		case 'bak':
			updateLoadingHint('解析数据中...');
			textContent = data.content;
			dataContent = JSON.parse(textContent);

			updateLoadingHint('渲染UI中...');
			updateUI();
			loading = false;
			updateTabs();
			break;
		default:
			yaGameAlert(`未知消息类型：${data.type}`);
			break;
	}
};
client.close = function () {
	yaGameAlert('连接已关闭');
};
client.error = function (err) {
	yaGameAlert(err.toString());
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
	client.connect('YaGameChatroom250919', key);
	document.getElementById('login').close();
	document.getElementById('admin').classList.remove('nodisplay');
	document.getElementById('admin').classList.add('fadeIn');
});

document.getElementById('refreshbutton').addEventListener('click', function () {
	loading = true;
	updateLoadingHint('同步数据中...');
	updateTabs();
	client.send({ type: 'bak' });
});

document.getElementById('backupbutton').addEventListener('click', function () {
	const time = new Date();
	const fileName = '聊天室备份 ' + time.toLocaleDateString() + ' ' + time.toLocaleTimeString() + '.json';

	const anchor = document.createElement('a');
	anchor.href = URL.createObjectURL(new Blob([textContent], { type: 'application/json' }));
	anchor.download = fileName;
	anchor.click();
});