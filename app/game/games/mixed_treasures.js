// 混合夺宝游戏
// 本文件绝大部分内容由 deepseek-R1 生成
const MixedTreasureGameName = '混合夺宝';

class MixedTreasureGameRule extends GameRule {

    // 游戏名
    name = MixedTreasureGameName;

    // 最多玩家人数
    maxN = 12;

    // 是否允许玩家人数n
    allowedN(n) {
        return n >= 2 && n <= 12;
    }

    // 游戏配置项
    // 时间限制（秒）
    timeLimit = 90;

    // 构造函数，无需修改
    constructor() { super(); }

    // 根据人数确定地图配置
    getMapConfig(n) {
        if (n <= 4) return { size: 6, positive: 6, negative: 3 }; // 小地图
        if (n <= 6) return { size: 9, positive: 12, negative: 9 }; // 中地图
        if (n <= 9) return { size: 12, positive: 22, negative: 18 }; // 大地图
        return { size: 15, positive: 36, negative: 24 }; // 特大地图
    }

    // 宝藏分数配置
    get positiveTreasureValue() {
        return 60; // 正宝藏分数
    }
    get negativeTreasureValue() {
        return 60; // 反宝藏分数
    }

    // 生成地图和宝藏
    generateMap(size, positiveCount, negativeCount) {
        const map = Array(size).fill(null).map(() => Array(size).fill(0)); // 0: 无宝藏
        const detectedNumbers = Array(size).fill(null).map(() => Array(size).fill(0));

        // 随机放置正宝藏
        let placed = 0;
        const positivePositions = [];
        while (placed < positiveCount) {
            const x = Math.floor(Math.random() * size);
            const y = Math.floor(Math.random() * size);
            if (map[x][y] === 0) {
                map[x][y] = 1; // 1: 正宝藏
                positivePositions.push({x, y});
                placed++;
            }
        }

        // 随机放置反宝藏
        placed = 0;
        const negativePositions = [];
        while (placed < negativeCount) {
            const x = Math.floor(Math.random() * size);
            const y = Math.floor(Math.random() * size);
            if (map[x][y] === 0) {
                map[x][y] = -1; // -1: 反向宝藏
                negativePositions.push({x, y});
                placed++;
            }
        }

        // 计算每个格子的探测数字
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                let count = 0;
                // 检查周围8个格子
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue; // 跳过自身
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                            count += map[nx][ny]; // 正宝藏+1，反宝藏-1
                        }
                    }
                }
                detectedNumbers[x][y] = count;
            }
        }

        return {
            map,
            detectedNumbers,
            positivePositions,
            negativePositions
        };
    }

    // 开始一个回合
    startTreasureRound(round) {
        const self = this;
        self.state.round = round;

        // 重置玩家行动状态
        for (let id = 0; id < self.state.n; ++id) {
            const player = self.state.players[id];
            player.played = false;
            player.selectedPos = null; // 选中的位置
            // 注意：这里不重置scoreChange，以便在下一回合开始时仍然显示
        }

        // 清除上一回合的挖掘标记
        self.state.lastRoundDugPositions = self.state.currentRoundDugPositions || [];
        self.state.currentRoundDugPositions = [];

        // 设置回合结束定时器
        setTimeout(function () {
            self.endTreasureRound(round);
        }, self.timeLimit * 1000);
    }

    // 结束一个回合
    endTreasureRound(round) {
        const self = this;
        if (self.state.round !== round || self.state.end) {
            return;
        }
        const dugThisRound = new Map(); // 记录本回合每个位置被哪些玩家挖掘

        // 处理玩家行动
        for (let id = 0; id < self.state.n; ++id) {
            const player = self.state.players[id];
            if (!player.played || player.selectedPos === null) {
                // 超时玩家默认pass，不选择任何位置
                player.lastDug = { pass: true };
                continue;
            }

            // 记录玩家的挖掘位置
            const posKey = `${player.selectedPos.x},${player.selectedPos.y}`;
            if (!dugThisRound.has(posKey)) {
                dugThisRound.set(posKey, []);
            }
            dugThisRound.get(posKey).push(id);

            // 记录玩家上回合选择
            player.lastSelection = player.selectedPos;
        }

        // 处理挖掘结果
        for (const [posKey, playerIds] of dugThisRound.entries()) {
            const [x, y] = posKey.split(',').map(Number);

            // 跳过无效位置
            if (x < 0 || y < 0) continue;

            // 标记为已挖掘
            self.state.dugPositions.add(posKey);
            self.state.currentRoundDugPositions.push(posKey);

            // 检查是否挖到宝藏
            const cellValue = self.state.map[x][y];
            if (cellValue !== 0) {
                // 挖到宝藏
                const isPositive = cellValue > 0;
                const treasureValue = isPositive ? self.positiveTreasureValue : self.negativeTreasureValue;
                const share = treasureValue / playerIds.length;

                // 更新宝藏数量
                if (isPositive) {
                    self.state.remainingPositive--;
                } else {
                    self.state.remainingNegative--;
                }

                // 分配分数
                for (const id of playerIds) {
                    self.state.players[id].score += share;
                    self.state.players[id].scoreChange = share; // 记录分数变化

                    // 记录挖掘结果
                    self.state.players[id].lastDug = {
                        x, y,
                        treasure: isPositive ? 'positive' : 'negative',
                        value: share,
                        shared: playerIds.length > 1
                    };
                }

                // 记录宝藏挖掘信息（用于显示）
                if (!self.state.treasureResults) self.state.treasureResults = [];
                self.state.treasureResults.push({
                    x, y,
                    type: isPositive ? 'positive' : 'negative',
                    players: playerIds,
                    value: treasureValue,
                    share: share
                });
            } else {
                // 未挖到宝藏，记录探测数字
                for (const id of playerIds) {
                    self.state.players[id].lastDug = {
                        x, y,
                        treasure: 'none',
                        detected: self.state.detectedNumbers[x][y]
                    };
                    self.state.players[id].scoreChange = 0; // 没有分数变化
                }
            }
        }

        // 检查游戏是否结束（所有宝藏都被挖出）
        if (self.state.remainingPositive <= 0 && self.state.remainingNegative <= 0) {
            self.state.end = true;

            // 计算胜利者
            let maxScore = -1;
            let winners = [];
            for (let id = 0; id < self.state.n; ++id) {
                const player = self.state.players[id];
                if (player.score > maxScore) {
                    maxScore = player.score;
                    winners = [id];
                } else if (player.score === maxScore) {
                    winners.push(id);
                }
            }
            self.state.winners = winners;
        } else {
            // 进入下一回合
            self.startTreasureRound(round + 1);
        }

        // 更新游戏状态
        self.pushState();
    }

    // 初始化游戏
    init(players) {
        const self = this;

        // 确保state对象存在
        if (!self.state) {
            self.state = {};
        }

        // 获取地图配置
        const mapConfig = self.getMapConfig(players.length);
        self.state.mapConfig = mapConfig;

        // 生成地图
        const { map, detectedNumbers} =
            self.generateMap(mapConfig.size, mapConfig.positive, mapConfig.negative);

        // 初始化游戏状态
        self.state.end = false;
        self.state.n = players.length;
        self.players = JSON.parse(JSON.stringify(players));
        self.state.players = JSON.parse(JSON.stringify(players));
        self.state.map = map;
        self.state.detectedNumbers = detectedNumbers;
        self.state.remainingPositive = mapConfig.positive;
        self.state.remainingNegative = mapConfig.negative;
        self.state.dugPositions = new Set(); // 使用Set记录已挖掘位置
        self.state.currentRoundDugPositions = []; // 本回合挖掘的位置
        self.state.lastRoundDugPositions = []; // 上回合挖掘的位置
        self.state.treasureResults = []; // 本回合宝藏挖掘结果
        self.state.winners = []; // 胜利者

        // 初始化玩家状态
        for (let id = 0; id < self.state.n; ++id) {
            const player = self.state.players[id];
            player.inGame = true;
            player.score = 0;
            player.scoreChange = 0;
            player.played = false;
            player.selectedPos = null;
            player.lastSelection = null; // 上回合选择
            player.lastDug = null;
        }

        // 开始第一回合
        self.startTreasureRound(1);
        self.pushState();
    }

    // 接收消息
    receive(data, id) {
        const self = this;

        // 验证数据格式
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
            self.send('无效的位置数据', id, true);
            return;
        }

        const { x, y } = data;
        const { size } = self.state.mapConfig;

        // 验证位置是否有效
        if (x < 0 || x >= size || y < 0 || y >= size) {
            self.send('位置超出地图范围', id, true);
            return;
        }

        // 验证位置是否已被挖掘
        const posKey = `${x},${y}`;
        if (self.state.dugPositions.has(posKey)) {
            self.send('该位置已被挖掘', id, true);
            return;
        }

        // 验证玩家是否已经行动
        if (self.state.players[id].played) {
            self.send('你已经行动过了', id, true);
            return;
        }

        // 记录玩家选择
        self.state.players[id].played = true;
        self.state.players[id].selectedPos = { x, y };

        // 检查是否所有玩家都已行动
        let allPlayed = true;
        for (let i = 0; i < self.state.n; ++i) {
            if (!self.state.players[i].played) {
                allPlayed = false;
                break;
            }
        }

        // 如果所有玩家都已行动，提前结束回合
        if (allPlayed) {
            self.endTreasureRound(self.state.round);
        }

        self.syncState();
    }

    // 将游戏状态转化为玩家视角
    projection(id) {
        const self = this;
        const { size } = self.state.mapConfig;

        // 创建地图投影（隐藏未挖掘格子的宝藏信息）
        const projectedMap = Array(size).fill(null).map(() => Array(size).fill(null));
        const projectedDetected = Array(size).fill(null).map(() => Array(size).fill(null));

        // 如果游戏结束，显示完整地图
        if (self.state.end) {
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    projectedMap[x][y] = self.state.map[x][y];
                    projectedDetected[x][y] = self.state.detectedNumbers[x][y];
                }
            }
        } else {
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    const posKey = `${x},${y}`;
                    if (self.state.dugPositions.has(posKey)) {
                        // 已挖掘的格子显示实际内容
                        projectedMap[x][y] = self.state.map[x][y];
                        projectedDetected[x][y] = self.state.detectedNumbers[x][y];
                    } else {
                        // 未挖掘的格子只显示为null
                        projectedMap[x][y] = null;
                        projectedDetected[x][y] = null;
                    }
                }
            }
        }

        return {
            id: id,
            end: self.state.end,
            n: self.state.n,
            round: self.state.round,
            timeLimit: self.timeLimit,
            mapConfig: self.state.mapConfig,
            map: projectedMap,
            detectedNumbers: projectedDetected,
            remainingPositive: self.state.remainingPositive,
            remainingNegative: self.state.remainingNegative,
            dugPositions: Array.from(self.state.dugPositions),
            currentRoundDugPositions: self.state.currentRoundDugPositions,
            lastRoundDugPositions: self.state.lastRoundDugPositions,
            treasureResults: self.state.treasureResults,
            winners: self.state.winners,
            players: self.state.players.map(function (player, i) {
                const ret = {
                    user: player.user,
                    inGame: player.inGame,
                    score: player.score,
                    scoreChange: player.scoreChange,
                    lastDug: player.lastDug,
                    lastSelection: player.lastSelection
                };
                if (i === id) {
                    ret.played = player.played;
                    ret.selectedPos = player.selectedPos;
                }
                return ret;
            }),
        };
    }

    // 游戏规则描述
    rule() {
        const self = this;
        return `<h1>${self.name}</h1>
<ul>
<li><b>游戏人数：</b>2-12人</li>
<li><b>原作：</b>saiwei</li>
<li><b>改编：</b>铁蛋</li>
</ul>
<h2>游戏规则</h2>
<ul>
<li><b>除非玩家一致同意，否则本游戏不允许私聊。</b></li>
<li>游戏的目标是通过探测挖掘宝藏，尽可能获得更的分数。</li>
<li>根据游戏人数随机生成埋藏着宝藏的地图：</li>
<ul style="margin-left: 10px;">
<li>2-4人：6×6地图，6个正宝藏(★)，3个反宝藏(☆)</li>
<li>5-6人：9×9地图，12个正宝藏，9个反宝藏</li>
<li>7-9人：12×12地图，22个正宝藏，18个反宝藏</li>
<li>10-12人：15×15地图，36个正宝藏，24个反宝藏</li>
</ul>
</ul>
<h2>游戏流程</h2>
<ul>
<li>每回合，每名玩家挖掘一个格子：</li>
<ul style="margin-left: 10px;">
<li>如果挖到宝藏，获得宝藏分数（正宝藏和反向宝藏各${self.positiveTreasureValue}分）</li>
<li>如果多个玩家挖到同一宝藏，则平分该宝藏的分数</li>
<li>如果没有挖到宝藏，则显示该格子周围8格的探测数字</li>
</ul>
<li><b>探测数字 = 周围正宝藏数量 - 反宝藏数量</b></li>
<li>不能挖掘已经挖掘过的格子</li>
<li>所有宝藏挖完后游戏结束，得分最高的玩家获胜</li>
<li>每回合有${self.timeLimit}秒时间思考，超时则视为放弃本轮行动</li>
</ul>`;
    }
}

