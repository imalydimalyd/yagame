const MZADActions = [
	'', '',
	'2：刺杀',
	'3：反制',
	'4：圣盾',
	'5：毁灭',
	'6：拼点',
	'7：弃牌',
	'8：巨型',
];

// 明争暗斗游戏规则
const MZADGameName = '明争暗斗';
class MZADGameRule extends GameRule {
	// 游戏名
	name = MZADGameName;

	// 最多玩家人数，必须是正整数
	maxN = 26;

	// 是否允许玩家人数n
	allowedN(n) {
		return n >= 2 && n <= 26;
	}

	// 游戏配置项，根据自己的游戏规则修改
	// 时间限制（秒）
	timeLimit = 120;
	// 目标分数
	goalScore = 25;

	// 构造函数，无需修改
	constructor() { super(); }

	// 开始一个明争暗斗的轮次
	startMZADRound(round) {
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
			self.endMZADRound(round);
		}, self.timeLimit * 1000);
	}

	// 结束一个明争暗斗的轮次
	endMZADRound(round) {
		const self = this;
		// 只有这个轮次还在进行的时候才需要结束
		// 如果已经到下一个轮次了，就不需要操作
		if (self.state.round !== round || self.state.end) {
			return;
		}
		// 处理玩家的行动
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			if (!player.played) {
				// 未行动的玩家直接被淘汰
				player.inGame = false;
			}
			if (player.inGame) {
				// 保存上一回合的行动
				player.lastPlay = player.play;
				// 上一回合的收益
				player.gain = player.play.x;
				// 选中这名玩家的所有玩家
				player.chosen = [];
				// 这名玩家的技能是否起作用
				player.effect = true;
			} else {
				// 清空上一回合的行动
				player.lastPlay = undefined;
			}
		}
		// 处理被选中的玩家
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			// 只有2和6会选择别人
			if (player.inGame && (player.play.x === 2 || player.play.x === 6)) {
				self.state.players[player.play.id].chosen.push(id);
			}
		}

		// 结算5：毁灭
		let has5 = false;
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			if (player.inGame && player.play.x === 5) {
				// 有毁灭
				has5 = true;
				break;
			}
		}
		if (has5) {
			// 计算最大的数字
			let maxX = 0;
			for (let id = 0; id < self.state.n; ++id) {
				// 枚举所有玩家
				const player = self.state.players[id];
				if (player.inGame && player.play.x > maxX) {
					maxX = player.play.x;
				}
			}
			for (let id = 0; id < self.state.n; ++id) {
				// 枚举所有玩家
				const player = self.state.players[id];
				if (player.inGame && player.play.x === maxX) {
					// 数字为最大的玩家不得分
					player.gain = 0;
				}
			}
		}

		// 结算4：圣盾和7：弃牌
		const threshold = 2;
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有被≥threshold个人选中的玩家
			const player = self.state.players[id];
			if (player.inGame && player.chosen.length >= threshold) {
				if (player.play.x === 4) {
					// 4：圣盾，让选择你的玩家技能失效且不得分
					for (const i of player.chosen) {
						const player2 = self.state.players[i];
						// 技能失效
						player2.effect = false;
						// 不得分
						player2.gain = 0;
					}
				} else if (player.play.x === 7) {
					// 7：弃牌，自己不得分
					player.gain = 0;
				}
			}
		}

		// 结算6：拼点
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			if (player.inGame && player.effect && player.play.x === 6) {
				// 玩家的6：拼点生效
				const i = player.play.id;
				const player2 = self.state.players[i];
				if (player.play.x <= player2.play.x) {
					player.gain = 0;
				}
				if (player2.play.x <= player.play.x) {
					player2.gain = 0;
				}
			}
		}

		// 结算2：刺杀和3：反制
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			if (player.inGame && player.effect && player.play.x === 2) {
				// 玩家的2：刺杀生效
				const i = player.play.id;
				const player2 = self.state.players[i];
				// 如果被刺杀的玩家挂机，那么刺杀无效
				if (player2.play) {
					if (player2.play.x === 3) {
						// 玩家被3反杀
						player.eliminated = true;
					} else if (player2.play.x === player.play.ix) {
						// 刺杀成功
						player2.eliminated = true;
						// 刺杀成功的玩家改为获得对方的数字
						player.gain = player2.play.x;
					}
				}
			}
		}

		// 统计存活玩家的个数和分数
		let countAlive = 0, maxScore = 0;
		for (let id = 0; id < self.state.n; ++id) {
			// 枚举所有玩家
			const player = self.state.players[id];
			// 移除已被淘汰的玩家
			if (player.inGame && player.eliminated) {
				player.inGame = false;
				player.gain = 0;
			}
			if (player.inGame) {
				// 统计玩家分数
				player.score += player.gain;
				// 存活玩家个数+1
				++countAlive;
				// 统计最大分数
				maxScore = Math.max(maxScore, player.score);
			}
		}

		// 判断游戏是否结束
		if (countAlive <= 1 || maxScore >= self.goalScore) {
			// 游戏结束
			self.state.end = true;
		} else {
			// 游戏未结束，进入下一个轮次
			self.startMZADRound(round + 1);
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
			// 玩家初始时未被选中
			player.chosen = [];
		}
		// 开始第一个明争暗斗轮次
		self.startMZADRound(1);
		// 将游戏状态保存至回放，这个函数会自动调用syncState，所以无需重复调用
		self.pushState();
	}

	// 接收消息
	receive(data, id) {
		const self = this;
		// 检查玩家是否已被淘汰
		if (!self.state.players[id].inGame) {
			self.send('你已经被淘汰了', id, true);
			return;
		}
		// 检查是否已经行动过
		if (self.state.players[id].played) {
			self.send('你已经行动过了', id, true);
			return;
		}
		// 检查数字是否正确
		if (typeof data !== 'object' || !Number.isSafeInteger(data.x) || data.x < 2 || data.x > 8) {
			// 发送报错信息
			self.send('数字错误', id, true);
			return;
		}
		// 检查巨型效果
		if (data.x >= 6 && self.state.players[id].lastPlay && self.state.players[id].lastPlay.x === 8) {
			self.send('你上回合选择了8，因此这回合不能选择6-8', id, true);
			return;
		}
		// 检查是否选择了人
		if ((data.x === 2 || data.x === 6) && (!Number.isSafeInteger(data.id) || data.id < 0 || data.id >= self.state.n || data.id === id || !self.state.players[data.id].inGame)) {
			self.send('选择的人错误', id, true);
			return;
		}
		// 检查是否选择了数字
		if (data.x === 2 && (!Number.isSafeInteger(data.ix) || data.ix < 2 || data.ix > 8)) {
			self.send('选择的数字错误', id, true);
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
			// 若还有存活的玩家未行动过，则无法结束轮次
			if (player.inGame && !player.played) {
				end = false;
				break;
			}
		}
		// 若所有玩家均已行动过，则提前结束轮次
		if (end) {
			self.endMZADRound(self.state.round);
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
					lastPlay: player.lastPlay,
					gain: player.gain,
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
<li><b>原作：</b>saiwei</li>
</ul>
<h2>游戏规则</h2>
<ul>
<li><b>除非玩家一致同意，否则本游戏不允许私聊。</b></li>
<li>游戏的目标是通过选择合适的数字，争取最快得到${self.goalScore}分，同时避免被淘汰。</li>
<li>每回合，每名玩家同时选择2-8的一个数字，获得相等的得分，并触发数字的效果。</li>
<li>每回合，每名玩家有${self.timeLimit}秒时间思考。超时则<b>自动淘汰</b>。</li>
<li>当有人达到${self.goalScore}分或者≤1名玩家时游戏结束，此时存活且分数最高者获胜。</li>
</ul>
<h2>数字效果</h2>
<p>除非另外说明，否则所有效果均只针对本回合。</p>
<ul>
<li class="mzad2">2：刺杀，猜测另一名玩家的数字，若猜中则对方淘汰，改为获得对方的分值。</li>
<li class="mzad3">3：反制，选择刺杀你的玩家淘汰。</li>
<li class="mzad4">4：圣盾，若被≥2人选择，则选择你的人技能失效且不得分。</li>
<li class="mzad5">5：毁灭，所有点数最大的牌不能分。</li>
<li class="mzad6">6：拼点，选择另一名玩家，你和他中数字较小者（包括并列）不得分。</li>
<li class="mzad7">7：弃牌，若被≥2人选择，则不得分。</li>
<li class="mzad8">8：巨型，下回合不能选6-8。</li>
</ul>`;
	}
}

// 明争暗斗游戏渲染器，和游戏规则配套
class MZADGameRenderer extends GameRenderer {
	value = {};
	// 初始化渲染器，状态为state，isPlaying=true（默认）表示是游戏中，否则是回放
	init(state, isPlaying = true) {
		const self = this;

		// 标题
		const headerElement = document.createElement('h1');
		headerElement.innerText = '明争暗斗';

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
			// 代表玩家上一轮行动的单元格
			const tableDataLastPlayElement = document.createElement('td');

			// 代表玩家的一行
			const tableRowElement = document.createElement('tr');
			// 代表自己的一行用粗体显示
			if (id === state.id) {
				tableRowElement.classList.add('bold');
			}
			// 将单元格加入代表玩家的行
			tableRowElement.appendChild(tableDataScoreElement);
			tableRowElement.appendChild(tableDataUserElement);
			tableRowElement.appendChild(tableDataLastPlayElement);
			// 保存今后需要修改的所有元素
			tableRowElements.push({
				row: tableRowElement,
				score: tableDataScoreElement,
				lastPlay: tableDataLastPlayElement,
			})
			// 将这一行加入表格
			tableElement.appendChild(tableRowElement);
		}

		// 选人控件
		const idElement = document.createElement('div');
		idElement.className = 'hidden horizontal centered';
		const idElements = [];
		self.idElements = idElements;
		function refreshIDElement(state) {
			for (let i = 0; i < state.n; ++i) {
				if (state.players[i].inGame && i !== state.id) {
					idElements[i].classList.remove('nodisplay');
				} else {
					idElements[i].classList.add('nodisplay');
				}
			}
		}
		self.refreshIDElement = refreshIDElement;

		for (let id = 0; id < state.n; ++id) {
			const idButtonElement = document.createElement('div');
			idButtonElement.className = `button`;
			idButtonElement.innerText = state.players[id].user;
			idButtonElement.addEventListener('click', function () {
				self.value.id = id;
				for (let i = 0; i < state.n; ++i) {
					if (i === id) {
						idElements[i].classList.add('active');
					} else {
						idElements[i].classList.remove('active');
					}
				}
			});
			idElements.push(idButtonElement);
			idElement.appendChild(idButtonElement);
		}
		refreshIDElement(state);

		// 预测控件
		const ixElement = document.createElement('div');
		ixElement.className = 'hidden horizontal centered';
		const ixElements = [0, 0];
		self.ixElements = ixElements;
		for (let ix = 2; ix <= 8; ++ix) {
			const ixButtonElement = document.createElement('div');
			ixButtonElement.className = `button`;
			ixButtonElement.innerText = MZADActions[ix];
			ixButtonElement.addEventListener('click', function () {
				self.value.ix = ix;
				for (let i = 2; i <= 8; ++i) {
					if (i === ix) {
						ixElements[i].classList.add('active');
					} else {
						ixElements[i].classList.remove('active');
					}
				}
			});
			ixElements.push(ixButtonElement);
			ixElement.appendChild(ixButtonElement);
		}

		// 确定行动时，向服务器发送行动信息
		const moveButtonElement = document.createElement('div');
		self.moveButtonElement = moveButtonElement;
		moveButtonElement.className = 'button';
		moveButtonElement.innerText = '确认行动';
		moveButtonElement.addEventListener('click', function () {
			if (self.movable) {
				self.send(self.value);
			}
		});

		// 行动控件
		const xElement = document.createElement('div');
		xElement.className = 'horizontal centered';
		const xElements = [0, 0];
		self.xElements = xElements;
		for (let x = 2; x <= 8; ++x) {
			const xButtonElement = document.createElement('div');
			xButtonElement.className = `mzad${x} button`;
			xButtonElement.innerText = MZADActions[x];
			xButtonElement.addEventListener('click', function () {
				if (x >= 6 && self.shouldDisableBig) {
					return;
				}
				self.value.x = x;
				for (let i = 2; i <= 8; ++i) {
					if (i === x) {
						xElements[i].classList.add('active');
					} else {
						xElements[i].classList.remove('active');
					}
				}
				for (let i = 2; i <= 8; ++i) {
					if (i === x) {
						idElement.classList.add(`mzad${i}`);
						ixElement.classList.add(`mzad${i}`);
						moveButtonElement.classList.add(`mzad${i}`);
					} else {
						idElement.classList.remove(`mzad${i}`);
						ixElement.classList.remove(`mzad${i}`);
						moveButtonElement.classList.remove(`mzad${i}`);
					}
				}
				if (x === 2 || x === 6) {
					idElement.classList.remove('hidden');
				} else {
					idElement.classList.add('hidden');
				}
				if (x === 2) {
					ixElement.classList.remove('hidden');
				} else {
					ixElement.classList.add('hidden');
				}
			});
			xElements.push(xButtonElement);
			xElement.appendChild(xButtonElement);
		}

		// 行动面板
		const movePanelElement = document.createElement('div');
		self.movePanelElement = movePanelElement;
		movePanelElement.appendChild(xElement);
		movePanelElement.appendChild(idElement);
		movePanelElement.appendChild(ixElement);
		movePanelElement.appendChild(moveButtonElement);

		// 把所有元素都添加到self.element里
		self.element.appendChild(headerElement);
		self.element.appendChild(roundElement);
		if (isPlaying) {
			self.element.appendChild(countdownElement);
		}
		self.element.appendChild(tableElement);
		self.element.appendChild(movePanelElement);
	}

	// 渲染器更新状态为state，isPlaying=true（默认）表示是游戏中，否则是回放
	render(state, isPlaying = true) {
		const self = this;

		// 创建行动对应的HTML元素
		function createActionElement(play) {
			let text = MZADActions[play.x];
			if (play.x === 2 || play.x === 6) {
				text += ` | ${state.players[play.id].user}`;
				if (play.x === 2) {
					text += ` | ${play.ix}`;
				}
			}
			const actionElement = document.createElement('span');
			actionElement.className = `mzad${play.x}`;
			actionElement.innerText = text;
			return actionElement;
		}

		// 更新轮次信息
		self.roundElement.innerText = state.end ? '游戏已结束' : `第 ${state.round} 回合`;

		// 若轮次信息有变化，存储轮次信息，并显示倒计时
		if (state.round !== self.round && isPlaying) {
			self.round = state.round;
			self.countdown.start(self.countdownElement, state.timeLimit * 1000);
		}

		// 自己是否已经行动过
		const played = isPlaying && state.players[state.id].played;
		// 依次更新每个玩家对应的一行
		for (let id = 0; id < state.n; ++id) {
			// 读取玩家信息
			const player = state.players[id];
			// 读取玩家对应的行
			const tableRowElement = self.tableRowElements[id];
			if (player.inGame) {
				// 代表未淘汰玩家的一行需要取消半透明效果
				tableRowElement.row.style.opacity = 'inherit';
			} else {
				// 代表已淘汰玩家的一行用半透明显示
				tableRowElement.row.style.opacity = '0.5';
			}
			// 更新玩家分数的单元格
			if (player.inGame) {
				tableRowElement.score.innerText = `${player.score}分`;
				if (player.gain) {
					const gainElement = document.createElement('span');
					gainElement.className = 'green';
					gainElement.innerText = `（+${player.gain}）`;
					tableRowElement.score.appendChild(gainElement);
				}
			} else {
				// 玩家已被淘汰，不显示分数
				tableRowElement.score.innerText = '淘汰';
			}
			// 更新玩家行动的单元格
			tableRowElement.lastPlay.innerHTML = '';
			if (played && !state.end) {
				if (id === state.id) {
					const actionElement = createActionElement(player.play);
					tableRowElement.lastPlay.appendChild(actionElement);
				}
			} else {
				if (player.lastPlay) {
					const actionElement = createActionElement(player.lastPlay);
					tableRowElement.lastPlay.appendChild(actionElement);
				}
			}
		}
		// 更新行动控件状态
		self.shouldDisableBig = false;
		if (isPlaying) {
			if (played) {
				// 玩家已经行动，需要禁用行动
				self.movable = false;
				self.moveButtonElement.classList.add('disabled');
			} else {
				// 玩家尚未行动，需要启用行动
				self.movable = true;
				self.moveButtonElement.classList.remove('disabled');
				// 若上一轮出8，则这一轮禁用6-8
				self.shouldDisableBig = (state.players[state.id].lastPlay && state.players[state.id].lastPlay.x === 8);
			}
			// 更新选人控件
			self.refreshIDElement(state);
		}
		if (self.shouldDisableBig) {
			for (let i = 6; i <= 8; ++i) {
				self.xElements[i].classList.add('disabled');
			}
		} else {
			for (let i = 6; i <= 8; ++i) {
				self.xElements[i].classList.remove('disabled');
			}
		}

		// 当游戏结束时，隐藏行动面板，隐藏倒计时。若为回放模式则无需隐藏倒计时
		if (state.end || !isPlaying) {
			if (isPlaying) {
				self.countdownElement.classList.add('hidden');
			}
			self.movePanelElement.classList.add('hidden');
		} else {
			if (isPlaying) {
				self.countdownElement.classList.remove('hidden');
			}
			self.movePanelElement.classList.remove('hidden');
		}
	}
	send(data) { }
}

// 将明争暗斗游戏添加到游戏列表中
games.push({
	name: MZADGameName,
	rule: MZADGameRule,
	renderer: MZADGameRenderer,
});