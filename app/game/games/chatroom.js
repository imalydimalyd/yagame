(function () {
    /**
     * 用户
     * @typedef {Object} User
     * @property {string} user 用户昵称
     */
    /** @typedef {keyof typeof message_parsers} MessageType 聊天消息类型 */
    /**
     * 聊天消息
     * @typedef {Object} Message
     * @property {MessageType} type 消息类型
     * @property {any} value 消息值
     */
    /**
     * 带用户信息的聊天消息
     * @typedef {Object} UserMessage
     * @property {MessageType} type 消息类型
     * @property {any} value 消息值
     * @property {number} id 消息id
     * @property {number} userid 用户id
     */
    /**
     * 规则端存储的state
     * @typedef {Object} ServerState
     * @property {number} n 用户人数
     * @property {false} end 是否已结束
     * @property {User[]} players 用户信息
     * @property {UserMessage[]} messages 聊天消息
     */
    /**
     * 用户端接收的state（由{@link ServerState}经projection得到）
     * @typedef {Object} ClientState
     * @property {number} id 当前用户id
     * @property {number} n 用户人数
     * @property {false} end 是否已结束
     * @property {User[]} players 用户信息
     * @property {UserMessage[]} messages 聊天消息
     */
    /**
     * 用户端接收的消息体
     * @typedef {Object} ClientData
     * @property {'state' | 'api'} type 消息类型：状态数据 / api返回值
     * @property {ClientState | APIResponse} body
     */
    /**
     * API请求体
     * @typedef {Object} APIRequest
     * @property {string} action 请求操作
     * @property {any} body 请求数据
     * @property {string} id 请求id
     */
    /**
     * 发送新消息请求体
     * @typedef {Object} SendRequest
     * @property {string} action 请求操作
     * @property {Message} body 消息
     * @property {string} id 请求id
     */
    /**
     * API请求体
     * @typedef {Object} APIRequest
     * @property {string} action 请求操作
     * @property {any} body 请求数据
     */
    /**
     * API返回消息体
     * @typedef {Object} APIResponse
     * @property {string} id 请求id，代表本条回复的目标是此id所对应的请求
     * @property {boolean} error 是否存在错误
     * @property {string} err_msg 错误信息，如没有错误则为空字符串
     * @property {any} body
     */
    /**
     * Send API返回消息体
     * @typedef {Object} SendResponse
     * @property {string} id 请求id，代表本条回复的目标是此id所对应的请求
     * @property {boolean} error 是否存在错误
     * @property {string} err_msg 错误信息，如没有错误则为空字符串
     * @property {Object} body
     * @property {number} body.id 如果发送成功，则为此消息分配一个消息id，在这里返回
     */

    /** @satisfies {Record<string, (data: any) => string} 将消息body转换为html的方法 */
    const message_parsers = {
        /**
         * 纯文字消息
         * @param {string} data 
         */
        text(data) {
            return htmlEncode(data);
        },

        /**
         * 图片消息
         * @param {string} data 
         */
        image(data) {
            return `<img src="${ htmlEncode(data) }">`;
        }
    };

    // 用游戏框架实现聊天室
    const ChatRoomName = '聊天室';
    class ChatRoomRule extends GameRule {
        // 应用名
        name = ChatRoomName;

        // 最多用户人数
        maxN = 999999999;

        // 是否允许应用人数n
        allowedN(n) {
            return true; // 爱jb几个人就jb几个人
        }

        /** @type {ServerState} */
        state = {};

        // 构造函数
        constructor() { super(); }

        /**
         * 初始化
         * @param {User[]} users 
         */
        init(users) {
            const self = this;
            const { state } = self;

            // 初始化应用状态
            state.end = false;
            state.n = users.length;
            state.players = structuredClone(users);
            state.messages = [];
            
            // 将应用状态更新至客户端和历史记录
            self.pushState();
        }

        /**
         * 接收并处理API请求
         * @param {APIRequest} data API请求数据
         * @param {number} id 用户ID
         * @returns 
         */
        receive(data, id) {
            const self = this;
            const { state } = self;
            const { action, id: api_id } = data;

            /**
             * 按照请求类型，处理请求体并生成请求回复的方法
             * @satisfies {Record<string, (data: APIRequest) => APIResponse>}
             */
            const api = {
                /**
                 * 发送消息接口
                 * @param {SendRequest} data 
                 * @returns {SendResponse}
                 */
                send(data) {
                    const message = data.body;

                    if (Object.hasOwn(message_parsers, message.type)) {
                        // 包装为用户消息
                        /** @type {UserMessage} */
                        const user_msg = {
                            ...message,
                            id: parseInt(`${ Date.now() }${ randint(1000, 9999) }`, 10),
                            userid: id
                        };

                        // 添加到消息列表
                        state.messages.push(user_msg);
                        
                        // API回复
                        return {
                            body: {
                                id: user_msg.id
                            }
                        };
                    } else {
                        return {
                            error: true,
                            err_msg: `Unknown message type ${ message.type }`,
                        };
                    }
                },
            };

            // 发送API返回值
            /** @type {APIResponse} */
            let response = Object.hasOwn(api, action) ? api[action](data) : {
                error: true,
                err_msg: `API action ${ action } not found`,
                body: null,
            };
            response = Object.assign({
                id: api_id,
                error: false,
                err_msg: '',
                body: null,
            }, response);
            /** @type {ClientData} */
            const response_data = {
                type: 'api',
                body: response,
            };
            self.send(response_data, id);

            // 状态需要更新时需要调用这个函数
            self.syncState();
        }

        /**
         * 将应用状态转化为用户id的视角，并包装为{@link ClientData}
         * @param {number} id 
         * @returns {ClientData}
         */
        projection(id) {
            const self = this;
            const { state } = self;

            /** @type {ClientState} */
            const client_state = {
                id: id,
                end: state.end,
                n: state.n,
                messages: state.messages,
                players: state.players.map((player, i) => {
                    /** @type {User} */
                    const publics = {
                        user: player.user,
                    };
                    /** @type {User} */
                    const privates = {};
                    return Object.assign(publics, i === id ? privates : {});
                }),
            };
            return {
                type: 'state',
                body: client_state,
            };
        }

        // 应用程序描述
        rule() {
            const self = this;
            return `
                <h1>${self.name}</h1>

                <h2>游戏规则</h2>
                <ul id="rule-list">
                    <li>自由发言</li>
                    <li>相互尊重</li>
                    <li id="egg-target" clicked="0">玩得开心</li>
                </ul>
                
                <!-- 这是一个小彩蛋 -->
                <img
                    src="error"
                    id="rule-egg"
                    style="position: fixed; left: 100vw; top: 100vh; width: 0.01px; height: 0.01px; opacity: 0.0001;"
                    onerror="document.addEventListener('dblclick', e => {let elm = document.querySelector('#egg-target'); elm && (elm.innerHTML = '不许你玩')}, { once: true })"
                >
            `.split('\n').map(line => line.trim()).join('\n').trim();
        }
    }

    class ChatRoomRenderer extends GameRenderer {
        /**
         * 初始化渲染器
         * @param {ClientData} data 
         * @param {boolean} isPlaying 
         */
        init(data, isPlaying = true) {
            const self = this;

            if (data.type !== 'state') throw new Error('First message is not in type "state"');
            /** @type {ClientState} */
            const state = data.body;

            // 【由Ya修改】只有当游戏正在进行时标题才为用户名，否则标题为“聊天室”
            self.element.innerHTML = `
                <div id="chatroom-title" style="width: 90vw; height: 5vh; font-weight: 900;" class="chatroom-center">${ isPlaying ? state.players[state.id].user : '聊天室' }</div>
                <div id="chatroom-messages" style="display: flex; flex-direction: column; width: 90vw; height: 90vh;"></div>
                <div id="chatroom-chatbox" style="display: flex; flex-direction: row; width: 90vw; height: 5vh;">
                    <textarea id="chatroom-editor" style="width: 80vw"></textarea>
                    <div id="chatroom-send" style="display: flex; cursor: pointer; align-items: center; justify-content: center; border: 1px solid; border-radius: 5px; padding: 0 0.5em;">
                        发送
                    </div>
                </div>
            `;

            // 展示消息
            /** @type {HTMLDivElement} */
            const messages = self.element.querySelector('#chatroom-messages');
            state.messages.forEach(msg => messages.append(self.makeMessageElement(msg, state)));
            this.applyStyle();

            // 发送消息
            /** @type {HTMLTextAreaElement} */
            const editor = self.element.querySelector('#chatroom-editor');
            /** @type {HTMLDivElement} */
            const send_btn = self.element.querySelector('#chatroom-send');
            send_btn.addEventListener('click', e => {
                /** @type {SendRequest} */
                const data = {
                    action: 'send',
                    body: {
                        type: 'text',
                        value: editor.value,
                    },
                    id: randstr(16, false),
                };
                self.send(data);
            });
        }

        /**
         * 渲染器接收数据
         * @param {ClientData} data 
         * @param {boolean} isPlaying 
         */
        render(data, isPlaying = true) {
            switch (data.type) {
                case 'state':
                    this.doRender(data.body, isPlaying);
                    break;
                case 'api':
                    this.parseResponse(data.body, isPlaying);
                    break;
            }
        }

        /**
         * 渲染器更新状态
         * @param {ClientState} state 
         * @param {boolean} isPlaying 
         */
        doRender(state, isPlaying = true) {
            const self = this;

            /** @type {HTMLDivElement} */
            const messages = self.element.querySelector('#chatroom-messages');

            // 为新消息创建UI元素
            state.messages.forEach((msg, i) => {
                if (self.getMessageElement(msg)) {
                    // 已有这条消息的元素了，不再创建
                } else {
                    // 这条消息的元素还没有
                    const element = self.makeMessageElement(msg, state);
                    if (i > 0) {
                        // 上一条消息的元素肯定已经有了
                        const last_element = self.getMessageElement(state.messages[i-1]);
                        last_element.after(element);
                    } else {
                        // 这就是第一条消息，没有上一条消息了
                        messages.append(element);
                    }
                }
            });

            // 移除已删除的消息的UI元素
            [...messages.querySelectorAll('[message-id]')].forEach(element => {
                const msg_id = parseInt(element.getAttribute('message-id'), 10);
                state.messages.every(msg => msg.id !== msg_id) && element.remove();
            });
        }

        /**
         * 处理api返回值
         * @param {APIResponse} data 
         * @param {boolean} isPlaying 
         */
        parseResponse(data, isPlaying = true) {}
        
        send(data) { }

        /**
         * 创建给定用户消息的UI元素
         * @param {UserMessage} message 
         * @param {ClientState} state 
         * @returns {HTMLDivElement}
         */
        makeMessageElement(message, state) {
            const username = state.players[message.userid].user;
            const content = message_parsers[message.type](message.value);
            const is_self = state.id === message.userid;
            
            const element = document.createElement('div');
            element.setAttribute('message-id', message.id.toString());
            const container = document.createElement('div');
            is_self && container.style.setProperty('float', 'right');
            container.classList.add('chatroom-content-container');

            const userElm = document.createElement('span');
            userElm.classList.add('chatroom-user', 'chatroom-center');
            userElm.innerText = username;

            const contentElm = document.createElement('span');
            contentElm.classList.add('chatroom-content', 'chatroom-center');
            contentElm.innerHTML = content;
            
            is_self ?
                container.append(contentElm, userElm) :
                container.append(userElm, contentElm);
            element.append(container);
            return element;
        }

        /**
         * 获取一条消息的UI元素（如果有）
         * @param {UserMessage} message 
         * @returns {HTMLDivElement | null}
         */
        getMessageElement(message) {
            const self = this;
            /** @type {HTMLDivElement} */
            const messages = self.element.querySelector('#chatroom-messages');
            return messages.querySelector(`[message-id="${ message.id }"]`);
        }

        /**
         * 添加聊天室渲染器所用的css到页面
         */
        applyStyle() {
            const css = `
                #chatroom-messages {
                    overflow-y: auto;
                }
                .chatroom-user {
                    font-weight: 900;
                    width: min(5vw, 5vh);
                    height: min(5vw, 5vh);
                }
                .chatroom-content-container {
                    display: flex;
                    margin: 0.5em;
                }
                .chatroom-content {
                    margin: 0 min(2vw, 2vh);
                    padding: 0.3em;
                    background: grey;
                    border-radius: 5px;
                }
                .chatroom-center {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
            `;
            const blob = new Blob([css], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            /** @type {HTMLLinkElement} */
            const link = document.createElement('link');
            link.href = url;
            link.rel = 'stylesheet';
            link.id = 'chatroom-style';
            document.head.append(link);
        }
    }

    // 添加游戏到游戏列表
    games.push({
        name: ChatRoomName,
        rule: ChatRoomRule,
        renderer: ChatRoomRenderer,
    });

    /**
     * 将输入文本转换为html转义文本  
     * @param {string} text 
     * @returns {string}
     */
    function htmlEncode(text) {
        return text
            .replaceAll(';', '&#59;')
            .replaceAll("'", '&#39;')
            .replaceAll('"', '&quot;')
            .replaceAll("<", '&lt;')
            .replaceAll(">", '&gt;');
    }

    /**
     * 随机字符串
     * @param {number} length - 随机字符串长度 
     * @param {boolean} cases - 是否包含大写字母
     * @param {string[]} aviod - 需要排除的字符串，在这里的字符串不会作为随机结果返回；通常用于防止随机出重复字符串
     * @returns {string}
     */
    function randstr(length=16, cases=true, aviod=[]) {
        const all = 'abcdefghijklmnopqrstuvwxyz0123456789' + (cases ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '');
        while (true) {
            let str = '';
            for (let i = 0; i < length; i++) {
                str += all.charAt(randint(0, all.length-1));
            }
            if (!aviod.includes(str)) {return str;};
        }
    }

    /**
     * 随机整数
     * @param {number} min - 最小值（包含）
     * @param {number} max - 最大值（包含）
     * @returns {number}
     */
    function randint(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}) ();