// 混合夺宝游戏渲染器
class MixedTreasureGameRenderer extends GameRenderer {
    constructor(element) {
        super(element);
        this.element = element;
    }

    init(state, isPlaying = true) {
        const self = this;

        // 清空元素
        self.element.innerHTML = '';

        const { size } = state.mapConfig;

        // 标题
        const headerElement = document.createElement('h1');
        headerElement.innerText = MixedTreasureGameName;
        headerElement.style.fontSize = '28px';
        self.element.appendChild(headerElement);

        // 游戏结束提示
        const gameEndElement = document.createElement('div');
        gameEndElement.id = 'game-end-message';
        gameEndElement.style.fontSize = '22px';
        gameEndElement.style.fontWeight = 'bold';
        gameEndElement.style.color = 'red';
        gameEndElement.style.margin = '10px 0';
        gameEndElement.style.display = 'none';
        self.gameEndElement = gameEndElement;
        self.element.appendChild(gameEndElement);

        // 轮次信息
        const roundElement = document.createElement('p');
        roundElement.style.fontSize = '20px';
        roundElement.style.fontWeight = 'bold';
        self.roundElement = roundElement;
        self.element.appendChild(roundElement);

        // 宝藏计数 - 放在地图区域上面玩家分数下面
        const treasureCountElement = document.createElement('div');
        treasureCountElement.className = 'treasure-count';
        treasureCountElement.style.fontSize = '18px';
        treasureCountElement.style.fontWeight = 'bold';
        treasureCountElement.style.margin = '10px 0';
        self.treasureCountElement = treasureCountElement;
        self.element.appendChild(treasureCountElement);

        // 倒计时
        const countdownElement = document.createElement('p');
        countdownElement.style.fontSize = '18px';
        countdownElement.style.fontWeight = 'bold';
        if (isPlaying) {
            self.countdownElement = countdownElement;
            self.countdown = new Countdown();
            self.element.appendChild(countdownElement);
        }

        // 玩家信息容器 - 使用div布局，每行一个玩家
        const playersContainer = document.createElement('div');
        playersContainer.className = 'players-container';
        playersContainer.style.margin = '10px 0';
        playersContainer.style.display = 'flex';
        playersContainer.style.flexDirection = 'column';
        playersContainer.style.alignItems = 'center';
        playersContainer.style.gap = '5px';

        const playerElements = [];
        self.playerElements = playerElements;

        for (let id = 0; id < state.n; ++id) {
            const player = state.players[id];

            const playerElement = document.createElement('div');
            playerElement.className = 'player-info';
            playerElement.style.padding = '5px 10px';
            playerElement.style.borderRadius = '4px';
            playerElement.style.textAlign = 'center';
            playerElement.style.minWidth = '300px';
            playerElement.style.display = 'flex';
            playerElement.style.justifyContent = 'space-between';
            playerElement.style.alignItems = 'center';

            // 当前玩家使用深蓝色加粗
            if (id === state.id) {
                playerElement.style.color = '#3366cc';
                playerElement.style.fontWeight = 'bold';
            }

            // 玩家名字
            const nameElement = document.createElement('span');
            nameElement.className = 'player-name';
            nameElement.innerText = player.user;
            nameElement.style.flex = '1';
            nameElement.style.textAlign = 'left';
            nameElement.style.fontSize = '16px';
            playerElement.appendChild(nameElement);

            // 分数 - 强制整数显示
            const scoreElement = document.createElement('span');
            scoreElement.className = 'player-score';
            scoreElement.style.flex = '1';
            scoreElement.style.textAlign = 'center';
            scoreElement.style.fontSize = '20px';
            scoreElement.style.fontWeight = 'bold';
            playerElement.appendChild(scoreElement);

            // 上回合选择
            const lastSelectionElement = document.createElement('span');
            lastSelectionElement.className = 'player-last-selection';
            lastSelectionElement.style.flex = '1';
            lastSelectionElement.style.textAlign = 'center';
            lastSelectionElement.style.fontSize = '16px';
            playerElement.appendChild(lastSelectionElement);

            // 分数变化 - 绿色显示
            const changeElement = document.createElement('span');
            changeElement.className = 'player-change';
            changeElement.style.flex = '1';
            changeElement.style.textAlign = 'center';
            changeElement.style.color = 'green';
            changeElement.style.fontSize = '16px';
            playerElement.appendChild(changeElement);

            playerElements.push({
                container: playerElement,
                name: nameElement,
                score: scoreElement,
                lastSelection: lastSelectionElement,
                change: changeElement,
            });

            playersContainer.appendChild(playerElement);
        }

        self.element.appendChild(playersContainer);

        // 地图容器
        const mapContainer = document.createElement('div');
        mapContainer.className = 'treasure-map';
        mapContainer.style.margin = '20px 0';
        mapContainer.style.textAlign = 'center';
        self.mapContainer = mapContainer;

        // 创建地图格子
        self.cellElements = Array(size).fill(null).map(() => Array(size).fill(null));
        self.selectedCell = null;

        for (let x = 0; x < size; x++) {
            const rowElement = document.createElement('div');
            rowElement.className = 'map-row';
            rowElement.style.marginBottom = '0';

            for (let y = 0; y < size; y++) {
                const cellElement = document.createElement('div');
                cellElement.className = 'map-cell unknown-cell';
                cellElement.dataset.x = x.toString();
                cellElement.dataset.y = y.toString();

                // 设置格子为正方形
                cellElement.style.width = '40px';
                cellElement.style.height = '40px';
                cellElement.style.display = 'inline-block';
                cellElement.style.border = '1px solid #ccc';
                cellElement.style.textAlign = 'center';
                cellElement.style.lineHeight = '40px';
                cellElement.style.cursor = 'pointer';
                cellElement.style.margin = '1px';
                cellElement.style.verticalAlign = 'middle';
                cellElement.style.fontSize = '16px';
                cellElement.style.fontWeight = 'bold';

                self.cellElements[x][y] = cellElement;
                rowElement.appendChild(cellElement);
            }

            mapContainer.appendChild(rowElement);
        }
        self.element.appendChild(mapContainer);

        // 选择提示和错误提示
        const hintElement = document.createElement('div');
        hintElement.id = 'hint-message';
        hintElement.style.margin = '10px 0';
        hintElement.style.color = '#666';
        hintElement.style.fontSize = '16px';
        self.hintElement = hintElement;
        self.element.appendChild(hintElement);

        // 确定按钮
        const confirmButton = document.createElement('div');
        confirmButton.className = 'button';
        confirmButton.id = 'confirm-button';
        confirmButton.innerText = '确定挖掘';
        confirmButton.style.visibility = 'hidden';
        confirmButton.style.opacity = '0';
        confirmButton.style.fontSize = '16px';
        self.confirmButton = confirmButton;
        self.element.appendChild(confirmButton);

        // 事件监听器
        if (isPlaying) {
            // 格子点击事件
            mapContainer.addEventListener('click', function(e) {
                if (!e.target.classList.contains('map-cell')) return;

                const x = parseInt(e.target.dataset.x);
                const y = parseInt(e.target.dataset.y);

                // 游戏结束和玩家行动后，不能点击任何格子
                if ((self.state && self.state.end) || self.state.players[state.id].played) {
                    return;
                }

                // 验证是否可以点击
                if (self.isCellDug(x, y)) {
                    self.showError('该位置已被挖掘');
                    return;
                }

                // 更新选择
                self.updateSelection(x, y);
            });

            // 确定按钮点击事件
            confirmButton.addEventListener('click', function() {
                if (!self.selectedCell) {
                    self.showError('请先选择一个格子');
                    return;
                }

                const {x, y} = self.selectedCell;
                if (self.isCellDug(x, y)) {
                    self.showError('该位置已被挖掘，请重新选择');
                    return;
                }

                // 发送选择
                if (self.send) {
                    self.send({x, y});
                }
                confirmButton.style.visibility = 'hidden';
                confirmButton.style.opacity = '0';
            });
        }
    }

