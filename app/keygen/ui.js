function createMessageElement(msg, isself = false) {
	if (msg.type === 'err') {
		const messageElement = document.createElement('div');
		messageElement.className = 'horizontal red fadeIn box';
		messageElement.style.margin = 'min(2vw,2vh)';
		messageElement.style.marginLeft = 'auto';
		messageElement.style.marginRight = 'auto';
		messageElement.style.width = 'fit-content';
		messageElement.innerText = msg.content;
		return messageElement;
	}
	if (msg.type === 'system') {
		const messageElement = document.createElement('div');
		messageElement.className = 'horizontal secondary fadeIn box';
		messageElement.style.margin = 'min(2vw,2vh)';
		messageElement.style.marginLeft = 'auto';
		messageElement.style.marginRight = 'auto';
		messageElement.style.width = 'fit-content';
		messageElement.innerText = msg.content;
		return messageElement;
	}
	const avatarElement = document.createElement('img');
	avatarElement.className = 'small round avatar';
	avatarElement.src = msg.avatar;

	const userElement = document.createElement('p');
	userElement.className = 'bold';
	userElement.innerText = msg.user;
	if (isself) {
		userElement.style.textAlign = 'right';
	}

	const contentElement = document.createElement('p');
	contentElement.className = 'primary select box';
	contentElement.innerText = msg.content;

	const rightElement = document.createElement('div');
	rightElement.style.marginLeft = 'min(2vw,2vh)';
	rightElement.style.marginRight = 'min(2vw,2vh)';
	rightElement.appendChild(userElement);
	rightElement.appendChild(contentElement);

	const messageElement = document.createElement('div');
	messageElement.className = 'horizontal fadeIn';
	messageElement.style.margin = 'min(2vw,2vh)';
	if (isself) {
		messageElement.appendChild(rightElement);
		messageElement.appendChild(avatarElement);
	} else {
		messageElement.appendChild(avatarElement);
		messageElement.appendChild(rightElement);
	}

	const wrapperElement = document.createElement('div');
	wrapperElement.appendChild(messageElement);
	if (isself) {
		messageElement.style.float = 'right';
	}
	return wrapperElement;
}
const messagesElement = document.getElementById('messages');
function clearMessages() {
	messagesElement.innerHTML = '';
}
function printMessage(msg, isself = false) {
	const messageElement = createMessageElement(msg, isself);
	messagesElement.appendChild(messageElement);
	messageElement.scrollIntoView();
}
function printError(err) {
	printMessage({
		type: 'err',
		content: err,
	});
}