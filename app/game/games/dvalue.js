// 差值投标游戏规则
// 可以根据按照代码中的注释自行修改成自己的游戏
const DvalueGameName = '差值投标';
class DvalueGameRule extends GameRule {
	// 游戏名
	name = DvalueGameName;

	// 最多玩家人数，必须是正整数
	maxN = 26;

	// 是否允许玩家人数n
	allowedN(n) {
		return n >= 2 && n <= 26;
	}

	// 游戏配置项，根据自己的游戏规则修改
	// 时间限制（秒）
	timeLimit = 60;
	// 初始金币数量
	initialCoins = 30;
	// 轮次数量
	rounds = 9;

	// 构造函数，无需修改
	constructor() { super(); }

	// 开始一个差值投标的轮次
	startDvalueRound(round) {
		const self = this;
		// 记录当前轮次
		self.state.round = round;
		// 将所有玩家设置为未行动
		for (let id = 0; id < self.state.n; ++id) {
			const player = self.state.players[id];
			player.played = false;
		}
		// 通过setTimeout函数设置这个轮次的结束时间
		setTimeout(function () {
			self.endDvalueRound(round);
		}, self.timeLimit * 1000);
	}

	// 结束一个差值投标的轮次
	endDvalueRound(round) {
		const self = this;
		// 只有这个轮次还在进行的时候才需要结束
		// 如果已经到下一个轮次了，就不需要操作
		if (self.state.round !== round || self.state.end) {
			return;
		}
		// 处理玩家的行动
		const plays = [];
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			if (!player.played) {
				// 未行动的玩家默认出0枚金币
				player.play = 0;
			}
			// 保存上一回合的行动
			player.lastPlay = player.play;
			plays.push(player.play);
		}
		// 将玩家的下注从小到大排序
		plays.sort(function (a, b) { return a - b; })
		// 求出最小的下注
		const playMin = plays[0];
		// 求出不重复且最大的下注，若不存在则计为-1
		let playMax = -1;
		for (let i = self.state.n - 1; i >= 0;) {
			if (!i || plays[i] !== plays[i - 1]) {
				playMax = plays[i];
				break;
			}
			const p = plays[i];
			do {
				--i;
			} while (plays[i] === p);
		}
		// 计算分数和金币
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			// 下注为不重复且最大者+1分
			if (player.play === playMax) {
				++player.score;
				player.lastWon = true;
			} else {
				player.lastWon = false;
			}
			// 每名玩家失去（自己下注数量−本轮最低下注数量）枚金币
			player.coins -= (player.play - playMin);
		}

		// 判断游戏是否结束
		if (round >= self.rounds) {
			// 游戏结束
			self.state.end = true;
		} else {
			// 游戏未结束，进入下一个轮次
			self.startDvalueRound(round + 1);
		}
		// 将游戏状态更新至客户端和历史记录
		self.pushState();
	}

	// 初始化游戏
	init(players) {
		const self = this;

		// 初始化游戏状态（所有游戏状态都必须存放在state内）

		// 游戏是否结束
		self.state.end = false;
		// 游戏人数
		self.state.n = players.length;
		// 玩家信息需要deep copy
		self.players = JSON.parse(JSON.stringify(players));
		self.state.players = JSON.parse(JSON.stringify(players));
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			// 玩家在游戏内
			player.inGame = true;
			// 玩家初始分数为0
			player.score = 0;
			// 玩家初始金币数
			player.coins = self.initialCoins;
		}
		// 开始第一个差值投标轮次
		self.startDvalueRound(1);
		// 将游戏状态保存至回放，这个函数会自动调用syncState，所以无需重复调用
		self.pushState();
	}

	// 接收消息
	receive(data, id) {
		const self = this;
		// 检查下注是否为整数
		if (!Number.isSafeInteger(data)) {
			// 发送报错信息
			self.send('下注非整数', id, true);
			return;
		}
		// 检查是否已经行动过
		if (self.state.players[id].played) {
			self.send('你已经行动过了', id, true);
			return;
		}
		// 检查下注金币数量是否超出所有的金币
		if (data > self.state.players[id].coins) {
			self.send('下注太多了', id, true);
			return;
		}
		// 行动
		self.state.players[id].played = true;
		self.state.players[id].play = data;
		// 检查是否应该结束轮次
		let end = true;
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			// 若还有玩家未行动过，则无法结束轮次
			if (!player.played) {
				end = false;
				break;
			}
		}
		// 若所有玩家均已行动过，则提前结束轮次
		if (end) {
			self.endDvalueRound(self.state.round);
		}
		// 状态更新时需要调用这个函数
		self.syncState();
	}

	// 将游戏状态转化为玩家id的视角，-1则为上帝视角
	// 需要隐藏那些玩家不应该看到的信息
	projection(id) {
		const self = this;
		return {
			id: id,
			end: self.state.end,
			n: self.state.n,
			round: self.state.round,
			timeLimit: self.timeLimit,
			players: self.state.players.map(function (player, i) {
				const ret = {
					user: player.user,
					inGame: player.inGame,
					score: player.score,
					coins: player.coins,
					lastPlay: player.lastPlay,
					lastWon: player.lastWon,
				};
				if (i === id) {
					ret.played = player.played;
					ret.play = player.play;
				}
				return ret;
			}),
		}
	}

	// 根据游戏配置动态生成游戏规则
	rule() {
		const self = this;
		// 游戏规则
		return `<h1>${self.name}</h1>
<ul>
<li><b>游戏人数：</b>2-26人</li>
<li><b>作者：</b>Ya</li>
</ul>
<h2>游戏规则</h2>
<ul>
<li><b>除非玩家一致同意，否则本游戏不允许私聊。</b></li>
<li>游戏的目标是通过合理分配进行投标，从而获取尽可能多的分数。</li>
<li>游戏开始时，每名玩家有${self.initialCoins}枚金币。</li>
<li>每回合，每名玩家同时下注一定数量的金币。</li>
<li>每回合，每名玩家有${self.timeLimit}秒时间思考。超时则视为下注0枚金币。</li>
<li>在下注<b>数量不重复</b>的玩家中，下注最高者（若有）得1分。</li>
<li>每名玩家失去（自己下注数量−本轮最低下注数量）枚金币。</li>
<li>${self.rounds}回合后，游戏结束，得分最高的玩家获胜。</li>
</ul>`;
	}
}

