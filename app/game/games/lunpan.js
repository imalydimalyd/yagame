// 24轮盘 · 双人对战（状态栏显示“流失”）
(function () {
	const GAME_NAME = '24轮盘';
	const SLOTS = 24;
	const INIT_CHIPS = 600;
	const MAX_BET = 16;
	const EMPTY_SHOT_LIMIT_DIFF = 3;
	const TURN_TIMEOUT_SECONDS = 120;

	// ---------- 辅助函数 ----------
	function randInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function hasDuplicates(arr) {
		return new Set(arr).size !== arr.length;
	}

	function shiftPositions(positions, offset) {
		return positions.map(p => (p + offset) % SLOTS);
	}

	// ---------- 游戏规则类 ----------
	class Game24RouletteRule extends GameRule {
		name = GAME_NAME;
		maxN = 2;
		allowedN(n) { return n === 2; }

		constructor() {
			super();
			this._timerId = null;
		}

		init(users) {
			const self = this;
			self._clearTimer();
			self.state = {
				phase: 'selecting',
				end: false,
				n: users.length,
				players: users.map((u, i) => ({
					user: u.user,
					chips: INIT_CHIPS,
					emptyShots: 0,
					selected: [],
					finalPositions: [],
					triggered: [],
				})),
				wheel: new Array(SLOTS).fill(null),
				currentPos: 0,
				currentPlayer: 0,
				bet: 1,
				pool: 0,
				roundStartDiff: 0,
				triggeredCount: 0,
				winner: null,
				loser: null,
				selectMessage: '',
				turnStartTimestamp: 0,
			};
			self.pushState();
		}

		// ---------- 计时器相关 ----------
		_startTimer() {
			const self = this;
			self._clearTimer();
			const state = self.state;
			if (state.phase !== 'playing' || state.end) return;
			state.turnStartTimestamp = Date.now();
			self._timerId = setTimeout(() => {
				self._handleTimeout();
			}, TURN_TIMEOUT_SECONDS * 1000);
		}

		_clearTimer() {
			if (this._timerId) {
				clearTimeout(this._timerId);
				this._timerId = null;
			}
		}

		_handleTimeout() {
			const self = this;
			const state = self.state;
			if (state.phase !== 'playing' || state.end) return;

			const loser = state.currentPlayer;
			const winner = 1 - loser;
			state.end = true;
			state.phase = 'ended';
			state.winner = winner;
			state.loser = loser;
			state.turnStartTimestamp = 0;
			state.roundStartDiff = state.players[0].chips - state.players[1].chips;
			self._clearTimer();
			self.pushState();
			self.send({ error: true, err_msg: `玩家 ${state.players[loser].user} 思考超时，判负` }, loser);
			self.send({ ok: true, msg: `玩家 ${state.players[loser].user} 超时，你获胜` }, winner);
		}

		// ---------- 接收客户端消息 ----------
		receive(data, id) {
			const self = this;
			const state = self.state;
			const { action, body } = data;

			if (state.end) {
				self.send('游戏已结束', id, true);
				return;
			}

			if (state.phase === 'selecting') {
				if (action === 'select') {
					if (!Array.isArray(body) || body.length !== 3) {
						self.send('请提交3个点位', id, true);
						return;
					}
					const invalid = body.some(v => !Number.isInteger(v) || v < 0 || v >= SLOTS);
					if (invalid || hasDuplicates(body)) {
						self.send('点位无效或重复', id, true);
						return;
					}
					state.players[id].selected = body.slice();
					self.send({ ok: true, msg: '选点已记录' }, id);

					if (state.players[0].selected.length === 3 && state.players[1].selected.length === 3) {
						const selA = state.players[0].selected;
						const selB = state.players[1].selected;
						const intersection = selA.filter(v => selB.includes(v));
						if (intersection.length > 0) {
							state.selectMessage = '选点重叠，请重新选择';
							state.players.forEach(p => p.selected = []);
							self.send({ error: true, err_msg: '选点与对方重叠，请重新选择' }, 0);
							self.send({ error: true, err_msg: '选点与对方重叠，请重新选择' }, 1);
							self.syncState();
							return;
						}

						const offset = randInt(0, SLOTS - 1);
						const finalA = shiftPositions(selA, offset);
						const finalB = shiftPositions(selB, offset);

						state.players[0].finalPositions = finalA;
						state.players[1].finalPositions = finalB;
						state.players.forEach((p, idx) => {
							p.finalPositions.forEach(pos => {
								state.wheel[pos] = idx;
							});
							p.triggered = p.finalPositions.map(() => false);
						});
						state.phase = 'playing';
						state.currentPos = 0;
						state.currentPlayer = 0;
						state.bet = 1;
						state.pool = 0;
						state.roundStartDiff = state.players[0].chips - state.players[1].chips;
						state.selectMessage = '';

						self._startTimer();
						self.pushState();
						self.send({ ok: true, msg: '游戏开始！' }, 0);
						self.send({ ok: true, msg: '游戏开始！' }, 1);
					}
				} else {
					self.send('目前处于选点阶段，请提交 select 操作', id, true);
				}
				return;
			}

			if (state.phase === 'playing' && !state.end) {
				if (action === 'shoot') {
					self.handleShoot(id);
				} else if (action === 'pay') {
					self.handlePay(id);
				} else {
					self.send('未知操作', id, true);
				}
				return;
			}

			self.send('游戏已结束或状态异常', id, true);
		}

		// ---------- 主动开枪 ----------
		handleShoot(playerIdx) {
			const self = this;
			const state = self.state;

			if (state.currentPlayer !== playerIdx) {
				self.send('当前不是你的回合', playerIdx, true);
				return;
			}

			const pos = state.currentPos;
			const bulletOwner = state.wheel[pos];
			const isBullet = bulletOwner !== null && !state.players[bulletOwner].triggered[state.players[bulletOwner].finalPositions.indexOf(pos)];

			let opponent = 1 - playerIdx;
			let poolAmount = state.pool;

			if (isBullet) {
				const owner = bulletOwner;
				const idx = state.players[owner].finalPositions.indexOf(pos);
				state.players[owner].triggered[idx] = true;
				state.triggeredCount++;
				state.players[opponent].chips += poolAmount;
				const pay50 = Math.min(50, state.players[playerIdx].chips);
				state.players[playerIdx].chips -= pay50;
				state.players[opponent].chips += pay50;
			} else {
				state.players[playerIdx].chips += poolAmount;
			}
			state.pool = 0;
			state.bet = 1;

			const ended = self.checkGameOver(playerIdx);
			if (!ended) {
				state.currentPos = (state.currentPos + 1) % SLOTS;
				state.currentPlayer = opponent;
				state.roundStartDiff = state.players[0].chips - state.players[1].chips;
				self._startTimer();
				self.send({ ok: true, msg: '开枪成功' }, playerIdx);
			}
			// 【由Ya修改】将 syncState 改为 pushState
			self.pushState();
		}

		// ---------- 支付 ----------
		handlePay(playerIdx) {
			const self = this;
			const state = self.state;

			if (state.currentPlayer !== playerIdx) {
				self.send('当前不是你的回合', playerIdx, true);
				return;
			}

			const betAmount = state.bet;
			if (betAmount > state.players[playerIdx].chips) {
				self.send('筹码不足', playerIdx, true);
				return;
			}

			state.players[playerIdx].chips -= betAmount;
			state.pool += betAmount;
			state.bet *= 2;

			if (state.bet > MAX_BET) {
				const autoPlayer = playerIdx;
				const pos = state.currentPos;
				const bulletOwner = state.wheel[pos];
				const isBullet = bulletOwner !== null && !state.players[bulletOwner].triggered[state.players[bulletOwner].finalPositions.indexOf(pos)];

				state.pool = 0;
				state.bet = 1;

				if (isBullet) {
					const owner = bulletOwner;
					const idx = state.players[owner].finalPositions.indexOf(pos);
					state.players[owner].triggered[idx] = true;
					state.triggeredCount++;
				} else {
					state.players[autoPlayer].emptyShots += 1;
				}

				const ended = self.checkGameOver(autoPlayer);
				if (!ended) {
					state.currentPos = (state.currentPos + 1) % SLOTS;
					state.currentPlayer = 1 - autoPlayer;
					state.roundStartDiff = state.players[0].chips - state.players[1].chips;
					self._startTimer();
					self.send({ ok: true, msg: '系统自动开枪' }, autoPlayer);
				}
				// 【由Ya修改】将 syncState 改为 pushState
				self.pushState();
			} else {
				state.currentPlayer = 1 - playerIdx;
				// 支付不更新点差
				self._startTimer();
				// 【由Ya修改】将 syncState 改为 pushState
				self.pushState();
				self.send({ ok: true, msg: `支付${betAmount}筹码，下次支付需${state.bet}` }, playerIdx);
			}
		}

		// ---------- 检查游戏是否结束 ----------
		checkGameOver(shooterIdx) {
			const self = this;
			const state = self.state;

			if (state.triggeredCount >= 6) {
				state.phase = 'ended';
				state.end = true;
				const p0 = state.players[0].chips;
				const p1 = state.players[1].chips;
				if (p0 > p1) state.winner = 0;
				else if (p1 > p0) state.winner = 1;
				else state.winner = -1;
				state.turnStartTimestamp = 0;
				state.roundStartDiff = state.players[0].chips - state.players[1].chips;
				self._clearTimer();
				return true;
			}

			const diff = Math.abs(state.players[0].emptyShots - state.players[1].emptyShots);
			if (diff >= EMPTY_SHOT_LIMIT_DIFF) {
				state.phase = 'ended';
				state.end = true;
				if (state.players[0].emptyShots > state.players[1].emptyShots) {
					state.loser = 0;
					state.winner = 1;
				} else {
					state.loser = 1;
					state.winner = 0;
				}
				state.turnStartTimestamp = 0;
				state.roundStartDiff = state.players[0].chips - state.players[1].chips;
				self._clearTimer();
				return true;
			}
			return false;
		}

		// ---------- 状态投影 ----------
		projection(id) {
			const self = this;
			const state = self.state;
			let remainingSeconds = null;
			if (state.phase === 'playing' && !state.end && state.turnStartTimestamp > 0) {
				const elapsed = (Date.now() - state.turnStartTimestamp) / 1000;
				remainingSeconds = Math.max(0, Math.floor(TURN_TIMEOUT_SECONDS - elapsed));
			}
			return {
				id: id,
				end: state.end,
				phase: state.phase,
				players: state.players.map(p => ({
					user: p.user,
					chips: p.chips,
					emptyShots: p.emptyShots,
					selected: p.selected.slice(),
					finalPositions: p.finalPositions.slice(),
					triggered: p.triggered.slice(),
				})),
				wheel: state.wheel.slice(),
				currentPos: state.currentPos,
				currentPlayer: state.currentPlayer,
				bet: state.bet,
				pool: state.pool,
				roundStartDiff: state.roundStartDiff,
				triggeredCount: state.triggeredCount,
				winner: state.winner,
				loser: state.loser,
				selectMessage: state.selectMessage,
				remainingSeconds: remainingSeconds,
			};
		}

		// ---------- 规则说明 ----------
		// 【由Ya修改】优化了规则文案
		rule() {
			return `
				<h1>24轮盘</h1>
				<ul>
					<li><b>游戏人数：</b>2人</li>
					<li><b>作者：</b>saiwei</li>
					<li><b>原作：</b>欺诈游戏</li>
				</ul>
				<h2>基本概念</h2>
				<ul>
					<li><b>初始筹码：</b>600</li>
					<li><b>子弹：</b>每人选择3个位置，系统随机嵌入24格轮盘。</li>
					<li>若位置有冲突则双方均需重新选择，否则系统随机旋转轮盘并开始游戏。</li>
					<li><b>回合时限：</b>每回合120秒，超时判负。</li>
					<li><b>点差更新：</b>仅在主动开枪、系统自动开枪或游戏结束时更新。</li>
				</ul>
				<h2>游戏流程</h2>
				<ul>
					<li>从1号位开始，玩家轮流行动（开枪或支付）。</li>
					<li><b>支付</b>：数额从1开始，每次翻倍，达到16时强制系统自动开枪，支付池立即清空（无论中枪与否）。</li>
					<li><b>主动开枪</b>：空枪则支付池归开枪者；中枪则支付池归对手，且开枪者额外支付50筹码。</li>
					<li><b>系统开枪</b>：支付池清空，中枪时触发子弹（无额外惩罚），空枪时最后支付的玩家空枪计数+1。</li>
					<li><b>结束条件</b>：①6颗子弹全部触发，筹码多者胜；②任一玩家空枪次数比对手多3次，直接判负；③回合超时判负。</li>
				</ul>
			`;
		}
	}

	// ---------- 渲染器（倒计时显示在右上，状态栏显示“流失”） ----------
	class Game24RouletteRenderer extends GameRenderer {
		extractState(data) {
			if (data && data.type === 'state' && data.body) return data.body;
			if (data && (data.id !== undefined || data.phase)) return data;
			return null;
		}

		init(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) {
				console.error('24轮盘：无效初始数据', data);
				return;
			}
			self.isPlaying = isPlaying;
			self.container = self.element;
			self.container.innerHTML = '';
			if (self._timerInterval) {
				clearInterval(self._timerInterval);
				self._timerInterval = null;
			}

			// 【由Ya修改】设置和主题更搭配的背景颜色
			self.container.style.background = '#443a2c';

			const title = document.createElement('h1');
			title.textContent = GAME_NAME;
			title.style.textAlign = 'center';
			title.style.margin = '0 0 12px 0';
			// 【由Ya修改】设置和主题更搭配的标题颜色
			// title.style.color = '#1a1a1a';
			title.style.color = '#eee3d4';
			self.container.appendChild(title);

			const statusBar = document.createElement('div');
			statusBar.style.display = 'flex';
			statusBar.style.justifyContent = 'space-between';
			statusBar.style.alignItems = 'center';
			statusBar.style.background = '#efe6d8';
			statusBar.style.padding = '8px 14px';
			statusBar.style.borderRadius = '80px';
			statusBar.style.marginBottom = '16px';
			statusBar.style.fontWeight = '600';
			statusBar.style.color = '#1a1a1a';
			self.container.appendChild(statusBar);

			// 左侧：红方信息
			const p0Info = document.createElement('div');
			p0Info.style.display = 'flex';
			// 【由Ya修改】将对齐改为 baseline 更好看
			// p0Info.style.alignItems = 'center';
			p0Info.style.alignItems = 'baseline';
			p0Info.style.gap = '8px';
			p0Info.style.color = '#1a1a1a';
			const p0Name = document.createElement('span');
			// 【由Ya修改】显示红方用户名
			p0Name.textContent = state.players[0].user;
			p0Name.style.color = '#b22222';
			const p0Chips = document.createElement('span');
			p0Chips.textContent = '600';
			const p0Empty = document.createElement('span');
			p0Empty.textContent = '流失:0';   // ★ 初始显示“流失”
			p0Info.appendChild(p0Name);
			p0Info.appendChild(p0Chips);
			p0Info.appendChild(p0Empty);
			statusBar.appendChild(p0Info);

			// 中间：回合信息
			const turnInfo = document.createElement('div');
			turnInfo.textContent = '选点阶段';
			turnInfo.style.background = '#524635';
			turnInfo.style.color = '#ffffff';
			turnInfo.style.padding = '6px 18px';
			turnInfo.style.borderRadius = '36px';
			turnInfo.style.fontSize = '1rem';
			turnInfo.style.flex = '1';
			turnInfo.style.textAlign = 'center';
			turnInfo.style.margin = '0 12px';
			statusBar.appendChild(turnInfo);

			// 右侧：倒计时 + 蓝方信息
			const rightGroup = document.createElement('div');
			rightGroup.style.display = 'flex';
			rightGroup.style.alignItems = 'center';
			rightGroup.style.gap = '12px';
			rightGroup.style.flexShrink = '0';

			const timerDisplay = document.createElement('div');
			// 【由Ya修改】倒计时组件为空时隐藏
			timerDisplay.classList.add('nodisplay');
			timerDisplay.textContent = '';
			timerDisplay.style.fontSize = '1rem';
			timerDisplay.style.fontWeight = 'bold';
			timerDisplay.style.color = '#b22222';
			timerDisplay.style.minWidth = '80px';
			// 【由Ya修改】倒计时文字居中显示
			// timerDisplay.style.textAlign = 'right';
			timerDisplay.style.textAlign = 'center';
			rightGroup.appendChild(timerDisplay);

			const p1Info = document.createElement('div');
			p1Info.style.display = 'flex';
			// 【由Ya修改】将对齐改为 baseline 更好看
			// p1Info.style.alignItems = 'center';
			p1Info.style.alignItems = 'baseline';
			p1Info.style.gap = '8px';
			p1Info.style.color = '#1a1a1a';
			const p1Name = document.createElement('span');
			// 【由Ya修改】显示蓝方用户名
			p1Name.textContent = state.players[1].user;
			p1Name.style.color = '#1e4f8a';
			const p1Chips = document.createElement('span');
			p1Chips.textContent = '600';
			const p1Empty = document.createElement('span');
			p1Empty.textContent = '流失:0';   // ★ 初始显示“流失”
			p1Info.appendChild(p1Name);
			p1Info.appendChild(p1Chips);
			p1Info.appendChild(p1Empty);
			rightGroup.appendChild(p1Info);

			statusBar.appendChild(rightGroup);

			// ---------- 轮盘 ----------
			const wheelContainer = document.createElement('div');
			wheelContainer.style.display = 'grid';
			wheelContainer.style.gridTemplateColumns = `repeat(6, 1fr)`;
			wheelContainer.style.gap = '4px';
			wheelContainer.style.maxWidth = '480px';
			wheelContainer.style.margin = '0 auto 16px';
			self.wheelContainer = wheelContainer;
			self.container.appendChild(wheelContainer);

			// ---------- 信息面板 ----------
			const infoPanel = document.createElement('div');
			infoPanel.style.display = 'flex';
			infoPanel.style.justifyContent = 'space-around';
			infoPanel.style.margin = '8px 0';
			infoPanel.style.fontSize = '1.1rem';
			infoPanel.style.gap = '20px';
			infoPanel.style.color = '#1a1a1a';
			self.infoPanel = infoPanel;
			self.container.appendChild(infoPanel);

			// ---------- 操作面板 ----------
			const actionPanel = document.createElement('div');
			actionPanel.style.display = 'flex';
			actionPanel.style.justifyContent = 'center';
			actionPanel.style.gap = '16px';
			actionPanel.style.margin = '12px 0';
			self.actionPanel = actionPanel;
			self.container.appendChild(actionPanel);

			// 保存引用
			self.p0Chips = p0Chips;
			self.p0Empty = p0Empty;
			self.p1Chips = p1Chips;
			self.p1Empty = p1Empty;
			self.turnInfo = turnInfo;
			self.timerDisplay = timerDisplay;
			self._remainingSeconds = 0;
			self._timerInterval = null;

			self.render(data, isPlaying);
		}

		render(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) {
				console.warn('24轮盘：收到无效数据', data);
				return;
			}

			// 更新玩家信息（筹码和流失次数）
			if (state.players && state.players.length === 2) {
				self.p0Chips.textContent = state.players[0].chips;
				self.p0Empty.textContent = `流失:${state.players[0].emptyShots}`;   // ★ 显示“流失”
				self.p1Chips.textContent = state.players[1].chips;
				self.p1Empty.textContent = `流失:${state.players[1].emptyShots}`;   // ★ 显示“流失”
			}

			// 清除旧计时器
			if (self._timerInterval) {
				clearInterval(self._timerInterval);
				self._timerInterval = null;
			}

			// 更新回合信息和倒计时
			if (state.phase === 'selecting') {
				self.turnInfo.textContent = '选点阶段';
				// 【由Ya修改】倒计时组件为空时隐藏
				self.timerDisplay.classList.add('nodisplay');
				self.timerDisplay.textContent = '';
			} else if (state.phase === 'playing') {
				self.turnInfo.textContent = `第${state.currentPos + 1}格  ${state.currentPlayer === 0 ? '红方' : '蓝方'}操作`;
				if (state.remainingSeconds !== null && state.remainingSeconds !== undefined) {
					self._remainingSeconds = Math.max(0, state.remainingSeconds);
					self.timerDisplay.textContent = `⏱ ${self._remainingSeconds}s`;
					self._timerInterval = setInterval(() => {
						self._remainingSeconds = Math.max(0, self._remainingSeconds - 1);
						self.timerDisplay.textContent = `⏱ ${self._remainingSeconds}s`;
						if (self._remainingSeconds <= 0) {
							self.timerDisplay.textContent = '⏱ 超时！';
							clearInterval(self._timerInterval);
							self._timerInterval = null;
						}
						// 【由Ya修改】倒计时组件非空时显示
						self.timerDisplay.classList.remove('nodisplay');
					}, 1000);
				} else {
					self.timerDisplay.textContent = '⏱ 计算中...';
				}
				// 【由Ya修改】倒计时组件非空时显示
				self.timerDisplay.classList.remove('nodisplay');
			} else if (state.phase === 'ended') {
				if (state.winner !== null && state.winner !== undefined) {
					const winnerName = state.players[state.winner]?.user || (state.winner === 0 ? '红方' : '蓝方');
					self.turnInfo.textContent = `🏁 ${winnerName} 获胜！`;
				} else {
					self.turnInfo.textContent = '🏁 平局';
				}
				// 【由Ya修改】倒计时组件为空时隐藏
				self.timerDisplay.classList.add('nodisplay');
				self.timerDisplay.textContent = '';
			}

			// 【由Ya修改】观看回放时隐藏倒计时组件
			if (data.id === -1) {
				self.timerDisplay.classList.add('nodisplay');
			}

			// 渲染轮盘和操作按钮
			if (state.phase === 'selecting') {
				self.renderSelecting(state);
			} else {
				self.renderPlaying(state);
			}

			// 更新信息面板（包含点差，但不涉及“流失”）
			if (self.infoPanel) {
				const diff = state.roundStartDiff !== undefined ? state.roundStartDiff : 0;
				// 【由Ya修改】在深色背景下使用浅色字体
				self.infoPanel.innerHTML = `
					<span style="color:#eee3d4;">点差: ${diff > 0 ? '+' : ''}${diff}</span>
					<span style="color:#eee3d4;">支付池: ${state.pool || 0}</span>
					<span style="color:#eee3d4;">当前支付额: ${state.bet || 1}</span>
					<span style="color:#eee3d4;">已触发: ${state.triggeredCount || 0}/6</span>
				`;
			}
		}

		// 选点阶段（不变）
		renderSelecting(state) {
			const self = this;
			const container = self.wheelContainer;
			container.innerHTML = '';

			const msgDiv = document.createElement('div');
			msgDiv.style.gridColumn = '1 / -1';
			msgDiv.style.textAlign = 'center';
			msgDiv.style.marginBottom = '6px';
			msgDiv.style.fontWeight = 'bold';
			msgDiv.style.color = '#b22222';
			msgDiv.textContent = state.selectMessage || '';
			container.appendChild(msgDiv);

			const myId = state.id;
			const selected = state.players[myId]?.selected || [];
			for (let i = 0; i < SLOTS; i++) {
				const cell = document.createElement('div');
				cell.style.width = '40px';
				cell.style.height = '40px';
				cell.style.border = '1px solid #999';
				cell.style.display = 'flex';
				cell.style.alignItems = 'center';
				cell.style.justifyContent = 'center';
				cell.style.cursor = 'pointer';
				cell.style.background = selected.includes(i) ? '#4CAF50' : '#eee';
				cell.style.color = '#1a1a1a';
				cell.style.fontWeight = 'bold';
				cell.textContent = i + 1;
				cell.dataset.index = i;
				cell.addEventListener('click', function () {
					if (self.isPlaying && state.phase === 'selecting') {
						const idx = parseInt(this.dataset.index);
						const sel = state.players[myId].selected;
						if (sel.includes(idx)) {
							const pos = sel.indexOf(idx);
							sel.splice(pos, 1);
						} else if (sel.length < 3) {
							sel.push(idx);
						} else {
							alert('最多选择3个位置');
							return;
						}
						state.selectMessage = '';
						self.renderSelecting(state);
					}
				});
				container.appendChild(cell);
			}
			self.actionPanel.innerHTML = '';
			const submitBtn = document.createElement('button');
			submitBtn.textContent = '提交选点';
			submitBtn.style.padding = '8px 20px';
			// 【由Ya修改】在深色背景下使用浅色背景和深色字体的按钮
			// submitBtn.style.color = '#ffffff';
			submitBtn.style.color = '#1a1a1a';
			// submitBtn.style.background = '#413628';
			submitBtn.style.background = '#efe6d8';
			submitBtn.style.border = 'none';
			submitBtn.style.borderRadius = '4px';
			submitBtn.style.cursor = 'pointer';
			submitBtn.addEventListener('click', function () {
				const sel = state.players[myId].selected;
				if (sel.length !== 3) {
					alert('请选择3个点位');
					return;
				}
				this.disabled = true;
				this.style.opacity = '0.6';
				this.style.cursor = 'default';
				self.send({ action: 'select', body: sel.slice() });
			});
			self.actionPanel.appendChild(submitBtn);
		}

		// 游戏阶段（不变）
		renderPlaying(state) {
			const self = this;
			const container = self.wheelContainer;
			container.innerHTML = '';

			const isEnded = state.phase === 'ended';
			const myId = state.id;

			for (let i = 0; i < SLOTS; i++) {
				const cell = document.createElement('div');
				cell.style.width = '40px';
				cell.style.height = '40px';
				cell.style.border = '1px solid #999';
				cell.style.display = 'flex';
				cell.style.alignItems = 'center';
				cell.style.justifyContent = 'center';
				cell.style.fontSize = '14px';
				cell.style.fontWeight = 'bold';
				cell.style.color = '#1a1a1a';

				if (i === state.currentPos) {
					// 【由Ya修改】将边框从 3px 改为 1px，保持边框宽度一致
					cell.style.border = '1px solid red';
				}

				const bulletOwner = state.wheel[i];
				if (bulletOwner !== null) {
					const owner = bulletOwner;
					const finalPositions = state.players[owner].finalPositions;
					const idx = finalPositions.indexOf(i);
					const triggered = state.players[owner].triggered[idx];
					if (triggered) {
						cell.style.background = '#aaa';
						cell.textContent = '✓';
						cell.style.color = '#1a1a1a';
					} else {
						cell.style.background = '#f0f0f0';
						cell.textContent = i + 1;
					}
				} else {
					cell.style.background = '#f0f0f0';
					cell.textContent = i + 1;
				}
				container.appendChild(cell);
			}

			self.actionPanel.innerHTML = '';
			if (!isEnded && state.currentPlayer === myId) {
				const shootBtn = document.createElement('button');
				shootBtn.textContent = '🔫 开枪';
				shootBtn.style.padding = '8px 20px';
				// 【由Ya修改】在深色背景下使用浅色背景和深色字体的按钮
				// shootBtn.style.color = '#ffffff';
				shootBtn.style.color = '#1a1a1a';
				// shootBtn.style.background = '#413628';
				shootBtn.style.background = '#efe6d8';
				shootBtn.style.border = 'none';
				shootBtn.style.borderRadius = '4px';
				shootBtn.style.cursor = 'pointer';
				shootBtn.addEventListener('click', function () {
					self.send({ action: 'shoot', body: {} });
				});
				const payBtn = document.createElement('button');
				payBtn.textContent = `💰 支付 ${state.bet}`;
				payBtn.style.padding = '8px 20px';
				// 【由Ya修改】在深色背景下使用浅色背景和深色字体的按钮
				// payBtn.style.color = '#ffffff';
				payBtn.style.color = '#1a1a1a';
				// payBtn.style.background = '#605342';
				payBtn.style.background = '#efe6d8';
				payBtn.style.border = 'none';
				payBtn.style.borderRadius = '4px';
				payBtn.style.cursor = 'pointer';
				payBtn.addEventListener('click', function () {
					self.send({ action: 'pay', body: {} });
				});
				self.actionPanel.appendChild(shootBtn);
				self.actionPanel.appendChild(payBtn);
			} else if (!isEnded) {
				const waitSpan = document.createElement('span');
				waitSpan.textContent = `等待 ${state.currentPlayer === 0 ? '红方' : '蓝方'} 操作`;
				// 【由Ya修改】在深色背景中使用浅色字体
				// waitSpan.style.color = '#1a1a1a';
				waitSpan.style.color = '#eee3d4';
				self.actionPanel.appendChild(waitSpan);
			} else {
				const endSpan = document.createElement('span');
				endSpan.textContent = '游戏已结束';
				// 【由Ya修改】在深色背景中使用浅色字体
				// endSpan.style.color = '#1a1a1a';
				endSpan.style.color = '#eee3d4';
				self.actionPanel.appendChild(endSpan);
			}
		}

		send(data) { /* 由框架注入 */ }
	}

	games.push({
		name: GAME_NAME,
		rule: Game24RouletteRule,
		renderer: Game24RouletteRenderer,
	});
})();