    // 更新选择
    updateSelection(x, y) {
        const self = this;

        // 清除之前的选择（只清除蓝色标记，保留橙色标记）
        if (self.selectedCell) {
            const prevCell = self.cellElements[self.selectedCell.x][self.selectedCell.y];
            // 只有当格子不是上回合挖掘的格子时才重置背景色
            if (!self.isLastRoundDug(self.selectedCell.x, self.selectedCell.y)) {
                prevCell.style.backgroundColor = 'black';
            }
            prevCell.style.borderColor = '#ccc';
        }

        // 设置新选择
        self.selectedCell = {x, y};
        const cell = self.cellElements[x][y];
        cell.style.backgroundColor = '#cce5ff'; // 深蓝色
        cell.style.borderColor = '#007bff'; // 蓝色边框

        // 显示确定按钮
        self.confirmButton.style.visibility = 'visible';
        self.confirmButton.style.opacity = '1';
        self.showHint(`已选择位置 (${x + 1}, ${y + 1})`);
    }

    // 显示提示信息
    showHint(message) {
        const self = this;
        if (self.hintElement) {
            self.hintElement.innerText = message;
            self.hintElement.style.color = '#666';
            self.hintElement.style.display = 'block';
        }
    }

    // 显示错误信息
    showError(message) {
        const self = this;
        if (self.hintElement) {
            self.hintElement.innerText = message;
            self.hintElement.style.color = 'red';
            self.hintElement.style.display = 'block';

            // 移除当前格子的选择
            if (self.selectedCell) {
                const cell = self.cellElements[self.selectedCell.x][self.selectedCell.y];
                if (!self.isLastRoundDug(self.selectedCell.x, self.selectedCell.y)) {
                    cell.style.backgroundColor = '';
                }
                cell.style.borderColor = '#ccc';
                self.selectedCell = null;
            }

            // 隐藏确定按钮
            if (self.confirmButton) {
                self.confirmButton.style.visibility = 'hidden';
                self.confirmButton.style.opacity = '0';
            }
        }
    }

