// 不围棋 (No Go) · 双人对战
// 规则：落子后若任何棋子无气，则落子方判负
// 本文件完全嵌入 buweiqi.html 的棋盘绘制与交互逻辑
// 已移除悔棋、重开按钮和落子记录（日志区域）
// 移除状态数据失效提示，无效数据不显示错误信息
// 显示当前玩家用户名（您：用户名）
// 先后手随机确定
(function () {
	'use strict';

	const GAME_NAME = '不围棋';
	const BOARD_SIZE = 5;
	const EMPTY = 0;
	const BLACK = 1;
	const WHITE = 2;

	// ---------- 工具函数 ----------
	function inBounds(row, col) {
		return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
	}

	function getGroup(board, row, col) {
		const color = board[row][col];
		if (color === EMPTY) return [];
		const visited = Array.from({ length: BOARD_SIZE }, () =>
			Array(BOARD_SIZE).fill(false)
		);
		const queue = [[row, col]];
		visited[row][col] = true;
		const group = [[row, col]];
		const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
		while (queue.length) {
			const [r, c] = queue.shift();
			for (const [dr, dc] of dirs) {
				const nr = r + dr, nc = c + dc;
				if (inBounds(nr, nc) && !visited[nr][nc] && board[nr][nc] === color) {
					visited[nr][nc] = true;
					group.push([nr, nc]);
					queue.push([nr, nc]);
				}
			}
		}
		return group;
	}

	function countLiberties(board, group) {
		const libertySet = new Set();
		const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
		for (const [r, c] of group) {
			for (const [dr, dc] of dirs) {
				const nr = r + dr, nc = c + dc;
				if (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
					libertySet.add(nr * BOARD_SIZE + nc);
				}
			}
		}
		return libertySet.size;
	}

	function hasDeadStones(board) {
		const visited = Array.from({ length: BOARD_SIZE }, () =>
			Array(BOARD_SIZE).fill(false)
		);
		for (let r = 0; r < BOARD_SIZE; r++) {
			for (let c = 0; c < BOARD_SIZE; c++) {
				if (board[r][c] !== EMPTY && !visited[r][c]) {
					const group = getGroup(board, r, c);
					for (const [gr, gc] of group) visited[gr][gc] = true;
					if (countLiberties(board, group) === 0) return true;
				}
			}
		}
		return false;
	}

	// ---------- 游戏规则类（框架接口） ----------
	class NoGoGameRule extends GameRule {
		name = GAME_NAME;
		maxN = 2;
		allowedN(n) { return n === 2; }

		constructor() { super(); }

		init(users) {
			const self = this;
			// 随机决定先手（黑方）的玩家 ID
			const blackPlayerId = Math.random() < 0.5 ? 0 : 1;

			self.state = {
				end: false,
				n: users.length,
				blackPlayerId: blackPlayerId,
				players: users.map((u, i) => ({
					user: u.user,
					color: i === blackPlayerId ? '黑' : '白',
				})),
				board: Array.from({ length: BOARD_SIZE }, () =>
					Array(BOARD_SIZE).fill(EMPTY)
				),
				currentPlayer: blackPlayerId,
				winner: null,
				moveCount: 0,
			};
			self.pushState();
		}

		receive(data, id) {
			const self = this;
			const state = self.state;

			let action, body;
			if (typeof data === 'object' && data.action) {
				action = data.action;
				body = data.body || {};
			} else if (typeof data === 'object' && data.row !== undefined && data.col !== undefined) {
				action = 'place';
				body = { row: data.row, col: data.col };
			} else {
				self.send('无效的请求格式', id, true);
				return;
			}

			if (state.end) {
				self.send('游戏已结束', id, true);
				return;
			}

			if (action === 'place') {
				const { row, col } = body;
				if (!inBounds(row, col)) { self.send('位置超出棋盘', id, true); return; }
				if (state.board[row][col] !== EMPTY) { self.send('该位置已有棋子', id, true); return; }
				if (state.currentPlayer !== id) { self.send('当前不是你的回合', id, true); return; }

				const color = (id === state.blackPlayerId) ? BLACK : WHITE;
				state.board[row][col] = color;
				state.moveCount++;

				if (hasDeadStones(state.board)) {
					const loser = id;
					const winner = 1 - loser;
					state.end = true;
					state.winner = winner;
					self.pushState();
					const loserName = state.players[loser].user;
					const winnerName = state.players[winner].user;
					self.send(`💀 ${loserName} 落子导致无气，${winnerName} 获胜！`, loser);
					self.send(`🏆 你获胜！${loserName} 落子导致无气。`, winner);
					return;
				}

				state.currentPlayer = 1 - state.currentPlayer;
				// 【由Ya修改】将 syncState 改为 pushState
				self.pushState();
				self.send({ ok: true, msg: '落子成功' }, id);
			} else {
				self.send(`未知操作: ${action}`, id, true);
			}
		}

		projection(id) {
			const state = this.state;
			return {
				id: id,
				end: state.end,
				n: state.n,
				blackPlayerId: state.blackPlayerId,
				players: state.players.map(p => ({ ...p })),
				board: state.board.map(row => [...row]),
				currentPlayer: state.currentPlayer,
				winner: state.winner,
				moveCount: state.moveCount,
			};
		}

		// 【由Ya修改】优化了规则文案
		rule() {
			return `
				<h1>不围棋</h1>
				<ul>
					<li><b>游戏人数：</b>2人</li>
					<li><b>作者：</b>saiwei</li>
					<li><b>棋盘：</b>5×5，无禁手</li>
				</ul>
				<h2>规则</h2>
				<ul>
					<li>黑方先手，双方轮流落子于空位。</li>
					<li>落子后，若棋盘上<b>任何棋子</b>（无论黑白）处于“无气”状态（即上下左右四个方向均无空位），则<b>落子方判负</b>。</li>
					<li>游戏无平局，直到一方因无气输掉。</li>
				</ul>
				<p style="font-size:0.9em; color:#666;">提示：点击棋盘交叉点落子。</p>
			`;
		}
	}

	// ---------- 游戏渲染器 ----------
	class NoGoGameRenderer extends GameRenderer {
		extractState(data) {
			if (data && data.type === 'state' && data.body) return data.body;
			if (data && (data.id !== undefined || data.board)) return data;
			return null;
		}

		_defaultState() {
			return {
				id: 0,
				end: false,
				n: 2,
				blackPlayerId: 0,
				players: [{ user: '黑方' }, { user: '白方' }],
				board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY)),
				currentPlayer: 0,
				winner: null,
				moveCount: 0,
			};
		}

		init(data, isPlaying = true) {
			const self = this;
			let state = self.extractState(data);
			if (!state) {
				console.warn('不围棋：初始数据无效，使用默认状态');
				state = self._defaultState();
			}

			self.isPlaying = isPlaying;
			self.container = self.element;
			self.container.innerHTML = '';

			// ---- 创建 DOM 结构 ----
			const gameContainer = document.createElement('div');
			gameContainer.className = 'game-container';
			gameContainer.style.cssText = `
				background: #d9c8a9;
				background-image: radial-gradient(ellipse at 20% 30%, #e8dcc0, #c4b08a);
				padding: 28px 28px 32px;
				border-radius: 48px;
				box-shadow: 0 20px 40px rgba(0,0,0,0.7), inset 0 1px 4px rgba(255,255,200,0.3);
				border: 1px solid #b8a282;
				max-width: 520px;
				width: 100%;
				margin: 0 auto;
			`;
			self.container.appendChild(gameContainer);

			// 头部
			const header = document.createElement('div');
			header.className = 'header';
			header.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 14px;
				padding: 0 4px;
			`;
			gameContainer.appendChild(header);

			const title = document.createElement('div');
			title.className = 'title';
			// 【由Ya修改】删除标题左侧的黑点
			// title.textContent = '⚫ 不围棋';
			title.textContent = '不围棋';
			title.style.cssText = `
				font-size: 24px;
				font-weight: 700;
				color: #3f2e1b;
				text-shadow: 0 2px 4px rgba(255,215,150,0.3);
				letter-spacing: 2px;
			`;
			header.appendChild(title);

			const turnInd = document.createElement('div');
			turnInd.className = 'turn-indicator';
			turnInd.style.cssText = `
				display: flex;
				align-items: center;
				gap: 10px;
				background: rgba(60,40,25,0.25);
				padding: 4px 14px 4px 10px;
				border-radius: 40px;
				backdrop-filter: blur(2px);
				border: 1px solid rgba(255,215,150,0.2);
			`;
			header.appendChild(turnInd);

			const dot = document.createElement('div');
			dot.className = 'turn-dot black';
			dot.id = 'render-turn-dot';
			dot.style.cssText = `
				width: 24px;
				height: 24px;
				border-radius: 50%;
				border: 2px solid rgba(0,0,0,0.5);
				background: radial-gradient(circle at 35% 35%, #555, #1a1a1a);
				flex-shrink: 0;
			`;
			turnInd.appendChild(dot);
			// 【由Ya修改】保存 dot 引用
			self.dot = dot;

			const turnLabel = document.createElement('span');
			turnLabel.className = 'turn-label';
			turnLabel.id = 'render-turn-label';
			turnLabel.style.cssText = `
				font-weight: 600;
				font-size: 17px;
				color: #3f2e1b;
			`;
			turnLabel.innerHTML = '<span style="font-weight:700;">黑子</span> 落子';
			turnInd.appendChild(turnLabel);
			// 【由Ya修改】保存 turnLabel 引用
			self.turnLabel = turnLabel;

			// 棋盘 Canvas
			const boardWrapper = document.createElement('div');
			boardWrapper.className = 'board-wrapper';
			boardWrapper.style.cssText = `
				display: flex;
				justify-content: center;
				margin: 6px 0 10px 0;
			`;
			gameContainer.appendChild(boardWrapper);

			const canvas = document.createElement('canvas');
			canvas.id = 'render-board-canvas';
			canvas.width = 500;
			canvas.height = 500;
			canvas.style.cssText = `
				display: block;
				width: 100%;
				max-width: 440px;
				aspect-ratio: 1 / 1;
				border-radius: 28px;
				box-shadow: inset 0 0 0 2px #b8a282, 0 12px 28px rgba(0,0,0,0.5);
				background: #e3d4b8;
				cursor: pointer;
				touch-action: none;
			`;
			boardWrapper.appendChild(canvas);
			self.canvas = canvas;
			self.ctx = canvas.getContext('2d');

			// 状态栏（含身份标识）
			const statusBar = document.createElement('div');
			statusBar.className = 'status-bar';
			statusBar.style.cssText = `
				display: flex;
				justify-content: center;
				align-items: center;
				margin-top: 14px;
				gap: 12px;
				flex-wrap: wrap;
			`;
			gameContainer.appendChild(statusBar);

			// 【由Ya修改】身份标识：显示玩家0用户名
			const identitySpan = document.createElement('span');
			identitySpan.id = 'render-identity';
			identitySpan.style.cssText = `
				font-weight: 600;
				font-size: 16px;
				color: #3f2e1b;
				background: rgba(60,40,25,0.1);
				padding: 4px 14px;
				border-radius: 30px;
				white-space: nowrap;
				display: flex;
				align-items: center;
				gap: 10px;
			`;
			statusBar.appendChild(identitySpan);

			const dot0 = document.createElement('div');
			dot0.className = (state.blackPlayerId === 0) ? 'turn-dot black' : 'turn-dot white';
			dot0.id = 'render-turn-dot0';
			dot0.style.cssText = (state.blackPlayerId === 0) ? `
				width: 24px;
				height: 24px;
				border-radius: 50%;
				border: 2px solid rgba(0,0,0,0.5);
				background: radial-gradient(circle at 35% 35%, #555, #1a1a1a);
				flex-shrink: 0;
			`: `
				width: 24px;
				height: 24px;
				border-radius: 50%;
				border: 2px solid rgba(0,0,0,0.5);
				background: radial-gradient(circle at 35% 35%, #f9f9f9, #c0c0c0);
				flex-shrink: 0;
			`;
			identitySpan.appendChild(dot0);

			const identitySpanText0 = document.createElement('span');
			identitySpan.appendChild(identitySpanText0);
			self.identitySpanText0 = identitySpanText0;

			// 【由Ya修改】身份标识2：显示玩家1用户名
			const identitySpan2 = document.createElement('span');
			identitySpan2.id = 'render-identity2';
			identitySpan2.style.cssText = `
				font-weight: 600;
				font-size: 16px;
				color: #3f2e1b;
				background: rgba(60,40,25,0.1);
				padding: 4px 14px;
				border-radius: 30px;
				white-space: nowrap;
				display: flex;
				align-items: center;
				gap: 10px;
			`;
			statusBar.appendChild(identitySpan2);

			const dot1 = document.createElement('div');
			dot1.className = (state.blackPlayerId === 1) ? 'turn-dot black' : 'turn-dot white';
			dot1.id = 'render-turn-dot1';
			dot1.style.cssText = (state.blackPlayerId === 1) ? `
				width: 24px;
				height: 24px;
				border-radius: 50%;
				border: 2px solid rgba(0,0,0,0.5);
				background: radial-gradient(circle at 35% 35%, #555, #1a1a1a);
				flex-shrink: 0;
			`: `
				width: 24px;
				height: 24px;
				border-radius: 50%;
				border: 2px solid rgba(0,0,0,0.5);
				background: radial-gradient(circle at 35% 35%, #f9f9f9, #c0c0c0);
				flex-shrink: 0;
			`;
			identitySpan2.appendChild(dot1);

			const identitySpanText1 = document.createElement('span');
			identitySpan2.appendChild(identitySpanText1);
			self.identitySpanText1 = identitySpanText1;

			// 状态消息
			const statusMsg = document.createElement('div');
			statusMsg.className = 'status-message';
			// 【由Ya修改】隐藏多余的状态元素
			statusMsg.classList.add('nodisplay');
			statusMsg.id = 'render-status-msg';
			statusMsg.style.cssText = `
				font-size: 18px;
				font-weight: 500;
				color: #3f2e1b;
				background: rgba(60,40,25,0.15);
				padding: 6px 18px;
				border-radius: 40px;
				border: 1px solid rgba(255,215,150,0.15);
				flex: 1;
				min-width: 130px;
				text-align: center;
				backdrop-filter: blur(2px);
				min-height: 46px;
				display: flex;
				align-items: center;
				justify-content: center;
			`;
			statusMsg.textContent = '⚔️ 对局中';
			statusBar.appendChild(statusMsg);
			self.statusMsg = statusMsg;

			// ---- 初始化 Canvas 尺寸 ----
			self._calcDimensions();

			// ---- 绑定 Canvas 点击 ----
			canvas.addEventListener('click', function (e) {
				if (self._gameOver || !self.isPlaying) return;
				const rect = canvas.getBoundingClientRect();
				const scaleX = canvas.width / rect.width;
				const scaleY = canvas.height / rect.height;
				const x = (e.clientX - rect.left) * scaleX;
				const y = (e.clientY - rect.top) * scaleY;
				const pos = self._toBoard(x, y);
				if (pos.row === -1 || pos.col === -1) return;
				self.send({ action: 'place', body: { row: pos.row, col: pos.col } });
			});

			// ---- 内部状态 ----
			self._board = state.board.map(row => [...row]);
			self._currentPlayer = state.currentPlayer;
			self._gameOver = state.end;
			self._winner = state.winner;
			self._myId = state.id;
			self._blackPlayerId = state.blackPlayerId;

			// ---- 初始绘制 ----
			self._drawBoard(self._board);
			self._updateUI(state);
		}

		// ---------- Canvas 绘制函数 ----------
		_calcDimensions() {
			const w = this.canvas.width;
			this._padding = w * 0.11;
			this._cellSize = (w - this._padding * 2) / (BOARD_SIZE - 1);
			this._stoneRadius = this._cellSize * 0.42;
		}

		_toPixel(row, col) {
			return {
				x: this._padding + col * this._cellSize,
				y: this._padding + row * this._cellSize,
			};
		}

		_toBoard(px, py) {
			let minDist = this._cellSize * 0.55;
			let bestRow = -1,
				bestCol = -1;
			for (let r = 0; r < BOARD_SIZE; r++) {
				for (let c = 0; c < BOARD_SIZE; c++) {
					const pos = this._toPixel(r, c);
					const dist = Math.hypot(px - pos.x, py - pos.y);
					if (dist < minDist) {
						minDist = dist;
						bestRow = r;
						bestCol = c;
					}
				}
			}
			return { row: bestRow, col: bestCol };
		}

		_drawBoard(board) {
			const ctx = this.ctx;
			const w = this.canvas.width;
			const pad = this._padding;
			const cell = this._cellSize;
			const radius = this._stoneRadius;

			ctx.clearRect(0, 0, w, w);
			ctx.strokeStyle = '#4d3e2b';
			ctx.lineWidth = 2;
			for (let i = 0; i < BOARD_SIZE; i++) {
				const pos = pad + i * cell;
				ctx.beginPath();
				ctx.moveTo(pad, pos);
				ctx.lineTo(w - pad, pos);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(pos, pad);
				ctx.lineTo(pos, w - pad);
				ctx.stroke();
			}
			if (BOARD_SIZE % 2 === 1) {
				const pos = this._toPixel((BOARD_SIZE - 1) / 2, (BOARD_SIZE - 1) / 2);
				ctx.beginPath();
				ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI);
				ctx.fillStyle = '#4d3e2b';
				ctx.fill();
			}
			for (let r = 0; r < BOARD_SIZE; r++) {
				for (let c = 0; c < BOARD_SIZE; c++) {
					const val = board[r][c];
					if (val === EMPTY) continue;
					const pos = this._toPixel(r, c);
					const grad = ctx.createRadialGradient(
						pos.x - radius * 0.25,
						pos.y - radius * 0.25,
						radius * 0.1,
						pos.x,
						pos.y,
						radius
					);
					if (val === BLACK) {
						grad.addColorStop(0, '#666');
						grad.addColorStop(0.7, '#222');
						grad.addColorStop(1, '#000');
					} else {
						grad.addColorStop(0, '#f9f9f9');
						grad.addColorStop(0.7, '#e0e0e0');
						grad.addColorStop(1, '#b0b0b0');
					}
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
					ctx.fillStyle = grad;
					ctx.shadowColor = 'rgba(0,0,0,0.3)';
					ctx.shadowBlur = 8;
					ctx.fill();
					ctx.shadowBlur = 0;
					ctx.strokeStyle = val === BLACK ? '#222' : '#aaa';
					ctx.lineWidth = 1;
					ctx.stroke();
				}
			}
		}

		_updateUI(state) {
			const self = this;
			// 【由Ya修改】使用引用而非通过 id 获取
			const dot = self.dot;
			const label = self.turnLabel;
			const msg = self.statusMsg;
			const identity0 = self.identitySpanText0;
			const identity1 = self.identitySpanText1;

			// 【由Ya修改】更新身份标识：显示双方用户名
			if (identity0) {
				identity0.textContent = state.players[0].user;
			}
			if (identity1) {
				identity1.textContent = state.players[1].user;
			}

			if (state.end) {
				if (state.winner !== null && state.winner !== undefined) {
					const wName = state.players[state.winner]?.user || (state.winner === 0 ? '黑方' : '白方');
					label.innerHTML = `🏆 ${wName} 获胜！`;
					msg.textContent = `🎉 ${wName} 获胜！`;
					// 【由Ya修改】隐藏多余的状态元素
					msg.className = 'nodisplay status-message win';
				} else {
					label.textContent = '🏁 终局';
					msg.textContent = '游戏结束';
				}
				// 【由Ya修改】游戏结束时隐藏 dot
				if (dot) {
					// dot.style.background = '#888';
					dot.classList.add('nodisplay');
				}
			} else {
				const cur = state.currentPlayer;
				const blackId = state.blackPlayerId !== undefined ? state.blackPlayerId : self._blackPlayerId;
				const isBlack = (cur === blackId);
				if (dot) {
					dot.style.background = isBlack ?
						'radial-gradient(circle at 35% 35%, #555, #1a1a1a)' :
						'radial-gradient(circle at 35% 35%, #f9f9f9, #c0c0c0)';
					// 【由Ya修改】游戏未结束时显示 dot
					dot.classList.remove('nodisplay');
				}
				label.innerHTML = `<span style="font-weight:700;">${isBlack ? '黑子' : '白子'}</span> 落子`;
				msg.textContent = `轮到 ${isBlack ? '黑方' : '白方'} 落子`;
				// 【由Ya修改】隐藏多余的状态元素
				msg.className = 'nodisplay status-message';
			}
		}

		// ---------- 渲染器主方法 ----------
		render(data, isPlaying = true) {
			const self = this;
			if (data && data.type === 'api') {
				if (data.body && data.body.error) {
					self.statusMsg.textContent = '❌ ' + data.body.err_msg;
				} else if (data.body && data.body.ok) {
					self.statusMsg.textContent = '✅ ' + (data.body.msg || '落子成功');
				}
				return;
			}

			let state = self.extractState(data);
			if (!state) {
				return;
			}

			self._board = state.board.map(row => [...row]);
			self._currentPlayer = state.currentPlayer;
			self._gameOver = state.end;
			self._winner = state.winner;
			self._myId = state.id;
			self._blackPlayerId = state.blackPlayerId;

			self._drawBoard(self._board);
			self._updateUI(state);
		}

		send(data) { }
	}

	// ---------- 注册游戏（框架模式） ----------
	if (typeof games !== 'undefined' && Array.isArray(games)) {
		games.push({
			name: GAME_NAME,
			rule: NoGoGameRule,
			renderer: NoGoGameRenderer,
		});
	} else {
		console.warn('games 数组未定义，将启动独立运行模式');

		// ---------- 独立运行模式 ----------
		// 【由Ya修改】仅当框架模式无法运行时再考虑独立运行模式
		if (typeof window !== 'undefined' && !window.games) {
			(function standalone() {
				const container = document.createElement('div');
				container.id = 'nogo-standalone';
				container.style.cssText = `
				position: fixed; top: 0; left: 0; width: 100%; height: 100%;
				background: linear-gradient(145deg, #2d2416, #4a3824);
				display: flex; justify-content: center; align-items: center;
				padding: 16px; z-index: 9999;
			`;
				document.body.appendChild(container);

				const renderer = new NoGoGameRenderer();
				renderer.element = container;

				const blackPlayerId = Math.random() < 0.5 ? 0 : 1;
				const initialBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
				const defaultState = {
					type: 'state',
					body: {
						id: 0,
						end: false,
						n: 2,
						blackPlayerId: blackPlayerId,
						players: [
							{ user: blackPlayerId === 0 ? '黑方' : '白方' },
							{ user: blackPlayerId === 1 ? '黑方' : '白方' }
						],
						board: initialBoard,
						currentPlayer: blackPlayerId,
						winner: null,
						moveCount: 0,
					}
				};
				renderer.init(defaultState, true);

				let board = initialBoard.map(row => [...row]);
				let currentPlayer = blackPlayerId;
				let gameOver = false;
				let winner = null;

				renderer.send = function (data) {
					if (data && data.action === 'place') {
						const { row, col } = data.body;
						if (gameOver) return;
						if (!inBounds(row, col) || board[row][col] !== EMPTY) return;

						const color = (currentPlayer === blackPlayerId) ? BLACK : WHITE;
						board[row][col] = color;

						if (hasDeadStones(board)) {
							const loser = currentPlayer;
							winner = (loser === 0) ? 1 : 0;
							gameOver = true;
							const newState = {
								type: 'state',
								body: {
									id: 0,
									end: true,
									n: 2,
									blackPlayerId: blackPlayerId,
									players: defaultState.body.players,
									board: board,
									currentPlayer: currentPlayer,
									winner: winner,
									moveCount: 0,
								}
							};
							renderer.render(newState, true);
							return;
						}

						currentPlayer = 1 - currentPlayer;
						const newState = {
							type: 'state',
							body: {
								id: 0,
								end: false,
								n: 2,
								blackPlayerId: blackPlayerId,
								players: defaultState.body.players,
								board: board,
								currentPlayer: currentPlayer,
								winner: null,
								moveCount: 0,
							}
						};
						renderer.render(newState, true);
					}
				};

				renderer.render(defaultState, true);
			})();
		}
	}
})();