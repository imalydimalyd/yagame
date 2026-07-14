// 奇数棋 · 双人对战（框架版，兼容多种数据格式）
(function () {
	const GAME_NAME = '奇数棋';
	const BOARD_SIZE = 5;
	const INIT_HP = 4;

	// 障碍物 (行, 列) 0-indexed
	const BLOCKED_SET = new Set([
		[0, 3], [1, 0], [3, 4], [4, 1]
	].map(([r, c]) => `${r},${c}`));

	// 单行道 (行, 列) 0-indexed
	const ONEWAY_SET = new Set([
		[1, 1], [3, 3]
	].map(([r, c]) => `${r},${c}`));

	// 预计算格子类型和编号
	const cellType = Array.from({ length: BOARD_SIZE }, () =>
		Array(BOARD_SIZE).fill('empty')
	);
	const cellIndex = Array.from({ length: BOARD_SIZE }, () =>
		Array(BOARD_SIZE).fill(null)
	);
	let idx = 1;
	for (let r = 0; r < BOARD_SIZE; r++) {
		for (let c = 0; c < BOARD_SIZE; c++) {
			const key = `${r},${c}`;
			if (BLOCKED_SET.has(key)) cellType[r][c] = 'blocked';
			else if (ONEWAY_SET.has(key)) cellType[r][c] = 'oneway';
			else cellIndex[r][c] = idx++;
		}
	}

	function isBlocked(r, c) { return cellType[r][c] === 'blocked'; }
	function isOneWay(r, c) { return cellType[r][c] === 'oneway'; }
	function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }

	// ----- 游戏规则类 -----
	class OddChessGameRule extends GameRule {
		name = GAME_NAME;
		maxN = 2;
		allowedN(n) { return n === 2; }

		constructor() { super(); }

		init(users) {
			const self = this;
			self.state = {
				end: false,
				n: users.length,
				players: users.map((u, i) => ({
					user: u.user,
					color: i === 0 ? 'red' : 'blue',
					hp: INIT_HP,
				})),
				board: Array.from({ length: BOARD_SIZE }, () =>
					Array(BOARD_SIZE).fill(null)
				),
				currentPlayer: 0,
				winner: null,
				history: [],
			};
			self.pushState();
		}

		applyDamage(row, col, playerIdx) {
			const self = this;
			const state = self.state;
			const board = state.board;
			const dirs = [
				{ dr: 0, dc: 1 },
				{ dr: 1, dc: 0 },
				{ dr: 1, dc: 1 },
				{ dr: 1, dc: -1 }
			];
			let loseR = 0, loseB = 0;

			for (const { dr, dc } of dirs) {
				let line = [];
				let rr = row, cc = col;
				while (inBounds(rr, cc)) {
					if (isBlocked(rr, cc)) break;
					if (isOneWay(rr, cc) && !(dr === 1 && dc === 0)) break;
					line.push({ r: rr, c: cc });
					rr += dr; cc += dc;
				}
				rr = row - dr; cc = col - dc;
				while (inBounds(rr, cc)) {
					if (isBlocked(rr, cc)) break;
					if (isOneWay(rr, cc) && !(dr === 1 && dc === 0)) break;
					line.unshift({ r: rr, c: cc });
					rr -= dr; cc -= dc;
				}
				line = line.filter(({ r, c }) => !isBlocked(r, c) && !isOneWay(r, c));
				if (line.length < 2) continue;

				let full = true;
				for (const { r, c } of line) {
					if (board[r][c] === null) { full = false; break; }
				}
				if (!full) continue;

				let rc = 0, bc = 0;
				for (const { r, c } of line) {
					if (board[r][c] === 0) rc++;
					else if (board[r][c] === 1) bc++;
				}
				if (rc % 2 === 1) loseR++;
				if (bc % 2 === 1) loseB++;
			}

			if (loseR > 0 || loseB > 0) {
				state.players[0].hp = Math.max(0, state.players[0].hp - loseR);
				state.players[1].hp = Math.max(0, state.players[1].hp - loseB);
				return true;
			}
			return false;
		}

		checkGameOver() {
			const self = this;
			const state = self.state;
			const hp0 = state.players[0].hp;
			const hp1 = state.players[1].hp;

			if (hp0 <= 0 && hp1 <= 0) {
				state.end = true;
				state.winner = state.history.length > 0 ? state.history[state.history.length - 1].player : null;
				return true;
			}
			if (hp0 <= 0) {
				state.end = true;
				state.winner = 1;
				return true;
			}
			if (hp1 <= 0) {
				state.end = true;
				state.winner = 0;
				return true;
			}
			return false;
		}

		receive(data, id) {
			const self = this;
			const { action, body, id: apiId } = data;

			if (action === 'place') {
				const { row, col } = body;
				const state = self.state;

				if (state.end) {
					self.send('游戏已结束', id, true);
					return;
				}
				if (state.currentPlayer !== id) {
					self.send('当前不是你的回合', id, true);
					return;
				}
				if (!inBounds(row, col) || isBlocked(row, col) || isOneWay(row, col)) {
					self.send('无效的落子位置', id, true);
					return;
				}
				if (state.board[row][col] !== null) {
					self.send('该位置已有棋子', id, true);
					return;
				}

				state.board[row][col] = id;
				state.history.push({ row, col, player: id });

				const damaged = self.applyDamage(row, col, id);
				const ended = self.checkGameOver();

				if (!ended) {
					state.currentPlayer = state.currentPlayer === 0 ? 1 : 0;
				}

				self.syncState();
				self.send({
					ok: true,
					damaged,
					ended,
					winner: state.winner,
				}, id);
			} else {
				self.send(`未知操作: ${action}`, id, true);
			}
		}

		projection(id) {
			const self = this;
			const state = self.state;
			return {
				id: id,
				end: state.end,
				n: state.n,
				players: state.players.map(p => ({ ...p })),
				board: state.board.map(row => [...row]),
				currentPlayer: state.currentPlayer,
				winner: state.winner,
			};
		}

		rule() {
			return `
				<h1>奇数棋</h1>
				<ul>
					<li><b>游戏人数：</b>2人</li>
					<li><b>作者：</b>saiwei</li>
				</ul>
				<h2>游戏规则</h2>
				<ul>
					<li><strong>棋盘</strong>：5×5，含障碍物(4个)与单行道(2个)，不可落子。</li>
					<li><strong>单行道 ⇅</strong>：只允许纵向格子连通，切断横向/斜向。</li>
					<li><strong>血量</strong>：红蓝各 <strong>4 HP</strong>，归零判负。</li>
					<li><strong>落子扣血</strong>：落子后，若某方向(横/纵/斜)所有格子被占满(≥2格)，该方向棋子数为奇数的一方扣1血。</li>
					<li><strong>同时暴血</strong>：若双方血量同时≤0，<strong>最后落子方获胜</strong>。</li>
				</ul>
			`;
		}
	}

	// ----- 渲染器类（兼容多种数据格式）-----
	class OddChessGameRenderer extends GameRenderer {
		// 工具：提取有效状态对象
		extractState(data) {
			if (data && typeof data === 'object') {
				// 如果是 ClientData 格式，取 body
				if (data.type === 'state' && data.body) {
					return data.body;
				}
				// 如果直接是状态对象（包含 id, end, players 等）
				if (data.id !== undefined || data.end !== undefined || data.players) {
					return data;
				}
			}
			return null;
		}

		init(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) {
				console.error('奇数棋：无效的初始数据', data);
				return;
			}

			self.isPlaying = isPlaying;
			const container = self.element;
			container.innerHTML = '';

			// 【由Ya修改】设置和主题更搭配的背景颜色
			document.body.style.background = '#443a2c';

			// 标题
			const title = document.createElement('h1');
			title.textContent = GAME_NAME;
			title.style.textAlign = 'center';
			title.style.margin = '0 0 12px 0';
			container.appendChild(title);

			// 状态栏
			const statusBar = document.createElement('div');
			statusBar.style.display = 'flex';
			statusBar.style.justifyContent = 'space-between';
			statusBar.style.alignItems = 'center';
			statusBar.style.background = '#efe6d8';
			// 【由Ya修改】在浅色状态栏中使用深色字体
			statusBar.style.color = '#594932';
			statusBar.style.padding = '8px 14px';
			statusBar.style.borderRadius = '80px';
			statusBar.style.marginBottom = '16px';
			statusBar.style.fontWeight = '600';
			statusBar.style.fontSize = '1.2rem';
			container.appendChild(statusBar);

			const hpRed = document.createElement('div');
			// 【由Ya修改】在信息元素和 HP 元素中加入间距
			const playerNameRed = state.players[0].user;
			hpRed.innerHTML = playerNameRed + '&nbsp;&nbsp;❤️ <span class="hp-badge" id="redHP">4</span>&nbsp;&nbsp;&nbsp;&nbsp;';
			statusBar.appendChild(hpRed);

			const turnInd = document.createElement('div');
			turnInd.textContent = '🔴 红方';
			turnInd.style.background = '#524635';
			turnInd.style.color = '#ede3d2';
			turnInd.style.padding = '6px 18px';
			turnInd.style.borderRadius = '36px';
			turnInd.style.fontSize = '1rem';
			turnInd.style.letterSpacing = '1px';
			statusBar.appendChild(turnInd);

			const hpBlue = document.createElement('div');
			// 【由Ya修改】在信息元素和 HP 元素中加入间距，并显示蓝方玩家名称
			const playerNameBlue = state.players[1].user;
			hpBlue.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;<span class="hp-badge" id="blueHP">4</span> 💙&nbsp;&nbsp;' + playerNameBlue;
			statusBar.appendChild(hpBlue);

			// 棋盘
			const boardWrapper = document.createElement('div');
			boardWrapper.style.background = '#ab9b84';
			boardWrapper.style.padding = '18px 12px 12px 18px';
			boardWrapper.style.borderRadius = '42px';
			boardWrapper.style.boxShadow = 'inset 0 0 0 2px #988a73, 0 10px 16px rgba(0,0,0,0.3)';
			container.appendChild(boardWrapper);

			const boardEl = document.createElement('div');
			boardEl.style.display = 'grid';
			boardEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
			boardEl.style.gap = '11px';
			boardEl.style.aspectRatio = '1 / 1';
			boardWrapper.appendChild(boardEl);

			// 信息面板
			const infoPanel = document.createElement('div');
			infoPanel.style.display = 'flex';
			infoPanel.style.justifyContent = 'space-between';
			infoPanel.style.alignItems = 'center';
			infoPanel.style.marginTop = '18px';
			infoPanel.style.padding = '0 4px';
			container.appendChild(infoPanel);

			const messageEl = document.createElement('div');
			messageEl.textContent = '落子吧';
			messageEl.style.background = '#ddd2be';
			messageEl.style.padding = '6px 18px';
			messageEl.style.borderRadius = '38px';
			messageEl.style.fontSize = '1.1rem';
			messageEl.style.fontWeight = '515';
			messageEl.style.color = '#282011';
			messageEl.style.minHeight = '2.8rem';
			messageEl.style.display = 'flex';
			messageEl.style.alignItems = 'center';
			messageEl.style.boxShadow = 'inset 0 1px 5px rgba(63, 45, 25, 0.185)';
			messageEl.style.flex = '1';
			messageEl.style.marginRight = '10px';
			// 【由Ya修改】删除重复的元素
			// infoPanel.appendChild(messageEl);

			// 规则按钮
			const ruleBtn = document.createElement('button');
			ruleBtn.textContent = '📖 规则';
			ruleBtn.style.background = '#605342';
			ruleBtn.style.border = 'none';
			ruleBtn.style.color = '#eee3d4';
			ruleBtn.style.padding = '8px 18px';
			ruleBtn.style.borderRadius = '46px';
			ruleBtn.style.fontWeight = '555';
			ruleBtn.style.letterSpacing = '2px';
			ruleBtn.style.boxShadow = '0 4px 0 #362e21';
			// 【由Ya修改】给规则按钮添加底部 margin，防止 box shadow 显示不完整
			ruleBtn.style.marginBottom = '9px';
			ruleBtn.style.cursor = 'pointer';
			ruleBtn.addEventListener('click', function () {
				const popup = document.getElementById('rulePopup');
				if (popup) popup.style.display = 'flex';
			});
			infoPanel.appendChild(ruleBtn);

			// 规则弹窗（全局）
			const popup = document.createElement('div');
			popup.id = 'rulePopup';
			popup.style.display = 'none';
			popup.style.position = 'fixed';
			popup.style.top = '0';
			popup.style.left = '0';
			popup.style.right = '0';
			popup.style.bottom = '0';
			popup.style.background = 'rgba(23, 18, 10, 0.735)';
			popup.style.backdropFilter = 'blur(3.5px)';
			popup.style.justifyContent = 'center';
			popup.style.alignItems = 'center';
			popup.style.zIndex = '997';
			popup.addEventListener('click', function (e) {
				if (e.target === popup) popup.style.display = 'none';
			});
			document.body.appendChild(popup);

			const ruleCard = document.createElement('div');
			ruleCard.style.background = '#efe6d8';
			ruleCard.style.maxWidth = '540px';
			ruleCard.style.width = '89%';
			ruleCard.style.padding = '28px 26px 32px';
			ruleCard.style.borderRadius = '54px';
			ruleCard.style.boxShadow = '0 24px 40px rgba(0,0,0,0.645)';
			ruleCard.style.color = '#2b2118';
			ruleCard.style.border = '1px solid #cdbd9e';
			popup.appendChild(ruleCard);

			const ruleTitle = document.createElement('h2');
			ruleTitle.textContent = '📜 奇数棋 · 规则';
			ruleTitle.style.marginTop = '0';
			ruleTitle.style.fontWeight = '405';
			ruleTitle.style.letterSpacing = '2px';
			ruleTitle.style.textAlign = 'center';
			ruleTitle.style.borderBottom = '2px dashed #b8a385';
			ruleTitle.style.paddingBottom = '12px';
			ruleCard.appendChild(ruleTitle);

			const ruleList = document.createElement('ul');
			ruleList.style.paddingLeft = '22px';
			ruleList.style.lineHeight = '1.7';
			ruleList.style.fontSize = '1rem';
			const rules = [
				'<strong>棋盘</strong>：5×5，含障碍物(4个)与单行道(2个)，不可落子。',
				'<strong>单行道 ⇅</strong>：只允许纵向格子连通，切断横向/斜向。',
				'<strong>血量</strong>：红蓝各 <strong>4 HP</strong>，归零判负。',
				'<strong>落子扣血</strong>：落子后，若某方向(横/纵/斜)所有格子被占满(≥2格)，该方向棋子数为奇数的一方扣1血。',
				'<strong>同时暴血</strong>：若双方血量同时≤0，<strong>最后落子方获胜</strong>。'
			];
			rules.forEach(text => {
				const li = document.createElement('li');
				li.innerHTML = text;
				ruleList.appendChild(li);
			});
			ruleCard.appendChild(ruleList);

			const closeRuleBtn = document.createElement('button');
			closeRuleBtn.textContent = '知道了';
			closeRuleBtn.style.display = 'block';
			closeRuleBtn.style.margin = '18px auto 0';
			closeRuleBtn.style.background = '#534434';
			closeRuleBtn.style.border = 'none';
			closeRuleBtn.style.color = '#f0e5d4';
			closeRuleBtn.style.fontSize = '1.095rem';
			closeRuleBtn.style.padding = '8px 34px';
			closeRuleBtn.style.borderRadius = '40px';
			closeRuleBtn.style.cursor = 'pointer';
			closeRuleBtn.style.boxShadow = '0 3px 0 #2d241b';
			closeRuleBtn.addEventListener('click', function () {
				popup.style.display = 'none';
			});
			ruleCard.appendChild(closeRuleBtn);

			// 保存引用
			self.boardEl = boardEl;
			self.messageEl = messageEl;
			self.turnInd = turnInd;
			self.hpRed = hpRed.querySelector('.hp-badge');
			self.hpBlue = hpBlue.querySelector('.hp-badge');

			// 生成格子
			self.cellElements = [];
			for (let r = 0; r < BOARD_SIZE; r++) {
				for (let c = 0; c < BOARD_SIZE; c++) {
					const cell = document.createElement('div');
					cell.dataset.row = r;
					cell.dataset.col = c;
					cell.style.background = '#dbcfbb';
					cell.style.borderRadius = '18px';
					cell.style.boxShadow = 'inset 0 -4px 0 #948572, 0 4px 6px rgba(40, 25, 10, 0.3)';
					cell.style.display = 'flex';
					cell.style.alignItems = 'center';
					cell.style.justifyContent = 'center';
					cell.style.aspectRatio = '1 / 1';
					cell.style.cursor = 'pointer';
					cell.style.fontSize = '2.5rem';
					cell.style.fontWeight = '850';
					cell.style.color = '#2b221a';
					cell.style.position = 'relative';

					if (isBlocked(r, c)) {
						cell.style.background = '#443a2c';
						cell.style.boxShadow = 'inset 0 -4px 0 #231e16, 0 2px 4px #1f1912';
						cell.style.cursor = 'not-allowed';
					} else if (isOneWay(r, c)) {
						cell.style.background = '#74664d';
						cell.style.boxShadow = 'inset 0 -4px 0 #514432, 0 2px 4px #32291e';
						cell.style.cursor = 'not-allowed';
						cell.textContent = '⇅';
						cell.style.fontSize = '2.2rem';
						cell.style.color = '#dacbb4';
					} else {
						const label = document.createElement('span');
						label.textContent = cellIndex[r][c];
						label.style.position = 'absolute';
						label.style.zIndex = '1';
						label.style.fontSize = '0.87rem';
						label.style.fontWeight = '670';
						label.style.color = '#594932';
						label.style.pointerEvents = 'none';
						label.style.opacity = '0.83';
						cell.appendChild(label);
						cell.style.cursor = 'pointer';
						if (isPlaying) {
							cell.addEventListener('click', (function (rr, cc) {
								return function () {
									if (self.isPlaying && !self.gameOver) {
										self.send({ action: 'place', body: { row: rr, col: cc } });
									} else {
										self.messageEl.textContent = '对局已结束或非游戏状态';
									}
								};
							})(r, c));
						}
					}
					boardEl.appendChild(cell);
					self.cellElements.push({ el: cell, row: r, col: c });
				}
			}

			// 初次渲染状态
			self.render(data, isPlaying);
		}

		render(data, isPlaying = true) {
			const self = this;

			// 处理 API 响应（若有）
			if (data && data.type === 'api') {
				if (data.body.error) {
					self.messageEl.textContent = '错误: ' + data.body.err_msg;
				} else {
					const body = data.body.body || {};
					if (body.ok !== undefined) {
						self.messageEl.textContent = body.damaged ? '扣血触发！' : '落子成功';
					}
				}
				return;
			}

			// 提取状态
			const state = self.extractState(data);
			if (!state) {
				console.warn('奇数棋：收到无效渲染数据', data);
				return;
			}

			self.gameOver = state.end;

			// 更新HP
			if (self.hpRed && self.hpBlue) {
				self.hpRed.textContent = state.players[0]?.hp ?? 4;
				self.hpBlue.textContent = state.players[1]?.hp ?? 4;
			}

			// 更新回合指示
			if (self.turnInd) {
				if (state.end) {
					if (state.winner !== null && state.winner !== undefined) {
						const winnerName = state.players[state.winner]?.user || (state.winner === 0 ? '红方' : '蓝方');
						self.turnInd.textContent = `🏁 ${winnerName} 获胜！`;
					} else {
						self.turnInd.textContent = '🏁 终局';
					}
				} else {
					self.turnInd.textContent = state.currentPlayer === 0 ? '🔴 红方' : '🔵 蓝方';
				}
			}

			// 更新棋盘
			if (self.cellElements) {
				for (const { el, row, col } of self.cellElements) {
					const val = state.board?.[row]?.[col];
					// 清空子元素（除障碍和单行道保留文本）
					while (el.firstChild) el.removeChild(el.firstChild);
					el.textContent = '';
					el.style.color = '';
					el.style.fontSize = '';
					el.style.background = '';

					if (val === 0) {
						el.textContent = '●';
						el.style.color = '#b31b1b';
						el.style.textShadow = '0 2px 5px rgba(155,0,0,0.6)';
						// 【由Ya修改】减小棋子大小，防止棋子把棋盘撑大
						// el.style.fontSize = '2.8rem';
						el.style.fontSize = '2.3rem';
						el.style.background = '#dbcfbb';
					} else if (val === 1) {
						el.textContent = '●';
						el.style.color = '#1f6eb0';
						el.style.textShadow = '0 2px 5px rgba(0,39,81,0.6)';
						// 【由Ya修改】减小棋子大小，防止棋子把棋盘撑大
						// el.style.fontSize = '2.8rem';
						el.style.fontSize = '2.3rem';
						el.style.background = '#dbcfbb';
					} else {
						if (isBlocked(row, col)) {
							el.style.background = '#443a2c';
						} else if (isOneWay(row, col)) {
							el.textContent = '⇅';
							el.style.background = '#74664d';
							el.style.fontSize = '2.2rem';
							el.style.color = '#dacbb4';
						} else {
							el.style.background = '#dbcfbb';
							const label = document.createElement('span');
							label.textContent = cellIndex[row][col];
							label.style.position = 'absolute';
							label.style.zIndex = '1';
							label.style.fontSize = '0.87rem';
							label.style.fontWeight = '670';
							label.style.color = '#594932';
							label.style.pointerEvents = 'none';
							label.style.opacity = '0.83';
							el.appendChild(label);
						}
					}
				}
			}

			// 更新消息（如果未被用户操作覆盖）
			if (self.messageEl && !self.messageEl.textContent.startsWith('错误')) {
				if (state.end) {
					self.messageEl.textContent = '游戏结束';
				} else {
					self.messageEl.textContent = `轮到 ${state.currentPlayer === 0 ? '红方' : '蓝方'}`;
				}
			}
		}

		send(data) { /* 由框架注入 */ }
	}

	// 注册游戏
	games.push({
		name: GAME_NAME,
		rule: OddChessGameRule,
		renderer: OddChessGameRenderer,
	});
})();