    // 检查格子是否已被挖掘
    isCellDug(x, y) {
        const self = this;
        if (!self.state || !self.state.dugPositions) return false;
        const posKey = `${x},${y}`;
        return self.state.dugPositions.includes(posKey);
    }

    // 检查格子是否是上回合挖掘的
    isLastRoundDug(x, y) {
        const self = this;
        if (!self.state || !self.state.lastRoundDugPositions) return false;
        const posKey = `${x},${y}`;
        return self.state.lastRoundDugPositions.includes(posKey);
    }

    render(state, isPlaying = true) {
        const self = this;

        self.state = state;

        // 检查必要的状态属性
        if (!state.mapConfig || !state.players) {
            console.error('Invalid state structure', state);
            return;
        }

        const { size } = state.mapConfig;

        // 更新游戏结束提示
        if (state.end && state.winners && state.winners.length > 0) {
            const winnerNames = state.winners.map(id => state.players[id].user).join(' ');
            self.gameEndElement.innerText = `恭喜胜者：${winnerNames}`;
            self.gameEndElement.style.display = 'block';
            // 展示最后一回合的挖掘结果
            self.state.lastRoundDugPositions = self.state.currentRoundDugPositions || [];
            self.state.currentRoundDugPositions = [];
        } else {
            self.gameEndElement.style.display = 'none';
        }

        // 更新轮次信息
        if (self.roundElement) {
            self.roundElement.innerText = state.end ? '游戏已结束' : `第 ${state.round} 回合`;
        }

        // 更新宝藏计数
        if (self.treasureCountElement) {
            self.treasureCountElement.innerHTML = `
                <p>剩余宝藏: <span style="color: gold; font-size: 24px;">★${state.remainingPositive}</span> <span style="color: gold; font-size: 24px;">☆${state.remainingNegative}</span></p>
            `;
        }

        // 更新倒计时
        if (isPlaying && state.round !== self.round) {
            self.round = state.round;
            if (self.countdown && self.countdownElement) {
                self.countdown.start(self.countdownElement, state.timeLimit * 1000);
            }
        }

        // 更新玩家信息
        if (self.playerElements) {
            for (let id = 0; id < state.n; ++id) {
                const player = state.players[id];
                const playerEl = self.playerElements[id];

                // 更新分数 - 强制整数显示
                if (playerEl.score) {
                    playerEl.score.innerText = Math.round(player.score);
                }

                // 更新上回合选择
                if (playerEl.lastSelection) {
                    if (player.lastSelection) {
                        if (!player.lastDug.pass) {
                            playerEl.lastSelection.innerText = `(${player.lastSelection.x + 1}, ${player.lastSelection.y + 1})`;
                        } else {
                            playerEl.lastSelection.innerText = '未选择';
                        }
                    } else {
                        playerEl.lastSelection.innerText = '';
                    }
                }

                // 更新分数变化 - 每回合结束后显示
                if (playerEl.change) {
                    if (player.scoreChange > 0 && !player.lastDug.pass) {
                        playerEl.change.innerText = `+${Math.round(player.scoreChange)}`;
                    } else {
                        playerEl.change.innerText = '';
                    }
                }
            }
        }

        // 更新地图显示
        if (self.cellElements) {
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    const cell = self.cellElements[x][y];
                    if (!cell) continue;

                    const posKey = `${x},${y}`;
                    const isDug = state.dugPositions && state.dugPositions.includes(posKey);
                    const isLastRoundDug = state.lastRoundDugPositions && state.lastRoundDugPositions.includes(posKey);

                    // 重置格子样式（除了上回合挖掘的格子）
                    // 注意：上回合挖掘的格子橙色背景会保留，除非被当前选择覆盖
                    if (!isLastRoundDug) {
                        cell.style.backgroundColor = '';
                    }
                    cell.style.borderColor = '#ccc';

                    // 检查是否是当前选择的格子
                    const isSelected = self.selectedCell &&
                        self.selectedCell.x === x &&
                        self.selectedCell.y === y;

                    // 提取重复的格子内容设置逻辑
                    function setCellContent(cell, cellValue, detectedValue) {
                        if (cellValue === 1) {
                            cell.innerText = '★';
                            cell.style.color = 'gold';
                            cell.style.fontSize = '28px';
                        } else if (cellValue === -1) {
                            cell.innerText = '☆';
                            cell.style.color = 'gold';
                            cell.style.fontSize = '28px';
                        } else {
                            cell.innerText = detectedValue;
                            cell.style.color = 'blue';
                            cell.style.fontSize = '22px';
                        }
                    }

                    function getCellValue(state, x, y) {
                        return state.map && state.map[x] ? state.map[x][y] : 0;
                    }

                    function getDetectedValue(state, x, y) {
                        return state.detectedNumbers && state.detectedNumbers[x] ? state.detectedNumbers[x][y] : 0;
                    }

                    if (state.end) {
                        // 游戏结束时显示完整地图
                        cell.style.cursor = 'default';
                        cell.style.backgroundColor = '#f0f0f0';

                        const cellValue = getCellValue(state, x, y);
                        const detectedValue = getDetectedValue(state, x, y);
                        setCellContent(cell, cellValue, detectedValue);

                        // 如果是上回合挖掘的格子，使用橙色背景
                        if (isLastRoundDug) {
                            cell.style.backgroundColor = '#ffa500';
                        }
                    } else if (isDug) {
                        // 已挖掘的格子
                        cell.style.backgroundColor = '#f0f0f0';
                        cell.style.cursor = 'default';

                        const cellValue = getCellValue(state, x, y);
                        const detectedValue = getDetectedValue(state, x, y);
                        setCellContent(cell, cellValue, detectedValue);

                        // 如果是上回合挖掘的格子，使用橙色背景
                        if (isLastRoundDug) {
                            cell.style.backgroundColor = '#ffa500';
                        }
                    } else {
                        // 未挖掘的格子
                        cell.innerText = '';
                        cell.style.backgroundColor = 'black';
                        cell.style.color = 'black';
                        cell.style.cursor = isPlaying ? 'pointer' : 'default';

                        // 如果是当前选择的格子，使用蓝色标记
                        if (isSelected) {
                            cell.style.backgroundColor = '#cce5ff';
                            cell.style.borderColor = '#007bff';
                        }
                    }
                }
            }
        }

        // 更新UI控件状态
        if (isPlaying) {
            const currentPlayer = state.players[state.id];

            // 每回合结束时重置底部文字提示
            if (state.round !== self.lastRenderedRound) {
                self.lastRenderedRound = state.round;
                if (self.hintElement) {
                    self.showHint('请点击地图选择一个格子进行挖掘');
                }
            }

            if (currentPlayer.played || state.end) {
                // 玩家已行动或游戏结束，隐藏控件
                if (self.confirmButton) {
                    self.confirmButton.style.visibility = 'hidden';
                    self.confirmButton.style.opacity = '0';
                }
                if (self.hintElement) {
                    if (currentPlayer.played && currentPlayer.selectedPos) {
                        self.showHint(`已选择位置 (${currentPlayer.selectedPos.x + 1}, ${currentPlayer.selectedPos.y + 1})，等待其他玩家`);
                    } else if (currentPlayer.played) {
                        self.showHint('已放弃本轮行动，等待其他玩家');
                    }
                }
            } else {
                // 玩家未行动，显示选择提示
                if (self.hintElement && !self.selectedCell) {
                    self.showHint('请点击地图选择一个格子进行挖掘');
                }
            }

            // 游戏结束时隐藏倒计时
            if (state.end) {
                // 显示游戏结束提示
                self.showHint('游戏结束，刷新页面以退出游戏');
                if (self.countdownElement) {
                    self.countdownElement.classList.add('hidden');
                }
            } else {
                if (self.countdownElement) {
                    self.countdownElement.classList.remove('hidden');
                }
            }
        }
    }
}

