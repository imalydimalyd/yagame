// 1-card · 双人对战 (最终版)
// 特殊规则：2 > A 仅在两者比较时；加注使用滑块；比牌展示2秒；认输按钮右置；上轮结果显示双方牌面。
(function () {
	'use strict';

	const GAME_NAME = '1-card';
	const SUITS = ['熊猫', '东北虎', '金丝猴', '中华鲟'];
	const SUIT_SYMBOLS = ['🐼', '🐯', '🐒', '🐟'];
	const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
	const RANK_VALUE = {
		'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
		'8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
	};
	const BIG_RANK_MIN = 8;
	const INIT_CHIPS = 7;
	const MAX_ROUNDS = 20;
	const TURN_TIMEOUT_SECONDS = 120;
	const DECK_COUNT = 3;

	function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
	function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = randInt(0, i);[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

	function createDeck() {
		const deck = [];
		for (let s = 0; s < 4; s++) {
			for (let r = 0; r < 13; r++) {
				const rank = RANK_NAMES[r];
				deck.push({
					rank, value: RANK_VALUE[rank], suit: s,
					suitName: SUITS[s], suitSymbol: SUIT_SYMBOLS[s],
					isBig: RANK_VALUE[rank] >= BIG_RANK_MIN,
					isSmall: RANK_VALUE[rank] < BIG_RANK_MIN,
					display: rank + SUIT_SYMBOLS[s]
				});
			}
		}
		return deck;
	}

	function createShuffledDeck(count) {
		let all = [];
		for (let i = 0; i < count; i++) all = all.concat(createDeck());
		return shuffle(all);
	}

	// 特殊比较：2 > A 仅在两者直接比较时
	function compareCards(a, b) {
		if (a.rank === '2' && b.rank === 'A') return 1;
		if (a.rank === 'A' && b.rank === '2') return -1;
		if (a.value > b.value) return 1;
		if (a.value < b.value) return -1;
		return 0;
	}

	// ---------- 游戏规则 ----------
	class OneCardRule extends GameRule {
		name = GAME_NAME;
		maxN = 2;
		allowedN(n) { return n === 2; }

		constructor() {
			super();
			this._timerId = null;
			this._showdownTimerId = null;
		}

		_startTimer() {
			this._clearTimer();
			const state = this.state;
			if (state.phase === 'ended' || state.end) return;
			state.turnStartTimestamp = Date.now();
			this._timerId = setTimeout(() => this._handleTimeout(), TURN_TIMEOUT_SECONDS * 1000);
		}

		_clearTimer() {
			if (this._timerId) { clearTimeout(this._timerId); this._timerId = null; }
			if (this._showdownTimerId) { clearTimeout(this._showdownTimerId); this._showdownTimerId = null; }
		}

		_handleTimeout() {
			const state = this.state;
			if (state.phase === 'ended' || state.end) return;
			const loser = state.currentPlayer;
			const winner = 1 - loser;
			state.end = true;
			state.phase = 'ended';
			state.winner = winner;
			state.loser = loser;
			state.turnStartTimestamp = 0;
			state.message = `玩家 ${state.players[loser].user} 超时判负`;
			state.lastRoundResult = state.message; // ★ 无牌面信息
			this._clearTimer();
			this.pushState();
			this.send({ error: true, err_msg: `玩家 ${state.players[loser].user} 思考超时，判负` }, loser);
			this.send({ ok: true, msg: `玩家 ${state.players[loser].user} 超时，你获胜` }, winner);
		}

		init(users) {
			this._clearTimer();
			const deck = createShuffledDeck(DECK_COUNT);
			const firstPlayer = Math.random() < 0.5 ? 0 : 1;
			const state = {
				phase: 'play',
				end: false,
				n: users.length,
				round: 0,
				firstPlayer: firstPlayer,
				currentPlayer: firstPlayer,
				players: users.map((u, i) => ({
					user: u.user,
					chips: INIT_CHIPS,
					hand: [],
					playedCard: null,
					betTotal: 0,
					isReady: false,
					startChips: INIT_CHIPS,
					bigCount: 0,
					smallCount: 0,
				})),
				deck: deck,
				pool: 0,
				betAmounts: [0, 0],
				winner: null,
				loser: null,
				roundStartDiff: 0,
				turnStartTimestamp: 0,
				showdownDone: false,
				message: '',
				foldPlayer: -1,
				hasRaised: false,
				called: [false, false],
				lastRoundResult: '', // ★ 上一回合详细结果（含牌面）
			};
			for (let i = 0; i < 2; i++) {
				for (let p = 0; p < 2; p++) {
					const card = state.deck.pop();
					if (card) state.players[p].hand.push(card);
				}
			}
			this._updateCounts(state);
			state.roundStartDiff = state.players[0].chips - state.players[1].chips;
			this.state = state;
			this.pushState();
		}

		_updateCounts(state) {
			for (let p = 0; p < 2; p++) {
				const hand = state.players[p].hand;
				state.players[p].bigCount = hand.filter(c => c.isBig).length;
				state.players[p].smallCount = hand.filter(c => c.isSmall).length;
			}
		}

		receive(data, id) {
			const self = this;
			const state = self.state;
			const { action, body } = data;

			if (state.end) {
				self.send('游戏已结束', id, true);
				return;
			}

			if (action === 'concede') {
				state.end = true;
				state.phase = 'ended';
				state.loser = id;
				state.winner = 1 - id;
				state.turnStartTimestamp = 0;
				state.message = `玩家 ${state.players[id].user} 认输`;
				state.lastRoundResult = state.message; // ★
				this._clearTimer();
				this.pushState();
				this.send({ error: true, err_msg: `你认输了` }, id);
				this.send({ ok: true, msg: `对手认输，你获胜` }, state.winner);
				return;
			}

			if (action === 'timeout') {
				if (state.currentPlayer === id) self._handleTimeout();
				else self.send('不是你的回合', id, true);
				return;
			}

			if (state.phase === 'play') {
				if (action === 'play_card') {
					const cardIdx = body && body.cardIdx;
					if (cardIdx === undefined || cardIdx < 0 || cardIdx >= state.players[id].hand.length) {
						self.send('请选择一张手牌', id, true);
						return;
					}
					const player = state.players[id];
					if (player.isReady) { self.send('你已经出过牌了', id, true); return; }
					const card = player.hand.splice(cardIdx, 1)[0];
					player.playedCard = card;
					player.isReady = true;
					self.send({ ok: true, msg: '出牌成功' }, id);

					if (state.players[0].isReady && state.players[1].isReady) {
						for (let p = 0; p < 2; p++) {
							const pl = state.players[p];
							if (pl.chips < 1) {
								state.end = true;
								state.phase = 'ended';
								state.loser = p;
								state.winner = 1 - p;
								state.message = `${pl.user} 筹码不足，无法下注`;
								state.lastRoundResult = state.message; // ★
								self._clearTimer();
								self.pushState();
								self.send({ error: true, err_msg: state.message }, p);
								self.send({ ok: true, msg: state.message }, 1 - p);
								return;
							}
							pl.chips -= 1;
							pl.betTotal = 1;
							state.pool += 1;
						}
						state.betAmounts = [1, 1];
						state.phase = 'bet';
						state.currentPlayer = state.firstPlayer;
						state.hasRaised = false;
						state.called = [false, false];
						state.message = '下注阶段';
						self._startTimer();
						self.send({ ok: true, msg: '双方出牌完毕，强制底注1，进入下注' }, 0);
						self.send({ ok: true, msg: '双方出牌完毕，强制底注1，进入下注' }, 1);
					}
					// 【由Ya修改】将 syncState 改为 pushState
					self.pushState();
				} else {
					self.send('请出牌 (action: play_card)', id, true);
				}
				return;
			}

			if (state.phase === 'bet') {
				if (state.currentPlayer !== id) {
					self.send('当前不是你的回合', id, true);
					return;
				}
				const player = state.players[id];
				const opponent = state.players[1 - id];
				const myBet = state.betAmounts[id];
				const oppBet = state.betAmounts[1 - id];

				if (action === 'call') {
					if (myBet >= oppBet) {
						state.called[id] = true;
						if (state.hasRaised || (state.called[0] && state.called[1])) {
							state.phase = 'showdown';
							state.currentPlayer = -1;
							state.showdownDone = false;
							state.message = '跟注，进入比牌';
							self._clearTimer();
							self._doShowdown();
							return;
						} else {
							state.currentPlayer = 1 - id;
							self._startTimer();
							// 【由Ya修改】将 syncState 改为 pushState
							self.pushState();
							return;
						}
					}
					const diff = oppBet - myBet;
					if (diff > player.chips) {
						self.send('筹码不足，无法跟注', id, true);
						return;
					}
					player.chips -= diff;
					player.betTotal += diff;
					state.pool += diff;
					state.betAmounts[id] = player.betTotal;
					state.called[id] = true;
					self.send({ ok: true, msg: `跟注 ${diff} 筹码` }, id);

					if (state.hasRaised || (state.called[0] && state.called[1])) {
						state.phase = 'showdown';
						state.currentPlayer = -1;
						state.showdownDone = false;
						state.message = '跟注完成，进入比牌';
						self._clearTimer();
						self._doShowdown();
					} else {
						state.currentPlayer = 1 - id;
						self._startTimer();
						// 【由Ya修改】将 syncState 改为 pushState
						self.pushState();
					}
					return;
				} else if (action === 'raise') {
					const amount = body && body.amount;
					if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) {
						self.send('请输入正整数加注金额', id, true);
						return;
					}
					const newTotal = myBet + amount;
					if (newTotal <= oppBet) {
						self.send(`加注后总额必须大于对手 (当前对手 ${oppBet})`, id, true);
						return;
					}
					if (newTotal > opponent.startChips) {
						self.send(`加注后总额不能超过对手起始筹码 (${opponent.startChips})`, id, true);
						return;
					}
					if (amount > player.chips) {
						self.send('筹码不足', id, true);
						return;
					}
					player.chips -= amount;
					player.betTotal += amount;
					state.pool += amount;
					state.betAmounts[id] = player.betTotal;
					state.hasRaised = true;
					state.called = [false, false];
					self.send({ ok: true, msg: `加注 ${amount} 筹码` }, id);
					state.currentPlayer = 1 - id;
					self._startTimer();
					// 【由Ya修改】将 syncState 改为 pushState
					self.pushState();
					return;
				} else if (action === 'fold') {
					state.foldPlayer = id;
					state.phase = 'showdown';
					state.currentPlayer = -1;
					state.showdownDone = false;
					state.message = `${state.players[id].user} 弃牌`;
					self._clearTimer();
					self._doShowdown();
					return;
				} else {
					self.send('请使用 call / raise / fold', id, true);
				}
				return;
			}

			if (state.phase === 'showdown') {
				self.send('比牌阶段，无需操作', id, true);
				return;
			}

			if (state.phase === 'ended') {
				self.send('游戏已结束', id, true);
				return;
			}
			self.send('未知操作', id, true);
		}

		// ★ 比牌：结算筹码，构建含牌面的结果，展示2秒后进入下一轮
		_doShowdown() {
			const self = this;
			const state = self.state;
			if (state.showdownDone) return;
			state.showdownDone = true;

			const p0 = state.players[0];
			const p1 = state.players[1];
			const card0 = p0.playedCard;
			const card1 = p1.playedCard;

			// 构建牌面描述
			const cardDesc0 = card0 ? `${card0.rank}${card0.suitSymbol}` : '无牌';
			const cardDesc1 = card1 ? `${card1.rank}${card1.suitSymbol}` : '无牌';
			const name0 = p0.user;
			const name1 = p1.user;

			if (state.foldPlayer !== -1) {
				const winner = 1 - state.foldPlayer;
				const loser = state.foldPlayer;
				state.players[winner].chips += state.pool;
				const winAmount = state.pool;
				state.pool = 0;
				state.winner = winner;
				// ★ 详细结果
				const loserName = state.players[loser].user;
				const winnerName = state.players[winner].user;
				const loserCard = state.players[loser].playedCard;
				const winnerCard = state.players[winner].playedCard;
				const loserDesc = loserCard ? `${loserCard.rank}${loserCard.suitSymbol}` : '无牌';
				const winnerDesc = winnerCard ? `${winnerCard.rank}${winnerCard.suitSymbol}` : '无牌';
				state.message = `${loserName} 弃牌，${winnerName} 赢得 ${winAmount} 筹码`;
				state.lastRoundResult = `${loserName} 弃牌（${loserDesc}），${winnerName} 获胜（${winnerDesc}），赢得 ${winAmount} 筹码`;
			} else {
				let winnerIdx = -1;
				if (card0 && card1) {
					const cmp = compareCards(card0, card1);
					if (cmp > 0) winnerIdx = 0;
					else if (cmp < 0) winnerIdx = 1;
					else winnerIdx = -1;
				}
				if (winnerIdx === -1) {
					const half = Math.floor(state.pool / 2);
					p0.chips += half;
					p1.chips += state.pool - half;
					state.message = `平局！双方平分 ${state.pool} 筹码`;
					state.lastRoundResult = `${name0} ${cardDesc0} 平 ${name1} ${cardDesc1}，平分 ${state.pool} 筹码`;
					state.winner = -1;
				} else {
					state.players[winnerIdx].chips += state.pool;
					const winAmount = state.pool;
					state.winner = winnerIdx;
					const winnerName = state.players[winnerIdx].user;
					const loserName = state.players[1 - winnerIdx].user;
					const winnerCard = state.players[winnerIdx].playedCard;
					const loserCard = state.players[1 - winnerIdx].playedCard;
					const winnerDesc = winnerCard ? `${winnerCard.rank}${winnerCard.suitSymbol}` : '无牌';
					const loserDesc = loserCard ? `${loserCard.rank}${loserCard.suitSymbol}` : '无牌';
					state.message = `${winnerName} 赢得 ${winAmount} 筹码！`;
					state.lastRoundResult = `${winnerName} ${winnerDesc} 胜 ${loserName} ${loserDesc}，赢得 ${winAmount} 筹码`;
				}
				state.pool = 0;
			}

			// 展示牌面2秒后进入下一轮
			self._clearTimer(); // 取消其他定时器（如超时）
			self._showdownTimerId = setTimeout(() => {
				self._finishRound(state.winner);
			}, 2000);
			self.pushState();
		}

		_finishRound(winnerIdx) {
			const self = this;
			const state = self.state;
			self._clearTimer(); // 清理展示定时器

			// ★ 检查筹码归零（此时 lastRoundResult 已经包含牌面信息，无需覆盖）
			const loserIdx = self._checkChipsZero();
			if (loserIdx !== -1) {
				state.phase = 'ended';
				state.end = true;
				state.loser = loserIdx;
				state.winner = 1 - loserIdx;
				state.message = `玩家 ${state.players[loserIdx].user} 筹码耗尽，落败！`;
				// 保留 lastRoundResult（含牌面），但补充败因
				state.lastRoundResult += ` → ${state.players[loserIdx].user} 筹码耗尽`;
				self.pushState();
				self.send({ ok: true, msg: state.message }, state.winner);
				self.send({ error: true, err_msg: state.message }, state.loser);
				return;
			}

			state.round++;
			if (state.round >= MAX_ROUNDS) {
				state.phase = 'ended';
				state.end = true;
				const p0 = state.players[0], p1 = state.players[1];
				if (p0.chips > p1.chips) { state.winner = 0; state.loser = 1; }
				else if (p1.chips > p0.chips) { state.winner = 1; state.loser = 0; }
				else { state.winner = -1; state.loser = -1; }
				state.message = `20回合结束，${state.winner !== -1 ? state.players[state.winner].user + ' 获胜！' : '平局！'}`;
				// 保留 lastRoundResult，不覆盖
				if (state.winner !== -1) {
					state.lastRoundResult += ` → 20回合结束，${state.players[state.winner].user} 获胜`;
				} else {
					state.lastRoundResult += ` → 20回合结束，平局`;
				}
				self.pushState();
				self.send({ ok: true, msg: state.message }, 0);
				self.send({ ok: true, msg: state.message }, 1);
				return;
			}

			// 补牌
			self._dealCards();
			self._updateCounts(state);

			state.phase = 'play';
			if (winnerIdx === -1) {
				state.firstPlayer = 1 - state.firstPlayer;
			} else {
				state.firstPlayer = winnerIdx;
			}
			state.currentPlayer = state.firstPlayer;
			state.players.forEach(p => {
				p.playedCard = null;
				p.isReady = false;
				p.betTotal = 0;
				p.startChips = p.chips;
			});
			state.betAmounts = [0, 0];
			state.winner = null;
			state.loser = null;
			state.showdownDone = false;
			state.foldPlayer = -1;
			state.hasRaised = false;
			state.called = [false, false];
			state.roundStartDiff = state.players[0].chips - state.players[1].chips;
			state.message = `第 ${state.round + 1} 轮开始`;
			// ★ 保留 lastRoundResult（含牌面），不覆盖
			self._startTimer();
			self.pushState();
			self.send({ ok: true, msg: '新回合开始' }, 0);
			self.send({ ok: true, msg: '新回合开始' }, 1);
		}

		_dealCards() {
			const state = this.state;
			for (let p = 0; p < 2; p++) {
				while (state.players[p].hand.length < 2) {
					if (state.deck.length === 0) {
						state.deck = createShuffledDeck(DECK_COUNT);
					}
					const card = state.deck.pop();
					if (card) state.players[p].hand.push(card);
				}
			}
		}

		_checkChipsZero() {
			const state = this.state;
			for (let i = 0; i < 2; i++) {
				if (state.players[i].chips <= 0) return i;
			}
			return -1;
		}

		projection(id) {
			const state = this.state;
			let remainingSeconds = null;
			if (state.phase !== 'ended' && !state.end && state.turnStartTimestamp > 0) {
				const elapsed = (Date.now() - state.turnStartTimestamp) / 1000;
				remainingSeconds = Math.max(0, Math.floor(TURN_TIMEOUT_SECONDS - elapsed));
			}
			return {
				id: id,
				end: state.end,
				phase: state.phase,
				round: state.round,
				firstPlayer: state.firstPlayer,
				currentPlayer: state.currentPlayer,
				players: state.players.map(p => ({
					user: p.user,
					chips: p.chips,
					hand: p.hand.map(c => ({ ...c })),
					playedCard: p.playedCard ? { ...p.playedCard } : null,
					betTotal: p.betTotal,
					isReady: p.isReady,
					startChips: p.startChips,
					bigCount: p.bigCount,
					smallCount: p.smallCount,
				})),
				pool: state.pool,
				betAmounts: state.betAmounts.slice(),
				winner: state.winner,
				loser: state.loser,
				roundStartDiff: state.roundStartDiff,
				message: state.message || '',
				remainingSeconds: remainingSeconds,
				showdownDone: state.showdownDone || false,
				foldPlayer: state.foldPlayer,
				hasRaised: state.hasRaised,
				called: state.called.slice(),
				lastRoundResult: state.lastRoundResult || '',
			};
		}

		// 【由Ya修改】优化了规则文案
		rule() {
			return `
				<h1>1-card</h1>
				<ul>
					<li><b>游戏人数：</b>2人</li>
					<li><b>作者：</b>saiwei</li>
					<li><b>初始筹码：</b>7</li>
					<li><b>牌组：</b>3副扑克牌（去大小王），花色：🐼熊猫 🐯东北虎 🐒金丝猴 🐟中华鲟</li>
					<li><b>大牌：</b>8-A &nbsp;|&nbsp; <b>小牌：</b>2-7</li>
					<li><b>点数大小：</b>2 最小，A 最大，<b>特殊规则：2 在跟 A 比较时大于 A</b>（即 2 > A 仅在两者直接对比时成立）。</li>
				</ul>
				<h2>流程</h2>
				<ul>
					<li>每人2张底牌（仅自己可见），每轮选 <b>1张</b> 暗牌打出。</li>
					<li>强制底注：双方各下注1筹码。</li>
					<li>下注阶段（轮流）：<b>跟注</b>（补足差额）、<b>加注</b>（滑块选择金额，须大于对手总额）、<b>弃牌</b>（展示双方牌，对方赢池）。</li>
					<li><b>跟注规则：</b>若本轮无人加注，则双方都需跟注才进入比牌；若有人加注过，则任意一方跟注即进入比牌。</li>
					<li>比牌使用特殊规则：2 > A（仅当二者比较）。</li>
					<li>比牌后展示牌面 <b>2秒</b>，然后进入下一轮。</li>
					<li>补牌：每人补足2张，进入下一轮。</li>
					<li><b>胜负：</b>筹码归零即败；20回合后筹码多者胜。</li>
					<li>每回合 <b>120秒</b> 超时判负。</li>
					<li>赢家下轮先下注，平局交换先手。</li>
				</ul>
			`;
		}
	}

	// ---------- 渲染器 ----------
	class OneCardRenderer extends GameRenderer {
		extractState(data) {
			if (data && data.type === 'state' && data.body) return data.body;
			if (data && (data.id !== undefined || data.phase)) return data;
			return null;
		}

		init(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) return;
			self.isPlaying = isPlaying;
			self.container = self.element;
			self.container.innerHTML = '';
			if (self._timerInterval) clearInterval(self._timerInterval);

			const wrapper = document.createElement('div');
			wrapper.style.cssText = `
				background: #1a2a3a;
				background-image: radial-gradient(ellipse at 30% 20%, #2a4a5a, #0d1b2a);
				padding: 18px 16px 20px;
				border-radius: 40px;
				box-shadow: 0 20px 40px rgba(0,0,0,0.7);
				border: 1px solid #3a5a6a;
				max-width: 680px;
				width: 100%;
				margin: 0 auto;
				color: #f0e8d0;
			`;
			self.container.appendChild(wrapper);

			const title = document.createElement('div');
			title.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				font-size: 22px;
				font-weight: 700;
				padding: 0 4px 8px 4px;
				border-bottom: 1px solid rgba(255,255,200,0.1);
				letter-spacing: 1px;
			`;
			title.innerHTML = `<span>🃏 ${GAME_NAME}</span><span style="font-size:14px;font-weight:400;color:#aac;">双人对战</span>`;
			wrapper.appendChild(title);

			const statusBar = document.createElement('div');
			statusBar.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				flex-wrap: wrap;
				gap: 6px;
				margin: 10px 0 12px 0;
				padding: 6px 12px;
				background: rgba(0,0,0,0.3);
				border-radius: 60px;
				backdrop-filter: blur(4px);
			`;
			wrapper.appendChild(statusBar);

			const p0Info = document.createElement('div');
			p0Info.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;';
			// 【由Ya修改】显示玩家 0 用户名
			p0Info.innerHTML = `
				<span id="p0-name">${state.players[0].user}</span>
				<span id="p0-chips" style="background:rgba(0,0,0,0.3);padding:0 10px;border-radius:20px;">7</span>
				<span id="p0-hand-info" style="font-weight:400;font-size:12px;color:#aac;">大0 小0</span>
			`;
			statusBar.appendChild(p0Info);

			const turnInfo = document.createElement('div');
			turnInfo.id = 'turn-info';
			turnInfo.style.cssText = `
				font-weight:600;
				font-size:14px;
				background:rgba(0,0,0,0.4);
				padding:4px 16px;
				border-radius:30px;
				text-align:center;
				flex:1;
				min-width:80px;
				white-space:nowrap;
			`;
			turnInfo.textContent = '准备开始';
			statusBar.appendChild(turnInfo);

			const rightGroup = document.createElement('div');
			rightGroup.style.cssText = 'display:flex;align-items:center;gap:10px;flex-shrink:0;';
			const timerDisplay = document.createElement('div');
			timerDisplay.id = 'timer-display';
			timerDisplay.style.cssText = `
				font-weight:700;font-size:16px;color:#ffdd77;
				background:rgba(0,0,0,0.3);padding:0 12px;border-radius:30px;line-height:32px;
				min-width:60px;text-align:center;
			`;
			timerDisplay.textContent = '120s';
			rightGroup.appendChild(timerDisplay);

			const p1Info = document.createElement('div');
			p1Info.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;';
			// 【由Ya修改】显示玩家 1 用户名
			p1Info.innerHTML = `
				<span id="p1-chips" style="background:rgba(0,0,0,0.3);padding:0 10px;border-radius:20px;">7</span>
				<span id="p1-hand-info" style="font-weight:400;font-size:12px;color:#aac;">大0 小0</span>
				<span id="p1-name">${state.players[1].user}</span>
			`;
			rightGroup.appendChild(p1Info);
			statusBar.appendChild(rightGroup);

			const gameArea = document.createElement('div');
			gameArea.style.cssText = `display:flex;flex-direction:column;gap:12px;margin:12px 0 10px 0;`;
			wrapper.appendChild(gameArea);

			const handArea = document.createElement('div');
			handArea.style.cssText = `display:flex;justify-content:space-between;gap:8px;`;
			gameArea.appendChild(handArea);

			const hand0 = document.createElement('div');
			hand0.id = 'hand-0';
			hand0.style.cssText = `
				display:flex;gap:4px;flex-wrap:wrap;background:rgba(0,0,0,0.2);
				padding:6px 10px;border-radius:16px;min-height:70px;flex:1;
				align-items:center;border:1px solid rgba(255,255,200,0.06);
			`;
			handArea.appendChild(hand0);

			const hand1 = document.createElement('div');
			hand1.id = 'hand-1';
			hand1.style.cssText = `
				display:flex;gap:4px;flex-wrap:wrap;background:rgba(0,0,0,0.2);
				padding:6px 10px;border-radius:16px;min-height:70px;flex:1;
				align-items:center;border:1px solid rgba(255,255,200,0.06);
				justify-content:flex-end;
			`;
			handArea.appendChild(hand1);

			const tableArea = document.createElement('div');
			tableArea.style.cssText = `
				display:flex;
				justify-content:space-between;
				align-items:center;
				background:rgba(0,0,0,0.25);
				border-radius:24px;
				padding:10px 14px;
				min-height:80px;
				border:1px solid rgba(255,255,200,0.06);
				gap:8px;
				flex-wrap:wrap;
			`;
			gameArea.appendChild(tableArea);

			const play0 = document.createElement('div');
			play0.id = 'play-0';
			play0.style.cssText = `
				display:flex;align-items:center;justify-content:center;
				width:64px;height:88px;border-radius:8px;
				background:rgba(0,0,0,0.3);border:2px dashed rgba(255,255,200,0.1);
				font-size:12px;color:#667;flex-shrink:0;text-align:center;
			`;
			play0.textContent = '出牌区';
			tableArea.appendChild(play0);

			const poolArea = document.createElement('div');
			poolArea.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:60px;`;
			tableArea.appendChild(poolArea);
			const poolDisplay = document.createElement('div');
			poolDisplay.id = 'pool-display';
			poolDisplay.style.cssText = `font-weight:700;font-size:18px;color:#ffdd77;background:rgba(0,0,0,0.3);padding:2px 16px;border-radius:30px;`;
			poolDisplay.textContent = '💰 0';
			poolArea.appendChild(poolDisplay);
			const betInfo = document.createElement('div');
			betInfo.id = 'bet-info';
			betInfo.style.cssText = 'font-size:12px;color:#aac;';
			betInfo.textContent = '下注: 0 / 0';
			poolArea.appendChild(betInfo);

			const play1 = document.createElement('div');
			play1.id = 'play-1';
			play1.style.cssText = `
				display:flex;align-items:center;justify-content:center;
				width:64px;height:88px;border-radius:8px;
				background:rgba(0,0,0,0.3);border:2px dashed rgba(255,255,200,0.1);
				font-size:12px;color:#667;flex-shrink:0;text-align:center;
			`;
			play1.textContent = '出牌区';
			tableArea.appendChild(play1);

			const msgArea = document.createElement('div');
			msgArea.id = 'msg-area';
			msgArea.style.cssText = `
				margin-top:8px;
				padding:6px 14px;
				border-radius:30px;
				background:rgba(0,0,0,0.3);
				font-size:14px;
				text-align:center;
				min-height:36px;
				display:flex;
				align-items:center;
				justify-content:center;
				color:#d0d8e0;
				border:1px solid rgba(255,255,200,0.05);
			`;
			msgArea.textContent = '选择一张手牌出牌';
			wrapper.appendChild(msgArea);

			// ★ 上一回合结果区域
			const resultArea = document.createElement('div');
			resultArea.id = 'result-area';
			resultArea.style.cssText = `
				margin-top:6px;
				padding:4px 14px;
				border-radius:30px;
				background:rgba(0,0,0,0.25);
				font-size:13px;
				text-align:center;
				min-height:28px;
				display:flex;
				align-items:center;
				justify-content:center;
				color:#aac;
				border:1px solid rgba(255,255,200,0.05);
				font-weight:400;
			`;
			resultArea.textContent = '上轮结果：无';
			wrapper.appendChild(resultArea);

			const actionPanel = document.createElement('div');
			actionPanel.id = 'action-panel';
			actionPanel.style.cssText = `
				display:flex;
				justify-content:center;
				align-items:center;
				gap:10px;
				flex-wrap:wrap;
				margin-top:8px;
				padding:8px 6px;
				background:rgba(0,0,0,0.2);
				border-radius:40px;
				min-height:52px;
			`;
			wrapper.appendChild(actionPanel);

			// 保存引用
			self._p0Chips = document.getElementById('p0-chips');
			self._p0HandInfo = document.getElementById('p0-hand-info');
			self._p1Chips = document.getElementById('p1-chips');
			self._p1HandInfo = document.getElementById('p1-hand-info');
			self._turnInfo = turnInfo;
			self._timerDisplay = timerDisplay;
			self._poolDisplay = poolDisplay;
			self._betInfo = betInfo;
			self._msgArea = msgArea;
			self._resultArea = resultArea;
			self._hand0 = hand0;
			self._hand1 = hand1;
			self._play0 = play0;
			self._play1 = play1;
			self._actionPanel = actionPanel;
			self._myId = state.id;
			self._selectedCardIdx = -1;
			self._timerInterval = null;
			self._remainingSeconds = 0;
			self._raiseAmount = 1;

			self.render(data, isPlaying);
		}

		render(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) return;
			self.isPlaying = isPlaying;
			self._boardState = state;
			const myId = state.id;
			const p0 = state.players[0];
			const p1 = state.players[1];

			if (self._p0Chips) self._p0Chips.textContent = p0.chips;
			if (self._p1Chips) self._p1Chips.textContent = p1.chips;
			if (self._p0HandInfo) {
				self._p0HandInfo.textContent = `大${p0.bigCount} 小${p0.smallCount}`;
			}
			if (self._p1HandInfo) {
				self._p1HandInfo.textContent = `大${p1.bigCount} 小${p1.smallCount}`;
			}

			if (self._turnInfo) {
				if (state.phase === 'ended') {
					if (state.winner !== null && state.winner !== -1) {
						self._turnInfo.textContent = `🏆 ${state.players[state.winner].user} 获胜`;
					} else {
						self._turnInfo.textContent = '🤝 平局';
					}
				} else if (state.phase === 'play') {
					self._turnInfo.textContent = `第${state.round + 1}轮 · 出牌`;
				} else if (state.phase === 'bet') {
					const cur = state.currentPlayer;
					const name = cur === 0 ? '红方' : '蓝方';
					self._turnInfo.textContent = `下注 · ${name}操作`;
				} else if (state.phase === 'showdown') {
					self._turnInfo.textContent = '⚔️ 展示牌面...';
				} else {
					self._turnInfo.textContent = state.message || '对局中';
				}
			}

			if (state.remainingSeconds !== null && state.remainingSeconds !== undefined) {
				self._remainingSeconds = Math.max(0, state.remainingSeconds);
				if (self._timerDisplay) {
					self._timerDisplay.textContent = `⏱ ${self._remainingSeconds}s`;
					self._timerDisplay.style.color = self._remainingSeconds <= 10 ? '#ff6b6b' : '#ffdd77';
				}
				if (self._timerInterval) clearInterval(self._timerInterval);
				if (state.phase !== 'ended' && state.phase !== 'showdown') {
					self._timerInterval = setInterval(() => {
						self._remainingSeconds = Math.max(0, self._remainingSeconds - 1);
						if (self._timerDisplay) {
							self._timerDisplay.textContent = `⏱ ${self._remainingSeconds}s`;
							if (self._remainingSeconds <= 0) self._timerDisplay.textContent = '⏱ 超时！';
						}
						if (self._remainingSeconds <= 0) clearInterval(self._timerInterval);
					}, 1000);
				}
			}

			// 【由Ya修改】当不需要时隐藏计时器，并加宽回合信息
			if (isPlaying && (state.id !== -1) && (!state.end)) {
				self._timerDisplay.classList.remove('nodisplay');
				self._turnInfo.style.minWidth = '80px';
			} else {
				self._timerDisplay.classList.add('nodisplay');
				self._turnInfo.style.minWidth = '164px';
			}

			if (self._poolDisplay) self._poolDisplay.textContent = `💰 ${state.pool}`;
			if (self._betInfo) {
				self._betInfo.textContent = `下注: ${state.betAmounts[0]} / ${state.betAmounts[1]}`;
			}
			if (self._msgArea) {
				self._msgArea.textContent = state.message || ' ';
			}
			// ★ 显示上轮结果（含牌面）
			if (self._resultArea) {
				const result = state.lastRoundResult || '无';
				self._resultArea.textContent = `📜 上轮结果：${result}`;
			}

			self._renderHand(0, p0.hand, state);
			self._renderHand(1, p1.hand, state);
			self._renderPlayed(0, p0.playedCard, state);
			self._renderPlayed(1, p1.playedCard, state);
			self._renderActions(state);
		}

		_renderHand(playerIdx, hand, state) {
			const container = playerIdx === 0 ? this._hand0 : this._hand1;
			if (!container) return;
			container.innerHTML = '';
			const myId = state.id;
			const isMine = (playerIdx === myId);
			const isPlayPhase = (state.phase === 'play' && !state.end);
			const canSelect = isMine && isPlayPhase && !state.players[playerIdx].isReady;

			hand.forEach((card, idx) => {
				const div = document.createElement('div');
				// 【由Ya修改】当游戏结束时显示所有牌
				if (isMine || state.end) {
					// 【由Ya修改】为牌补上边框，防止牌大小变化
					div.style.cssText = `
						width:56px;height:80px;border-radius:8px;
						background:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.5);
						display:flex;flex-direction:column;align-items:center;justify-content:center;
						font-weight:700;font-size:20px;color:#1a1a1a;
						cursor:${canSelect ? 'pointer' : 'default'};
						transition:0.1s;
						border:${(this._selectedCardIdx === idx && canSelect) ? '3px solid #ffdd77' : '3px solid #0000'};
					`;
					const rankSpan = document.createElement('span');
					rankSpan.textContent = card.rank;
					const suitSpan = document.createElement('span');
					suitSpan.textContent = card.suitSymbol;
					suitSpan.style.fontSize = '14px';
					div.appendChild(rankSpan);
					div.appendChild(suitSpan);
					if (canSelect) {
						div.addEventListener('click', () => {
							if (this._selectedCardIdx === idx) {
								this._selectedCardIdx = -1;
							} else {
								this._selectedCardIdx = idx;
							}
							this._renderHand(playerIdx, hand, state);
							this._renderActions(state);
						});
					}
				} else {
					// 【由Ya修改】为牌补上边框，防止牌大小变化
					div.style.cssText = `
						width:56px;height:80px;border-radius:8px;
						border: 3px solid #0000;
						background:linear-gradient(135deg,#1a3a6a,#2a5a9a);
						background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.12) 8px, rgba(255,255,255,0.12) 16px);
						box-shadow:0 4px 12px rgba(0,0,0,0.6);
					`;
				}
				container.appendChild(div);
			});
		}

		_renderPlayed(playerIdx, card, state) {
			const container = playerIdx === 0 ? this._play0 : this._play1;
			if (!container) return;
			container.innerHTML = '';
			if (card) {
				const show = (state.phase === 'showdown' || state.phase === 'ended' || state.foldPlayer !== -1);
				if (show) {
					const div = document.createElement('div');
					div.style.cssText = `
						display:flex;flex-direction:column;align-items:center;justify-content:center;
						width:100%;height:100%;background:#fff;border-radius:8px;
						font-weight:700;font-size:20px;color:#1a1a1a;
					`;
					const rankSpan = document.createElement('span');
					rankSpan.textContent = card.rank;
					const suitSpan = document.createElement('span');
					suitSpan.textContent = card.suitSymbol;
					suitSpan.style.fontSize = '14px';
					div.appendChild(rankSpan);
					div.appendChild(suitSpan);
					container.appendChild(div);
				} else {
					const div = document.createElement('div');
					div.style.cssText = `
						width:100%;height:100%;background:linear-gradient(135deg,#1a3a6a,#2a5a9a);
						border-radius:8px;
						background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.12) 8px, rgba(255,255,255,0.12) 16px);
					`;
					container.appendChild(div);
				}
			} else {
				container.textContent = '出牌区';
			}
		}

		_renderActions(state) {
			const panel = this._actionPanel;
			if (!panel) return;
			panel.innerHTML = '';
			const myId = state.id;
			// 【由Ya修改】旁观状态或游戏结束时下不显示行动面板
			if (state.end || (myId === -1)) {
				panel.classList.add('nodisplay');
				return;
			}
			panel.classList.remove('nodisplay');
			const isEnded = state.phase === 'ended' || state.end;

			if (!isEnded) {
				if (state.phase === 'play') {
					const player = state.players[myId];
					if (player.isReady) {
						const span = document.createElement('span');
						span.textContent = '已出牌，等待对手...';
						panel.appendChild(span);
					} else {
						const btn = document.createElement('button');
						btn.className = 'btn btn-primary';
						btn.textContent = '出牌';
						btn.disabled = (this._selectedCardIdx === -1);
						btn.addEventListener('click', () => {
							if (this._selectedCardIdx === -1) return;
							this.send({ action: 'play_card', body: { cardIdx: this._selectedCardIdx } });
							this._selectedCardIdx = -1;
						});
						panel.appendChild(btn);
						const cancelBtn = document.createElement('button');
						cancelBtn.className = 'btn btn-sm';
						cancelBtn.textContent = '取消选择';
						cancelBtn.style.background = '#6a3a3a';
						cancelBtn.addEventListener('click', () => {
							this._selectedCardIdx = -1;
							this.render(this._boardState);
						});
						panel.appendChild(cancelBtn);
					}
				} else if (state.phase === 'bet') {
					const isMyTurn = (state.currentPlayer === myId);
					if (!isMyTurn) {
						const span = document.createElement('span');
						span.textContent = `等待 ${state.currentPlayer === 0 ? '红方' : '蓝方'} 行动`;
						panel.appendChild(span);
					} else {
						const callBtn = document.createElement('button');
						callBtn.className = 'btn btn-blue';
						callBtn.textContent = '跟注';
						callBtn.addEventListener('click', () => {
							this.send({ action: 'call', body: {} });
						});
						panel.appendChild(callBtn);

						const player = state.players[myId];
						const opponent = state.players[1 - myId];
						const myBet = state.betAmounts[myId];
						const oppBet = state.betAmounts[1 - myId];
						const minRaise = Math.max(1, oppBet - myBet + 1);
						const maxRaise = Math.min(opponent.startChips - myBet, player.chips);
						const canRaise = (minRaise <= maxRaise) && (maxRaise > 0);

						const raiseContainer = document.createElement('div');
						raiseContainer.style.cssText = 'display:flex;align-items:center;gap:6px;';
						panel.appendChild(raiseContainer);

						const raiseLabel = document.createElement('span');
						raiseLabel.textContent = '加注:';
						raiseContainer.appendChild(raiseLabel);

						const rangeInput = document.createElement('input');
						rangeInput.type = 'range';
						rangeInput.min = minRaise;
						rangeInput.max = maxRaise;
						rangeInput.step = 1;
						rangeInput.value = Math.min(this._raiseAmount || minRaise, maxRaise);
						rangeInput.disabled = !canRaise;
						rangeInput.style.cssText = 'width:120px;';
						raiseContainer.appendChild(rangeInput);

						const raiseValueDisplay = document.createElement('span');
						raiseValueDisplay.textContent = rangeInput.value;
						raiseValueDisplay.style.minWidth = '30px';
						raiseContainer.appendChild(raiseValueDisplay);

						rangeInput.addEventListener('input', () => {
							const val = parseInt(rangeInput.value);
							raiseValueDisplay.textContent = val;
							this._raiseAmount = val;
						});

						const raiseBtn = document.createElement('button');
						raiseBtn.className = 'btn btn-gold';
						raiseBtn.textContent = '加注';
						raiseBtn.disabled = !canRaise;
						raiseBtn.addEventListener('click', () => {
							const amount = parseInt(rangeInput.value);
							if (isNaN(amount) || amount < 1) return;
							this.send({ action: 'raise', body: { amount: amount } });
						});
						raiseContainer.appendChild(raiseBtn);

						if (!canRaise) {
							const hint = document.createElement('span');
							hint.textContent = ' (无法加注)';
							hint.style.color = '#ff6b6b';
							hint.style.fontSize = '12px';
							raiseContainer.appendChild(hint);
						}

						const foldBtn = document.createElement('button');
						foldBtn.className = 'btn btn-danger';
						foldBtn.textContent = '弃牌';
						foldBtn.addEventListener('click', () => {
							// 【由Ya修改】将弹窗改成 YaGame 自带版
							if (yaGameConfirm('确定弃牌吗？')) {
								this.send({ action: 'fold', body: {} });
							}
						});
						panel.appendChild(foldBtn);
					}
				} else if (state.phase === 'showdown') {
					const span = document.createElement('span');
					span.textContent = '牌面展示中...';
					panel.appendChild(span);
				}
			} else {
				const span = document.createElement('span');
				span.textContent = '游戏已结束';
				panel.appendChild(span);
			}

			// 认输按钮（最右边）
			if (!isEnded) {
				const concedeBtn = document.createElement('button');
				concedeBtn.className = 'btn btn-danger';
				concedeBtn.textContent = '🏳️ 认输';
				concedeBtn.style.background = '#8a2a2a';
				concedeBtn.style.marginLeft = 'auto';
				concedeBtn.addEventListener('click', () => {
					// 【由Ya修改】将弹窗改成 YaGame 自带版
					if (yaGameConfirm('确定认输吗？')) {
						this.send({ action: 'concede', body: {} });
					}
				});
				panel.appendChild(concedeBtn);
			}
		}

		send(data) { /* 由框架注入 */ }
	}

	// ---------- 注册游戏 ----------
	if (typeof games !== 'undefined' && Array.isArray(games)) {
		games.push({
			name: GAME_NAME,
			rule: OneCardRule,
			renderer: OneCardRenderer,
		});
	} else {
		console.warn('games 数组未定义，请确保在框架中运行');
	}
})();