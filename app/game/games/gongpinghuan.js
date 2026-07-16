// 公平换牌 (Fair Exchange) · 多人对战
// 规则：2-5人，初始生命5，每局换牌轮数1-9循环，按梭哈牌型比大小，未达最大牌型扣1血，归零淘汰。
// 每轮所有存活玩家同时选择丢弃牌，全部提交后统一进入下一轮。
(function () {
	'use strict';

	const GAME_NAME = '公平换牌';
	// 花色图案：动物 Emoji
	const SUITS = ['🐼', '🐟', '🐅', '🐒'];   // 熊猫、中华鲟、东北虎、金丝猴
	const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
	const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
	const HAND_SIZE = 5;
	const INIT_LIFE = 5;
	const MAX_ROUND_NUMBER = 9;
	const TURN_TIMEOUT_SECONDS = 120;
	const SETTLEMENT_DELAY_MS = 2000;   // 结算后延迟2秒

	// ---------- 工具函数 ----------
	function randInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function shuffle(arr) {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = randInt(0, i);
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	function createDeck() {
		const deck = [];
		for (const suit of SUITS) {
			for (const rank of RANK_NAMES) {
				deck.push({
					rank: rank,
					suit: suit,
					value: RANK_VALUES[rank],
					display: rank + suit
				});
			}
		}
		return deck;
	}

	function createShuffledDeck() {
		return shuffle(createDeck());
	}

	function copyDeck(deck) {
		return deck.map(c => ({ ...c }));
	}

	// ---------- 梭哈牌型评估 ----------
	function evaluateHand(hand) {
		const values = hand.map(c => c.value);
		const suits = hand.map(c => c.suit);
		const sorted = values.slice().sort((a, b) => a - b);

		let isFlush = suits.every(s => s === suits[0]);

		let isStraight = false;
		let straightHigh = 0;
		const unique = [...new Set(sorted)].sort((a, b) => a - b);
		if (unique.length === 5) {
			if (unique[4] - unique[0] === 4) {
				isStraight = true;
				straightHigh = unique[4];
			} else if (unique[0] === 2 && unique[1] === 3 && unique[2] === 4 && unique[3] === 5 && unique[4] === 14) {
				isStraight = true;
				straightHigh = 5;
			}
		}

		const counts = {};
		for (const v of values) {
			counts[v] = (counts[v] || 0) + 1;
		}
		const pairs = [];
		const triples = [];
		let quads = 0;
		for (const [v, cnt] of Object.entries(counts)) {
			const num = parseInt(v);
			if (cnt === 4) quads = num;
			else if (cnt === 3) triples.push(num);
			else if (cnt === 2) pairs.push(num);
		}
		pairs.sort((a, b) => b - a);
		triples.sort((a, b) => b - a);

		let rank, typeName, kickers = [];

		if (isFlush && isStraight && straightHigh === 14) {
			rank = 9; typeName = '皇家同花顺';
			kickers = [14];
		} else if (isFlush && isStraight) {
			rank = 8; typeName = '同花顺';
			kickers = [straightHigh];
		} else if (quads) {
			rank = 7; typeName = '四条';
			const remaining = values.filter(v => v !== quads);
			kickers = [quads, ...remaining.sort((a, b) => b - a)];
		} else if (triples.length === 1 && pairs.length === 1) {
			rank = 6; typeName = '葫芦';
			kickers = [triples[0], pairs[0]];
		} else if (isFlush) {
			rank = 5; typeName = '同花';
			kickers = sorted.slice().reverse();
		} else if (isStraight) {
			rank = 4; typeName = '顺子';
			kickers = [straightHigh];
		} else if (triples.length === 1) {
			rank = 3; typeName = '三条';
			const remaining = values.filter(v => v !== triples[0]).sort((a, b) => b - a);
			kickers = [triples[0], ...remaining];
		} else if (pairs.length === 2) {
			rank = 2; typeName = '两对';
			const highPair = pairs[0], lowPair = pairs[1];
			const kicker = values.find(v => v !== highPair && v !== lowPair);
			kickers = [highPair, lowPair, kicker];
		} else if (pairs.length === 1) {
			rank = 1; typeName = '一对';
			const remaining = values.filter(v => v !== pairs[0]).sort((a, b) => b - a);
			kickers = [pairs[0], ...remaining];
		} else {
			rank = 0; typeName = '高牌';
			kickers = sorted.slice().reverse();
		}

		return { rank, typeName, kickers };
	}

	function compareHands(a, b) {
		if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1;
		for (let i = 0; i < a.kickers.length; i++) {
			if (a.kickers[i] !== b.kickers[i]) {
				return a.kickers[i] > b.kickers[i] ? 1 : -1;
			}
		}
		return 0;
	}

	// ---------- 游戏规则类 ----------
	class FairExchangeRule extends GameRule {
		name = GAME_NAME;
		maxN = 5;
		minN = 2;
		allowedN(n) { return n >= 2 && n <= 5; }

		constructor() {
			super();
			this._timerId = null;
			this._settleTimerId = null;
		}

		_startTimer() {
			this._clearTimer();
			const state = this.state;
			if (state.phase === 'ended' || state.end) return;
			state.roundStartTimestamp = Date.now();
			this._timerId = setTimeout(() => this._handleTimeout(), TURN_TIMEOUT_SECONDS * 1000);
		}

		_clearTimer() {
			if (this._timerId) {
				clearTimeout(this._timerId);
				this._timerId = null;
			}
			if (this._settleTimerId) {
				clearTimeout(this._settleTimerId);
				this._settleTimerId = null;
			}
		}

		_handleTimeout() {
			const self = this;
			const state = self.state;
			if (state.phase !== 'exchange' || state.end) return;

			for (let i = 0; i < state.players.length; i++) {
				const p = state.players[i];
				if (!p.alive) continue;
				if (p.exchangeUsed < state.currentExchangeRound) {
					p.exchangeUsed++;
					p.alive = false;
					p.life = 0;
					p.exchangeUsed = state.maxExchanges;
				}
			}

			const alivePlayers = state.players.filter(p => p.alive);
			if (alivePlayers.length <= 1) {
				state.phase = 'ended';
				state.end = true;
				state.winner = alivePlayers.length === 1 ? state.players.indexOf(alivePlayers[0]) : -1;
				state.message = '超时淘汰导致游戏结束';
				self._clearTimer();
				self.pushState();
				return;
			}

			self._checkRoundComplete();
		}

		_eliminatePlayer(idx, reason) {
			const self = this;
			const state = self.state;
			const player = state.players[idx];
			if (!player.alive) return false;
			player.alive = false;
			player.life = 0;
			player.exchangeUsed = state.maxExchanges;

			const alivePlayers = state.players.filter(p => p.alive);
			if (alivePlayers.length <= 1) {
				state.phase = 'ended';
				state.end = true;
				state.winner = alivePlayers.length === 1 ? state.players.indexOf(alivePlayers[0]) : -1;
				state.message = reason + '，游戏结束';
				self._clearTimer();
				self.pushState();
				return true;
			}
			return false;
		}

		_checkRoundComplete() {
			const self = this;
			const state = self.state;
			if (state.phase !== 'exchange') return;

			const aliveIndices = state.players.map((p, i) => p.alive ? i : -1).filter(i => i >= 0);
			if (aliveIndices.length === 0) {
				state.phase = 'ended';
				state.end = true;
				state.message = '所有玩家已淘汰';
				self._clearTimer();
				self.pushState();
				return;
			}

			const allDone = aliveIndices.every(i => state.players[i].exchangeUsed >= state.currentExchangeRound);
			if (!allDone) {
				// 【由Ya修改】将 syncState 改为 pushState
				self.pushState();
				return;
			}

			state.currentExchangeRound++;
			if (state.currentExchangeRound > state.maxExchanges) {
				self._settleRound();
				return;
			}

			self._startTimer();
			// 【由Ya修改】将 syncState 改为 pushState
			self.pushState();
			self.send({ ok: true, msg: `第 ${state.currentExchangeRound} 轮换牌开始` }, 0);
			self.send({ ok: true, msg: `第 ${state.currentExchangeRound} 轮换牌开始` }, 1);
		}

		_settleRound() {
			const self = this;
			const state = self.state;
			state.phase = 'settlement';
			self._clearTimer();

			const alivePlayers = state.players.filter(p => p.alive);
			if (alivePlayers.length === 0) {
				state.phase = 'ended';
				state.end = true;
				state.message = '游戏结束，无人存活';
				self.pushState();
				return;
			}

			const results = [];
			for (let i = 0; i < state.players.length; i++) {
				const p = state.players[i];
				if (!p.alive) {
					results.push(null);
					continue;
				}
				const evalResult = evaluateHand(p.hand);
				results.push({
					playerIdx: i,
					eval: evalResult,
					hand: p.hand.map(c => ({ ...c }))
				});
			}

			let best = null;
			let bestIndices = [];
			for (const res of results) {
				if (!res) continue;
				if (best === null) {
					best = res.eval;
					bestIndices = [res.playerIdx];
				} else {
					const cmp = compareHands(res.eval, best);
					if (cmp > 0) {
						best = res.eval;
						bestIndices = [res.playerIdx];
					} else if (cmp === 0) {
						bestIndices.push(res.playerIdx);
					}
				}
			}

			for (let i = 0; i < state.players.length; i++) {
				if (!state.players[i].alive) continue;
				if (!bestIndices.includes(i)) {
					state.players[i].life -= 1;
					if (state.players[i].life <= 0) {
						state.players[i].alive = false;
						state.players[i].life = 0;
					}
				}
			}

			const resultMsg = bestIndices.map(i => state.players[i].user).join('、') + ' 获得最大牌型 (' + best.typeName + ')，其余玩家扣1生命。';
			state.message = resultMsg;
			state.settlementDetail = results.map(r => {
				if (!r) return null;
				return {
					user: state.players[r.playerIdx].user,
					typeName: r.eval.typeName,
					hand: r.hand,
					isWinner: bestIndices.includes(r.playerIdx)
				};
			});

			const aliveCount = state.players.filter(p => p.alive).length;
			if (aliveCount <= 1) {
				state.phase = 'ended';
				state.end = true;
				state.winner = aliveCount === 1 ? state.players.findIndex(p => p.alive) : -1;
				state.message = (state.winner !== -1 ? state.players[state.winner].user : '无') + ' 获得最终胜利！';
				self.pushState();
				return;
			}

			// 延迟2秒进入下一局
			state.settlementStartTimestamp = Date.now();
			state.message = resultMsg + ' 2秒后进入下一局...';
			self.pushState();

			if (self._settleTimerId) {
				clearTimeout(self._settleTimerId);
				self._settleTimerId = null;
			}
			self._settleTimerId = setTimeout(() => {
				self._prepareNextRound();
			}, SETTLEMENT_DELAY_MS);
		}

		_prepareNextRound() {
			const self = this;
			const state = self.state;
			if (self._settleTimerId) {
				clearTimeout(self._settleTimerId);
				self._settleTimerId = null;
			}
			state.roundNumber = (state.roundNumber % MAX_ROUND_NUMBER) + 1;
			state.maxExchanges = state.roundNumber;

			const newDeckOrder = createShuffledDeck();
			for (let i = 0; i < state.players.length; i++) {
				const p = state.players[i];
				if (!p.alive) continue;
				p.deck = copyDeck(newDeckOrder);
				p.discard = [];
				p.hand = [];
				p.exchangeUsed = 0;
				p.roundDiscardCount = 0;
				p.exchangeHistory = new Array(state.maxExchanges).fill(0);
				for (let j = 0; j < HAND_SIZE; j++) {
					if (p.deck.length > 0) {
						p.hand.push(p.deck.pop());
					}
				}
			}

			state.phase = 'exchange';
			state.currentExchangeRound = 1;
			state.settlementDetail = null;
			state.settlementStartTimestamp = 0;
			state.message = `第 ${state.roundNumber} 局开始，换牌轮数：${state.maxExchanges}`;
			self._startTimer();
			self.pushState();
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
				if (!state.players[id].alive) {
					self.send('你已经出局', id, true);
					return;
				}
				const ended = self._eliminatePlayer(id, '主动认输');
				if (ended) {
					self.pushState();
					self.send({ ok: true, msg: '你已认输，游戏结束' }, id);
				} else {
					self._checkRoundComplete();
					self.send({ ok: true, msg: '你已认输，继续游戏' }, id);
				}
				return;
			}

			if (action === 'timeout') {
				self._handleTimeout();
				return;
			}

			if (state.phase === 'settlement') {
				self.send('结算中，请稍候', id, true);
				return;
			}

			if (state.phase === 'exchange') {
				if (action !== 'exchange') {
					self.send('当前是换牌阶段，请使用 exchange 操作', id, true);
					return;
				}
				const player = state.players[id];
				if (!player.alive) {
					self.send('你已被淘汰', id, true);
					return;
				}
				if (player.exchangeUsed >= state.currentExchangeRound) {
					self.send('你已完成本轮换牌', id, true);
					return;
				}

				const discardIndices = body && body.discardIndices;
				if (!Array.isArray(discardIndices)) {
					self.send('请提供丢弃牌索引数组 discardIndices', id, true);
					return;
				}
				if (discardIndices.length > HAND_SIZE) {
					self.send('一次最多丢弃5张', id, true);
					return;
				}
				const idxSet = new Set(discardIndices);
				if (idxSet.size !== discardIndices.length) {
					self.send('丢弃索引重复', id, true);
					return;
				}
				for (const idx of discardIndices) {
					if (!Number.isInteger(idx) || idx < 0 || idx >= player.hand.length) {
						self.send('无效索引', id, true);
						return;
					}
				}

				const sortedIdx = discardIndices.slice().sort((a, b) => b - a);
				const discarded = [];
				for (const idx of sortedIdx) {
					const card = player.hand.splice(idx, 1)[0];
					if (card) {
						player.discard.push(card);
						discarded.push(card);
					}
				}
				const drawCount = discarded.length;
				for (let i = 0; i < drawCount; i++) {
					if (player.deck.length === 0) {
						player.deck = shuffle(player.discard.slice());
						player.discard = [];
					}
					if (player.deck.length > 0) {
						player.hand.push(player.deck.pop());
					}
				}

				const currentRoundIdx = player.exchangeUsed;
				player.exchangeHistory[currentRoundIdx] = discarded.length;
				player.exchangeUsed++;
				player.roundDiscardCount = discarded.length;

				self.send({ ok: true, msg: `换牌成功，已换 ${discarded.length} 张` }, id);
				self._checkRoundComplete();

			} else {
				self.send('未知操作', id, true);
			}
		}

		init(users) {
			const self = this;
			self._clearTimer();

			const n = users.length;
			const deckOrder = createShuffledDeck();

			const players = users.map((u, i) => {
				const deck = copyDeck(deckOrder);
				const hand = [];
				for (let j = 0; j < HAND_SIZE; j++) {
					if (deck.length > 0) hand.push(deck.pop());
				}
				return {
					user: u.user,
					life: INIT_LIFE,
					alive: true,
					hand: hand,
					deck: deck,
					discard: [],
					exchangeUsed: 0,
					roundDiscardCount: 0,
					exchangeHistory: [],
				};
			});

			self.state = {
				phase: 'exchange',
				end: false,
				n: n,
				roundNumber: 1,
				maxExchanges: 1,
				currentExchangeRound: 1,
				players: players,
				roundStartTimestamp: 0,
				settlementStartTimestamp: 0,
				message: '游戏开始，请换牌',
				winner: null,
				loser: null,
				settlementDetail: null,
			};
			for (const p of self.state.players) {
				p.exchangeHistory = new Array(self.state.maxExchanges).fill(0);
			}
			self._startTimer();
			self.pushState();
		}

		projection(id) {
			const state = this.state;
			const now = Date.now();
			const deadline = state.roundStartTimestamp + TURN_TIMEOUT_SECONDS * 1000;
			const isSettlement = (state.phase === 'settlement' || state.end);

			const completedRounds = Math.max(0, state.currentExchangeRound - 1);

			const projectedPlayers = state.players.map((p, idx) => {
				const isSelf = (idx === id);
				const showHand = isSelf || isSettlement;
				let remainingSeconds = null;
				if (p.alive && p.exchangeUsed < state.currentExchangeRound) {
					const remain = Math.max(0, Math.floor((deadline - now) / 1000));
					remainingSeconds = remain;
				} else {
					remainingSeconds = 0;
				}

				const history = p.exchangeHistory || [];
				const displayHistory = history.slice(0, completedRounds);
				const historyStr = displayHistory.join('-');

				return {
					user: p.user,
					life: p.life,
					alive: p.alive,
					hand: showHand ? p.hand.map(c => ({ ...c })) : p.hand.map(() => ({ hidden: true })),
					handCount: p.hand.length,
					deckCount: p.deck.length,
					discardCount: p.discard.length,
					exchangeUsed: p.exchangeUsed,
					exchangeHistory: history,
					exchangeHistoryStr: historyStr,
					remainingSeconds: remainingSeconds,
					hasCompletedThisRound: (p.exchangeUsed >= state.currentExchangeRound),
				};
			});

			let settlementDetail = null;
			if (state.phase === 'settlement' || state.end) {
				if (state.settlementDetail) {
					settlementDetail = state.settlementDetail.map(d => {
						if (!d) return null;
						return {
							user: d.user,
							typeName: d.typeName,
							hand: d.hand.map(c => ({ ...c })),
							isWinner: d.isWinner,
						};
					});
				}
			}

			return {
				id: id,
				end: state.end,
				phase: state.phase,
				n: state.n,
				roundNumber: state.roundNumber,
				maxExchanges: state.maxExchanges,
				currentExchangeRound: state.currentExchangeRound,
				players: projectedPlayers,
				message: state.message || '',
				winner: state.winner,
				loser: state.loser,
				settlementDetail: settlementDetail,
				roundStartTimestamp: state.roundStartTimestamp,
				settlementStartTimestamp: state.settlementStartTimestamp || 0,
			};
		}

		// 【由Ya修改】优化了规则文案
		rule() {
			return `
				<h1>公平换牌</h1>
				<ul>
					<li><b>游戏人数：</b>2-5人</li>
					<li><b>作者：</b>saiwei</li>
					<li><b>初始生命：</b>5点</li>
					<li><b>牌组：</b>标准52张扑克牌（无大小王），每局重新洗牌，所有玩家牌序完全相同。</li>
					<li><b>花色图案：</b>🐼 熊猫、🐟 中华鲟、🐅 东北虎、🐒 金丝猴</li>
				</ul>
				<h2>流程</h2>
				<ul>
					<li>每局开始，每人发5张手牌。</li>
					<li>换牌轮数：第1局1轮，第2局2轮……第9局9轮，之后循环。</li>
					<li>每轮所有存活玩家<b>同时</b>选择要丢弃的牌（0-5张），提交后立即补牌。</li>
					<li>全部提交后自动进入下一轮，直到所有轮次完成。</li>
					<li>每轮限时120秒，超时未提交者自动淘汰。</li>
					<li>所有轮次完成后，按梭哈牌型比大小，未拥有最大牌型的玩家各扣1生命。</li>
					<li>结算后等待2秒自动进入下一局，期间所有玩家手牌公开。</li>
					<li>生命归零即淘汰，仅剩一人时游戏结束。</li>
					<li>换牌记录（如 5-2-0）表示该玩家在本局各轮的弃牌张数，<b>仅在该轮所有人完成后才更新显示</b>。</li>
				</ul>
				<h2>操作</h2>
				<ul>
					<li>点击手牌可选中/取消（用于丢弃）。</li>
					<li>点击“换牌”提交选择。</li>
					<li>提交后本轮回合结束，等待其他玩家。</li>
				</ul>
			`;
		}
	}

	// ---------- 渲染器 ----------
	class FairExchangeRenderer extends GameRenderer {
		extractState(data) {
			if (data && data.type === 'state' && data.body) return data.body;
			if (data && (data.id !== undefined || data.phase)) return data;
			return null;
		}

		init(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) {
				console.error('公平换牌：无效初始数据', data);
				return;
			}
			self.isPlaying = isPlaying;
			self.container = self.element;
			self.container.innerHTML = '';

			self._selectedIndices = [];
			self._timerInterval = null;

			const wrapper = document.createElement('div');
			wrapper.style.cssText = `
				background: #1a2a3a;
				background-image: radial-gradient(ellipse at 30% 20%, #2a4a5a, #0d1b2a);
				padding: 16px 12px 20px;
				border-radius: 40px;
				box-shadow: 0 20px 40px rgba(0,0,0,0.7);
				border: 1px solid #3a5a6a;
				max-width: 760px;
				width: 100%;
				margin: 0 auto;
				color: #f0e8d0;
			`;
			self.container.appendChild(wrapper);

			const header = document.createElement('div');
			header.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				font-size: 20px;
				font-weight: 700;
				padding: 0 4px 8px 4px;
				border-bottom: 1px solid rgba(255,255,200,0.1);
				flex-wrap: wrap;
				gap: 6px;
			`;
			header.innerHTML = `<span>🃏 ${GAME_NAME}</span><span style="font-size:14px;font-weight:400;color:#aac;">${state.n}人局</span>`;
			wrapper.appendChild(header);

			const infoBar = document.createElement('div');
			infoBar.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				flex-wrap: wrap;
				gap: 6px;
				margin: 8px 0 10px 0;
				padding: 4px 12px;
				background: rgba(0,0,0,0.3);
				border-radius: 40px;
				font-size: 14px;
			`;
			wrapper.appendChild(infoBar);

			const roundInfo = document.createElement('span');
			roundInfo.id = 'round-info';
			roundInfo.textContent = `第 ${state.roundNumber} 局 · 换牌轮数 ${state.maxExchanges}`;
			infoBar.appendChild(roundInfo);

			const turnInfo = document.createElement('span');
			turnInfo.id = 'turn-info';
			turnInfo.style.fontWeight = '600';
			turnInfo.textContent = state.message || '等待开始';
			infoBar.appendChild(turnInfo);

			const globalTimer = document.createElement('span');
			globalTimer.id = 'global-timer';
			globalTimer.style.cssText = `
				font-weight:700; font-size:16px; color:#ffdd77;
				background:rgba(0,0,0,0.3); padding:0 12px; border-radius:30px; line-height:30px;
				min-width:60px; text-align:center;
			`;
			globalTimer.textContent = '--';
			infoBar.appendChild(globalTimer);

			const playersContainer = document.createElement('div');
			playersContainer.id = 'players-container';
			playersContainer.style.cssText = `
				display: flex;
				flex-direction: column;
				gap: 12px;
				margin: 12px 0;
			`;
			wrapper.appendChild(playersContainer);

			const actionPanel = document.createElement('div');
			actionPanel.id = 'action-panel';
			actionPanel.style.cssText = `
				display: flex;
				justify-content: center;
				align-items: center;
				gap: 12px;
				flex-wrap: wrap;
				margin-top: 8px;
				padding: 8px 6px;
				background: rgba(0,0,0,0.2);
				border-radius: 40px;
				min-height: 52px;
			`;
			wrapper.appendChild(actionPanel);

			const settlementDiv = document.createElement('div');
			settlementDiv.id = 'settlement-detail';
			settlementDiv.style.cssText = `
				margin-top: 8px;
				padding: 8px 12px;
				border-radius: 16px;
				background: rgba(0,0,0,0.25);
				border: 1px solid rgba(255,255,200,0.08);
				display: none;
				font-size: 13px;
				max-height: 200px;
				overflow-y: auto;
			`;
			wrapper.appendChild(settlementDiv);

			self._roundInfo = roundInfo;
			self._turnInfo = turnInfo;
			self._globalTimer = globalTimer;
			self._playersContainer = playersContainer;
			self._actionPanel = actionPanel;
			self._settlementDiv = settlementDiv;

			self.render(data, isPlaying);
		}

		render(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) return;
			self.isPlaying = isPlaying;
			self._state = state;

			if (!Array.isArray(self._selectedIndices)) {
				self._selectedIndices = [];
			}

			// ---- 倒计时逻辑 ----
			if (state.phase === 'exchange' && !state.end) {
				if (!self._timerInterval) {
					self._timerInterval = setInterval(() => {
						if (self._state && self._state.phase === 'exchange' && !self._state.end) {
							const now = Date.now();
							const deadline = self._state.roundStartTimestamp + TURN_TIMEOUT_SECONDS * 1000;
							const remain = Math.max(0, Math.floor((deadline - now) / 1000));
							if (self._globalTimer) {
								self._globalTimer.textContent = `⏱ ${remain}s`;
								self._globalTimer.style.color = remain <= 10 ? '#ff6b6b' : '#ffdd77';
							}
						} else {
							clearInterval(self._timerInterval);
							self._timerInterval = null;
						}
					}, 1000);
				}
				const now = Date.now();
				const deadline = state.roundStartTimestamp + TURN_TIMEOUT_SECONDS * 1000;
				const remain = Math.max(0, Math.floor((deadline - now) / 1000));
				if (self._globalTimer) {
					self._globalTimer.textContent = `⏱ ${remain}s`;
					self._globalTimer.style.color = remain <= 10 ? '#ff6b6b' : '#ffdd77';
				}
			} else {
				if (self._timerInterval) {
					clearInterval(self._timerInterval);
					self._timerInterval = null;
				}
				if (state.phase === 'settlement' && !state.end && state.settlementStartTimestamp) {
					const now = Date.now();
					const elapsed = (now - state.settlementStartTimestamp) / 1000;
					const remain = Math.max(0, Math.ceil(SETTLEMENT_DELAY_MS / 1000 - elapsed));
					if (self._globalTimer) {
						self._globalTimer.textContent = `⏳ ${remain}s`;
						self._globalTimer.style.color = '#ffdd77';
					}
				} else {
					if (self._globalTimer) {
						self._globalTimer.textContent = '--';
					}
				}
			}

			// 更新信息
			if (self._roundInfo) {
				// 【由Ya修改】轮数不超过总轮数
				self._roundInfo.textContent = `第 ${state.roundNumber} 局 · 换牌轮数 ${state.maxExchanges} · 第 ${Math.min(state.currentExchangeRound, state.maxExchanges)}/${state.maxExchanges} 轮`;
			}
			if (self._turnInfo) {
				let msg = state.message || '';
				if (state.phase === 'exchange') {
					const submitted = state.players.filter(p => p.alive && p.hasCompletedThisRound).length;
					const total = state.players.filter(p => p.alive).length;
					msg += ` (已提交 ${submitted}/${total})`;
				} else if (state.phase === 'settlement') {
					if (!msg.includes('2秒')) {
						msg = '🏆 结算中...';
					}
				} else if (state.phase === 'ended') {
					if (state.winner !== null && state.winner !== undefined && state.winner >= 0) {
						msg = `🎉 ${state.players[state.winner]?.user || '玩家'} 获胜！`;
					} else {
						msg = '💀 游戏结束';
					}
				}
				self._turnInfo.textContent = msg;
			}

			self._renderPlayers(state);
			self._renderActions(state);
			self._renderSettlement(state);

			// 【由Ya修改】不需要时隐藏计时器
			if (isPlaying && !state.end && state.phase !== 'settlement') {
				self._globalTimer.classList.remove('nodisplay');
			} else {
				self._globalTimer.classList.add('nodisplay');
			}
			// 【由Ya修改】不需要时隐藏行动条
			if (isPlaying && !state.end) {
				self._actionPanel.classList.remove('nodisplay');
			} else {
				self._actionPanel.classList.add('nodisplay');
			}
		}

		_renderPlayers(state) {
			const self = this;
			const container = this._playersContainer;
			container.innerHTML = '';
			const myId = parseInt(state.id, 10);
			if (isNaN(myId)) {
				console.warn('state.id 不是有效数字，使用 0 作为默认');
			}
			const currentPlayerId = isNaN(myId) ? 0 : myId;

			for (let i = 0; i < state.players.length; i++) {
				const p = state.players[i];
				const isSelf = (i === currentPlayerId);
				const isAlive = p.alive;
				const hasCompleted = p.hasCompletedThisRound && isAlive;

				const playerDiv = document.createElement('div');
				playerDiv.style.cssText = `
					display: flex;
					align-items: center;
					gap: 10px;
					padding: 6px 12px;
					border-radius: 16px;
					background: ${hasCompleted ? 'rgba(100,200,100,0.10)' : 'rgba(0,0,0,0.2)'};
					border: 1px solid ${hasCompleted ? 'rgba(100,200,100,0.25)' : 'rgba(255,255,200,0.05)'};
					flex-wrap: wrap;
				`;
				if (!isAlive) {
					playerDiv.style.opacity = '0.4';
					playerDiv.style.textDecoration = 'line-through';
				}

				const info = document.createElement('div');
				info.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:600;min-width:70px;';
				const nameColor = isSelf ? '#ffdd77' : '#aac';
				info.innerHTML = `
					<span style="color:${nameColor};">${p.user}</span>
					<span style="background:rgba(0,0,0,0.3);padding:0 8px;border-radius:12px;font-size:13px;">❤️ ${p.life}</span>
					${!isAlive ? '<span style="color:#ff6b6b;font-size:12px;">已淘汰</span>' : ''}
					${hasCompleted ? '<span style="color:#8f8;font-size:12px;">✓ 已换</span>' : ''}
					${!hasCompleted && isAlive && state.phase === 'exchange' ? `<span style="color:#ffdd77;font-size:12px;">⏳ ${p.remainingSeconds}s</span>` : ''}
				`;
				playerDiv.appendChild(info);

				const handDiv = document.createElement('div');
				handDiv.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;flex:1;';
				const hand = p.hand || [];
				const showBack = !(isSelf || state.phase === 'settlement' || state.phase === 'ended');

				for (let idx = 0; idx < HAND_SIZE; idx++) {
					const card = hand[idx];
					const cardDiv = document.createElement('div');
					cardDiv.style.cssText = `
						width: 48px;
						height: 68px;
						border-radius: 6px;
						display: flex;
						flex-direction: column;
						align-items: center;
						justify-content: center;
						font-size: 16px;
						font-weight: 700;
						box-shadow: 0 2px 6px rgba(0,0,0,0.4);
						transition: 0.1s;
						cursor: default;
						user-select: none;
					`;
					if (showBack || !card || card.hidden) {
						cardDiv.style.background = 'linear-gradient(135deg, #1a3a6a, #2a5a9a)';
						cardDiv.style.backgroundImage = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 6px, rgba(255,255,255,0.12) 6px, rgba(255,255,255,0.12) 12px)';
						cardDiv.textContent = '?';
						cardDiv.style.color = 'rgba(255,255,255,0.2)';
					} else {
						const isRed = (card.suit === '🐟' || card.suit === '🐒');
						cardDiv.style.background = '#fff';
						cardDiv.style.color = isRed ? '#cc0000' : '#1a1a1a';
						const rankSpan = document.createElement('span');
						rankSpan.textContent = card.rank;
						const suitSpan = document.createElement('span');
						suitSpan.textContent = card.suit;
						suitSpan.style.fontSize = '12px';
						cardDiv.appendChild(rankSpan);
						cardDiv.appendChild(suitSpan);

						if (isSelf && isAlive && state.phase === 'exchange' && !hasCompleted) {
							cardDiv.style.cursor = 'pointer';
							const selected = self._selectedIndices.includes(idx);
							if (selected) {
								cardDiv.style.border = '3px solid #ffdd77';
								cardDiv.style.boxShadow = '0 0 12px rgba(255,220,100,0.6)';
							} else {
								// 【由Ya修改】保持卡牌边框粗细不变
								cardDiv.style.border = '3px solid transparent';
							}
							cardDiv.onclick = (function (idx) {
								return function (e) {
									e.stopPropagation();
									self._toggleSelect(idx);
								};
							})(idx);
						}
					}
					handDiv.appendChild(cardDiv);
				}
				playerDiv.appendChild(handDiv);

				const historyStr = p.exchangeHistoryStr || '';
				const statusSpan = document.createElement('div');
				statusSpan.style.cssText = 'font-size:12px;color:#aac;white-space:nowrap;';
				if (historyStr) {
					statusSpan.textContent = `换牌：${historyStr}`;
				} else {
					const hasAnyCompleted = state.currentExchangeRound > 1;
					statusSpan.textContent = hasAnyCompleted ? '换牌：—' : '换牌：尚未开始';
				}
				playerDiv.appendChild(statusSpan);

				container.appendChild(playerDiv);
			}
		}

		_toggleSelect(idx) {
			const self = this;
			const state = self._state;
			if (!state) return;
			const myId = parseInt(state.id, 10);
			if (isNaN(myId)) return;
			const player = state.players[myId];
			if (!player || !player.alive) return;
			if (state.phase !== 'exchange') return;
			if (player.hasCompletedThisRound) return;

			const pos = self._selectedIndices.indexOf(idx);
			if (pos >= 0) {
				self._selectedIndices.splice(pos, 1);
			} else {
				if (self._selectedIndices.length >= 5) {
					alert('一次最多选择5张');
					return;
				}
				self._selectedIndices.push(idx);
			}
			self._renderPlayers(state);
			self._renderActions(state);
		}

		_renderActions(state) {
			const panel = this._actionPanel;
			panel.innerHTML = '';
			const myId = parseInt(state.id, 10);
			if (isNaN(myId)) return;
			const isAlive = state.players[myId]?.alive || false;
			const isEnded = state.phase === 'ended' || state.end;

			if (isEnded) {
				const span = document.createElement('span');
				span.textContent = '游戏已结束';
				panel.appendChild(span);
				return;
			}

			if (state.phase === 'settlement') {
				const span = document.createElement('span');
				span.textContent = '⏳ 结算中，请等待...';
				panel.appendChild(span);
				return;
			}

			if (state.phase === 'exchange') {
				const player = state.players[myId];
				if (!isAlive) {
					const span = document.createElement('span');
					span.textContent = '您已淘汰';
					panel.appendChild(span);
					return;
				}
				if (player.hasCompletedThisRound) {
					const span = document.createElement('span');
					span.textContent = '✅ 已完成本轮换牌，等待其他玩家';
					panel.appendChild(span);
					return;
				}

				const exchangeBtn = document.createElement('button');
				exchangeBtn.textContent = '🔄 换牌';
				exchangeBtn.style.cssText = `
					padding: 8px 24px;
					border-radius: 40px;
					border: none;
					background: #2a6a3a;
					color: white;
					font-weight: 600;
					font-size: 16px;
					cursor: pointer;
					box-shadow: 0 4px 0 #1a3a2a;
				`;
				exchangeBtn.disabled = (this._selectedIndices.length === 0);
				exchangeBtn.addEventListener('click', () => {
					const indices = this._selectedIndices.slice();
					if (indices.length === 0) return;
					this.send({
						action: 'exchange',
						body: { discardIndices: indices }
					});
					this._selectedIndices = [];
				});
				panel.appendChild(exchangeBtn);

				const zeroBtn = document.createElement('button');
				zeroBtn.textContent = '⏭️ 不换牌 (0张)';
				zeroBtn.style.cssText = `
					padding: 6px 16px;
					border-radius: 30px;
					border: none;
					background: #3a5a6a;
					color: white;
					font-size: 14px;
					cursor: pointer;
				`;
				zeroBtn.addEventListener('click', () => {
					if (confirm('确定本轮不换牌吗？')) {
						this.send({
							action: 'exchange',
							body: { discardIndices: [] }
						});
						this._selectedIndices = [];
					}
				});
				panel.appendChild(zeroBtn);

				const clearBtn = document.createElement('button');
				clearBtn.textContent = '取消选择';
				clearBtn.style.cssText = `
					padding: 6px 16px;
					border-radius: 30px;
					border: none;
					background: #6a3a3a;
					color: white;
					font-size: 14px;
					cursor: pointer;
				`;
				clearBtn.addEventListener('click', () => {
					this._selectedIndices = [];
					this._renderPlayers(this._state);
					this._renderActions(this._state);
				});
				panel.appendChild(clearBtn);

				const concedeBtn = document.createElement('button');
				concedeBtn.textContent = '🏳️ 认输';
				concedeBtn.style.cssText = `
					padding: 6px 16px;
					border-radius: 30px;
					border: none;
					background: #8a2a2a;
					color: white;
					font-size: 14px;
					cursor: pointer;
					margin-left: auto;
				`;
				concedeBtn.addEventListener('click', () => {
					if (confirm('确定认输吗？')) {
						this.send({ action: 'concede', body: {} });
					}
				});
				panel.appendChild(concedeBtn);
			}
		}

		// ---------- 关键修改：结算展示高亮最大牌型 ----------
		_renderSettlement(state) {
			const div = this._settlementDiv;
			if (!div) return;
			if (state.phase === 'settlement' || state.phase === 'ended') {
				if (state.settlementDetail && state.settlementDetail.length > 0) {
					div.style.display = 'block';
					div.innerHTML = '';
					const title = document.createElement('div');
					title.style.cssText = 'font-weight:bold;margin-bottom:4px;color:#ffdd77;';
					title.textContent = '📊 牌型详情（⭐ 获胜牌型高亮）';
					div.appendChild(title);
					for (const d of state.settlementDetail) {
						if (!d) continue;
						const row = document.createElement('div');
						row.style.cssText = `
							display: flex;
							align-items: center;
							gap: 8px;
							padding: 4px 8px;
							border-bottom: 1px solid rgba(255,255,200,0.05);
							border-radius: 8px;
							transition: 0.1s;
							${d.isWinner ? `
								background: rgba(255,215,0,0.15);
								border: 1px solid #ffdd77;
								box-shadow: 0 0 8px rgba(255,215,0,0.3);
								font-weight: bold;
							` : ''}
						`;
						const handStr = d.hand.map(c => c.display).join(' ');
						const winnerMark = d.isWinner ? '⭐' : '';
						row.innerHTML = `
							<span style="font-weight:${d.isWinner ? '700' : '400'};color:${d.isWinner ? '#ffdd77' : '#aac'};">${d.user}</span>
							<span style="color:${d.isWinner ? '#ffdd77' : '#aac'};font-weight:${d.isWinner ? '700' : '400'};">${d.typeName}</span>
							<span style="font-size:12px;color:#889;">${handStr}</span>
							<span style="margin-left:auto;">${winnerMark}</span>
						`;
						div.appendChild(row);
					}
				} else {
					div.style.display = 'none';
				}
			} else {
				div.style.display = 'none';
			}
		}

		send(data) { /* 由框架注入 */ }
	}

	// ---------- 注册游戏 ----------
	if (typeof games !== 'undefined' && Array.isArray(games)) {
		games.push({
			name: GAME_NAME,
			rule: FairExchangeRule,
			renderer: FairExchangeRenderer,
		});
	} else {
		console.warn('games 数组未定义，请确保在框架中运行');
	}
})();