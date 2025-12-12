function textToLex(text) {
	const n = text.length, lex = [];
	let state = 'default', unpushedText = '';
	function push(type, content) {
		if (type == 'text') {
			unpushedText += content;
		} else {
			if (unpushedText) {
				lex.push({ type: 'text', content: unpushedText });
				unpushedText = '';
			}
			lex.push({ type: type, content: content });
		}
	}
	for (let i = 0; i <= n; ++i) {
		const char = (i < n) ? text[i] : undefined;
		switch (state) {
			case '*':
				if (char === '*') {
					push('**', '**');
				} else {
					push('text', '*');
					--i;
				};
				state = 'default';
				break;

			case 'default':
				switch (char) {
					case undefined:
						if (unpushedText) {
							lex.push({ type: 'text', content: unpushedText });
						}
						break;

					case '*':
						state = '*';
						break;

					case '\n':
						push('breakline', char);
						break;

					case '（':
						push('leftparenthesis', char);
						break;

					case '）':
						push('rightparenthesis', char);
						break;

					default:
						push('text', char);
						break;
				}
				break;
		}
	}
	return lex;
}
function lexToHTML(lex) {
	const stack = [];
	let html = '';
	function push(type, content = undefined) {
		switch (type) {
			case 'leftparenthesis':
				html += '<span style="opacity:0.3">（';
				break;
			case '**':
				html += '<b>';
				break;
		}
		stack.push({ type: type, content: content });
	}
	function pop() {
		if (!stack.length) {
			return undefined;
		}
		const top = stack.pop();
		const type = top.type;
		switch (type) {
			case 'leftparenthesis':
				html += '）</span>';
				break;
			case '**':
				html += '</b>';
				break;
		}
		return top;
	}
	function popUntil(type = undefined) {
		let top;
		do {
			top = pop();
		} while (top !== undefined && top.type !== type);
	}
	function top() {
		if (!stack.length) {
			return undefined;
		}
		return stack[stack.length - 1];
	}
	for (const word of lex) {
		const type = word.type, content = word.content;
		switch (type) {
			case 'text':
				html += content;
				break;
			case 'leftparenthesis':
				push('leftparenthesis');
				break;
			case 'rightparenthesis':
				popUntil('leftparenthesis');
				break;
			case '**':
				{
					const t = top();
					if (t === undefined || t.type !== '**') {
						push('**');
					} else {
						pop();
					}
				}
				break;
			case 'breakline':
				popUntil();
				html += '<br>';
				break;
		}
	}
	return html;
}
function messageTextToHTML(text) {
	const temp = document.createElement('div');
	(temp.textContent !== undefined) ? (temp.textContent = text) : (temp.innerText = text);
	return lexToHTML(textToLex(temp.innerHTML));
}
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
	contentElement.innerHTML = messageTextToHTML(msg.content);

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
	messageElement.style.maxWidth = '70%';
	return wrapperElement;
}
const messagesElement = document.getElementById('messages');
function clearMessages() {
	messagesElement.innerHTML = '';
}
function prependMessage(msg, isself = false) {
	const messageElement = createMessageElement(msg, isself);
	messagesElement.prepend(messageElement);
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