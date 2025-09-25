class GameRule {
	name;
	maxN;
	allowedN() { return false; }
	state = {};
	history = [];
	constructor() { }
	load(state, history) {
		const self = this;
		self.state = state;
		self.history = history;
	}
	init(players) { }
	receive(data, id) { }
	projection(id) { }
	rule() {
		const self = this;
		return `<h1>${self.name}</h1>
<ul>
<li><b>游戏人数：</b>L-R人</li>
</ul>
<h2>游戏规则</h2>
<ul>
<li><b>除非玩家一致同意，否则本游戏不允许私聊。</b></li>
<li>游戏规则</li>
<li>游戏规则</li>
</ul>`;
	}

	syncState() {
		const self = this;
		for (let id = 0; id < self.state.n; ++id) {
			self.send(self.projection(id), id);
		}
		self.updateState();
	}
	pushState() {
		const self = this;
		self.history.push(JSON.stringify(self.state));
		self.syncState();
	}
	resend(id) {
		const self = this;
		self.send(self.projection(id), id);
	}
	updateState() { }
	send(data, id, err = false) { }
	end() { }
}

class GameRenderer {
	constructor(element) {
		this.element = element;
		element.innerHTML = '';
	}
	init(state, isPlaying = true) { }
	render(state, isPlaying = true) { }
	send(data) { }
}

const games = [];