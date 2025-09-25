class DeepseekAgent extends Agent {
	constructor(config, state) {
		super(config, state);
		if (!this.state.messages) {
			this.state.messages = [];
		}
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
	trigger(outputConfig) {
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

		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (this.readyState === 4 && this.status === 200) {
				const response = JSON.parse(xhr.responseText);
				const message = response.choices[0].message;
				self.output({
					type: 'usermessage',
					user: self.config.name,
					avatar: self.config.avatar,
					content: message.content,
				}, outputConfig);
			}
		};
		xhr.open('POST', 'https://api.deepseek.com/chat/completions');
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('Authorization', 'Bearer ' + self.config.apikey);
		xhr.send(JSON.stringify({
			model: self.config.reasoner ? 'deepseek-reasoner' : 'deepseek-chat',
			messages: messages,
			stream: false
		}));
	}
}