// 差值投标游戏渲染器，和游戏规则配套
class DvalueGameRenderer extends GameRenderer {
	// 初始化渲染器，状态为state，isPlaying=true（默认）表示是游戏中，否则是回放
	init(state, isPlaying = true) {
		const self = this;

		// 标题
		const headerElement = document.createElement('h1');
		headerElement.innerText = '差值投标';

		// 轮次信息
		const roundElement = document.createElement('p');
		self.roundElement = roundElement;

		// 倒计时
		const countdownElement = document.createElement('p');
		if (isPlaying) {
			self.countdownElement = countdownElement;
			self.countdown = new Countdown();
		}

		// 游戏信息的表格
		const tableElement = document.createElement('table');
		const tableRowElements = [];
		self.tableRowElements = tableRowElements;
		for (let id = 0; id < state.n; ++id) {
			const player = state.players[id];
			// 代表玩家得分的单元格
			const tableDataScoreElement = document.createElement('td');
			// 代表玩家用户名的单元格
			const tableDataUserElement = document.createElement('td');
			tableDataUserElement.innerText = player.user;
			// 代表玩家金币数量的单元格
			const tableDataCoinElement = document.createElement('td');
			// 代表玩家上一轮下注的单元格
			const tableDataLastPlayElement = document.createElement('td');

			// 代表玩家的一行
			const tableRowElement = document.createElement('tr');
			// 代表自己的一行用蓝色显示
			if (id === state.id) {
				tableRowElement.classList.add('blue');
			}
			// 将单元格加入代表玩家的行
			tableRowElement.appendChild(tableDataScoreElement);
			tableRowElement.appendChild(tableDataUserElement);
			tableRowElement.appendChild(tableDataCoinElement);
			tableRowElement.appendChild(tableDataLastPlayElement);
			// 保存今后需要修改的所有元素
			tableRowElements.push({
				row: tableRowElement,
				score: tableDataScoreElement,
				coin: tableDataCoinElement,
				lastPlay: tableDataLastPlayElement,
			})
			// 将这一行加入表格
			tableElement.appendChild(tableRowElement);
		}

		// 用于修改下注的滑动条
		const sliderElement = document.createElement('input');
		self.sliderElement = sliderElement;
		sliderElement.type = 'range';
		sliderElement.min = '0';
		sliderElement.max = '0';
		sliderElement.value = '0';
		sliderElement.step = '1';

		// 用于增加下注的按钮
		const increaseButtonElement = document.createElement('div');
		self.increaseButtonElement = increaseButtonElement;
		increaseButtonElement.className = 'button';
		increaseButtonElement.innerHTML = '+1下注';

		// 用于减少下注的按钮
		const decreaseButtonElement = document.createElement('div');
		self.decreaseButtonElement = decreaseButtonElement;
		decreaseButtonElement.className = 'button';
		decreaseButtonElement.innerHTML = '−1下注';

		// 用于确定下注的按钮
		const moveButtonElement = document.createElement('div');
		self.moveButtonElement = moveButtonElement;
		moveButtonElement.className = 'button';

		// 下注相关控件都统一放到一行里
		const moveButtonsElement = document.createElement('div');
		self.moveButtonsElement = moveButtonsElement;
		moveButtonsElement.className = 'horizontal';
		moveButtonsElement.appendChild(decreaseButtonElement);
		moveButtonsElement.appendChild(moveButtonElement);
		moveButtonsElement.appendChild(increaseButtonElement);

		// 将滑动条的值+delta
		function changeSlider(delta = 0) {
			const value = Math.max(0, Math.min(self.coins, parseInt(sliderElement.value) + delta));
			self.value = value;
			sliderElement.value = value;
			moveButtonElement.innerText = `下注${value}金币`;
			if (value < self.coins) {
				increaseButtonElement.classList.remove('disabled');
			} else {
				increaseButtonElement.classList.add('disabled');
			}
			if (value > 0) {
				decreaseButtonElement.classList.remove('disabled');
			} else {
				decreaseButtonElement.classList.add('disabled');
			}
		}
		self.changeSlider = changeSlider;
		sliderElement.addEventListener('input', function () { changeSlider(); });
		increaseButtonElement.addEventListener('click', function () { changeSlider(1); });
		decreaseButtonElement.addEventListener('click', function () { changeSlider(-1); });
		changeSlider();

		// 确定下注时，向服务器发送下注信息
		moveButtonElement.addEventListener('click', function () {
			if (self.movable) {
				self.send(self.value);
			}
		});

		// 把所有元素都添加到self.element里
		self.element.appendChild(headerElement);
		self.element.appendChild(roundElement);
		if (isPlaying) {
			self.element.appendChild(countdownElement);
		}
		self.element.appendChild(tableElement);
		self.element.appendChild(sliderElement);
		self.element.appendChild(moveButtonsElement);
	}

