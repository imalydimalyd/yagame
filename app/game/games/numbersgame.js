// 数字大小游戏
const NumbersGameName = '数字大小';
class NumbersGameRule extends GameRule {
    // 游戏名
    name = NumbersGameName;

    // 最多玩家人数
    maxN = 2;

    // 是否允许玩家人数n
    allowedN(n) {
        return n === 2; // 只允许2人游戏
    }

    // 游戏配置项
    timeLimit = 30; // 时间限制（秒）
    winScore = 3;   // 胜利所需分数

    // 构造函数
    constructor() { super(); }

    // 开始一个回合
    startRound(round) {
        const self = this;
        // 记录当前轮次
        self.state.round = round;
        // 将所有玩家设置为未行动
        for (let id = 0; id < self.state.n; ++id) {
            const player = self.state.players[id];
            player.played = false;
            player.play = 0; // 重置本回合出牌
        }
        // 通过setTimeout函数设置这个轮次的结束时间
        setTimeout(function () {
            self.endRound(round);
        }, self.timeLimit * 1000);
    }

    // 结束一个回合
    endRound(round) {
        const self = this;
        // 只有这个轮次还在进行的时候才需要结束
        if (self.state.round !== round || self.state.end) {
            return;
        }

        // 处理玩家的行动
        const plays = [];
        for (let id = 0; id < self.state.n; ++id) {
            const player = self.state.players[id];
            if (!player.played) {
                // 未行动的玩家默认出1
                player.play = 1;
            }
            // 保存上一回合的行动
            player.lastPlay = player.play;
            plays.push({ id: id, play: player.play });
        }

        // 比较数字大小
        const play1 = plays[0].play;
        const play2 = plays[1].play;

        if (play1 > play2) {
            // 玩家1获胜
            self.state.players[0].score += 1;
            self.state.players[0].lastWon = true;
            self.state.players[1].lastWon = false;
        } else if (play2 > play1) {
            // 玩家2获胜
            self.state.players[1].score += 1;
            self.state.players[0].lastWon = false;
            self.state.players[1].lastWon = true;
        } else {
            // 平局，双方都得1分
            self.state.players[0].score += 1;
            self.state.players[1].score += 1;
            self.state.players[0].lastWon = true;
            self.state.players[1].lastWon = true;
        }

        // 检查游戏是否结束
        if (self.state.players[0].score >= self.winScore ||
            self.state.players[1].score >= self.winScore) {
            // 游戏结束
            self.state.end = true;
            self.state.winner = self.state.players[0].score > self.state.players[1].score ? 0 :
                self.state.players[1].score > self.state.players[0].score ? 1 : -1;
        } else {
            // 游戏未结束，进入下一个回合
            self.startRound(round + 1);
        }

        // 将游戏状态更新至客户端和历史记录
        self.pushState();
    }

    // 初始化游戏
    init(players) {
        const self = this;

        // 初始化游戏状态
        self.state.end = false;
        self.state.n = players.length;
        self.state.winner = -1; // -1表示平局或未结束

        // 玩家信息需要deep copy
        self.players = JSON.parse(JSON.stringify(players));
        self.state.players = JSON.parse(JSON.stringify(players));

        for (let id = 0; id < self.state.n; ++id) {
            const player = self.state.players[id];
            player.inGame = true;
            player.score = 0;
            player.lastPlay = 0;
            player.lastWon = false;
        }

        // 开始第一个回合
        self.startRound(1);
        // 将游戏状态更新至客户端和历史记录
        self.pushState();
    }

    // 接收消息
    receive(data, id) {
        const self = this;
        // 检查数字是否为整数
        if (!Number.isSafeInteger(data)) {
            self.send('请输入整数', id, true);
            return;
        }
        // 检查数字范围
        if (data < 1 || data > 10) {
            self.send('请输入1-10之间的数字', id, true);
            return;
        }
        // 检查是否已经行动过
        if (self.state.players[id].played) {
            self.send('你已经行动过了', id, true);
            return;
        }
        // 行动
        self.state.players[id].played = true;
        self.state.players[id].play = data;

        // 检查是否应该结束轮次
        let end = true;
        for (let id = 0; id < self.state.n; ++id) {
            const player = self.state.players[id];
            if (!player.played) {
                end = false;
            }
        }
        // 若所有玩家均已行动过，则提前结束轮次
        if (end) {
            self.endRound(self.state.round);
        }
        // 状态更新时需要调用这个函数
        self.syncState();
    }

    // 将游戏状态转化为玩家id的视角
    projection(id) {
        const self = this;
        return {
            id: id,
            end: self.state.end,
            n: self.state.n,
            round: self.state.round,
            timeLimit: self.timeLimit,
            winScore: self.winScore,
            winner: self.state.winner,
            players: self.state.players.map(function (player, i) {
                const ret = {
                    user: player.user,
                    inGame: player.inGame,
                    score: player.score,
                    lastPlay: player.lastPlay,
                    lastWon: player.lastWon,
                };
                if (i === id) {
                    ret.played = player.played;
                    ret.play = player.play;
                }
                return ret;
            }),
        }
    }

    // 游戏规则描述
    rule() {
        const self = this;
        return `<h1>${self.name}</h1>
<ul>
<li><b>游戏人数：</b>2人</li>
<li><b>作者：</b>隐身鱼、DeepSeek</li>
</ul>
<h2>游戏规则</h2>
<ul>
<li><b>除非玩家一致同意，否则本游戏不允许私聊。</b></li>
<li>游戏的目标是通过出更大的数字获得分数。</li>
<li>每回合，每名玩家同时选择一个1-10之间的数字。</li>
<li>每回合，每名玩家有${self.timeLimit}秒时间思考。超时则视为选择数字1。</li>
<li>数字较大的一方得1分。</li>
<li>如果双方数字相同，则双方都得1分。</li>
<li>先得到${self.winScore}分的玩家获胜。</li>
</ul>`;
    }
}

