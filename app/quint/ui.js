const images = [
	'img/momo.png',
	'img/moonshadow.png',
	'img/starry.png',
	'img/sunflower.png',
	'img/catgirl.png',
];
const localGif = [
	'img/momo.gif',
	'img/moonshadow.gif',
	'img/starry.gif',
	'img/sunflower.gif',
	'img/catgirl.gif',
]
const hostGif = [
	'https://i.imgs.ovh/2025/10/04/7szzQp.gif',
	'https://i.imgs.ovh/2025/10/04/7szTYm.gif',
	'https://i.imgs.ovh/2025/10/04/7szU39.gif',
	'https://i.imgs.ovh/2025/10/04/7szbUc.gif',
	'https://i.imgs.ovh/2025/10/04/7szLgF.gif',
]
function getImageWin(idx) {
	if (!config.useGifForQuint) return images[idx];
	return config.useLocalGifForQuint ? localGif[idx] : hostGif[idx];
}
const shadowColors = [
	'#8F8',
	'#FCF',
	'#ECC',
	'#FFC',
	'#8CF',
];

function createMessageElement(msg) {
	const messageElement = document.createElement('p');
	messageElement.style.marginLeft = 'auto';
	messageElement.style.marginRight = 'auto';
	messageElement.style.width = 'fit-content';
	messageElement.innerText = msg.content;
	switch (msg.type) {
		case 'err':
			messageElement.classList.add('red');
			break;
		case 'bonus':
			messageElement.classList.add('blue');
			break;
		case 'first':
			messageElement.classList.add('yellow');
			break;
	}
	return messageElement;
}
const messagesElement = document.getElementById('messages');
function clearMessages() {
	messagesElement.innerHTML = '';
}
function printMessage(msg) {
	const messageElement = createMessageElement(msg);
	messagesElement.appendChild(messageElement);
	messageElement.scrollIntoView();
}
function printError(err) {
	printMessage({
		type: 'err',
		content: err,
	});
}

const mainElement = document.getElementById('main');
const slots = [];
if (mainElement) {
	for (let i = 0; i < 5; ++i) {
		const imageElement = document.createElement('div');
		imageElement.style.position = 'absolute';
		imageElement.style.left = '0';
		imageElement.style.top = '0';
		imageElement.style.width = 'min(18vw, 18vh)';
		imageElement.style.height = 'min(18vw, 18vh)';
		imageElement.style.display = 'flex';
		imageElement.style.justifyContent = 'center';
		imageElement.style.alignItems = 'center';
		imageElement.style.fontSize = 'min(15vw, 15vh)';
		imageElement.style.fontWeight = '400';
		imageElement.innerHTML = '?';

		const slotElement = document.createElement('div');
		slotElement.style.position = 'relative';
		slotElement.style.width = 'min(18vw, 18vh)';
		slotElement.style.height = 'min(18vw, 18vh)';
		slotElement.style.borderRadius = 'min(5vw, 5vh)';
		slotElement.style.overflow = 'hidden';
		slotElement.appendChild(imageElement);

		slots.push({
			slotElement: slotElement,
			imageElement: imageElement,
			x: 1,
		});
		mainElement.appendChild(slotElement);
	}
}
const startTime = 50;
const rollTime = 99;
const animationTime = 2000;
function rollTo(i, x) {
	const slot = slots[i];
	slot.slotElement.style.boxShadow = 'none';
	let count = i * 5 + 9;
	do {
		++count;
	} while (slot.x !== (count + x) % 5);
	const imageElements = [slot.imageElement];
	for (let i = 0; i <= count; ++i) {
		let imageElement;
		if (i) {
			imageElement = document.createElement('img');
			imageElement.style.position = 'absolute';
			imageElement.style.left = '0';
			imageElement.style.top = `calc(-${i} * min(18vw, 18vh))`;
			imageElement.style.width = 'min(18vw, 18vh)';
			imageElement.style.height = 'min(18vw, 18vh)';
			imageElement.src = images[(slot.x - i % 5 + 5) % 5];
		} else {
			imageElement = slot.imageElement;
		}
		imageElement.style.transition = `top ${count * rollTime}ms linear`;
		if (i) {
			slot.slotElement.appendChild(imageElement);
			imageElements.push(imageElement);
		}
	}
	slot.x = x;
	setTimeout(function () {
		for (let i = 0; i <= count; ++i) {
			imageElements[i].style.top = `calc(${count - i} * min(18vw, 18vh))`;
		}
	}, startTime);
	const totalTime = startTime + count * rollTime;
	setTimeout(function () {
		for (let i = 0; i < count; ++i) {
			imageElements[i].remove();
		}
		slot.imageElement = imageElements[count];
		slot.x = x;
	}, totalTime);
	return totalTime;
}
function rollSlots(x) {
	let maxTime = 0;
	for (let i = 0; i < 5; ++i) {
		maxTime = Math.max(maxTime, rollTo(i, x[i]));
	}
	const count = [0, 0, 0, 0, 0];
	for (let i = 0; i < 5; ++i) {
		++count[x[i]];
	}
	for (let y = 0; y < 5; ++y) {
		if (count[y] >= 3) {
			setTimeout(function () {
				for (let i = 0; i < 5; ++i) {
					if (x[i] === y) {
						slots[i].imageElement.src = getImageWin(y);
						slots[i].slotElement.style.boxShadow = '0 0 min(3vw, 3vh) ' + shadowColors[y];
					}
				}
			}, maxTime);
			break;
		}
	}
	return maxTime;
}

function printHP(hp) {
	document.getElementById('hp').innerHTML = `剩余${hp}体力值`;
}

function createRecordElement(record, rank) {
	const recordElement = document.createElement('div');
	recordElement.className = 'horizontal';
	recordElement.style.justifyContent = 'flex-end';
	recordElement.style.alignItems = 'center';

	const nameElement = document.createElement('div');
	nameElement.innerHTML = `第${rank + 1}名：<b>${record.user}</b>&nbsp;`;
	recordElement.appendChild(nameElement);

	const x = record.cards;
	const count = [0, 0, 0, 0, 0];
	for (let i = 0; i < 5; ++i) {
		++count[x[i]];
	}
	let most = -1;
	for (let y = 0; y < 5; ++y) {
		if (count[y] >= 3) {
			most = y;
			break;
		}
	}
	for (let i = 0; i < 5; ++i) {
		const imageElement = document.createElement('img');
		imageElement.style.width = 'min(5vw, 5vh)';
		imageElement.style.height = 'min(5vw, 5vh)';
		imageElement.style.borderRadius = 'min(1vw, 1vh)';

		const value = x[i];
		if (value === most) {
			imageElement.src = getImageWin(value);
			imageElement.style.boxShadow = '0 0 min(3vw, 3vh) ' + shadowColors[value];
		} else {
			imageElement.src = images[value];
		}
		recordElement.appendChild(imageElement);
	}
	return recordElement;
}
function updateRanklist(ranklistElement, ranklist) {
	if (!ranklist.count) {
		ranklistElement.innerHTML = '<p>排行榜空空如也，等你来挑战哟~</p>';
		return;
	}
	ranklistElement.innerHTML = `<p>共有${ranklist.count}条记录</p>`;
	for (let i = 0; i < ranklist.ranklist.length; ++i) {
		ranklistElement.appendChild(createRecordElement(ranklist.ranklist[i], i));
	}
}
function updateRanklists(ranklists) {
	updateRanklist(document.getElementById('ranklistToday'), ranklists.today);
	updateRanklist(document.getElementById('ranklistAll'), ranklists.all);
}