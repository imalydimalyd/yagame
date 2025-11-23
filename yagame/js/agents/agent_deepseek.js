class DeepseekAgent extends Agent {
	constructor(config, state) {
		super(config, state);
		if (!this.state.messages) {
			this.state.messages = [];
		}
		this.setSleepTime();
	}
	addMessage(message) {
		const self = this;
		const messages = self.state.messages;
		messages.push(message);
		if (messages.length > self.config.maxMessages) {
			self.state.messages = messages.slice(-self.config.maxMessages);
		}
	}
	input(message, user = undefined) {
		const self = this;
		const prefix = (user && user !== self.config.name) ? `${user}：` : ''
		self.addMessage({
			role: (user === self.config.name) ? 'assistant' : 'user',
			content: prefix + message,
		});
	}
	dream() {
		const self = this;
		self.state.messages.push({
			role: 'user',
			content: '你做了一个梦，梦见了什么呢',
		});
		const messages = [
			{
				role: 'system',
				content: self.config.persona,
			}
		];
		for (const message of self.state.messages) {
			messages.push(message);
		}

		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (this.readyState === 4 && this.status === 200) {
				const response = JSON.parse(this.responseText);
				const message = response.choices[0].message;
				if (response.choices[0].finish_reason == 'length') {
					self.log({
						type: 'system',
						content: `${self.config.name}正在做梦呢！`,
					}, outputConfig);
				} else {
					self.state.messages.push({
						role: 'assistant',
						content: message.content,
					});
					self.finishSleep();
				}
			}
		};
		xhr.open('POST', 'https://api.deepseek.com/chat/completions');
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('Authorization', 'Bearer ' + self.config.apikey);
		xhr.send(JSON.stringify({
			model: self.config.reasoner ? 'deepseek-reasoner' : 'deepseek-chat',
			messages: messages,
			stream: false,
		}));
	}
	sleep() {
		const self = this;
		printMessage({
			type: 'system',
			content: `${self.config.name}睡着啦`,
		});
		const messages = [
			{
				role: 'system',
				content: self.config.persona,
			}
		];
		for (const message of self.state.messages) {
			messages.push(message);
		}
		messages.push({
			role: 'user',
			content: '你睡着了，在睡着之前请回忆一下你最近一段时间里最重要的几段经历',
		});

		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (this.readyState === 4 && this.status === 200) {
				const response = JSON.parse(this.responseText);
				const message = response.choices[0].message;
				if (response.choices[0].finish_reason == 'length') {
					self.log({
						type: 'system',
						content: `${self.config.name}睡觉啦！`,
					}, outputConfig);
				} else {
					self.state.messages = [
						{
							role: 'assistant',
							content: message.content,
						}
					];
					if (self.config.dreamProb && Math.random() < self.config.dreamProb) {
						self.dream();
					} else {
						self.state.messages.push({
							role: 'user',
							content: '你睡了安稳的一觉，没有做梦',
						});
						self.finishSleep();
					}
				}
			}
		};
		xhr.open('POST', 'https://api.deepseek.com/chat/completions');
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('Authorization', 'Bearer ' + self.config.apikey);
		xhr.send(JSON.stringify({
			model: self.config.reasoner ? 'deepseek-reasoner' : 'deepseek-chat',
			messages: messages,
			stream: false,
		}));
	}
	setSleepTime() {
		const self = this;
		if (self.config.sleepTime !== undefined) {
			const TIME_PER_DAY = 86400000;
			let timeTillSleep = (self.config.sleepTime - Date.now()) % TIME_PER_DAY;
			if (timeTillSleep <= 60000) {
				timeTillSleep += TIME_PER_DAY;
			}
			setTimeout(function () {
				self.sleep();
				setInterval(function () {
					self.sleep();
				}, TIME_PER_DAY);
			}, timeTillSleep);
			printMessage({
				type: 'system',
				content: `${self.config.name}还有${timeTillSleep}毫秒睡着`,
			});
		}
	}
	trigger(outputConfig, isAgentMessage = false) {
		const self = this;
		const messages = [
			{
				role: 'system',
				content: self.config.persona,
			}
		];
		for (const message of self.state.messages) {
			messages.push(message);
		}
		if (isAgentMessage) {
			messages[messages.length - 1].content += '若想结束对话，请在输出末尾加上🛑表情。';
		}

		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (this.readyState === 4 && this.status === 200) {
				const response = JSON.parse(this.responseText);
				const message = response.choices[0].message;
				if (message.reasoning_content && self.config.showCOT) {
					self.log({
						type: 'usermsg',
						user: `（${self.config.name}的心理活动）`,
						avatar: self.config.avatar,
						content: message.reasoning_content,
					}, outputConfig);
				}
				if (response.choices[0].finish_reason == 'length') {
					self.log({
						type: 'system',
						content: `${self.config.name}睡着啦！`,
					}, outputConfig);
				} else {
					self.output({
						type: 'usermsg',
						user: self.config.name,
						avatar: self.config.avatar,
						content: message.content,
					}, outputConfig);
				}
			}
		};
		xhr.open('POST', 'https://api.deepseek.com/chat/completions');
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('Authorization', 'Bearer ' + self.config.apikey);
		xhr.send(JSON.stringify({
			model: self.config.reasoner ? 'deepseek-reasoner' : 'deepseek-chat',
			messages: messages,
			stream: false,
		}));
	}
}