// 添加CSS样式
const style = document.createElement('style');
style.textContent = `
.treasure-map {
    margin: 20px 0;
    text-align: center;
}
.map-row {
    margin-bottom: 0;
}
.map-cell {
    width: 40px;
    height: 40px;
    display: inline-block;
    border: 1px solid #ccc;
    text-align: center;
    line-height: 40px;
    cursor: pointer;
    margin: 1px;
    vertical-align: middle;
    font-weight: bold;
    transition: background-color 0.2s;
}
.unknown-cell {
    color: black !important;
}
/* 鼠标经过未知格子时的样式 */
.map-cell.unknown-cell:hover {
    background-color: #d4e8ff !important;
}
.treasure-count {
    font-size: 16px;
    font-weight: bold;
    margin: 10px 0;
}
.treasure-count p {
    margin: 5px 0;
}
.button {
    display: inline-block;
    padding: 10px 20px;
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
    margin: 5px;
}
.button:hover {
    background-color: #45a049;
}
.button.disabled {
    background-color: #cccccc;
    cursor: not-allowed;
}
.horizontal {
    display: flex;
    align-items: center;
    justify-content: center;
}
.hidden {
    display: none !important;
}
.blue {
    color: blue;
    font-weight: bold;
}
.bold {
    font-weight: bold;
}
`;

document.head.appendChild(style);

// 将混合夺宝游戏添加到游戏列表中
games.push({
    name: MixedTreasureGameName,
    rule: MixedTreasureGameRule,
    renderer: MixedTreasureGameRenderer,
});
