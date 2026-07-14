// 犹太人棋 (Jewish Game) · 双人对战
// 规则：6×6 棋盘，双方轮流涂色，每次可涂1格或多格（同一直线且相连），涂完最后一格者获胜。
// 每回合120秒倒计时，超时判负。
// 支持 games 数组注册，也支持独立运行模式。

(function () {
	'use strict';

	const GAME_NAME = '犹太人棋';
	const BOARD_SIZE = 6;
	const EMPTY = 0;
	const RED = 1;
	const YELLOW = 2;

	// ---------- 工具函数 ----------
	function inBounds(row, col) {
		return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
	}

	// 检查两点是否在同一直线（横/竖/斜）且连续，且中间所有格子均为空
	// 返回 { cells: [{row, col}], valid: boolean }
	function getLineCells(r1, c1, r2, c2, board) {
		if (!inBounds(r1, c1) || !inBounds(r2, c2)) return { valid: false, cells: [] };
		if (r1 === r2 && c1 === c2) {
			// 单格
			if (board[r1][c1] !== EMPTY) return { valid: false, cells: [] };
			return { valid: true, cells: [{ row: r1, col: c1 }] };
		}

		const dr = r2 - r1;
		const dc = c2 - c1;
		// 必须同行、同列或同对角线（45°）
		if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) {
			return { valid: false, cells: [] };
		}
		// 检查中间格子是否连续（即步长必须为1）
		const steps = Math.max(Math.abs(dr), Math.abs(dc));
		if (steps === 0) return { valid: false, cells: [] };
		const stepR = dr / steps;
		const stepC = dc / steps;
		if (!Number.isInteger(stepR) || !Number.isInteger(stepC)) return { valid: false, cells: [] };

		const cells = [];
		for (let i = 0; i <= steps; i++) {
			const r = r1 + i * stepR;
			const c = c1 + i * stepC;
			if (!inBounds(r, c)) return { valid: false, cells: [] };
			if (board[r][c] !== EMPTY) return { valid: false, cells: [] };
			cells.push({ row: r, col: c });
		}
		return { valid: true, cells: cells };
	}

	// ---------- 游戏规则类（框架接口） ----------
	class JewishGameRule extends GameRule {
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
				board: Array.from({ length: BOARD_SIZE }, () =>
					Array(BOARD_SIZE).fill(EMPTY)
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
			} else {
				self.send('无效的请求格式', id, true);
				return;
			}

			if (state.end) {
				self.send('游戏已结束', id, true);
				return;
			}

			// 处理超时
			if (action === 'timeout') {
				if (state.currentPlayer === id) {
					state.end = true;
					state.winner = 1 - id;
					state.draw = false;
					self.pushState();
					const loserName = state.players[id].user;
					const winnerName = state.players[state.winner].user;
					self.send(`⏰ ${loserName} 超时，${winnerName} 获胜！`, id);
					self.send(`🎉 对手超时，你获胜！`, state.winner);
				} else {
					self.send('不是你的回合，超时无效', id, true);
				}
				return;
			}

			if (action === 'place') {
				if (state.currentPlayer !== id) {
					self.send('当前不是你的回合', id, true);
					return;
				}

				const { startRow, startCol, endRow, endCol } = body;
				if (startRow === undefined || startCol === undefined ||
					endRow === undefined || endCol === undefined) {
					self.send('缺少起点或终点坐标', id, true);
					return;
				}

				const result = getLineCells(startRow, startCol, endRow, endCol, state.board);
				if (!result.valid) {
					self.send('无效的涂色路径：必须为空且在同一直线连续', id, true);
					return;
				}

				const cells = result.cells;
				if (cells.length === 0) {
					self.send('路径无效', id, true);
					return;
				}

				// 执行涂色
				const color = (id === state.firstPlayerId) ? RED : YELLOW;
				for (const cell of cells) {
					state.board[cell.row][cell.col] = color;
				}
				state.moveCount += cells.length;

				// 检查是否涂满最后一格 -> 当前玩家获胜
				if (state.moveCount === BOARD_SIZE * BOARD_SIZE) {
					state.end = true;
					state.winner = id;
					state.draw = false;
					self.pushState();
					const winnerName = state.players[id].user;
					const loserName = state.players[1 - id].user;
					self.send(`🎉 ${winnerName} 涂满最后一格，获得胜利！`, id);
					self.send(`💔 ${loserName} 对手涂满最后一格，你输了。`, 1 - id);
					return;
				}

				// 未结束，切换玩家
				state.currentPlayer = 1 - state.currentPlayer;
				// 【由Ya修改】将 syncState 改为 pushState
				self.pushState();
				self.send({ ok: true, msg: '涂色成功' }, id);
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
				<h1>犹太人棋</h1>
				<ul>
					<li><b>游戏人数：</b>2人</li>
					<li><b>作者：</b>saiwei</li>
					<li><b>棋盘：</b>6×6 方格</li>
					<li><b>棋子：</b>红方先手，黄方后手</li>
				</ul>
				<h2>规则</h2>
				<ul>
					<li>双方轮流行动，每次选择 <b>1格</b> 或 <b>多格</b> 涂色（同一直线且相连）。</li>
					<li>已涂色格子不可再涂。</li>
					<li>涂完 <b>最后一格</b> 的一方获胜。</li>
					<li>每回合限时 <b>120秒</b>，超时判负。</li>
				</ul>
				<p style="font-size:0.9em; color:#aac;">💡 点击空格即选定单格（确定可用），或再点击其他空格选择终点（多点连线）。</p>
			`;
		}
	}

	// ---------- 游戏渲染器 ----------
	class JewishGameRenderer extends GameRenderer {
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
				board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY)),
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
				console.warn('犹太人棋：初始数据无效，使用默认状态');
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
				padding: 20px 20px 24px;
				border-radius: 48px;
				box-shadow: 0 24px 48px rgba(0,0,0,0.8), inset 0 1px 4px rgba(255,255,255,0.08);
				border: 1px solid #4a6a8a;
				max-width: 580px;
				width: 100%;
				margin: 0 auto;
			`;
			self.container.appendChild(gameContainer);

			// 头部：标题、当前玩家、倒计时
			const header = document.createElement('div');
			header.className = 'header';
			header.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 12px;
				padding: 0 4px;
				flex-wrap: wrap;
				gap: 6px;
			`;
			gameContainer.appendChild(header);

			const title = document.createElement('div');
			title.className = 'title';
			title.textContent = '✡️ 犹太人棋';
			title.style.cssText = `
				font-size: 22px;
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
			dot.className = 'turn-dot';
			dot.id = 'render-turn-dot';
			dot.style.cssText = `
				width: 24px;
				height: 24px;
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
				font-size: 16px;
				color: #f0e8d0;
			`;
			turnLabel.innerHTML = '<span style="font-weight:700;color:#ff6b6b;">红方</span> 落子';
			turnInd.appendChild(turnLabel);
			// 【由Ya修改】保存 turnLabel 引用
			self.turnLabel = turnLabel;

			// 倒计时显示
			const timerSpan = document.createElement('span');
			timerSpan.id = 'render-timer';
			timerSpan.style.cssText = `
				font-weight: 700;
				font-size: 18px;
				color: #ffdd77;
				background: rgba(0,0,0,0.4);
				padding: 0 12px;
				border-radius: 30px;
				line-height: 32px;
				min-width: 60px;
				text-align: center;
				border: 1px solid rgba(255,220,100,0.2);
			`;
			timerSpan.textContent = '120s';
			turnInd.appendChild(timerSpan);

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
			canvas.width = 600;
			canvas.height = 600;
			canvas.style.cssText = `
				display: block;
				width: 100%;
				max-width: 480px;
				aspect-ratio: 1 / 1;
				border-radius: 28px;
				box-shadow: inset 0 0 0 2px #4a6a8a, 0 12px 32px rgba(0,0,0,0.6);
				background: #1a3a5a;
				cursor: pointer;
				touch-action: none;
			`;
			boardWrapper.appendChild(canvas);
			self.canvas = canvas;
			self.ctx = canvas.getContext('2d');

			// 操作按钮区域
			const actionBar = document.createElement('div');
			actionBar.className = 'action-bar';
			actionBar.style.cssText = `
				display: flex;
				justify-content: center;
				gap: 16px;
				margin: 10px 0 6px 0;
			`;
			gameContainer.appendChild(actionBar);

			const confirmBtn = document.createElement('button');
			confirmBtn.id = 'render-confirm-btn';
			confirmBtn.textContent = '✅ 确定涂色';
			confirmBtn.disabled = true;
			confirmBtn.style.cssText = `
				background: #2a6a3a;
				color: white;
				border: none;
				padding: 8px 24px;
				border-radius: 40px;
				font-size: 16px;
				font-weight: 600;
				cursor: pointer;
				box-shadow: 0 4px 0 #1a3a2a;
				transition: all 0.1s;
				opacity: 0.6;
				pointer-events: none;
			`;
			actionBar.appendChild(confirmBtn);

			const cancelBtn = document.createElement('button');
			cancelBtn.id = 'render-cancel-btn';
			cancelBtn.textContent = '↩️ 取消选择';
			cancelBtn.disabled = true;
			cancelBtn.style.cssText = `
				background: #6a3a3a;
				color: white;
				border: none;
				padding: 8px 24px;
				border-radius: 40px;
				font-size: 16px;
				font-weight: 600;
				cursor: pointer;
				box-shadow: 0 4px 0 #3a1a1a;
				transition: all 0.1s;
				opacity: 0.6;
				pointer-events: none;
			`;
			actionBar.appendChild(cancelBtn);

			self.confirmBtn = confirmBtn;
			self.cancelBtn = cancelBtn;

			// 状态栏
			const statusBar = document.createElement('div');
			statusBar.className = 'status-bar';
			statusBar.style.cssText = `
				display: flex;
				justify-content: center;
				align-items: center;
				margin-top: 8px;
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
				font-size: 16px;
				font-weight: 500;
				color: #f0e8d0;
				background: rgba(0,0,0,0.3);
				padding: 6px 18px;
				border-radius: 40px;
				border: 1px solid rgba(255,255,200,0.08);
				flex: 1;
				min-width: 100px;
				text-align: center;
				backdrop-filter: blur(2px);
				min-height: 40px;
				display: flex;
				align-items: center;
				justify-content: center;
			`;
			statusMsg.textContent = '⚔️ 对局中';
			statusBar.appendChild(statusMsg);
			self.statusMsg = statusMsg;

			// ---- 初始化尺寸 ----
			self._calcDimensions();

			// ---- 绑定 Canvas 事件 ----
			canvas.addEventListener('click', function (e) {
				if (self._gameOver || !self.isPlaying) return;
				const rect = canvas.getBoundingClientRect();
				const scaleX = canvas.width / rect.width;
				const scaleY = canvas.height / rect.height;
				const x = (e.clientX - rect.left) * scaleX;
				const y = (e.clientY - rect.top) * scaleY;
				const pos = self._toGrid(x, y);
				if (!pos) return;
				self._handleGridClick(pos.row, pos.col);
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
				const pos = self._toGrid(x, y);
				if (!pos) return;
				self._handleGridClick(pos.row, pos.col);
			}, { passive: false });

			// ---- 按钮事件 ----
			confirmBtn.addEventListener('click', function () {
				if (self._gameOver || !self.isPlaying) return;
				self._submitMove();
			});

			cancelBtn.addEventListener('click', function () {
				self._clearSelection();
				self._updateButtons();
				self._drawBoard(self._board);
				self.statusMsg.textContent = '请选择起点（单格直接确定）或选择终点';
			});

			// ---- 内部状态 ----
			self._board = state.board.map(row => [...row]);
			self._currentPlayer = state.currentPlayer;
			self._gameOver = state.end;
			self._winner = state.winner;
			self._draw = state.draw || false;
			self._myId = state.id;
			self._firstPlayerId = state.firstPlayerId;

			// 选择状态
			self._startRow = null;
			self._startCol = null;
			self._endRow = null;
			self._endCol = null;
			self._previewCells = [];

			// 计时器
			self._timer = 120;
			self._timerInterval = null;

			// ---- 初始绘制 ----
			self._drawBoard(self._board);
			self._updateUI(state);
			self.statusMsg.textContent = '请选择起点（单格直接确定）或选择终点';

			// 启动计时器
			self._startTimer();
		}

		// ---------- Canvas 绘制 ----------
		_calcDimensions() {
			const w = this.canvas.width;
			const h = this.canvas.height;
			const pad = w * 0.06;
			this._padding = pad;
			this._cellSize = (w - pad * 2) / BOARD_SIZE;
		}

		_toPixel(row, col) {
			return {
				x: this._padding + col * this._cellSize + this._cellSize / 2,
				y: this._padding + (BOARD_SIZE - 1 - row) * this._cellSize + this._cellSize / 2,
			};
		}

		_toGrid(px, py) {
			const w = this.canvas.width;
			const h = this.canvas.height;
			const pad = this._padding;
			const cell = this._cellSize;
			if (px < pad - cell * 0.2 || px > w - pad + cell * 0.2) return null;
			if (py < pad - cell * 0.2 || py > h - pad + cell * 0.2) return null;
			const col = Math.floor((px - pad) / cell);
			const row = BOARD_SIZE - 1 - Math.floor((py - pad) / cell);
			if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
			return { row, col };
		}

		_drawBoard(board) {
			const ctx = this.ctx;
			const w = this.canvas.width;
			const h = this.canvas.height;
			const pad = this._padding;
			const cell = this._cellSize;
			const radius = cell * 0.38;

			ctx.clearRect(0, 0, w, h);

			// 背景
			const bgGrad = ctx.createLinearGradient(0, 0, w, h);
			bgGrad.addColorStop(0, '#1a3a5a');
			bgGrad.addColorStop(0.5, '#1e4a6a');
			bgGrad.addColorStop(1, '#142a44');
			ctx.fillStyle = bgGrad;
			ctx.fillRect(0, 0, w, h);

			// 绘制网格线
			ctx.strokeStyle = 'rgba(255,255,200,0.15)';
			ctx.lineWidth = 1.5;
			for (let i = 0; i <= BOARD_SIZE; i++) {
				const x = pad + i * cell;
				const y = pad + i * cell;
				ctx.beginPath();
				ctx.moveTo(x, pad);
				ctx.lineTo(x, pad + BOARD_SIZE * cell);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(pad, y);
				ctx.lineTo(pad + BOARD_SIZE * cell, y);
				ctx.stroke();
			}

			// 绘制格子
			for (let r = 0; r < BOARD_SIZE; r++) {
				for (let c = 0; c < BOARD_SIZE; c++) {
					const pos = this._toPixel(r, c);
					const val = board[r][c];
					const x = pos.x;
					const y = pos.y;

					// 空背景
					const grad = ctx.createRadialGradient(
						x - radius * 0.2, y - radius * 0.2, radius * 0.1,
						x, y, radius * 1.1
					);
					grad.addColorStop(0, '#2a5a7a');
					grad.addColorStop(0.7, '#1a3a5a');
					grad.addColorStop(1, '#0d2a44');
					ctx.beginPath();
					ctx.arc(x, y, radius * 1.05, 0, 2 * Math.PI);
					ctx.fillStyle = grad;
					ctx.fill();

					if (val === EMPTY) {
						// 高光
						const hl = ctx.createRadialGradient(
							x - radius * 0.3, y - radius * 0.3, radius * 0.05,
							x, y, radius * 0.6
						);
						hl.addColorStop(0, 'rgba(255,255,255,0.12)');
						hl.addColorStop(1, 'rgba(255,255,255,0)');
						ctx.beginPath();
						ctx.arc(x, y, radius * 0.6, 0, 2 * Math.PI);
						ctx.fillStyle = hl;
						ctx.fill();
					} else {
						const isRed = (val === RED);
						const grad2 = ctx.createRadialGradient(
							x - radius * 0.3, y - radius * 0.35, radius * 0.05,
							x, y, radius
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
						ctx.arc(x, y, radius, 0, 2 * Math.PI);
						ctx.fillStyle = grad2;
						ctx.shadowColor = 'rgba(0,0,0,0.5)';
						ctx.shadowBlur = 10;
						ctx.fill();
						ctx.shadowBlur = 0;

						// 高光
						const hl2 = ctx.createRadialGradient(
							x - radius * 0.3, y - radius * 0.35, radius * 0.05,
							x - radius * 0.2, y - radius * 0.25, radius * 0.5
						);
						hl2.addColorStop(0, isRed ? 'rgba(255,220,200,0.5)' : 'rgba(255,255,220,0.5)');
						hl2.addColorStop(1, 'rgba(255,255,255,0)');
						ctx.beginPath();
						ctx.arc(x, y, radius * 0.7, 0, 2 * Math.PI);
						ctx.fillStyle = hl2;
						ctx.fill();
					}
				}
			}

			// 绘制预览路径（高亮）
			if (this._previewCells && this._previewCells.length > 0) {
				for (const cell of this._previewCells) {
					const pos = this._toPixel(cell.row, cell.col);
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, radius * 1.1, 0, 2 * Math.PI);
					ctx.strokeStyle = 'rgba(255,255,255,0.8)';
					ctx.lineWidth = 3;
					ctx.setLineDash([6, 4]);
					ctx.stroke();
					ctx.setLineDash([]);
				}
			}

			// 绘制起点和终点标记
			if (this._startRow !== null && this._startCol !== null) {
				const pos = this._toPixel(this._startRow, this._startCol);
				ctx.beginPath();
				ctx.arc(pos.x, pos.y, radius * 1.2, 0, 2 * Math.PI);
				ctx.strokeStyle = '#00ffaa';
				ctx.lineWidth = 3;
				ctx.stroke();
				ctx.fillStyle = 'rgba(0,255,170,0.15)';
				ctx.fill();
			}
			if (this._endRow !== null && this._endCol !== null) {
				const pos = this._toPixel(this._endRow, this._endCol);
				ctx.beginPath();
				ctx.arc(pos.x, pos.y, radius * 1.2, 0, 2 * Math.PI);
				ctx.strokeStyle = '#ffaa00';
				ctx.lineWidth = 3;
				ctx.stroke();
				ctx.fillStyle = 'rgba(255,170,0,0.15)';
				ctx.fill();
			}

			// 坐标标签
			ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			for (let c = 0; c < BOARD_SIZE; c++) {
				const x = pad + c * cell + cell / 2;
				const y = pad + BOARD_SIZE * cell + 4;
				ctx.fillStyle = 'rgba(255,255,255,0.25)';
				ctx.fillText(c + 1, x + 1, y + 1);
				ctx.fillStyle = 'rgba(255,255,255,0.6)';
				ctx.fillText(c + 1, x, y);
			}
			ctx.textBaseline = 'bottom';
			for (let r = 0; r < BOARD_SIZE; r++) {
				const x = pad - 10;
				// 【由Ya修改】修正标签位置
				const y = pad + (BOARD_SIZE - 1 - r) * cell + cell / 2 + 10;
				ctx.fillStyle = 'rgba(255,255,255,0.25)';
				ctx.fillText(r + 1, x - 1, y + 1);
				ctx.fillStyle = 'rgba(255,255,255,0.6)';
				ctx.fillText(r + 1, x, y);
			}
		}

		// ---------- 交互逻辑 ----------
		_handleGridClick(row, col) {
			const board = this._board;
			if (board[row][col] !== EMPTY) {
				// 如果点击已涂色，清除选择
				this._clearSelection();
				this._updateButtons();
				this._drawBoard(board);
				this.statusMsg.textContent = '该格已涂色，请选择空格';
				return;
			}

			if (this._startRow === null) {
				// 无起点：设置起点和终点均为该格，确定可用
				this._startRow = row;
				this._startCol = col;
				this._endRow = row;
				this._endCol = col;
				this._previewCells = [{ row, col }];
				this._updateButtons();
				this._drawBoard(board);
				this.statusMsg.textContent = '已选单格，点击确定涂色或点击其他格子选择终点';
				return;
			}

			// 已有起点
			if (this._startRow === row && this._startCol === col) {
				// 点击起点，取消选择
				this._clearSelection();
				this._updateButtons();
				this._drawBoard(board);
				this.statusMsg.textContent = '请选择起点（单格直接确定）或选择终点';
				return;
			}

			// 尝试设为终点
			const result = getLineCells(this._startRow, this._startCol, row, col, board);
			if (result.valid) {
				this._endRow = row;
				this._endCol = col;
				this._previewCells = result.cells;
				this._updateButtons();
				this._drawBoard(board);
				this.statusMsg.textContent = `已选 ${result.cells.length} 格，点击确定涂色`;
			} else {
				// 非法路径，清除选择并提示
				this.statusMsg.textContent = '❌ 路径无效：必须为空且在同一直线连续';
				this._clearSelection();
				this._updateButtons();
				this._drawBoard(board);
				setTimeout(() => {
					if (!this._gameOver) {
						this.statusMsg.textContent = '请选择起点（单格直接确定）或选择终点';
					}
				}, 1500);
			}
		}

		_clearSelection() {
			this._startRow = null;
			this._startCol = null;
			this._endRow = null;
			this._endCol = null;
			this._previewCells = [];
		}

		_updateButtons() {
			const hasSelection = (this._startRow !== null && this._endRow !== null);
			this.confirmBtn.disabled = !hasSelection;
			this.cancelBtn.disabled = (this._startRow === null);
			this.confirmBtn.style.opacity = hasSelection ? '1' : '0.6';
			this.confirmBtn.style.pointerEvents = hasSelection ? 'auto' : 'none';
			this.cancelBtn.style.opacity = (this._startRow !== null) ? '1' : '0.6';
			this.cancelBtn.style.pointerEvents = (this._startRow !== null) ? 'auto' : 'none';
		}

		_submitMove() {
			if (this._startRow === null || this._endRow === null) return;
			const startRow = this._startRow;
			const startCol = this._startCol;
			const endRow = this._endRow;
			const endCol = this._endCol;
			// 发送动作
			this.send({
				action: 'place',
				body: { startRow, startCol, endRow, endCol }
			});
			// 清除选择
			this._clearSelection();
			this._updateButtons();
			this._drawBoard(this._board);
		}

		// ---------- 计时器 ----------
		_startTimer() {
			if (this._timerInterval) {
				clearInterval(this._timerInterval);
				this._timerInterval = null;
			}
			if (this._gameOver) return;

			this._timer = 120;
			this._updateTimerDisplay();

			this._timerInterval = setInterval(() => {
				this._timer--;
				this._updateTimerDisplay();
				if (this._timer <= 0) {
					clearInterval(this._timerInterval);
					this._timerInterval = null;
					if (!this._gameOver) {
						this.send({ action: 'timeout', body: {} });
					}
				}
			}, 1000);
		}

		_resetTimer() {
			if (this._gameOver) {
				if (this._timerInterval) {
					clearInterval(this._timerInterval);
					this._timerInterval = null;
				}
				this._timer = 0;
				this._updateTimerDisplay();
				return;
			}
			this._startTimer();
		}

		_updateTimerDisplay() {
			const timerEl = document.getElementById('render-timer');
			if (timerEl) {
				timerEl.textContent = this._timer + 's';
				if (this._timer <= 10) {
					timerEl.style.color = '#ff6b6b';
				} else {
					timerEl.style.color = '#ffdd77';
				}
			}
		}

		// ---------- UI 更新 ----------
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
					msg.textContent = `🎉 ${wName} 涂满最后一格，获胜！`;
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
				if (this._timerInterval) {
					clearInterval(this._timerInterval);
					this._timerInterval = null;
				}
				this._timer = 0;
				this._updateTimerDisplay();
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
				this._resetTimer();
			}
		}

		// ---------- 渲染接口 ----------
		render(data, isPlaying = true) {
			const self = this;
			if (data && data.type === 'api') {
				if (data.body && data.body.error) {
					self.statusMsg.textContent = '❌ ' + data.body.err_msg;
				} else if (data.body && data.body.ok) {
					self.statusMsg.textContent = '✅ ' + (data.body.msg || '涂色成功');
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

			self._clearSelection();
			self._updateButtons();
			self._drawBoard(self._board);
			self._updateUI(state);
		}

		send(data) { }
	}

	// ---------- 注册游戏（框架模式） ----------
	if (typeof games !== 'undefined' && Array.isArray(games)) {
		games.push({
			name: GAME_NAME,
			rule: JewishGameRule,
			renderer: JewishGameRenderer,
		});
	} else {
		console.warn('games 数组未定义，将启动独立运行模式');

		// ---------- 独立运行模式 ----------
		// 【由Ya修改】仅当框架模式无法运行时再考虑独立运行模式
		if (typeof window !== 'undefined' && !window.games) {
			(function standalone() {
				const container = document.createElement('div');
				container.id = 'jewish-standalone';
				container.style.cssText = `
				position: fixed; top: 0; left: 0; width: 100%; height: 100%;
				background: #1a1a2e;
				display: flex; justify-content: center; align-items: center;
				padding: 16px; z-index: 9999;
				overflow-y: auto;
			`;
				document.body.appendChild(container);

				const renderer = new JewishGameRenderer();
				renderer.element = container;

				const firstPlayerId = Math.random() < 0.5 ? 0 : 1;
				const initialBoard = Array.from({ length: BOARD_SIZE }, () =>
					Array(BOARD_SIZE).fill(EMPTY)
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
				let moveCount = 0;

				let timeoutId = null;

				function handleTimeout() {
					if (gameOver) return;
					gameOver = true;
					winner = 1 - currentPlayer;
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
							moveCount: moveCount,
							draw: false,
						}
					};
					renderer.render(newState, true);
					renderer.statusMsg.textContent = '⏰ 超时！' + (winner === 0 ? '红方' : '黄方') + '获胜！';
					clearTimeout(timeoutId);
					timeoutId = null;
				}

				function startTimer() {
					if (timeoutId) clearTimeout(timeoutId);
					if (gameOver) return;
					timeoutId = setTimeout(handleTimeout, 120000);
				}

				renderer.send = function (data) {
					if (data && data.action === 'place') {
						const { startRow, startCol, endRow, endCol } = data.body;
						if (gameOver) return;
						if (startRow === undefined || startCol === undefined ||
							endRow === undefined || endCol === undefined) return;

						const result = getLineCells(startRow, startCol, endRow, endCol, board);
						if (!result.valid) return;

						const cells = result.cells;
						const color = (currentPlayer === firstPlayerId) ? RED : YELLOW;
						for (const cell of cells) {
							board[cell.row][cell.col] = color;
						}
						moveCount += cells.length;

						if (moveCount === BOARD_SIZE * BOARD_SIZE) {
							gameOver = true;
							winner = currentPlayer;
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
									moveCount: moveCount,
									draw: false,
								}
							};
							renderer.render(newState, true);
							if (timeoutId) clearTimeout(timeoutId);
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
								moveCount: moveCount,
								draw: false,
							}
						};
						renderer.render(newState, true);
						startTimer();
					} else if (data && data.action === 'timeout') {
						handleTimeout();
					}
				};

				startTimer();
				renderer.render(defaultState, true);
			})();
		}
	}
})();