class NumbersGameRenderer extends GameRenderer {
    // 初始化渲染器
    init(state, isPlaying = true) {
        const self = this;

        // 标题
        const headerElement = document.createElement('h1');
        headerElement.innerText = '数字大小游戏';

        // 轮次信息
        const roundElement = document.createElement('p');
        self.roundElement = roundElement;

        // 倒计时
        const countdownElement = document.createElement('p');
        if (isPlaying) {
            self.countdownElement = countdownElement;
            self.countdown = new Countdown();
        }

        // 游戏信息表格
        const tableElement = document.createElement('table');
        const tableRowElements = [];
        self.tableRowElements = tableRowElements;

        for (let id = 0; id < state.n; ++id) {
            const player = state.players[id];

            // 创建表格单元格
            const tableDataUserElement = document.createElement('td');
            tableDataUserElement.innerText = player.user;

            const tableDataScoreElement = document.createElement('td');
            const tableDataLastPlayElement = document.createElement('td');
            const tableDataStatusElement = document.createElement('td');

            // 创建表格行
            const tableRowElement = document.createElement('tr');
            if (id === state.id) {
                tableRowElement.classList.add('blue'); // 自己用蓝色显示
            }

            tableRowElement.appendChild(tableDataUserElement);
            tableRowElement.appendChild(tableDataScoreElement);
            tableRowElement.appendChild(tableDataLastPlayElement);
            tableRowElement.appendChild(tableDataStatusElement);

            // 保存需要更新的元素
            tableRowElements.push({
                row: tableRowElement,
                user: tableDataUserElement,
                score: tableDataScoreElement,
                lastPlay: tableDataLastPlayElement,
                status: tableDataStatusElement,
            });

            tableElement.appendChild(tableRowElement);
        }

        // 数字选择按钮
        const numberButtonsElement = document.createElement('div');
        numberButtonsElement.className = 'horizontal';
        self.numberButtons = [];

        for (let i = 1; i <= 10; i++) {
            const buttonElement = document.createElement('div');
            buttonElement.className = 'button';
            buttonElement.innerText = i;
            buttonElement.addEventListener('click', function () {
                if (self.movable) {
                    self.send(i);
                }
            });
            numberButtonsElement.appendChild(buttonElement);
            self.numberButtons.push(buttonElement);
        }

        // 将所有元素添加到界面
        self.element.appendChild(headerElement);
        self.element.appendChild(roundElement);
        if (isPlaying) {
            self.element.appendChild(countdownElement);
        }
        self.element.appendChild(tableElement);
        self.element.appendChild(numberButtonsElement);
    }

    // 渲染器更新状态
    render(state, isPlaying = true) {
        const self = this;

        // 更新轮次信息
        if (state.end) {
            if (state.winner === -1) {
                self.roundElement.innerText = '游戏结束：平局！';
            } else {
                self.roundElement.innerText = `游戏结束：${state.players[state.winner].user}获胜！`;
            }
        } else {
            self.roundElement.innerText = `第 ${state.round} 回合`;
        }

        // 更新倒计时
        if (state.round !== self.round && isPlaying) {
            self.round = state.round;
            self.countdown.start(self.countdownElement, state.timeLimit * 1000);
        }

        // 更新玩家信息
        for (let id = 0; id < state.n; ++id) {
            const player = state.players[id];
            const tableRowElement = self.tableRowElements[id];

            // 标记获胜玩家
            if (player.lastWon) {
                tableRowElement.row.classList.add('bold');
            } else {
                tableRowElement.row.classList.remove('bold');
            }

            // 更新分数
            tableRowElement.score.innerText = `分数：${player.score}`;

            // 更新上一回合出牌
            // 【由Ya修改】只有当游戏正在进行时才只显示自己的出牌
            if (isPlaying && state.players[state.id].played && !state.end) {
                // 游戏中且已出牌，只显示自己的出牌
                if (id === state.id) {
                    tableRowElement.lastPlay.innerText = `出牌：${player.play}`;
                } else {
                    tableRowElement.lastPlay.innerText = '已出牌';
                }
            } else {
                // 回合结束或游戏结束，显示所有人的出牌
                tableRowElement.lastPlay.innerText = `出牌：${player.lastPlay || '无'}`;
            }

            // 更新状态
            if (player.played && !state.end) {
                tableRowElement.status.innerText = '已行动';
            } else if (!state.end) {
                tableRowElement.status.innerText = '思考中...';
            } else {
                tableRowElement.status.innerText = '';
            }
        }

        // 更新按钮状态
        if (isPlaying) {
            const played = state.players[state.id].played;

            if (played || state.end) {
                // 已出牌或游戏结束，禁用按钮
                self.movable = false;
                self.numberButtons.forEach(button => {
                    button.classList.add('disabled');
                });
            } else {
                // 可以出牌，启用按钮
                self.movable = true;
                self.numberButtons.forEach(button => {
                    button.classList.remove('disabled');
                });
            }
        }

        // 游戏结束时隐藏控件
        if (state.end || !isPlaying) {
            if (isPlaying) {
                self.countdownElement.classList.add('hidden');
            }
            self.numberButtons.forEach(button => {
                button.classList.add('hidden');
            });
        } else {
            if (isPlaying) {
                self.countdownElement.classList.remove('hidden');
            }
            self.numberButtons.forEach(button => {
                button.classList.remove('hidden');
            });
        }
    }

    send(data) { }
}

// 添加游戏到游戏列表
games.push({
    name: NumbersGameName,
    rule: NumbersGameRule,
    renderer: NumbersGameRenderer,
});