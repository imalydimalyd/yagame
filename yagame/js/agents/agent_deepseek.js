class DeepseekAgent extends Agent {
	constructor(config, state) {
		super(config, state);
		if (!this.state.messages) {
			this.state.messages = [];
		}
		if (!this.state.memories) {
			this.state.memories = [];
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
	addMemory(memory) {
		const self = this;
		const memories = self.state.memories;
		memories.push(memory);
	}
	input(message, user = undefined) {
		const self = this;
		const prefix = (user && user !== self.config.name) ? `${user}：` : '';
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
	memorizeBeforeSleep() {
		const self = this;
		printMessage({
			type: 'system',
			content: `${self.config.name}正在进行睡前的回忆`,
		});
		const messages = [
			{
				role: 'system',
				content: `你是${self.config.name}的小助手。接下来将列举今天的全部对话。`,
			}
		];
		for (const message of self.state.messages) {
			messages.push(message.role === 'assistant' ? {
				role: 'user',
				content: `${self.config.name}：${message.content}`,
			} : message);
		}
		messages.push({
			role: 'user',
			content: `现在，请为${self.config.name}总结一天的记忆。注意：
1、忽略和${self.config.name}无关的对话，只保留和${self.config.name}有关的对话（包括${self.config.name}自己说的话，和别人对${self.config.name}说的话）；
2、输出若干行，每行代表一段记忆；
3、每一行尽量简洁，控制在20个汉字左右；
4、每一行之前加一个表情符号，代表这段记忆对${self.config.name}带来的感受；
5、不要输出任何额外信息，只输出记忆信息。`,
		});
		console.log(messages);
		return; // debug

		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (this.readyState === 4 && this.status === 200) {
				const response = JSON.parse(this.responseText);
				const message = response.choices[0].message;
				if (response.choices[0].finish_reason == 'length') {
					self.log({
						type: 'system',
						content: `${self.config.name}困困啦！`,
					}, outputConfig);
				} else {
					self.addMemory(message.content);
					self.sleep();
				}
			}
		};
		xhr.open('POST', 'https://api.deepseek.com/chat/completions');
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('Authorization', 'Bearer ' + self.config.apikey);
		xhr.send(JSON.stringify({
			model: 'deepseek-reasoner',
			messages: messages,
			stream: false,
			temperature: 0.0,
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
				self.memorizeBeforeSleep();
				setInterval(function () {
					self.memorizeBeforeSleep();
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
		if (self.state.memories) {
			let memoriesText = '让我帮你恢复一下你的记忆。你的记忆如下：'
			for (const memory of self.state.memories) {
				memoriesText += memory;
			}
			messages.push({
				role: 'user',
				content: memoriesText,
			});
		}
		for (const message of self.state.messages) {
			messages.push(message);
		}
		if (isAgentMessage) {
			messages[messages.length - 1].content += '若想结束对话，请在输出末尾加上🛑表情。';
		}
		console.log(messages); // debug

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