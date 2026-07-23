// 幸运牌 · 多人对战（2-8人）
// 规则：每人4张手牌，弃2张，然后发5张公共牌，选最优5张梭哈牌型，未获最大牌型者扣1生命，归零淘汰，最终一人获胜。
// 弃牌阶段：自己可见弃牌（高亮），其他玩家仍看到完整4张手牌，且看不到弃牌。
(function () {
	'use strict';

	const GAME_NAME = '幸运牌';
	const SUITS = ['🐼', '🐟', '🐅', '🐒'];   // 熊猫、中华鲟、东北虎、金丝猴
	const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
	const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
	const HAND_SIZE = 4;
	const DISCARD_SIZE = 2;
	const COMMUNITY_SIZE = 5;
	const INIT_LIFE = 5;
	const TURN_TIMEOUT_SECONDS = 120;
	const SHOWDOWN_DELAY_MS = 5000;   // 结算展示5秒
	const PUBLIC_INTERVAL_MS = 1000;   // 公共牌每轮间隔1秒

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

	// ---------- 梭哈牌型评估（复用） ----------
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

	// 从7张牌中选最优5张组合
	function getBestFiveFromSeven(cards) {
		if (cards.length < 5) return null;
		let best = null;
		const n = cards.length;
		const comb = (arr, k) => {
			if (k === 0) return [[]];
			if (arr.length < k) return [];
			const [first, ...rest] = arr;
			const withFirst = comb(rest, k - 1).map(c => [first, ...c]);
			const withoutFirst = comb(rest, k);
			return [...withFirst, ...withoutFirst];
		};
		const allComb = comb(cards, 5);
		for (const combo of allComb) {
			const evalRes = evaluateHand(combo);
			if (!best || compareHands(evalRes, best) > 0) {
				best = evalRes;
			}
		}
		return best;
	}

	// ---------- 游戏规则类 ----------
	class LuckyCardRule extends GameRule {
		name = GAME_NAME;
		maxN = 8;
		minN = 2;
		allowedN(n) { return n >= 2 && n <= 8; }

		constructor() {
			super();
			this._timerId = null;
			this._publicTimerId = null;
			this._showdownTimerId = null;
		}

		// ---------- 计时器 ----------
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
			if (this._publicTimerId) {
				clearTimeout(this._publicTimerId);
				this._publicTimerId = null;
			}
			if (this._showdownTimerId) {
				clearTimeout(this._showdownTimerId);
				this._showdownTimerId = null;
			}
		}

		_handleTimeout() {
			const self = this;
			const state = self.state;
			if (state.phase !== 'discard' || state.end) return;

			for (let i = 0; i < state.players.length; i++) {
				const p = state.players[i];
				if (p.alive && !p.hasDiscarded) {
					self._eliminatePlayer(i, '超时未弃牌');
				}
			}
			self._checkDiscardComplete();
		}

		// ---------- 淘汰玩家 ----------
		_eliminatePlayer(idx, reason) {
			const self = this;
			const state = self.state;
			const player = state.players[idx];
			if (!player.alive) return false;
			player.alive = false;
			player.life = 0;
			player.hasDiscarded = true; // 标记为已完成，避免重复

			const aliveCount = state.players.filter(p => p.alive).length;
			if (aliveCount <= 1) {
				state.phase = 'ended';
				state.end = true;
				state.winner = aliveCount === 1 ? state.players.findIndex(p => p.alive) : -1;
				state.message = (state.winner !== -1 ? state.players[state.winner].user : '无') + ' 获得最终胜利！';
				self._clearTimer();
				self.pushState();
				return true;
			}
			return false;
		}

		// ---------- 初始化 ----------
		init(users) {
			const self = this;
			self._clearTimer();

			const n = users.length;
			const deck = createShuffledDeck();

			const players = users.map((u, i) => {
				const hand = [];
				for (let j = 0; j < HAND_SIZE; j++) {
					if (deck.length > 0) hand.push(deck.pop());
				}
				return {
					user: u.user,
					life: INIT_LIFE,
					alive: true,
					hand: hand.slice(),          // 剩余手牌（弃牌后减少）
					originalHand: hand.slice(),  // 原始4张，用于其他玩家视角
					discard: [],
					hasDiscarded: false,
					bestHand: null,
					bestEval: null,
				};
			});

			const state = {
				phase: 'discard',
				end: false,
				n: n,
				round: 1,
				players: players,
				deck: deck,
				community: [],
				publicStep: 0,
				message: '请弃牌（选择2张舍弃）',
				winner: null,
				roundStartTimestamp: 0,
				settlementDetail: null,
			};
			self.state = state;
			self._startTimer();
			self.pushState();
		}

		// ---------- 接收消息 ----------
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
					self._checkDiscardComplete();
					self.send({ ok: true, msg: '你已认输，继续游戏' }, id);
				}
				return;
			}

			if (action === 'timeout') {
				self._handleTimeout();
				return;
			}

			// 弃牌阶段
			if (state.phase === 'discard') {
				if (action !== 'discard') {
					self.send('当前是弃牌阶段，请使用 discard 操作', id, true);
					return;
				}
				const player = state.players[id];
				if (!player.alive) {
					self.send('你已被淘汰', id, true);
					return;
				}
				if (player.hasDiscarded) {
					self.send('你已完成弃牌', id, true);
					return;
				}

				const discardIndices = body && body.discardIndices;
				if (!Array.isArray(discardIndices)) {
					self.send('请提供丢弃牌索引数组 discardIndices', id, true);
					return;
				}
				if (discardIndices.length !== DISCARD_SIZE) {
					self.send(`必须弃 ${DISCARD_SIZE} 张牌`, id, true);
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

				// 执行弃牌（从后往前删）
				const sortedIdx = discardIndices.slice().sort((a, b) => b - a);
				const discarded = [];
				for (const idx of sortedIdx) {
					const card = player.hand.splice(idx, 1)[0];
					if (card) {
						player.discard.push(card);
						discarded.push(card);
					}
				}
				player.hasDiscarded = true;

				self.send({ ok: true, msg: `弃牌成功，剩余 ${player.hand.length} 张` }, id);
				self._checkDiscardComplete();
				return;
			}

			if (state.phase === 'public' || state.phase === 'showdown') {
				self.send('当前阶段无需操作，请等待', id, true);
				return;
			}

			self.send('未知操作', id, true);
		}

		// ---------- 检查弃牌是否完成 ----------
		_checkDiscardComplete() {
			const self = this;
			const state = self.state;
			if (state.phase !== 'discard') return;

			const alivePlayers = state.players.filter(p => p.alive);
			if (alivePlayers.length === 0) {
				state.phase = 'ended';
				state.end = true;
				state.message = '游戏结束，无人存活';
				self._clearTimer();
				self.pushState();
				return;
			}

			const allDone = alivePlayers.every(p => p.hasDiscarded);
			if (!allDone) {
				self.pushState();
				return;
			}

			self._startPublicPhase();
		}

		// ---------- 公共牌发放 ----------
		_startPublicPhase() {
			const self = this;
			const state = self.state;
			self._clearTimer();
			state.phase = 'public';
			state.publicStep = 0;
			state.message = '公共牌发放中...';
			self.pushState();
			self._doPublicStep();
		}

		_doPublicStep() {
			const self = this;
			const state = self.state;
			if (state.phase !== 'public' || state.end) return;

			const currentStep = state.publicStep;
			let count = 0;
			if (currentStep === 0) {
				count = 3;
			} else if (currentStep === 1 || currentStep === 2) {
				count = 1;
			} else {
				self._startShowdown();
				return;
			}

			const deck = state.deck;
			for (let i = 0; i < count; i++) {
				if (deck.length === 0) {
					state.deck = createShuffledDeck();
				}
				const card = state.deck.pop();
				if (card) state.community.push(card);
			}
			state.publicStep += 1;
			state.message = `公共牌已发 ${state.community.length} 张`;
			self.pushState();

			if (state.community.length >= COMMUNITY_SIZE) {
				self._publicTimerId = setTimeout(() => {
					self._startShowdown();
				}, PUBLIC_INTERVAL_MS);
			} else {
				self._publicTimerId = setTimeout(() => {
					self._doPublicStep();
				}, PUBLIC_INTERVAL_MS);
			}
		}

		// ---------- 结算 ----------
		_startShowdown() {
			const self = this;
			const state = self.state;
			if (state.phase === 'showdown' || state.end) return;
			self._clearTimer();
			state.phase = 'showdown';
			state.message = '结算中...';

			const alivePlayers = state.players.filter(p => p.alive);
			const results = [];
			for (const p of alivePlayers) {
				const allCards = [...p.hand, ...state.community];
				const bestEval = getBestFiveFromSeven(allCards);
				results.push({
					playerIdx: state.players.indexOf(p),
					eval: bestEval,
				});
			}

			let bestEval = null;
			let bestIndices = [];
			for (const res of results) {
				if (!res.eval) continue;
				if (bestEval === null) {
					bestEval = res.eval;
					bestIndices = [res.playerIdx];
				} else {
					const cmp = compareHands(res.eval, bestEval);
					if (cmp > 0) {
						bestEval = res.eval;
						bestIndices = [res.playerIdx];
					} else if (cmp === 0) {
						bestIndices.push(res.playerIdx);
					}
				}
			}

			for (let i = 0; i < state.players.length; i++) {
				const p = state.players[i];
				if (!p.alive) continue;
				if (!bestIndices.includes(i)) {
					p.life -= 1;
					if (p.life <= 0) {
						p.alive = false;
						p.life = 0;
					}
				}
			}

			const detail = results.map(r => {
				const p = state.players[r.playerIdx];
				return {
					user: p.user,
					typeName: r.eval ? r.eval.typeName : '无牌型',
					hand: p.hand.slice(),
					discard: p.discard.slice(),
					isWinner: bestIndices.includes(r.playerIdx),
					life: p.life,
				};
			});
			state.settlementDetail = detail;
			state.message = `结算完成，${bestIndices.map(i => state.players[i].user).join('、')} 获得最大牌型 (${bestEval.typeName})，其余玩家扣1生命。`;

			self.pushState();

			self._showdownTimerId = setTimeout(() => {
				self._finishRound();
			}, SHOWDOWN_DELAY_MS);
		}

		_finishRound() {
			const self = this;
			const state = self.state;
			self._clearTimer();

			const alivePlayers = state.players.filter(p => p.alive);
			if (alivePlayers.length <= 1) {
				state.phase = 'ended';
				state.end = true;
				state.winner = alivePlayers.length === 1 ? state.players.indexOf(alivePlayers[0]) : -1;
				state.message = (state.winner !== -1 ? state.players[state.winner].user : '无') + ' 获得最终胜利！';
				self.pushState();
				return;
			}

			self._startNextRound();
		}

		_startNextRound() {
			const self = this;
			const state = self.state;
			self._clearTimer();

			state.round += 1;
			const deck = createShuffledDeck();
			for (let i = 0; i < state.players.length; i++) {
				const p = state.players[i];
				if (!p.alive) {
					p.hand = [];
					p.originalHand = [];
					p.discard = [];
					continue;
				}
				const newHand = [];
				for (let j = 0; j < HAND_SIZE; j++) {
					if (deck.length > 0) newHand.push(deck.pop());
				}
				p.hand = newHand.slice();
				p.originalHand = newHand.slice();
				p.discard = [];
				p.hasDiscarded = false;
				p.bestHand = null;
				p.bestEval = null;
			}
			state.deck = deck;
			state.community = [];
			state.publicStep = 0;
			state.phase = 'discard';
			state.end = false;
			state.message = `第 ${state.round} 局开始，请弃牌（选择2张舍弃）`;
			state.settlementDetail = null;
			self._startTimer();
			self.pushState();
		}

		// ---------- 状态投影 ----------
		projection(id) {
			const state = this.state;
			const now = Date.now();
			let remainingSeconds = null;
			if (state.phase === 'discard' && !state.end) {
				const elapsed = (now - state.roundStartTimestamp) / 1000;
				remainingSeconds = Math.max(0, Math.floor(TURN_TIMEOUT_SECONDS - elapsed));
			}

			// 判断是否处于隐藏弃牌阶段（弃牌和公共牌阶段，且未结束）
			const isHiddenPhase = (state.phase === 'discard' || state.phase === 'public') && !state.end;
			const showDiscard = (state.phase === 'showdown' || state.phase === 'ended');

			const projectedPlayers = state.players.map((p, idx) => {
				const isSelf = (idx === id);
				let displayHand, displayDiscard;

				if (isSelf) {
					// 自己总是看到剩余手牌和弃牌（如果有）
					displayHand = p.hand.map(c => ({ ...c }));
					displayDiscard = p.discard.map(c => ({ ...c }));
				} else {
					if (isHiddenPhase) {
						// 其他玩家在弃牌/公共牌阶段看到原始4张，且看不到弃牌
						displayHand = p.originalHand.map(c => ({ ...c }));
						displayDiscard = [];
					} else if (showDiscard) {
						// 结算或结束，所有人都看到剩余手牌和弃牌
						displayHand = p.hand.map(c => ({ ...c }));
						displayDiscard = p.discard.map(c => ({ ...c }));
					} else {
						// 其他情况（理论上不会发生），回退到原始手牌
						displayHand = p.originalHand.map(c => ({ ...c }));
						displayDiscard = [];
					}
				}

				return {
					user: p.user,
					life: p.life,
					alive: p.alive,
					hand: displayHand,
					discard: displayDiscard,
					hasDiscarded: p.hasDiscarded,
					remainingSeconds: (p.alive && !p.hasDiscarded && state.phase === 'discard') ? remainingSeconds : 0,
				};
			});

			let settlementDetail = null;
			if (state.phase === 'showdown' || state.phase === 'ended') {
				if (state.settlementDetail) {
					settlementDetail = state.settlementDetail.map(d => ({
						user: d.user,
						typeName: d.typeName,
						hand: d.hand.map(c => ({ ...c })),
						discard: d.discard.map(c => ({ ...c })),
						isWinner: d.isWinner,
						life: d.life,
					}));
				}
			}

			return {
				id: id,
				end: state.end,
				phase: state.phase,
				round: state.round,
				players: projectedPlayers,
				community: state.community.map(c => ({ ...c })),
				publicStep: state.publicStep,
				message: state.message || '',
				winner: state.winner,
				remainingSeconds: remainingSeconds,
				settlementDetail: settlementDetail,
				// ----- 修复倒计时：透传开局时间戳 -----
				roundStartTimestamp: state.roundStartTimestamp,
			};
		}

		// ---------- 规则说明 ----------
		rule() {
			return `
				<h1>${GAME_NAME}</h1>
				<ul>
					<li><b>游戏人数：</b>2-8人</li>
					<li><b>作者：</b>saiwei</li>
					<li><b>初始生命：</b>5点</li>
					<li><b>牌组：</b>标准52张扑克牌（无大小王），花色：🐼 熊猫、🐟 中华鲟、🐅 东北虎、🐒 金丝猴。</li>
				</ul>
				<h2>流程</h2>
				<ul>
					<li>每局开始，每人发4张手牌，<b>全员公开</b>。</li>
					<li>弃牌阶段：每位玩家从自身手牌中挑选 <b>2张</b> 舍弃，弃牌选择仅本人知晓，结算后公示。</li>
					<li>所有存活玩家完成弃牌后，分三轮发放公共牌：先3张，再1张，再1张，共5张，每轮间隔1秒。</li>
					<li>每位玩家用剩余2张手牌 + 5张公共牌，组成最优5张梭哈牌型。</li>
					<li>结算展示5秒，显示所有手牌、弃牌和公共牌，未获得最大牌型的玩家各扣1生命。</li>
					<li>生命归零淘汰，仅剩一人时游戏结束。</li>
					<li>每回合限时120秒，超时未弃牌者直接淘汰。</li>
				</ul>
			`;
		}
	}

	// ---------- 渲染器 ----------
	class LuckyCardRenderer extends GameRenderer {
		extractState(data) {
			if (data && data.type === 'state' && data.body) return data.body;
			if (data && (data.id !== undefined || data.phase)) return data;
			return null;
		}

		init(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) {
				console.error('幸运牌：无效初始数据', data);
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
				max-width: 820px;
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
			header.innerHTML = `<span>🃏 ${GAME_NAME}</span><span style="font-size:14px;font-weight:400;color:#aac;">第 ${state.round} 局 · ${state.players.length}人</span>`;
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
			roundInfo.textContent = `第 ${state.round} 局`;
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

			const communityContainer = document.createElement('div');
			communityContainer.id = 'community-container';
			communityContainer.style.cssText = `
				display: flex;
				justify-content: center;
				gap: 6px;
				margin: 8px 0 12px 0;
				padding: 8px 0;
				background: rgba(0,0,0,0.2);
				border-radius: 20px;
				min-height: 70px;
				align-items: center;
			`;
			wrapper.appendChild(communityContainer);

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
				max-height: 240px;
				overflow-y: auto;
			`;
			wrapper.appendChild(settlementDiv);

			self._roundInfo = roundInfo;
			self._turnInfo = turnInfo;
			self._globalTimer = globalTimer;
			self._communityContainer = communityContainer;
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

			// 倒计时
			if (state.phase === 'discard' && !state.end) {
				if (!self._timerInterval) {
					self._timerInterval = setInterval(() => {
						if (self._state && self._state.phase === 'discard' && !self._state.end) {
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
				if (state.phase === 'showdown' && !state.end) {
					if (self._globalTimer) {
						self._globalTimer.textContent = '⏳ 展示中';
						self._globalTimer.style.color = '#ffdd77';
					}
				} else {
					if (self._globalTimer) {
						self._globalTimer.textContent = '--';
					}
				}
			}

			if (self._roundInfo) {
				self._roundInfo.textContent = `第 ${state.round} 局 · ${state.players.length}人`;
			}
			if (self._turnInfo) {
				let msg = state.message || '';
				if (state.phase === 'discard') {
					const submitted = state.players.filter(p => p.alive && p.hasDiscarded).length;
					const total = state.players.filter(p => p.alive).length;
					msg += ` (已弃牌 ${submitted}/${total})`;
				}
				self._turnInfo.textContent = msg;
			}

			self._renderCommunity(state);
			self._renderPlayers(state);
			self._renderActions(state);
			self._renderSettlement(state);

			if (!isPlaying || state.end) {
				self._globalTimer.classList.add('nodisplay');
				self._actionPanel.classList.add('nodisplay');
			} else {
				if (state.phase === 'discard' || state.phase === 'public') {
					self._globalTimer.classList.remove('nodisplay');
				} else {
					self._globalTimer.classList.add('nodisplay');
				}
				if (state.phase === 'discard' && !state.end) {
					self._actionPanel.classList.remove('nodisplay');
				} else {
					self._actionPanel.classList.add('nodisplay');
				}
			}
		}

		_renderCommunity(state) {
			const container = this._communityContainer;
			container.innerHTML = '';
			const community = state.community || [];
			const label = document.createElement('span');
			label.textContent = '公共牌：';
			label.style.cssText = 'font-weight:600;color:#aac;margin-right:6px;';
			container.appendChild(label);

			if (community.length === 0) {
				const empty = document.createElement('span');
				empty.textContent = '尚未发牌';
				empty.style.color = '#667';
				container.appendChild(empty);
			} else {
				for (const card of community) {
					const cardDiv = document.createElement('div');
					cardDiv.style.cssText = `
						width: 48px;
						height: 68px;
						border-radius: 6px;
						background: #fff;
						display: flex;
						flex-direction: column;
						align-items: center;
						justify-content: center;
						font-size: 16px;
						font-weight: 700;
						box-shadow: 0 2px 6px rgba(0,0,0,0.4);
						color: ${(card.suit === '🐟' || card.suit === '🐒') ? '#cc0000' : '#1a1a1a'};
					`;
					const rankSpan = document.createElement('span');
					rankSpan.textContent = card.rank;
					const suitSpan = document.createElement('span');
					suitSpan.textContent = card.suit;
					suitSpan.style.fontSize = '12px';
					cardDiv.appendChild(rankSpan);
					cardDiv.appendChild(suitSpan);
					container.appendChild(cardDiv);
				}
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

			const isDiscardPhase = (state.phase === 'discard' && !state.end);
			const showDiscard = (state.phase === 'showdown' || state.phase === 'ended');

			for (let i = 0; i < state.players.length; i++) {
				const p = state.players[i];
				const isSelf = (i === currentPlayerId);
				const isAlive = p.alive;
				const hasDiscarded = p.hasDiscarded;

				const playerDiv = document.createElement('div');
				playerDiv.style.cssText = `
					display: flex;
					align-items: center;
					gap: 10px;
					padding: 6px 12px;
					border-radius: 16px;
					background: ${hasDiscarded && isAlive ? 'rgba(100,200,100,0.10)' : 'rgba(0,0,0,0.2)'};
					border: 1px solid ${hasDiscarded && isAlive ? 'rgba(100,200,100,0.25)' : 'rgba(255,255,200,0.05)'};
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
					${hasDiscarded && isAlive ? '<span style="color:#8f8;font-size:12px;">✓ 已弃牌</span>' : ''}
					${!hasDiscarded && isAlive && state.phase === 'discard' ? `<span style="color:#ffdd77;font-size:12px;">⏳ ${p.remainingSeconds}s</span>` : ''}
				`;
				playerDiv.appendChild(info);

				// 手牌区域
				const handDiv = document.createElement('div');
				handDiv.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
				const hand = p.hand || [];

				// 判断是否允许选牌（自己、存活、弃牌阶段、未弃牌）
				const canSelect = isSelf && isAlive && isDiscardPhase && !hasDiscarded;

				for (let idx = 0; idx < hand.length; idx++) {
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
						background: #fff;
						color: ${(card && (card.suit === '🐟' || card.suit === '🐒')) ? '#cc0000' : '#1a1a1a'};
					`;
					if (card) {
						const rankSpan = document.createElement('span');
						rankSpan.textContent = card.rank;
						const suitSpan = document.createElement('span');
						suitSpan.textContent = card.suit;
						suitSpan.style.fontSize = '12px';
						cardDiv.appendChild(rankSpan);
						cardDiv.appendChild(suitSpan);

						if (canSelect) {
							cardDiv.style.cursor = 'pointer';
							const selected = self._selectedIndices.includes(idx);
							if (selected) {
								cardDiv.style.border = '3px solid #ffdd77';
								cardDiv.style.boxShadow = '0 0 12px rgba(255,220,100,0.6)';
							} else {
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

				// ---- 弃牌显示 ----
				// 情况1：自己在弃牌阶段，已弃牌 -> 显示高亮弃牌
				// 情况2：结算或结束时，所有人都显示弃牌（无高亮）
				if (isSelf && isDiscardPhase && hasDiscarded && p.discard && p.discard.length > 0) {
					const discardContainer = document.createElement('div');
					discardContainer.style.cssText = 'display:flex;gap:4px;align-items:center;margin-left:8px;';
					const label = document.createElement('span');
					label.textContent = '已弃:';
					label.style.cssText = 'font-size:12px;color:#ffdd77;font-weight:600;';
					discardContainer.appendChild(label);
					for (const card of p.discard) {
						const cardDiv = document.createElement('div');
						cardDiv.style.cssText = `
							width: 32px;
							height: 44px;
							border-radius: 4px;
							background: #fff;
							border: 3px solid #ff6b6b;
							display: flex;
							flex-direction: column;
							align-items: center;
							justify-content: center;
							font-size: 12px;
							font-weight: 700;
							box-shadow: 0 0 8px rgba(255,100,100,0.6);
							color: ${(card.suit === '🐟' || card.suit === '🐒') ? '#cc0000' : '#1a1a1a'};
						`;
						const rankSpan = document.createElement('span');
						rankSpan.textContent = card.rank;
						const suitSpan = document.createElement('span');
						suitSpan.textContent = card.suit;
						suitSpan.style.fontSize = '10px';
						cardDiv.appendChild(rankSpan);
						cardDiv.appendChild(suitSpan);
						discardContainer.appendChild(cardDiv);
					}
					playerDiv.appendChild(discardContainer);
				} else if (showDiscard && p.discard && p.discard.length > 0) {
					// 结算/结束时展示所有人的弃牌（非高亮）
					const discardDiv = document.createElement('div');
					discardDiv.style.cssText = 'display:flex;gap:4px;align-items:center;margin-left:8px;';
					const label = document.createElement('span');
					label.textContent = '弃:';
					label.style.cssText = 'font-size:12px;color:#aac;';
					discardDiv.appendChild(label);
					for (const card of p.discard) {
						const cardDiv = document.createElement('div');
						cardDiv.style.cssText = `
							width: 32px;
							height: 44px;
							border-radius: 4px;
							background: #fff;
							display: flex;
							flex-direction: column;
							align-items: center;
							justify-content: center;
							font-size: 12px;
							font-weight: 700;
							box-shadow: 0 1px 4px rgba(0,0,0,0.3);
							color: ${(card.suit === '🐟' || card.suit === '🐒') ? '#cc0000' : '#1a1a1a'};
							border: 1px solid #ccc;
						`;
						const rankSpan = document.createElement('span');
						rankSpan.textContent = card.rank;
						const suitSpan = document.createElement('span');
						suitSpan.textContent = card.suit;
						suitSpan.style.fontSize = '10px';
						cardDiv.appendChild(rankSpan);
						cardDiv.appendChild(suitSpan);
						discardDiv.appendChild(cardDiv);
					}
					playerDiv.appendChild(discardDiv);
				}

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
			if (state.phase !== 'discard') return;
			if (player.hasDiscarded) return;

			const pos = self._selectedIndices.indexOf(idx);
			if (pos >= 0) {
				self._selectedIndices.splice(pos, 1);
			} else {
				if (self._selectedIndices.length >= DISCARD_SIZE) {
					yaGameAlert(`最多选择 ${DISCARD_SIZE} 张`);
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

			if (state.phase === 'public' || state.phase === 'showdown') {
				const span = document.createElement('span');
				span.textContent = '⏳ 等待...';
				panel.appendChild(span);
				return;
			}

			if (state.phase === 'discard') {
				const player = state.players[myId];
				if (!isAlive) {
					const span = document.createElement('span');
					span.textContent = '您已淘汰';
					panel.appendChild(span);
					return;
				}
				if (player.hasDiscarded) {
					const span = document.createElement('span');
					span.textContent = '✅ 已完成弃牌，等待其他玩家';
					panel.appendChild(span);
					return;
				}

				const discardBtn = document.createElement('button');
				discardBtn.textContent = '✋ 弃牌';
				discardBtn.style.cssText = `
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
				discardBtn.disabled = (this._selectedIndices.length !== DISCARD_SIZE);
				discardBtn.addEventListener('click', () => {
					const indices = this._selectedIndices.slice();
					if (indices.length !== DISCARD_SIZE) {
						yaGameAlert(`请选择 ${DISCARD_SIZE} 张牌`);
						return;
					}
					this.send({
						action: 'discard',
						body: { discardIndices: indices }
					});
					this._selectedIndices = [];
				});
				panel.appendChild(discardBtn);

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
					if (yaGameConfirm('确定认输吗？')) {
						this.send({ action: 'concede', body: {} });
					}
				});
				panel.appendChild(concedeBtn);
			}
		}

		_renderSettlement(state) {
			const div = this._settlementDiv;
			if (!div) return;
			if (state.phase === 'showdown' || state.phase === 'ended') {
				if (state.settlementDetail && state.settlementDetail.length > 0) {
					div.style.display = 'block';
					div.innerHTML = '';
					const title = document.createElement('div');
					title.style.cssText = 'font-weight:bold;margin-bottom:4px;color:#ffdd77;';
					title.textContent = '📊 结算详情（⭐ 最大牌型免扣）';
					div.appendChild(title);
					for (const d of state.settlementDetail) {
						const row = document.createElement('div');
						row.style.cssText = `
							display: flex;
							align-items: center;
							gap: 8px;
							padding: 4px 8px;
							border-bottom: 1px solid rgba(255,255,200,0.05);
							border-radius: 8px;
							${d.isWinner ? `
								background: rgba(255,215,0,0.15);
								border: 1px solid #ffdd77;
								box-shadow: 0 0 8px rgba(255,215,0,0.3);
								font-weight: bold;
							` : ''}
						`;
						const handStr = d.hand.map(c => c.display).join(' ');
						const discardStr = d.discard.length > 0 ? ' 弃: ' + d.discard.map(c => c.display).join(' ') : '';
						const winnerMark = d.isWinner ? '⭐' : '❌';
						row.innerHTML = `
							<span style="font-weight:${d.isWinner ? '700' : '400'};color:${d.isWinner ? '#ffdd77' : '#aac'};">${d.user}</span>
							<span style="color:${d.isWinner ? '#ffdd77' : '#aac'};font-weight:${d.isWinner ? '700' : '400'};">${d.typeName}</span>
							<span style="font-size:12px;color:#889;">${handStr}${discardStr}</span>
							<span style="margin-left:auto;">❤️${d.life} ${winnerMark}</span>
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
			rule: LuckyCardRule,
			renderer: LuckyCardRenderer,
		});
	} else {
		console.warn('games 数组未定义，请确保在框架中运行');
	}
})();