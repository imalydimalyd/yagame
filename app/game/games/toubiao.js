// 投标牌 · 双人对战（隐藏对方筹码 + 实时显示最佳牌型）
// 规则：商品拍卖，每轮同时下注，逐件结算，最终梭哈比牌
(function () {
	'use strict';

	const GAME_NAME = '投标牌';
	const SUITS = ['🐼', '🐟', '🐅', '🐒'];
	const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
	const RANK_VALUES = {
		'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
		'8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
	};
	const INIT_CHIPS = 30;
	const MAX_ROUNDS = 5;
	const MIN_ITEM_GROUPS = 5;
	const MAX_ITEM_GROUPS = 10;
	const MIN_CARDS_PER_GROUP = 1;
	const MAX_CARDS_PER_GROUP = 5;
	const TURN_TIMEOUT_SECONDS = 300;
	const SETTLEMENT_DELAY_MS = 1500;

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
		return shuffle(deck);
	}

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

	// 返回最佳牌型的牌面（5张或全部）以及牌型名称
	function getBestHandInfo(hand) {
		if (hand.length === 0) {
			return { cards: [], typeName: '无牌' };
		}
		if (hand.length < 5) {
			// 不足5张，全部显示，牌型视为最小
			return { cards: hand.slice(), typeName: '不足5张' };
		}
		// 枚举所有5张组合找出最佳
		let best = null;
		let bestCards = null;
		const indices = hand.map((_, i) => i);
		const combos = [];
		const choose = (start, selected) => {
			if (selected.length === 5) {
				combos.push(selected.slice());
				return;
			}
			for (let i = start; i < hand.length; i++) {
				selected.push(i);
				choose(i + 1, selected);
				selected.pop();
			}
		};
		choose(0, []);
		for (const combo of combos) {
			const subHand = combo.map(i => hand[i]);
			const evalRes = evaluateHand(subHand);
			if (best === null || compareHands(evalRes, best) > 0) {
				best = evalRes;
				bestCards = subHand;
			}
		}
		return { cards: bestCards, typeName: best.typeName };
	}

	class BiddingGameRule extends GameRule {
		name = GAME_NAME;
		maxN = 2;
		minN = 2;
		allowedN(n) { return n === 2; }

		constructor() {
			super();
			this._timerId = null;
			this._settleTimerId = null;
		}

		_startTimer() {
			this._clearTimer();
			const state = this.state;
			if (state.phase === 'ended' || state.end) return;
			state.turnStartTimestamp = Date.now();
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
			if (state.phase === 'ended' || state.end) return;
			let timeoutPlayer = -1;
			for (let i = 0; i < state.players.length; i++) {
				if (!state.players[i].submitted) {
					timeoutPlayer = i;
					break;
				}
			}
			if (timeoutPlayer === -1) return;
			state.end = true;
			state.phase = 'ended';
			state.winner = 1 - timeoutPlayer;
			state.loser = timeoutPlayer;
			state.message = `玩家 ${state.players[timeoutPlayer].user} 超时未提交，判负`;
			self._clearTimer();
			self.pushState();
			self.send({ error: true, err_msg: state.message }, timeoutPlayer);
			self.send({ ok: true, msg: state.message }, state.winner);
		}

		init(users) {
			const self = this;
			self._clearTimer();

			const deck = createDeck();
			let numGroups = randInt(MIN_ITEM_GROUPS, MAX_ITEM_GROUPS);
			let totalCards = 0;
			const groups = [];
			let attempts = 0;
			while (attempts < 100) {
				const tempGroups = [];
				let tempTotal = 0;
				let deckCopy = deck.slice();
				for (let i = 0; i < numGroups; i++) {
					const count = randInt(MIN_CARDS_PER_GROUP, MAX_CARDS_PER_GROUP);
					if (tempTotal + count > 52) break;
					const cards = deckCopy.splice(0, count);
					cards.sort((a, b) => b.value - a.value);
					tempGroups.push({ cards, round: 0, owner: -1, winnerBid: null, loserBid: null, publicBid: null });
					tempTotal += count;
				}
				if (tempGroups.length === numGroups && tempTotal <= 52) {
					groups.push(...tempGroups);
					totalCards = tempTotal;
					break;
				}
				attempts++;
				numGroups = randInt(MIN_ITEM_GROUPS, MAX_ITEM_GROUPS);
			}
			if (groups.length === 0) {
				const cards = deck.splice(0, 5);
				cards.sort((a, b) => b.value - a.value);
				groups.push({ cards, round: 0, owner: -1, winnerBid: null, loserBid: null, publicBid: null });
			}

			const totalRounds = Math.min(randInt(1, MAX_ROUNDS), groups.length);
			const itemsPerRound = Math.floor(groups.length / totalRounds);
			let remainder = groups.length % totalRounds;
			let idx = 0;
			for (let r = 0; r < totalRounds; r++) {
				let count = itemsPerRound + (remainder > 0 ? 1 : 0);
				remainder--;
				for (let i = 0; i < count; i++) {
					groups[idx].round = r;
					idx++;
				}
			}

			const players = users.map(u => ({
				user: u.user,
				chips: INIT_CHIPS,
				hand: [],
				bids: new Array(groups.length).fill(0),
				submitted: false,
			}));

			self.state = {
				phase: 'bidding',
				end: false,
				n: 2,
				players: players,
				items: groups,
				totalRounds: totalRounds,
				currentRound: 0,
				roundItems: groups.filter(item => item.round === 0).map((_, i) => i),
				submitted: [false, false],
				settlingIndex: -1,
				settlingDone: false,
				message: '游戏开始，请下注',
				winner: null,
				loser: null,
				turnStartTimestamp: 0,
				settlementStartTimestamp: 0,
			};

			self._updateRoundItems();
			self._startTimer();
			self.pushState();
		}

		_updateRoundItems() {
			const state = this.state;
			state.roundItems = state.items
				.map((item, idx) => ({ ...item, idx }))
				.filter(item => item.round === state.currentRound)
				.map(item => item.idx);
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
				const loser = id;
				const winner = 1 - id;
				state.end = true;
				state.phase = 'ended';
				state.winner = winner;
				state.loser = loser;
				state.message = `玩家 ${state.players[loser].user} 认输`;
				self._clearTimer();
				self.pushState();
				self.send({ error: true, err_msg: '你已认输' }, loser);
				self.send({ ok: true, msg: '对手认输，你获胜' }, winner);
				return;
			}

			if (action === 'timeout') {
				self._handleTimeout();
				return;
			}

			if (state.phase === 'bidding') {
				if (action !== 'submit_bids') {
					self.send('请提交下注 (action: submit_bids)', id, true);
					return;
				}
				const bids = body && body.bids;
				if (!Array.isArray(bids)) {
					self.send('请提供下注数组 bids', id, true);
					return;
				}
				const roundItems = state.roundItems;
				if (bids.length !== roundItems.length) {
					self.send(`下注数量应为 ${roundItems.length}`, id, true);
					return;
				}
				for (const val of bids) {
					if (!Number.isInteger(val) || val < 0) {
						self.send('下注必须为非负整数', id, true);
						return;
					}
				}
				const totalBet = bids.reduce((a, b) => a + b, 0);
				if (totalBet > state.players[id].chips) {
					self.send(`总下注 ${totalBet} 超过剩余筹码 ${state.players[id].chips}`, id, true);
					return;
				}
				const player = state.players[id];
				for (let i = 0; i < roundItems.length; i++) {
					const itemIdx = roundItems[i];
					player.bids[itemIdx] = bids[i];
				}
				player.submitted = true;
				state.submitted[id] = true;
				self.send({ ok: true, msg: '下注已提交' }, id);

				if (state.submitted[0] && state.submitted[1]) {
					state.phase = 'settling';
					state.settlingIndex = 0;
					state.settlingDone = false;
					state.message = '开始结算商品归属';
					self._clearTimer();
					self._settleNextItem();
				} else {
					self._startTimer();
					self.pushState();
				}
				return;
			}

			if (state.phase === 'settling') {
				self.send('结算中，请稍候', id, true);
				return;
			}

			self.send('未知操作', id, true);
		}

		_settleNextItem() {
			const self = this;
			const state = self.state;
			const items = state.items;
			const roundItems = state.roundItems;
			let idx = state.settlingIndex;
			if (idx >= roundItems.length) {
				self._finishRound();
				return;
			}
			const itemIdx = roundItems[idx];
			const item = items[itemIdx];
			const p0 = state.players[0];
			const p1 = state.players[1];
			const bid0 = p0.bids[itemIdx];
			const bid1 = p1.bids[itemIdx];

			p0.chips -= bid0;
			p1.chips -= bid1;

			let winner = -1;
			let loserBid = 0;
			let winnerBid = 0;
			let publicBid = null;

			if (bid0 > bid1) {
				winner = 0;
				winnerBid = bid0;
				loserBid = bid1;
				item.owner = 0;
				p0.hand.push(...item.cards);
				const refund = Math.floor(bid1 / 2);
				p1.chips += refund;
				publicBid = bid0;
				item.winnerBid = bid0;
				item.loserBid = bid1;
				item.publicBid = bid0;
			} else if (bid1 > bid0) {
				winner = 1;
				winnerBid = bid1;
				loserBid = bid0;
				item.owner = 1;
				p1.hand.push(...item.cards);
				const refund = Math.floor(bid0 / 2);
				p0.chips += refund;
				publicBid = bid1;
				item.winnerBid = bid1;
				item.loserBid = bid0;
				item.publicBid = bid1;
			} else {
				item.owner = -1;
				const refund0 = Math.floor(bid0 / 2);
				const refund1 = Math.floor(bid1 / 2);
				p0.chips += refund0;
				p1.chips += refund1;
				publicBid = bid0;
				item.winnerBid = null;
				item.loserBid = null;
				item.publicBid = bid0;
			}

			p0.bids[itemIdx] = 0;
			p1.bids[itemIdx] = 0;

			state.settlingIndex = idx + 1;
			state.message = `结算商品 ${idx + 1}/${roundItems.length}`;
			self.pushState();

			if (self._settleTimerId) clearTimeout(self._settleTimerId);
			self._settleTimerId = setTimeout(() => {
				self._settleNextItem();
			}, SETTLEMENT_DELAY_MS);
		}

		_finishRound() {
			const self = this;
			const state = self.state;
			state.settlingIndex = 0;
			state.settlingDone = true;
			state.submitted = [false, false];
			state.players.forEach(p => p.submitted = false);

			if (state.currentRound + 1 >= state.totalRounds) {
				self._finalCompare();
				return;
			}

			state.currentRound++;
			self._updateRoundItems();
			state.phase = 'bidding';
			state.message = `第 ${state.currentRound + 1} 轮开始，请下注`;
			self._startTimer();
			self.pushState();
			self.send({ ok: true, msg: '进入下一轮' }, 0);
			self.send({ ok: true, msg: '进入下一轮' }, 1);
		}

		_finalCompare() {
			const self = this;
			const state = self.state;
			state.phase = 'ended';
			state.end = true;

			const p0 = state.players[0];
			const p1 = state.players[1];
			let best0 = getBestHandInfo(p0.hand);
			let best1 = getBestHandInfo(p1.hand);

			let winner = -1;
			let msg = '';

			if (best0.cards.length < 5 && best1.cards.length < 5) {
				if (p0.chips > p1.chips) winner = 0;
				else if (p1.chips > p0.chips) winner = 1;
				else winner = -1;
				msg = '双方均不足5张，比较剩余筹码';
			} else if (best0.cards.length < 5) {
				winner = 1;
				msg = `${p0.user} 不足5张，判为最小`;
			} else if (best1.cards.length < 5) {
				winner = 0;
				msg = `${p1.user} 不足5张，判为最小`;
			} else {
				const eval0 = evaluateHand(best0.cards);
				const eval1 = evaluateHand(best1.cards);
				const cmp = compareHands(eval0, eval1);
				if (cmp > 0) winner = 0;
				else if (cmp < 0) winner = 1;
				else {
					if (p0.chips > p1.chips) winner = 0;
					else if (p1.chips > p0.chips) winner = 1;
					else winner = -1;
					msg = '牌型相同，比较剩余筹码';
				}
			}

			if (winner === -1) {
				state.message = `游戏结束：平局！ ${msg}`;
			} else {
				state.winner = winner;
				state.loser = 1 - winner;
				state.message = `🎉 ${state.players[winner].user} 获胜！ ${msg}`;
			}
			self._clearTimer();
			self.pushState();
			self.send({ ok: true, msg: state.message }, 0);
			self.send({ ok: true, msg: state.message }, 1);
		}

		projection(id) {
			const state = this.state;
			const now = Date.now();
			let remainingSeconds = null;
			if (state.phase === 'bidding' && !state.end && state.turnStartTimestamp > 0) {
				const elapsed = (now - state.turnStartTimestamp) / 1000;
				remainingSeconds = Math.max(0, Math.floor(TURN_TIMEOUT_SECONDS - elapsed));
			}

			const items = state.items.map((item, idx) => ({
				cards: item.cards.map(c => ({ ...c })),
				round: item.round,
				owner: item.owner,
				publicBid: item.publicBid,
				winnerBid: item.winnerBid,
				loserBid: item.loserBid,
			}));

			const players = state.players.map(p => ({
				user: p.user,
				chips: p.chips,
				hand: p.hand.map(c => ({ ...c })),
				submitted: p.submitted,
			}));

			return {
				id: id,
				end: state.end,
				phase: state.phase,
				players: players,
				items: items,
				totalRounds: state.totalRounds,
				currentRound: state.currentRound,
				roundItems: state.roundItems.slice(),
				submitted: state.submitted.slice(),
				settlingIndex: state.settlingIndex,
				settlingDone: state.settlingDone,
				message: state.message || '',
				winner: state.winner,
				loser: state.loser,
				remainingSeconds: remainingSeconds,
				turnStartTimestamp: state.turnStartTimestamp,
				settlementStartTimestamp: state.settlementStartTimestamp || 0,
			};
		}

		rule() {
			return `
				<h1>投标牌</h1>
				<ul>
					<li><b>游戏人数：</b>2人（红方、蓝方）</li>
					<li><b>作者：</b>saiwei</li>
					<li><b>初始筹码：</b>30</li>
					<li><b>牌组：</b>标准52张（去大小王），花色：🐼熊猫 🐟中华鲟 🐅东北虎 🐒金丝猴</li>
				</ul>
				<h2>商品与轮次</h2>
				<ul>
					<li>系统随机生成5~10组商品，每组1~5张牌，牌面明牌展示。</li>
					<li>总轮次数1~5轮，商品按轮次分配。</li>
				</ul>
				<h2>下注阶段</h2>
				<ul>
					<li>每轮所有商品同时参与竞拍，双方为每个商品分别下注（非负整数）。</li>
					<li>单轮所有商品下注总额不得超过自身剩余筹码。</li>
					<li>双方提交后，系统逐件结算。</li>
					<li>每轮限时300秒，超时未提交者判负。</li>
				</ul>
				<h2>结算规则</h2>
				<ul>
					<li>比较同一商品双方下注额：</li>
					<li>— 一方更高：高者获得该商品（加入手牌），低者收回下注的一半（向下取整）。获胜方下注金额公开，失败方保密。</li>
					<li>— 平局：双方各收回下注的一半，双方下注金额均公开。</li>
				</ul>
				<h2>最终胜负</h2>
				<ul>
					<li>所有轮次结束后，双方各选5张牌组成最大梭哈牌型比较。</li>
					<li>若不足5张，判为最小牌面。</li>
					<li>牌型大者获胜；牌型相同则比较剩余筹码，多者胜。</li>
				</ul>
			`;
		}
	}

	class BiddingGameRenderer extends GameRenderer {
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
				max-width: 800px;
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
				margin: 10px 0 8px 0;
				padding: 6px 12px;
				background: rgba(0,0,0,0.3);
				border-radius: 60px;
			`;
			wrapper.appendChild(statusBar);

			// 玩家0信息
			const p0Info = document.createElement('div');
			p0Info.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;';
			const myId = state.id;
			const p0ChipsDisplay = (myId === 0) ? state.players[0].chips : '??';
			p0Info.innerHTML = `
				<span id="p0-name" style="color:#ff6b6b;">${state.players[0].user}</span>
				<span id="p0-chips" style="background:rgba(0,0,0,0.3);padding:0 10px;border-radius:20px;">${p0ChipsDisplay}</span>
				<span id="p0-hand-count" style="font-size:12px;color:#aac;">牌:0</span>
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
			timerDisplay.textContent = '300s';
			rightGroup.appendChild(timerDisplay);

			// 玩家1信息
			const p1Info = document.createElement('div');
			p1Info.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;';
			const p1ChipsDisplay = (myId === 1) ? state.players[1].chips : '??';
			p1Info.innerHTML = `
				<span id="p1-hand-count" style="font-size:12px;color:#aac;">牌:0</span>
				<span id="p1-chips" style="background:rgba(0,0,0,0.3);padding:0 10px;border-radius:20px;">${p1ChipsDisplay}</span>
				<span id="p1-name" style="color:#4a8af4;">${state.players[1].user}</span>
			`;
			rightGroup.appendChild(p1Info);
			statusBar.appendChild(rightGroup);

			// ★ 新增：双方最佳牌型展示区域
			const bestHandContainer = document.createElement('div');
			bestHandContainer.id = 'best-hand-container';
			bestHandContainer.style.cssText = `
				display: flex;
				justify-content: space-between;
				gap: 10px;
				margin: 4px 0 8px 0;
				padding: 4px 8px;
				background: rgba(0,0,0,0.2);
				border-radius: 16px;
				font-size: 13px;
				flex-wrap: wrap;
			`;
			wrapper.appendChild(bestHandContainer);

			const p0BestDiv = document.createElement('div');
			p0BestDiv.id = 'p0-best';
			p0BestDiv.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
			bestHandContainer.appendChild(p0BestDiv);

			const p1BestDiv = document.createElement('div');
			p1BestDiv.id = 'p1-best';
			p1BestDiv.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
			bestHandContainer.appendChild(p1BestDiv);

			const itemsContainer = document.createElement('div');
			itemsContainer.id = 'items-container';
			itemsContainer.style.cssText = `
				margin: 6px 0;
				padding: 8px;
				background: rgba(0,0,0,0.2);
				border-radius: 16px;
				max-height: 280px;
				overflow-y: auto;
				display: flex;
				flex-direction: column;
				gap: 6px;
			`;
			wrapper.appendChild(itemsContainer);

			const msgArea = document.createElement('div');
			msgArea.id = 'msg-area';
			msgArea.style.cssText = `
				margin-top: 4px;
				padding: 6px 14px;
				border-radius: 30px;
				background: rgba(0,0,0,0.3);
				font-size: 14px;
				text-align: center;
				min-height: 32px;
				display: flex;
				align-items: center;
				justify-content: center;
				color: #d0d8e0;
			`;
			wrapper.appendChild(msgArea);

			const bidInputArea = document.createElement('div');
			bidInputArea.id = 'bid-input-area';
			bidInputArea.style.cssText = `
				margin: 6px 0;
				padding: 8px;
				background: rgba(0,0,0,0.15);
				border-radius: 16px;
				display: none;
				flex-wrap: wrap;
				gap: 8px;
				justify-content: center;
			`;
			wrapper.appendChild(bidInputArea);

			const actionPanel = document.createElement('div');
			actionPanel.id = 'action-panel';
			actionPanel.style.cssText = `
				display: flex;
				justify-content: center;
				align-items: center;
				gap: 12px;
				flex-wrap: wrap;
				margin-top: 6px;
				padding: 8px 6px;
				background: rgba(0,0,0,0.2);
				border-radius: 40px;
				min-height: 52px;
			`;
			wrapper.appendChild(actionPanel);

			self._p0Chips = document.getElementById('p0-chips');
			self._p0HandCount = document.getElementById('p0-hand-count');
			self._p1Chips = document.getElementById('p1-chips');
			self._p1HandCount = document.getElementById('p1-hand-count');
			self._p0Best = document.getElementById('p0-best');
			self._p1Best = document.getElementById('p1-best');
			self._turnInfo = turnInfo;
			self._timerDisplay = timerDisplay;
			self._msgArea = msgArea;
			self._itemsContainer = itemsContainer;
			self._bidInputArea = bidInputArea;
			self._actionPanel = actionPanel;
			self._myId = state.id;
			self._remainingSeconds = 0;
			self._timerInterval = null;
			self._bidValues = {};

			self.render(data, isPlaying);
		}

		render(data, isPlaying = true) {
			const self = this;
			const state = self.extractState(data);
			if (!state) return;
			self.isPlaying = isPlaying;
			self._state = state;
			const myId = state.id;

			// 更新筹码（自己的显示数字，对方的显示'??'）
			if (self._p0Chips) {
				self._p0Chips.textContent = (myId === 0) ? state.players[0].chips : '??';
			}
			if (self._p1Chips) {
				self._p1Chips.textContent = (myId === 1) ? state.players[1].chips : '??';
			}
			if (self._p0HandCount) self._p0HandCount.textContent = `牌:${state.players[0].hand.length}`;
			if (self._p1HandCount) self._p1HandCount.textContent = `牌:${state.players[1].hand.length}`;

			// ★ 更新双方最佳牌型
			self._updateBestHand(state);

			if (self._turnInfo) {
				if (state.phase === 'ended') {
					if (state.winner !== null && state.winner !== -1) {
						self._turnInfo.textContent = `🏆 ${state.players[state.winner].user} 获胜`;
					} else {
						self._turnInfo.textContent = '🤝 平局';
					}
				} else {
					self._turnInfo.textContent = `第 ${state.currentRound + 1}/${state.totalRounds} 轮 · ${state.phase === 'bidding' ? '下注' : '结算'}`;
				}
			}

			if (state.phase === 'bidding' && !state.end && state.remainingSeconds !== null) {
				self._remainingSeconds = Math.max(0, state.remainingSeconds);
				if (self._timerDisplay) {
					self._timerDisplay.textContent = `⏱ ${self._remainingSeconds}s`;
					self._timerDisplay.style.color = self._remainingSeconds <= 30 ? '#ff6b6b' : '#ffdd77';
				}
				if (!self._timerInterval) {
					self._timerInterval = setInterval(() => {
						self._remainingSeconds = Math.max(0, self._remainingSeconds - 1);
						if (self._timerDisplay) {
							self._timerDisplay.textContent = `⏱ ${self._remainingSeconds}s`;
							if (self._remainingSeconds <= 0) self._timerDisplay.textContent = '⏱ 超时！';
						}
						if (self._remainingSeconds <= 0) clearInterval(self._timerInterval);
					}, 1000);
				}
			} else {
				if (self._timerInterval) {
					clearInterval(self._timerInterval);
					self._timerInterval = null;
				}
				if (self._timerDisplay) {
					self._timerDisplay.textContent = '';
					self._timerDisplay.classList.add('nodisplay');
				}
			}

			if (self._msgArea) {
				self._msgArea.textContent = state.message || ' ';
			}

			self._renderItems(state);
			self._renderBidInputs(state);
			self._renderActions(state);
		}

		// ★ 更新最佳牌型显示
		_updateBestHand(state) {
			const p0 = state.players[0];
			const p1 = state.players[1];
			const p0Info = getBestHandInfo(p0.hand);
			const p1Info = getBestHandInfo(p1.hand);

			this._renderBestHand(this._p0Best, p0.user, p0Info, '#ff6b6b');
			this._renderBestHand(this._p1Best, p1.user, p1Info, '#4a8af4');
		}

		_renderBestHand(container, userName, info, color) {
			container.innerHTML = '';
			const nameSpan = document.createElement('span');
			nameSpan.style.cssText = `font-weight:600;color:${color};margin-right:4px;`;
			nameSpan.textContent = userName + ': ';
			container.appendChild(nameSpan);

			const typeSpan = document.createElement('span');
			typeSpan.style.cssText = 'font-weight:500;color:#ffdd77;margin-right:6px;';
			typeSpan.textContent = info.typeName;
			container.appendChild(typeSpan);

			if (info.cards.length === 0) {
				const emptySpan = document.createElement('span');
				emptySpan.style.cssText = 'color:#889;font-size:12px;';
				emptySpan.textContent = '无牌';
				container.appendChild(emptySpan);
				return;
			}

			for (const card of info.cards) {
				const cardSpan = document.createElement('span');
				cardSpan.style.cssText = `
					display:inline-block;
					background:#fff;
					color:${(card.suit === '🐟' || card.suit === '🐒') ? '#cc0000' : '#1a1a1a'};
					padding:0 4px;
					border-radius:3px;
					font-size:12px;
					font-weight:600;
					margin:0 1px;
				`;
				cardSpan.textContent = card.display;
				container.appendChild(cardSpan);
			}
			if (info.cards.length < 5) {
				const note = document.createElement('span');
				note.style.cssText = 'font-size:11px;color:#aac;margin-left:4px;';
				note.textContent = `(${info.cards.length}张)`;
				container.appendChild(note);
			}
		}

		_renderItems(state) {
			const container = this._itemsContainer;
			container.innerHTML = '';
			const items = state.items;
			const currentRound = state.currentRound;

			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				const isCurrentRound = (item.round === currentRound);
				const isSettling = (state.phase === 'settling');
				const isEnded = state.phase === 'ended';

				const div = document.createElement('div');
				div.style.cssText = `
					display: flex;
					align-items: center;
					gap: 8px;
					padding: 4px 8px;
					border-radius: 8px;
					background: rgba(0,0,0,0.2);
					${isCurrentRound ? 'border: 2px solid #ffdd77;' : 'border: 1px solid rgba(255,255,200,0.05);'}
					${isSettling && isCurrentRound ? 'background: rgba(255,215,0,0.1);' : ''}
				`;
				if (item.owner === 0) {
					div.style.background = 'rgba(200,50,50,0.25)';
				} else if (item.owner === 1) {
					div.style.background = 'rgba(50,100,200,0.25)';
				} else if (item.owner === -1 && (isSettling || isEnded)) {
					div.style.background = 'rgba(128,128,128,0.25)';
				}

				const roundTag = document.createElement('span');
				roundTag.style.cssText = 'font-size:12px;color:#889;min-width:40px;';
				roundTag.textContent = `R${item.round + 1}`;
				div.appendChild(roundTag);

				const cardsDiv = document.createElement('div');
				cardsDiv.style.cssText = 'display:flex;gap:2px;flex-wrap:wrap;flex:1;';
				for (const card of item.cards) {
					const cardSpan = document.createElement('span');
					cardSpan.style.cssText = `
						background: #fff;
						color: ${(card.suit === '🐟' || card.suit === '🐒') ? '#cc0000' : '#1a1a1a'};
						padding: 2px 4px;
						border-radius: 4px;
						font-size: 12px;
						font-weight: 600;
					`;
					cardSpan.textContent = card.display;
					cardsDiv.appendChild(cardSpan);
				}
				div.appendChild(cardsDiv);

				const infoSpan = document.createElement('span');
				infoSpan.style.cssText = 'font-size:12px;color:#aac;white-space:nowrap;';
				if (item.owner !== undefined && item.owner !== -1) {
					const ownerName = item.owner === 0 ? state.players[0].user : state.players[1].user;
					let bidText = '';
					if (item.publicBid !== null) {
						bidText = `💰${item.publicBid}`;
					}
					infoSpan.textContent = `${ownerName} ${bidText}`;
				} else if (item.owner === -1 && (state.phase === 'settling' || state.phase === 'ended')) {
					const bidText = item.publicBid !== null ? `💰${item.publicBid}` : '';
					infoSpan.textContent = `平局 ${bidText}`;
				} else {
					infoSpan.textContent = '';
				}
				div.appendChild(infoSpan);

				container.appendChild(div);
			}
		}

		_renderBidInputs(state) {
			const area = this._bidInputArea;
			if (!area) return;
			area.innerHTML = '';
			const myId = state.id;
			if (myId === -1 || state.phase !== 'bidding' || state.end) {
				area.style.display = 'none';
				return;
			}
			const player = state.players[myId];
			if (player.submitted) {
				area.style.display = 'none';
				return;
			}
			const roundItems = state.roundItems;
			if (roundItems.length === 0) {
				area.style.display = 'none';
				return;
			}
			area.style.display = 'flex';

			const maxTotal = state.players[myId].chips;

			const updateTotalHint = () => {
				let total = 0;
				const inputs = area.querySelectorAll('input[type="number"]');
				inputs.forEach(inp => {
					const val = parseInt(inp.value) || 0;
					total += val;
				});
				const hint = document.getElementById('total-bid-hint');
				if (hint) hint.textContent = `总额: ${total} / ${maxTotal}`;
			};

			for (let i = 0; i < roundItems.length; i++) {
				const itemIdx = roundItems[i];
				const container = document.createElement('div');
				container.style.cssText = 'display:flex;align-items:center;gap:4px;';
				const label = document.createElement('span');
				label.style.cssText = 'font-size:12px;color:#aac;';
				label.textContent = `商品${i + 1}:`;
				const input = document.createElement('input');
				input.type = 'number';
				input.min = 0;
				input.step = 1;
				input.value = this._bidValues[itemIdx] || 0;
				input.style.cssText = 'width:60px;padding:2px 4px;border-radius:4px;border:1px solid #555;background:#222;color:#fff;';
				const eventHandler = (function (idx) {
					return function () {
						let val = parseInt(this.value) || 0;
						if (val < 0) val = 0;
						self._bidValues[idx] = val;
						updateTotalHint();
					};
				})(itemIdx);
				input.addEventListener('input', eventHandler);
				input.addEventListener('change', eventHandler);
				container.appendChild(label);
				container.appendChild(input);
				area.appendChild(container);
			}
			const totalSpan = document.createElement('span');
			totalSpan.id = 'total-bid-hint';
			totalSpan.style.cssText = 'font-size:12px;color:#ffdd77;margin-left:8px;';
			let total = 0;
			for (const key in this._bidValues) total += this._bidValues[key] || 0;
			totalSpan.textContent = `总额: ${total} / ${maxTotal}`;
			area.appendChild(totalSpan);
		}

		_renderActions(state) {
			const panel = this._actionPanel;
			panel.innerHTML = '';
			const myId = state.id;
			if (myId === -1 || state.end) {
				panel.classList.add('nodisplay');
				return;
			}
			panel.classList.remove('nodisplay');

			if (state.phase === 'bidding') {
				const player = state.players[myId];
				if (player.submitted) {
					const span = document.createElement('span');
					span.textContent = '✅ 已提交，等待对方...';
					panel.appendChild(span);
				} else {
					const submitBtn = document.createElement('button');
					submitBtn.className = 'btn btn-primary';
					submitBtn.textContent = '提交下注';
					submitBtn.style.padding = '8px 24px';
					submitBtn.style.background = '#2a6a3a';
					submitBtn.style.color = '#fff';
					submitBtn.style.border = 'none';
					submitBtn.style.borderRadius = '30px';
					submitBtn.style.cursor = 'pointer';
					submitBtn.addEventListener('click', () => {
						const inputs = document.querySelectorAll('#bid-input-area input[type="number"]');
						const bids = [];
						let total = 0;
						inputs.forEach(input => {
							const val = parseInt(input.value) || 0;
							bids.push(val);
							total += val;
						});
						if (total > state.players[myId].chips) {
							yaGameAlert(`总下注 ${total} 超过剩余筹码 ${state.players[myId].chips}`);
							return;
						}
						this.send({ action: 'submit_bids', body: { bids } });
						this._bidValues = {};
					});
					panel.appendChild(submitBtn);

					const concedeBtn = document.createElement('button');
					concedeBtn.textContent = '🏳️ 认输';
					concedeBtn.style.padding = '6px 16px';
					concedeBtn.style.background = '#8a2a2a';
					concedeBtn.style.color = '#fff';
					concedeBtn.style.border = 'none';
					concedeBtn.style.borderRadius = '30px';
					concedeBtn.style.cursor = 'pointer';
					concedeBtn.style.marginLeft = 'auto';
					concedeBtn.addEventListener('click', () => {
						if (yaGameConfirm('确定认输吗？')) {
							this.send({ action: 'concede', body: {} });
						}
					});
					panel.appendChild(concedeBtn);
				}
			} else if (state.phase === 'settling') {
				const span = document.createElement('span');
				span.textContent = '⏳ 结算中...';
				panel.appendChild(span);
			} else {
				const span = document.createElement('span');
				span.textContent = '游戏已结束';
				panel.appendChild(span);
			}
		}

		send(data) { /* 由框架注入 */ }
	}

	if (typeof games !== 'undefined' && Array.isArray(games)) {
		games.push({
			name: GAME_NAME,
			rule: BiddingGameRule,
			renderer: BiddingGameRenderer,
		});
	} else {
		console.warn('games 数组未定义，请确保在框架中运行');
	}
})();