	// 渲染器更新状态为state，isPlaying=true（默认）表示是游戏中，否则是回放
	render(state, isPlaying = true) {
		const self = this;

		// 更新轮次信息
		self.roundElement.innerText = state.end ? '游戏已结束' : `第 ${state.round} 回合`;

		// 若轮次信息有变化，存储轮次信息，并显示倒计时
		if (state.round !== self.round && isPlaying) {
			self.round = state.round;
			self.countdown.start(self.countdownElement, state.timeLimit * 1000);
		}

		// 自己是否已经下注
		const played = isPlaying && state.players[state.id].played;
		// 依次更新每个玩家对应的一行
		for (let id = 0; id < state.n; ++id) {
			// 读取玩家信息
			const player = state.players[id];
			// 读取玩家对应的行
			const tableRowElement = self.tableRowElements[id];
			// 上一轮赢的玩家对应的行加粗（其他玩家对应的行要取消粗体）
			if (player.lastWon) {
				tableRowElement.row.classList.add('bold');
			} else {
				tableRowElement.row.classList.remove('bold');
			}
			// 更新玩家分数的单元格，每一分对应一个⭐
			let scoreText = '';
			for (let i = 0; i < player.score; ++i) {
				scoreText += '⭐';
			};
			tableRowElement.score.innerText = scoreText;
			// 更新玩家金币的单元格
			tableRowElement.coin.innerText = `金币：${player.coins}`;
			// 更新玩家下注的单元格
			if (played && !state.end) {
				tableRowElement.lastPlay.innerHTML = (id === state.id) ? `下注：${player.play}` : '';
			} else {
				tableRowElement.lastPlay.innerHTML = (player.lastPlay !== undefined) ? `下注：${player.lastPlay}` : '';
			}
		}
		// 更新下注控件状态
		if (isPlaying) {
			if (played) {
				// 玩家已经下注，需要禁用按钮
				self.movable = false;
				self.moveButtonElement.classList.add('disabled');
			} else {
				// 玩家尚未下注，需要启用按钮，并更新滑动条的最大值
				self.movable = true;
				self.moveButtonElement.classList.remove('disabled');
				self.coins = state.players[state.id].coins;
				self.sliderElement.max = self.coins;
				if (parseInt(self.sliderElement.value) > self.coins) {
					self.sliderElement.value = self.coins;
				}
				// 刷新滑动条状态
				self.changeSlider();
			}
		}

		// 当游戏结束时，隐藏下注控件，隐藏倒计时。若为回放模式则无需隐藏倒计时
		if (state.end || !isPlaying) {
			if (isPlaying) {
				self.countdownElement.classList.add('hidden');
			}
			self.sliderElement.classList.add('hidden');
			self.moveButtonsElement.classList.add('hidden');
		} else {
			if (isPlaying) {
				self.countdownElement.classList.remove('hidden');
			}
			self.sliderElement.classList.remove('hidden');
			self.moveButtonsElement.classList.remove('hidden');
		}
	}
	send(data) { }
}

// 将差值投标游戏添加到游戏列表中
games.push({
	name: DvalueGameName,
	rule: DvalueGameRule,
	renderer: DvalueGameRenderer,
});