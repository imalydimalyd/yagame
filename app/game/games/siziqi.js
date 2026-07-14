// 四子棋 (Connect Four) · 双人对战
// 规则：6行7列，每列可落6子；率先四子连线（横/竖/斜）获胜
// 本文件完全嵌入四子棋的棋盘绘制与交互逻辑
// 显示当前玩家用户名（您：用户名），先后手随机确定
// 支持 games 数组注册，也支持独立运行模式
(function () {
	'use strict';

	const GAME_NAME = '四子棋';
	const BOARD_ROWS = 6;
	const BOARD_COLS = 7;
	const EMPTY = 0;
	const RED = 1;
	const YELLOW = 2;

	// ---------- 工具函数 ----------
	function inBounds(row, col) {
		return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
	}

	function getLowestEmptyRow(board, col) {
		for (let r = 0; r < BOARD_ROWS; r++) {
			if (board[r][col] === EMPTY) return r;
		}
		return -1;
	}

	function checkWinOnBoard(board) {
		// 水平
		for (let r = 0; r < BOARD_ROWS; r++) {
			for (let c = 0; c <= BOARD_COLS - 4; c++) {
				const color = board[r][c];
				if (color !== EMPTY &&
					board[r][c + 1] === color &&
					board[r][c + 2] === color &&
					board[r][c + 3] === color) {
					return color;
				}
			}
		}
		// 垂直
		for (let c = 0; c < BOARD_COLS; c++) {
			for (let r = 0; r <= BOARD_ROWS - 4; r++) {
				const color = board[r][c];
				if (color !== EMPTY &&
					board[r + 1][c] === color &&
					board[r + 2][c] === color &&
					board[r + 3][c] === color) {
					return color;
				}
			}
		}
		// 对角线（右下）
		for (let r = 0; r <= BOARD_ROWS - 4; r++) {
			for (let c = 0; c <= BOARD_COLS - 4; c++) {
				const color = board[r][c];
				if (color !== EMPTY &&
					board[r + 1][c + 1] === color &&
					board[r + 2][c + 2] === color &&
					board[r + 3][c + 3] === color) {
					return color;
				}
			}
		}
		// 对角线（左下）
		for (let r = 3; r < BOARD_ROWS; r++) {
			for (let c = 0; c <= BOARD_COLS - 4; c++) {
				const color = board[r][c];
				if (color !== EMPTY &&
					board[r - 1][c + 1] === color &&
					board[r - 2][c + 2] === color &&
					board[r - 3][c + 3] === color) {
					return color;
				}
			}
		}
		return EMPTY;
	}

	function isBoardFull(board) {
		for (let r = 0; r < BOARD_ROWS; r++) {
			for (let c = 0; c < BOARD_COLS; c++) {
				if (board[r][c] === EMPTY) return false;
			}
		}
		return true;
	}

	// ---------- 游戏规则类（框架接口） ----------
	class ConnectFourGameRule extends GameRule {
		name = GAME_NAME;
		maxN = 2;
		allowedN(n) { return n === 2; }

		constructor() { super(); }

		init(users) {
			const self = this;
			const firstPlayerId = Math.random() < 0.5 ? 0 : 1;

			self.state = {
				end: false,
				n: users.length,
				firstPlayerId: firstPlayerId,
				players: users.map((u, i) => ({
					user: u.user,
					color: i === firstPlayerId ? '红' : '黄',
				})),
				board: Array.from({ length: BOARD_ROWS }, () =>
					Array(BOARD_COLS).fill(EMPTY)
				),
				currentPlayer: firstPlayerId,
				winner: null,
				moveCount: 0,
				draw: false,
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
			} else if (typeof data === 'object' && data.col !== undefined) {
				action = 'place';
				body = { col: data.col };
			} else {
				self.send('无效的请求格式', id, true);
				return;
			}

			if (state.end) {
				self.send('游戏已结束', id, true);
				return;
			}

			if (action === 'place') {
				const { col } = body;
				if (col === undefined || !Number.isInteger(col) || col < 0 || col >= BOARD_COLS) {
					self.send('列号无效，请选择 0-6', id, true);
					return;
				}
				if (state.currentPlayer !== id) {
					self.send('当前不是你的回合', id, true);
					return;
				}

				const row = getLowestEmptyRow(state.board, col);
				if (row === -1) {
					self.send('该列已满', id, true);
					return;
				}

				const color = (id === state.firstPlayerId) ? RED : YELLOW;
				state.board[row][col] = color;
				state.moveCount++;

				const winColor = checkWinOnBoard(state.board);
				if (winColor !== EMPTY) {
					const winnerId = (winColor === RED) ? state.firstPlayerId : (1 - state.firstPlayerId);
					state.end = true;
					state.winner = winnerId;
					state.draw = false;
					self.pushState();
					const winnerName = state.players[winnerId].user;
					const loserName = state.players[1 - winnerId].user;
					self.send(`🎉 ${winnerName} 四子连线，获得胜利！`, winnerId);
					self.send(`💔 ${loserName} 四子连线，你输了。`, 1 - winnerId);
					return;
				}

				if (isBoardFull(state.board)) {
					state.end = true;
					state.winner = null;
					state.draw = true;
					self.pushState();
					self.send('🤝 棋盘已满，平局！', 0);
					self.send('🤝 棋盘已满，平局！', 1);
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
				firstPlayerId: state.firstPlayerId,
				players: state.players.map(p => ({ ...p })),
				board: state.board.map(row => [...row]),
				currentPlayer: state.currentPlayer,
				winner: state.winner,
				moveCount: state.moveCount,
				draw: state.draw || false,
			};
		}

		// 【由Ya修改】优化了规则文案
		rule() {
			return `
				<h1>四子棋</h1>
				<ul>
					<li><b>游戏人数：</b>2人</li>
					<li><b>作者：</b>saiwei</li>
					<li><b>棋盘：</b>6行 × 7列</li>
					<li><b>棋子：</b>红方先手，黄方后手</li>
				</ul>
				<h2>规则</h2>
				<ul>
					<li>每轮选择一列（1~7），棋子因重力落到该列最下方空位。</li>
					<li>率先将 <b>同色4子连成一线</b>（横、竖、斜均可）即获胜。</li>
					<li>棋盘下满无人连成4子，判为 <b>平局</b>。</li>
				</ul>
				<p style="font-size:0.9em; color:#aac;">💡 点击棋盘上方的列号或列区域落子。</p>
			`;
		}
	}

	// ---------- 游戏渲染器 ----------
	class ConnectFourGameRenderer extends GameRenderer {
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
				firstPlayerId: 0,
				players: [{ user: '红方' }, { user: '黄方' }],
				board: Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(EMPTY)),
				currentPlayer: 0,
				winner: null,
				moveCount: 0,
				draw: false,
			};
		}

		init(data, isPlaying = true) {
			const self = this;
			let state = self.extractState(data);
			if (!state) {
				console.warn('四子棋：初始数据无效，使用默认状态');
				state = self._defaultState();
			}

			self.isPlaying = isPlaying;
			self.container = self.element;
			self.container.innerHTML = '';

			// ---- 创建 DOM 结构 ----
			const gameContainer = document.createElement('div');
			gameContainer.className = 'game-container';
			gameContainer.style.cssText = `
				background: #1a2a4a;
				background-image: radial-gradient(ellipse at 20% 30%, #2a5a7a, #0d1b3a);
				padding: 24px 24px 28px;
				border-radius: 48px;
				box-shadow: 0 24px 48px rgba(0,0,0,0.8), inset 0 1px 4px rgba(255,255,255,0.08);
				border: 1px solid #4a6a8a;
				max-width: 620px;
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
				flex-wrap: wrap;
				gap: 8px;
			`;
			gameContainer.appendChild(header);

			const title = document.createElement('div');
			title.className = 'title';
			// 【由Ya修改】删除标题左侧的黑点
			// title.textContent = '🔴 四子棋';
			title.textContent = '四子棋';
			title.style.cssText = `
				font-size: 24px;
				font-weight: 700;
				color: #f0e8d0;
				text-shadow: 0 2px 8px rgba(0,0,0,0.5);
				letter-spacing: 2px;
			`;
			header.appendChild(title);

			const turnInd = document.createElement('div');
			turnInd.className = 'turn-indicator';
			turnInd.style.cssText = `
				display: flex;
				align-items: center;
				gap: 10px;
				background: rgba(0,0,0,0.35);
				padding: 4px 16px 4px 12px;
				border-radius: 40px;
				backdrop-filter: blur(4px);
				border: 1px solid rgba(255,255,200,0.12);
			`;
			header.appendChild(turnInd);

			const dot = document.createElement('div');
			dot.className = 'turn-dot red';
			dot.id = 'render-turn-dot';
			dot.style.cssText = `
				width: 26px;
				height: 26px;
				border-radius: 50%;
				border: 2px solid rgba(255,255,255,0.4);
				background: radial-gradient(circle at 35% 35%, #ff6b6b, #c0392b);
				flex-shrink: 0;
				transition: background 0.2s;
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
				color: #f0e8d0;
			`;
			turnLabel.innerHTML = '<span style="font-weight:700;color:#ff6b6b;">红方</span> 落子';
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
			canvas.width = 700;
			canvas.height = 600;
			canvas.style.cssText = `
				display: block;
				width: 100%;
				max-width: 560px;
				aspect-ratio: 7 / 6;
				border-radius: 28px;
				box-shadow: inset 0 0 0 2px #4a6a8a, 0 12px 32px rgba(0,0,0,0.6);
				background: #1a3a5a;
				cursor: pointer;
				touch-action: none;
			`;
			boardWrapper.appendChild(canvas);
			self.canvas = canvas;
			self.ctx = canvas.getContext('2d');

			// 状态栏
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
				color: #f0e8d0;
				background: rgba(0,0,0,0.3);
				padding: 4px 16px;
				border-radius: 30px;
				white-space: nowrap;
				border: 1px solid rgba(255,255,200,0.08);
				display: flex;
				align-items: center;
				gap: 10px;
			`;
			statusBar.appendChild(identitySpan);

			const dot0 = document.createElement('div');
			dot0.className = (state.firstPlayerId === 0) ? 'turn-dot red' : 'turn-dot yellow';
			dot0.id = 'render-turn-dot0';
			dot0.style.cssText = (state.firstPlayerId === 0) ? `
				width: 26px;
				height: 26px;
				border-radius: 50%;
				border: 2px solid rgba(255,255,255,0.4);
				background: radial-gradient(circle at 35% 35%, #ff6b6b, #c0392b);
				flex-shrink: 0;
				transition: background 0.2s;
			`: `
				width: 26px;
				height: 26px;
				border-radius: 50%;
				border: 2px solid rgba(255,255,255,0.4);
				background: radial-gradient(circle at 35% 35%, #ffe066, #b7950b);
				flex-shrink: 0;
				transition: background 0.2s;
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
				color: #f0e8d0;
				background: rgba(0,0,0,0.3);
				padding: 4px 16px;
				border-radius: 30px;
				white-space: nowrap;
				border: 1px solid rgba(255,255,200,0.08);
				display: flex;
				align-items: center;
				gap: 10px;
			`;
			statusBar.appendChild(identitySpan2);

			const dot1 = document.createElement('div');
			dot1.className = (state.firstPlayerId === 1) ? 'turn-dot red' : 'turn-dot yellow';
			dot1.id = 'render-turn-dot1';
			dot1.style.cssText = (state.firstPlayerId === 1) ? `
				width: 26px;
				height: 26px;
				border-radius: 50%;
				border: 2px solid rgba(255,255,255,0.4);
				background: radial-gradient(circle at 35% 35%, #ff6b6b, #c0392b);
				flex-shrink: 0;
				transition: background 0.2s;
			`: `
				width: 26px;
				height: 26px;
				border-radius: 50%;
				border: 2px solid rgba(255,255,255,0.4);
				background: radial-gradient(circle at 35% 35%, #ffe066, #b7950b);
				flex-shrink: 0;
				transition: background 0.2s;
			`;
			identitySpan2.appendChild(dot1);

			const identitySpanText1 = document.createElement('span');
			identitySpan2.appendChild(identitySpanText1);
			self.identitySpanText1 = identitySpanText1;

			const statusMsg = document.createElement('div');
			statusMsg.className = 'status-message';
			// 【由Ya修改】隐藏多余的状态元素
			statusMsg.classList.add('nodisplay');
			statusMsg.id = 'render-status-msg';
			statusMsg.style.cssText = `
				font-size: 18px;
				font-weight: 500;
				color: #f0e8d0;
				background: rgba(0,0,0,0.3);
				padding: 6px 18px;
				border-radius: 40px;
				border: 1px solid rgba(255,255,200,0.08);
				flex: 1;
				min-width: 120px;
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

			// ---- 初始化尺寸 ----
			self._calcDimensions();

			// ---- 绑定 Canvas 点击 ----
			canvas.addEventListener('click', function (e) {
				if (self._gameOver || !self.isPlaying) return;
				const rect = canvas.getBoundingClientRect();
				const scaleX = canvas.width / rect.width;
				const scaleY = canvas.height / rect.height;
				const x = (e.clientX - rect.left) * scaleX;
				const y = (e.clientY - rect.top) * scaleY;
				const col = self._toCol(x, y);
				if (col === -1) return;
				self.send({ action: 'place', body: { col: col } });
			});

			canvas.addEventListener('touchstart', function (e) {
				e.preventDefault();
				if (self._gameOver || !self.isPlaying) return;
				const touch = e.touches[0];
				const rect = canvas.getBoundingClientRect();
				const scaleX = canvas.width / rect.width;
				const scaleY = canvas.height / rect.height;
				const x = (touch.clientX - rect.left) * scaleX;
				const y = (touch.clientY - rect.top) * scaleY;
				const col = self._toCol(x, y);
				if (col === -1) return;
				self.send({ action: 'place', body: { col: col } });
			}, { passive: false });

			// ---- 内部状态 ----
			self._board = state.board.map(row => [...row]);
			self._currentPlayer = state.currentPlayer;
			self._gameOver = state.end;
			self._winner = state.winner;
			self._draw = state.draw || false;
			self._myId = state.id;
			self._firstPlayerId = state.firstPlayerId;

			// ---- 初始绘制 ----
			self._drawBoard(self._board);
			self._updateUI(state);
		}

		// ---------- Canvas 绘制 ----------
		_calcDimensions() {
			const w = this.canvas.width;
			const h = this.canvas.height;
			const padX = w * 0.06;
			const padY = h * 0.06;
			this._paddingX = padX;
			this._paddingY = padY;
			this._cellW = (w - padX * 2) / BOARD_COLS;
			this._cellH = (h - padY * 2) / BOARD_ROWS;
			this._stoneRadius = Math.min(this._cellW, this._cellH) * 0.42;
		}

		_toPixel(row, col) {
			return {
				x: this._paddingX + col * this._cellW + this._cellW / 2,
				y: this._paddingY + (BOARD_ROWS - 1 - row) * this._cellH + this._cellH / 2,
			};
		}

		_toCol(px, py) {
			const w = this.canvas.width;
			const h = this.canvas.height;
			const padX = this._paddingX;
			const padY = this._paddingY;
			if (px < padX - this._cellW * 0.3 || px > w - padX + this._cellW * 0.3) return -1;
			if (py < padY - this._cellH * 0.5 || py > h - padY + this._cellH * 0.5) return -1;
			const col = Math.floor((px - padX) / this._cellW);
			if (col < 0 || col >= BOARD_COLS) return -1;
			return col;
		}

		_drawBoard(board) {
			const ctx = this.ctx;
			const w = this.canvas.width;
			const h = this.canvas.height;
			const padX = this._paddingX;
			const padY = this._paddingY;
			const cw = this._cellW;
			const ch = this._cellH;
			const radius = this._stoneRadius;

			ctx.clearRect(0, 0, w, h);

			const bgGrad = ctx.createLinearGradient(0, 0, w, h);
			bgGrad.addColorStop(0, '#1a3a5a');
			bgGrad.addColorStop(0.5, '#1e4a6a');
			bgGrad.addColorStop(1, '#142a44');
			ctx.fillStyle = bgGrad;
			ctx.fillRect(0, 0, w, h);

			for (let r = 0; r < BOARD_ROWS; r++) {
				for (let c = 0; c < BOARD_COLS; c++) {
					const pos = this._toPixel(r, c);
					const val = board[r][c];

					const grad = ctx.createRadialGradient(
						pos.x - radius * 0.2, pos.y - radius * 0.2, radius * 0.1,
						pos.x, pos.y, radius * 1.1
					);
					grad.addColorStop(0, '#2a5a7a');
					grad.addColorStop(0.7, '#1a3a5a');
					grad.addColorStop(1, '#0d2a44');
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, radius * 1.05, 0, 2 * Math.PI);
					ctx.fillStyle = grad;
					ctx.fill();

					if (val === EMPTY) {
						const hl = ctx.createRadialGradient(
							pos.x - radius * 0.3, pos.y - radius * 0.3, radius * 0.05,
							pos.x, pos.y, radius * 0.6
						);
						hl.addColorStop(0, 'rgba(255,255,255,0.15)');
						hl.addColorStop(1, 'rgba(255,255,255,0)');
						ctx.beginPath();
						ctx.arc(pos.x, pos.y, radius * 0.6, 0, 2 * Math.PI);
						ctx.fillStyle = hl;
						ctx.fill();
					} else {
						const isRed = (val === RED);
						const grad2 = ctx.createRadialGradient(
							pos.x - radius * 0.3, pos.y - radius * 0.35, radius * 0.05,
							pos.x, pos.y, radius
						);
						if (isRed) {
							grad2.addColorStop(0, '#ff8a7a');
							grad2.addColorStop(0.4, '#e74c3c');
							grad2.addColorStop(0.85, '#a93226');
							grad2.addColorStop(1, '#6b1f1a');
						} else {
							grad2.addColorStop(0, '#ffe066');
							grad2.addColorStop(0.4, '#f1c40f');
							grad2.addColorStop(0.85, '#b7950b');
							grad2.addColorStop(1, '#7d6608');
						}
						ctx.beginPath();
						ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
						ctx.fillStyle = grad2;
						ctx.shadowColor = 'rgba(0,0,0,0.5)';
						ctx.shadowBlur = 10;
						ctx.fill();
						ctx.shadowBlur = 0;

						const hl2 = ctx.createRadialGradient(
							pos.x - radius * 0.3, pos.y - radius * 0.35, radius * 0.05,
							pos.x - radius * 0.2, pos.y - radius * 0.25, radius * 0.5
						);
						hl2.addColorStop(0, isRed ? 'rgba(255,220,200,0.5)' : 'rgba(255,255,220,0.5)');
						hl2.addColorStop(1, 'rgba(255,255,255,0)');
						ctx.beginPath();
						ctx.arc(pos.x, pos.y, radius * 0.7, 0, 2 * Math.PI);
						ctx.fillStyle = hl2;
						ctx.fill();

						ctx.beginPath();
						ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
						ctx.strokeStyle = isRed ? 'rgba(120,20,10,0.3)' : 'rgba(100,80,10,0.3)';
						ctx.lineWidth = 1.5;
						ctx.stroke();
					}
				}
			}

			ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			for (let c = 0; c < BOARD_COLS; c++) {
				const x = padX + c * cw + cw / 2;
				const y = h - padY + 6;
				ctx.fillStyle = 'rgba(255,255,255,0.3)';
				ctx.fillText(c + 1, x + 1, y + 1);
				ctx.fillStyle = 'rgba(255,255,255,0.7)';
				ctx.fillText(c + 1, x, y);
			}

			ctx.strokeStyle = 'rgba(255,255,200,0.06)';
			ctx.lineWidth = 2;
			ctx.strokeRect(padX - 4, padY - 4, w - padX * 2 + 8, h - padY * 2 + 8);
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
				if (state.draw) {
					label.textContent = '🤝 平局';
					msg.textContent = '🤝 棋盘已满，平局！';
					if (dot) dot.style.background = 'radial-gradient(circle at 35% 35%, #888, #555)';
				} else if (state.winner !== null && state.winner !== undefined) {
					const wName = state.players[state.winner]?.user || (state.winner === 0 ? '红方' : '黄方');
					const isRedWin = (state.winner === state.firstPlayerId);
					label.innerHTML = `🏆 ${wName} 获胜！`;
					msg.textContent = `🎉 ${wName} 四子连线，获胜！`;
					if (dot) {
						dot.style.background = isRedWin ?
							'radial-gradient(circle at 35% 35%, #ff8a7a, #c0392b)' :
							'radial-gradient(circle at 35% 35%, #ffe066, #b7950b)';
					}
				} else {
					label.textContent = '🏁 终局';
					msg.textContent = '游戏结束';
					if (dot) dot.style.background = '#888';
				}
			} else {
				const cur = state.currentPlayer;
				const firstId = state.firstPlayerId !== undefined ? state.firstPlayerId : self._firstPlayerId;
				const isRed = (cur === firstId);
				if (dot) {
					dot.style.background = isRed ?
						'radial-gradient(circle at 35% 35%, #ff6b6b, #c0392b)' :
						'radial-gradient(circle at 35% 35%, #ffe066, #b7950b)';
				}
				label.innerHTML = `<span style="font-weight:700;color:${isRed ? '#ff6b6b' : '#f1c40f'};">${isRed ? '红方' : '黄方'}</span> 落子`;
				msg.textContent = `轮到 ${isRed ? '红方' : '黄方'} 落子`;
			}
		}

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
			if (!state) return;

			self._board = state.board.map(row => [...row]);
			self._currentPlayer = state.currentPlayer;
			self._gameOver = state.end;
			self._winner = state.winner;
			self._draw = state.draw || false;
			self._myId = state.id;
			self._firstPlayerId = state.firstPlayerId;

			self._drawBoard(self._board);
			self._updateUI(state);
		}

		send(data) { }
	}

	// ---------- 注册游戏（框架模式） ----------
	if (typeof games !== 'undefined' && Array.isArray(games)) {
		games.push({
			name: GAME_NAME,
			rule: ConnectFourGameRule,
			renderer: ConnectFourGameRenderer,
		});
	} else {
		console.warn('games 数组未定义，将启动独立运行模式');

		// ---------- 独立运行模式 ----------
		// 【由Ya修改】仅当框架模式无法运行时再考虑独立运行模式
		if (typeof window !== 'undefined' && !window.games) {
			(function standalone() {
				const container = document.createElement('div');
				container.id = 'connectfour-standalone';
				container.style.cssText = `
				position: fixed; top: 0; left: 0; width: 100%; height: 100%;
				background: #1a1a2e;
				display: flex; justify-content: center; align-items: center;
				padding: 16px; z-index: 9999;
				overflow-y: auto;
			`;
				document.body.appendChild(container);

				const renderer = new ConnectFourGameRenderer();
				renderer.element = container;

				const firstPlayerId = Math.random() < 0.5 ? 0 : 1;
				const initialBoard = Array.from({ length: BOARD_ROWS }, () =>
					Array(BOARD_COLS).fill(EMPTY)
				);
				const defaultState = {
					type: 'state',
					body: {
						id: 0,
						end: false,
						n: 2,
						firstPlayerId: firstPlayerId,
						players: [
							{ user: firstPlayerId === 0 ? '红方' : '黄方' },
							{ user: firstPlayerId === 1 ? '红方' : '黄方' }
						],
						board: initialBoard,
						currentPlayer: firstPlayerId,
						winner: null,
						moveCount: 0,
						draw: false,
					}
				};
				renderer.init(defaultState, true);

				let board = initialBoard.map(row => [...row]);
				let currentPlayer = firstPlayerId;
				let gameOver = false;
				let winner = null;
				let draw = false;

				renderer.send = function (data) {
					if (data && data.action === 'place') {
						const { col } = data.body;
						if (gameOver) return;
						if (col === undefined || col < 0 || col >= BOARD_COLS) return;

						const row = getLowestEmptyRow(board, col);
						if (row === -1) return;

						const color = (currentPlayer === firstPlayerId) ? RED : YELLOW;
						board[row][col] = color;

						const winColor = checkWinOnBoard(board);
						if (winColor !== EMPTY) {
							winner = (winColor === RED) ? firstPlayerId : (1 - firstPlayerId);
							gameOver = true;
							draw = false;
							const newState = {
								type: 'state',
								body: {
									id: 0,
									end: true,
									n: 2,
									firstPlayerId: firstPlayerId,
									players: defaultState.body.players,
									board: board,
									currentPlayer: currentPlayer,
									winner: winner,
									moveCount: 0,
									draw: false,
								}
							};
							renderer.render(newState, true);
							return;
						}

						if (isBoardFull(board)) {
							gameOver = true;
							winner = null;
							draw = true;
							const newState = {
								type: 'state',
								body: {
									id: 0,
									end: true,
									n: 2,
									firstPlayerId: firstPlayerId,
									players: defaultState.body.players,
									board: board,
									currentPlayer: currentPlayer,
									winner: null,
									moveCount: 0,
									draw: true,
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
								firstPlayerId: firstPlayerId,
								players: defaultState.body.players,
								board: board,
								currentPlayer: currentPlayer,
								winner: null,
								moveCount: 0,
								draw: false,
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