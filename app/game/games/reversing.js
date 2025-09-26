// @name        reversing.js
// @description 翻转棋 Yagame实现
// @version     1.3
// @author      InvFish

/**
 * 更新日志
 * - 1.3
 *   - improvement: 游戏内聊天框
 *     - 改进的UI
 *     - 支持发送图片消息
 *     - 代码架构优化
 * - 1.2.1
 *   - maintainence: 规范了部分变量命名
 * - 1.2
 *   - feat: 游戏内聊天
 *   - framework: 实现了规则端向玩家端的反向api请求
 * - 1.1
 *   - improvement: 增加了对上一手棋的UI提示
 * - 1.0 初始版本
 */

(function() {
    const GAME_NAME = '翻转棋';
    const GAME_RULE = `
        <h1>${ GAME_NAME }</h1>

        <h2>游戏规则</h2>
        <ul>
            <li>在10x10的棋盘上轮流落子</li>
            <li>落子只能在棋盘上已有的己方棋子的上、下、左、右四格其中之一</li>
            <li>落子时，落子位置所在九宫格内所有已有棋子都会变成己方棋子</li>
            <li>可以主动跳过回合（不落子），当没有可落子位置时自动跳过回合</li>
            <li>当所有玩家在一回合内均不落子时游戏结束并数子</li>
            <li>最后棋盘上拥有越多子的玩家排名越靠前</li>
        </ul>

        <h2>有关棋盘</h2>
        <ul>
            <li>棋盘上下、左右是互相联通的</li>
            <li>
                棋盘上除了棋子和空位外，还会有不同<b>地形</b>：
                <ul>
                    <li>墙：不可落子、不可翻转的格子，相当于这一格不存在</li>
                </ul>
            </li>
        </ul>

        <h2>有关开局</h2>
        <ul>
            <li>落子顺序和开局位置是随机的，每局都不一样</li>
            <li>任意两个玩家之间的距离不会小于4</li>
            <li>玩家和特殊地形之间的距离不会小于2</li>
            <li>横竖相邻算1单位距离，斜向相邻算2单位距离</li>
        </ul>
    `;

    // 工具函数
    const { randstr, randint, $, Popup } = (function() {
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
        
        /**
         * 弹窗控件类
         */
        class Popup {
            /**
             * @callback PopupButtonCallback
             * @param {MouseEvent} e 单击事件
             * @this {Popup} 当前Popup实例
             */

            /**
             * Popup初始化选项
             * @typedef {Object} PopupInit
             * @property {boolean} [visible=false] 创建时的显示/隐藏状态；默认隐藏
             * @property {string | Node | null} [content=null] 创建时填充的html内容 / HTML节点；默认无内容
             * @property {boolean | string} [ok=true] "确认"按钮状态：boolean: 是否创建确认按钮; string: 创建确认按钮并将此值用作按钮文字；默认为true
             * @property {boolean | string} [cancel=false] "取消"按钮状态：boolean: 是否创建取消按钮; string: 创建取消按钮并将此值用作按钮文字；默认为false
             * @property {boolean} [shadowroot=true] 若为true，将所有弹窗元素和样式封装到shadowroot内否则直接添加到document.body；默认为true
             * @property {PopupButtonCallback} [onOk] "确认"按钮点击回调
             * @property {PopupButtonCallback} [onCancel] "取消"按钮点击回调
             * @property {boolean | string} [dark] 深色/浅色模式：boolean直接控制使用深色/浅色；string则作为body class进行检测，当document.body具备此类名时为深色，否则为浅色
             * @property {Popup} [parent] 父级弹窗：当给定此参数时，此弹窗始终展示在该父级弹窗之上，当父级弹窗隐藏/销毁时，此弹窗也随之隐藏/销毁；随父级弹窗隐藏后，当父级弹窗再次显示时，同时展示此弹窗
             */

            /** @type {number} 弹窗实例计数器，用于生成唯一z-index */
            static #popupCounter = 0;

            /** @type {Popup[]} 所有弹窗实例列表 */
            static #allPopups = [];

            /**
             * 获取最高层级的弹窗
             * @returns {Popup | null}
             */
            static getTopPopup() {
                return this.#allPopups.length > 0 ? this.#allPopups[this.#allPopups.length - 1] : null;
            }

            /**
             * 更新所有弹窗的z-index层级
             */
            static #updateAllZIndex() {
                this.#allPopups.forEach((popup, index) => {
                    popup.#updateZIndex(index + 1000);
                });
            }

            /**
             * 从全局弹窗列表中移除指定弹窗
             * @param {Popup} popup 
             */
            static #removeFromAllPopups(popup) {
                const index = this.#allPopups.indexOf(popup);
                if (index > -1) {
                    this.#allPopups.splice(index, 1);
                    this.#updateAllZIndex();
                }
            }

            /**
             * 添加到全局弹窗列表
             * @param {Popup} popup 
             */
            static #addToAllPopups(popup) {
                if (!this.#allPopups.includes(popup)) {
                    this.#allPopups.push(popup);
                    this.#updateAllZIndex();
                }
            }

            /** @type {ShadowRoot | HTMLElement} 弹窗容器（Shadow DOM或普通DOM元素） */
            #container;
            
            /** @type {HTMLElement} 弹窗主元素 */
            #popupElement;
            
            /** @type {HTMLElement} 遮罩元素 */
            #overlayElement;
            
            /** @type {HTMLElement} 内容区域元素 */
            #contentElement;
            
            /** @type {HTMLElement} 按钮容器元素 */
            #buttonsElement;
            
            /** @type {HTMLElement | null} 确认按钮 */
            #okButton = null;
            
            /** @type {HTMLElement | null} 取消按钮 */
            #cancelButton = null;
            
            /** @type {boolean} 是否可见 */
            #isVisible = false;
            
            /** @type {string | Node | null} 弹窗内容 */
            #popupContent = null;
            
            /** @type {boolean | string} 深色模式配置 */
            #darkMode;
            
            /** @type {Popup | null} 父级弹窗 */
            #parentPopup;
            
            /** @type {Popup[]} 子级弹窗列表 */
            #childPopups = [];
            
            /** @type {PopupButtonCallback | null} 确认按钮回调 */
            #onOkCallback = null;
            
            /** @type {PopupButtonCallback | null} 取消按钮回调 */
            #onCancelCallback = null;
            
            /** @type {boolean} 是否使用Shadow DOM */
            #useShadowRoot;
            
            /** @type {MutationObserver | null} body类名变化观察器 */
            #bodyClassObserver = null;
            
            /** @type {boolean} 是否已销毁 */
            #isDestroyed = false;

            /**
             * @param {PopupInit} init 初始化选项
             */
            constructor(init = {}) {
                const {
                    visible = false,
                    content = null,
                    ok = true,
                    cancel = false,
                    shadowroot = true,
                    onOk = null,
                    onCancel = null,
                    dark = null,
                    parent = null
                } = init;

                this.#popupContent = content;
                this.#darkMode = dark;
                this.#parentPopup = parent;
                this.#onOkCallback = onOk;
                this.#onCancelCallback = onCancel;
                this.#useShadowRoot = shadowroot;

                // 初始化DOM结构
                this.#initializeDOM();
                
                // 初始化按钮
                this.#initializeButtons(ok, cancel);
                
                // 设置内容
                this.content = content;
                
                // 设置深色模式
                this.dark = dark;
                
                // 处理父级弹窗关系
                if (parent) {
                    parent.#addChildPopup(this);
                } else {
                    Popup.#addToAllPopups(this);
                }
                
                // 初始显示状态
                visible ? this.show() : this.hide();
            }

            /**
             * 初始化DOM结构
             */
            #initializeDOM() {
                // 创建容器
                if (this.#useShadowRoot) {
                    const host = document.createElement('div');
                    host.className = 'popup-host';
                    document.body.appendChild(host);
                    this.#container = host.attachShadow({ mode: 'open' });
                } else {
                    this.#container = document.createElement('div');
                    this.#container.className = 'popup-host';
                    document.body.appendChild(this.#container);
                }

                // 添加样式
                this.#addStyles();

                // 创建弹窗结构
                this.#popupElement = document.createElement('div');
                this.#popupElement.className = 'popup-container';
                
                this.#overlayElement = document.createElement('div');
                this.#overlayElement.className = 'popup-overlay';
                
                const popupContentWrapper = document.createElement('div');
                popupContentWrapper.className = 'popup-content-wrapper';
                
                this.#contentElement = document.createElement('div');
                this.#contentElement.className = 'popup-content';
                
                this.#buttonsElement = document.createElement('div');
                this.#buttonsElement.className = 'popup-buttons';
                
                popupContentWrapper.appendChild(this.#contentElement);
                popupContentWrapper.appendChild(this.#buttonsElement);
                this.#popupElement.appendChild(popupContentWrapper);
                
                this.#container.appendChild(this.#overlayElement);
                this.#container.appendChild(this.#popupElement);

                // 绑定事件
                this.#bindEvents();
            }

            /**
             * 添加样式
             */
            #addStyles() {
                const style = document.createElement('style');
                style.textContent = `
                    .popup-host {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        z-index: 1000;
                        font-family: system-ui, -apple-system, sans-serif;
                    }
                    
                    .popup-overlay {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.5);
                        backdrop-filter: blur(2px);
                    }
                    
                    .popup-container {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        min-width: 300px;
                        min-height: 150px;
                        max-width: 90vw;
                        max-height: 90vh;
                        background-color: white;
                        border-radius: 8px;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    
                    .popup-content-wrapper {
                        display: flex;
                        flex-direction: column;
                        flex: 1;
                        min-height: 0;
                    }
                    
                    .popup-content {
                        flex: 1;
                        padding: 20px;
                        overflow: auto;
                        color: #333;
                    }
                    
                    .popup-buttons {
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                        padding: 15px 20px;
                        background-color: #f5f5f5;
                        border-top: 1px solid #e0e0e0;
                    }
                    
                    .popup-button {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: background-color 0.2s;
                    }
                    
                    .popup-button-ok {
                        background-color: #007bff;
                        color: white;
                    }
                    
                    .popup-button-ok:hover {
                        background-color: #0056b3;
                    }
                    
                    .popup-button-cancel {
                        background-color: #6c757d;
                        color: white;
                    }
                    
                    .popup-button-cancel:hover {
                        background-color: #545b62;
                    }
                    
                    /* 深色模式样式 */
                    .popup-dark.popup-container {
                        background-color: #2d2d2d;
                    }
                    
                    .popup-dark .popup-content {
                        color: #e0e0e0;
                    }
                    
                    .popup-dark .popup-buttons {
                        background-color: #3d3d3d;
                        border-top-color: #4d4d4d;
                    }
                    
                    .popup-dark .popup-button-cancel {
                        background-color: #5a6268;
                    }
                    
                    .popup-dark .popup-button-cancel:hover {
                        background-color: #4e555b;
                    }
                    
                    /* 隐藏状态 */
                    .popup-hidden {
                        display: none !important;
                    }
                `;
                
                this.#container.appendChild(style);
            }

            /**
             * 绑定事件
             */
            #bindEvents() {
                // 遮罩点击事件
                this.#overlayElement.addEventListener('click', (e) => {
                    if (e.target === this.#overlayElement) {
                        this.hide();
                    }
                });

                // 阻止弹窗内容点击事件冒泡到遮罩
                this.#popupElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }

            /**
             * 初始化按钮
             * @param {boolean | string} ok 确认按钮配置
             * @param {boolean | string} cancel 取消按钮配置
             */
            #initializeButtons(ok, cancel) {
                // 创建确认按钮
                if (ok) {
                    this.#okButton = document.createElement('button');
                    this.#okButton.className = 'popup-button popup-button-ok';
                    this.#okButton.textContent = typeof ok === 'string' ? ok : '确认';
                    this.#okButton.addEventListener('click', (e) => {
                        if (this.#onOkCallback) {
                            this.#onOkCallback.call(this, e);
                        } else {
                            this.hide();
                        }
                    });
                    this.#buttonsElement.appendChild(this.#okButton);
                }

                // 创建取消按钮
                if (cancel) {
                    this.#cancelButton = document.createElement('button');
                    this.#cancelButton.className = 'popup-button popup-button-cancel';
                    this.#cancelButton.textContent = typeof cancel === 'string' ? cancel : '取消';
                    this.#cancelButton.addEventListener('click', (e) => {
                        if (this.#onCancelCallback) {
                            this.#onCancelCallback.call(this, e);
                        } else {
                            this.hide();
                        }
                    });
                    this.#buttonsElement.appendChild(this.#cancelButton);
                }

                // 如果没有按钮，隐藏按钮容器
                if (!ok && !cancel) {
                    this.#buttonsElement.style.display = 'none';
                }
            }

            /**
             * 更新z-index层级
             * @param {number} zIndex 
             */
            #updateZIndex(zIndex) {
                if (this.#container instanceof ShadowRoot) {
                    this.#container.host.style.zIndex = zIndex.toString();
                } else {
                    this.#container.style.zIndex = zIndex.toString();
                }
            }

            /**
             * 添加子弹窗
             * @param {Popup} child 
             */
            #addChildPopup(child) {
                if (!this.#childPopups.includes(child)) {
                    this.#childPopups.push(child);
                }
            }

            /**
             * 移除子弹窗
             * @param {Popup} child 
             */
            #removeChildPopup(child) {
                const index = this.#childPopups.indexOf(child);
                if (index > -1) {
                    this.#childPopups.splice(index, 1);
                }
            }

            /**
             * 设置深色模式
             * @param {boolean | string} val 
             */
            #setDarkMode(val) {
                const isDark = typeof val === 'boolean' ? val : 
                            typeof val === 'string' ? document.body.classList.contains(val) : false;
                
                if (isDark) {
                    this.#popupElement.classList.add('popup-dark');
                } else {
                    this.#popupElement.classList.remove('popup-dark');
                }

                // 监听body类名变化（仅当使用字符串配置时）
                if (typeof val === 'string') {
                    this.#cleanupBodyClassObserver();
                    
                    this.#bodyClassObserver = new MutationObserver(() => {
                        const nowDark = document.body.classList.contains(val);
                        if (nowDark !== isDark) {
                            this.#setDarkMode(val);
                        }
                    });
                    
                    this.#bodyClassObserver.observe(document.body, {
                        attributes: true,
                        attributeFilter: ['class']
                    });
                }
            }

            /**
             * 清理body类名观察器
             */
            #cleanupBodyClassObserver() {
                if (this.#bodyClassObserver) {
                    this.#bodyClassObserver.disconnect();
                    this.#bodyClassObserver = null;
                }
            }

            /**
             * 深色/浅色模式配置
             * @type {boolean | string}
             */
            get dark() {
                return this.#darkMode;
            }

            set dark(val) {
                this.#darkMode = val;
                this.#setDarkMode(val);
            }

            /**
             * 是否可见
             * @type {boolean}
             */
            get visible() {
                return this.#isVisible;
            }

            set visible(val) {
                if (val) {
                    this.show();
                } else {
                    this.hide();
                }
            }

            /**
             * 弹窗内容
             * @type {string | Node | null}
             */
            get content() {
                return this.#popupContent;
            }

            set content(val) {
                this.#popupContent = val;
                
                // 清空现有内容
                while (this.#contentElement.firstChild) {
                    this.#contentElement.removeChild(this.#contentElement.firstChild);
                }
                
                // 添加新内容
                if (val) {
                    if (typeof val === 'string') {
                        this.#contentElement.innerHTML = val;
                    } else if (val instanceof Node) {
                        this.#contentElement.appendChild(val);
                    }
                }
            }

            /**
             * 父级弹窗（只读）
             * @type {Popup | null}
             */
            get parent() {
                return this.#parentPopup;
            }

            /**
             * 直接子级弹窗（只读）
             * @type {Popup[]}
             */
            get children() {
                return [...this.#childPopups];
            }

            /**
             * 显示弹窗
             */
            show() {
                if (this.#isDestroyed) return;
                
                this.#isVisible = true;
                this.#popupElement.classList.remove('popup-hidden');
                this.#overlayElement.classList.remove('popup-hidden');
                
                // 如果没有父级弹窗，添加到全局列表
                if (!this.#parentPopup) {
                    Popup.#addToAllPopups(this);
                }
                
                // 显示所有子弹窗
                this.#childPopups.forEach(child => child.show());
            }

            /**
             * 隐藏弹窗
             */
            hide() {
                this.#isVisible = false;
                this.#popupElement.classList.add('popup-hidden');
                this.#overlayElement.classList.add('popup-hidden');
                
                // 如果没有父级弹窗，从全局列表移除
                if (!this.#parentPopup) {
                    Popup.#removeFromAllPopups(this);
                }
                
                // 隐藏所有子弹窗
                this.#childPopups.forEach(child => child.hide());
            }

            /**
             * 销毁弹窗及所有子级弹窗
             */
            destroy() {
                if (this.#isDestroyed) return;
                
                this.#isDestroyed = true;
                
                // 隐藏弹窗
                this.hide();
                
                // 清理body类名观察器
                this.#cleanupBodyClassObserver();
                
                // 销毁所有子弹窗
                this.#childPopups.forEach(child => child.destroy());
                this.#childPopups = [];
                
                // 从父级弹窗中移除
                if (this.#parentPopup) {
                    this.#parentPopup.#removeChildPopup(this);
                } else {
                    Popup.#removeFromAllPopups(this);
                }
                
                // 移除DOM元素
                if (this.#container instanceof ShadowRoot) {
                    document.body.removeChild(this.#container.host);
                } else {
                    document.body.removeChild(this.#container);
                }
            }
        }

        /**
         * 页面内聊天消息插件  
         * 用于在任意页面内展示聊天框
         * 
         * @AI 注意：
         * 1. 生成要求
         *   - 生成代码时，要遵循代码中的注释和JSDoc类型注释以下代码中
         *   - 带有 `@AI` 的注释为和代码外Prompt同等效力的指示，请格外注意并遵循 `@AI` 标识的注释
         *   - 生成代码时，要同时生成注释和JSDoc类型注释，尤其注意对外导出的接口的注释，保证调用者有迹可循
         *   - 生成代码时，务必保留包括已有 `@AI` 的Prompt注释在内的全部现有注释，方便第三者查阅代码时理解代码的设计思想与生成逻辑
         *   - 生成注释时，不要新增带有 `@AI` 标识的注释Prompt，写Prompt是我的工作而不是你的
         *   - 对于不够具体或准确的已有注释，视情况补充完整
         * 2. 代码风格要求
         *   - 避免生成大量重复代码，可封装时应封装调用，此规则同时适用于js代码、JSDoc注释、CSS样式等一切代码
         *   - 编写封装代码时，避免添加代码中原本没有的公开接口；可以将封装代码添加为私有属性/方法，或者添加在已有方法作用域内
         *   - 避免大量使用内联样式，应尽量封装为元素class类名和<style>样式表
         *   - 为元素定义类名时，尽量使用独特的、不易与网页其余部分代码重复的名称，尽量做到在调用时不使用shadowroot时，也不会与网页其余部分冲突
         *   - 命名风格应当遵循：
         *     - 对于变量（除js类和构造函数以外），使用snake_case
         *     - 对于常量，使用全大写的SNAKE_CASE
         *     - 对于js类和构造函数，使用PascalCase
         *     - 对于函数/方法，使用camelCase
         *     - 对于css类名，使用kebab-case
         *     - 对于函数作为变量的情况，考虑在当前语境下是更多将其作为变量还是函数使用，然后使用对应命名风格
         *   - 如有较多常量需要定义，尽量集中定义，方便查阅和修改；避免使用魔术字面量
         * 3. 针对此代码需求的补充说明
         *   - UI与用户交互设计
         *     - 聊天框应为一个不大的弹窗式窗口，紧贴屏幕下边缘展示，覆盖于页面其余内容之上，其大小不应喧宾夺主、过度遮挡页面（宽高都不应超过屏幕的一半）
         *     - 聊天框内为标题栏和主体上下两部分，标题栏分为标题和按钮区域左右两部分，主体分为消息列表和输入区域上下两部分
         *     - 主体消息列表内展示消息参考流行实时聊天软件（如QQ、微信等）的设计，将自己的消息和别人的消息分别在左右两侧显示，每条消息一行
         *     - 消息列表元素内部可滚动，保证聊天框的大小固定，不因内部消息数量改变
         *     - 输入区域应包括一个输入框、一个发送按钮和一个类型切换按钮，输入框回车可发送消息，Shift+Enter允许输入多行消息；发送时仅广播事件，并不直接将消息添加到UI中
         *     - 输入区域的类型切换按钮用于切换当前输入的消息的类型，点击后在按钮旁弹出菜单，其中列出已注册的消息类型，以供用户选择
         *     - 采用Material Design风格
         *   - 调用接口设计
         *     - 需要实现的方法和属性接口都已在代码中列出，你只需要完成实现
         *     - Chatbox类继承了EventTarget，通过触发事件主动向外传递数据，其中应实现以下事件：
         *       - send: 用户发送新消息，事件定义 {@link ChatboxSendEvent}
         *       - inputstart: 用户开始输入新消息，事件定义 {@link ChatboxInputStartEvent}
         *       - inputend: 用户结束输入新消息，事件定义 {@link ChatboxInputEndEvent}
         *     - 事件具体定义参照代码中的注释，事件对象应为{@link Event}的实例（不用自行实现新的事件类），注释中定义的属性应赋值在事件对象上传递给外部事件处理器
         *   - 注意事项
         *     - 注意shadowroot功能和样式相关功能（如添加CSS样式表、根据body类判断浅色/深色模式等）的潜在冲突，开启shadowroot时影子DOM和主DOM之间的CSS是隔离的；必要时可以分别在影子DOM内和主DOM添加两份CSS
         *     - 使用shadowroot时，包括总容器元素在内全部元素都应添加到shadowroot内，然后将shadowroot挂载在body的一个直接子元素（挂载点元素）下，此挂载点元素应仅作为挂载点使用，具体UI应由影子DOM内部元素创建。具体来说，DOM结构应如下所示：
         *       - 不使用shadowroot时
         *         - head
         *           - style
         *         - body
         *           - container
         *             - 内部结构
         *       - 不使用shadowroot时
         *         - body
         *           - mount_element
         *             - mount_element.shadowroot
         *               - style
         *               - container
         *                 - 内部结构
         */
        class Chatbox extends EventTarget {
            // @AI
            // 以下代码用 `// 私有属性`, `// 公开方法` 等注释划分了区域，生成代码时请生成到对应区域；
            // 对于尚未创建的区域，如有需要可以新建（记得带划分区域的注释）

            // 事件类型定义
            /**
             * 用户发送新消息  
             * @AI 用户发送新消息时应自动生成随机的、全局唯一的消息ID赋值于message.id中
             * @typedef {Object} ChatboxSendEvent
             * @property {'send'} name 事件名称
             * @property {ChatboxMessage} message 消息
             */
            /**
             * 用户开始输入新消息  
             * 用户聚焦到输入框，并触发了一次input或compositionstart事件时触发此事件
             * @AI 此时编辑新消息而未发出，不用生成消息ID
             * @typedef {Object} ChatboxInputStartEvent
             * @property {'inputstart'} name 事件名称
             * @property {ChatboxMessage} message 消息当前内容
             */
            /**
             * 用户结束输入新消息  
             * 用户焦点离开输入框时触发此事件
             * @AI 此时编辑新消息而未发出，不用生成消息ID
             * @typedef {Object} ChatboxInputEndEvent
             * @property {'inputend'} name 事件名称
             * @property {ChatboxMessage} message 消息当前内容
             */

            // 常量定义
            /** @type {Object} CSS类名常量 */
            static CLASS_NAMES = {
                CONTAINER: 'chatbox-container',
                TITLE_BAR: 'chatbox-title-bar',
                TITLE: 'chatbox-title',
                BUTTON_AREA: 'chatbox-button-area',
                MAIN: 'chatbox-main',
                MESSAGE_LIST: 'chatbox-message-list',
                MESSAGE_USERNAME: 'chatbox-message-username',
                INPUT_AREA: 'chatbox-input-area',
                INPUT: 'chatbox-input',
                SEND_BUTTON: 'chatbox-send-button',
                TYPE_BUTTON: 'chatbox-type-button',
                TYPE_MENU: 'chatbox-type-menu',
                TYPE_ITEM: 'chatbox-type-item',
                MESSAGE: 'chatbox-message',
                MESSAGE_LEFT: 'chatbox-message-left',
                MESSAGE_RIGHT: 'chatbox-message-right',
                MESSAGE_TYPE_PREFIX: 'chatbox-message-',
                COLLAPSE_BUTTON: 'chatbox-collapse-button',
                DARK_MODE: 'chatbox-dark-mode',
                COLLAPSED: 'chatbox-collapsed',
                POSITION_LEFT: 'chatbox-position-left',
                POSITION_RIGHT: 'chatbox-position-right'
            };

            // 私有属性
            /** @typedef {string | number} ChatboxMessageID */
            /**
             * 聊天消息
             * @typedef {Object} ChatboxMessage
             * @property {string} type 消息类型
             * @property {string} content 消息内容
             * @property {string} username 消息发送者昵称
             * @property {boolean} is_self 该消息是否为自己发送
             * @property {ChatboxMessageID} [id] (可选) 全局唯一消息id，如提供则后续可以对该消息更方便地进行修改等操作
             */
            /** @type {ChatboxMessage[]} */
            #messages = [];

            /** @type {boolean} 是否启用了shadowroot模式 */
            #shadowroot = true;

            /**
             * @typedef {'left' | 'right'} ChatboxPosition 聊天框位置
             */
            /** @type {ChatboxPosition} */
            #position = 'left';

            /**
             * 是否处于折叠状态  
             * 折叠状态下，应隐藏聊天框窗口主体内容，仅保留标题栏吸附在屏幕底部边缘（根据position参数决定吸附在偏左侧还是偏右侧）  
             * 折叠状态下，标题栏右侧按钮区域显示一个展开按钮；非折叠状态下，该位置显示折叠按钮
             * @type {boolean}
             */
            #collapsed = true;

            /**
             * 深色/浅色模式参数
             * @typedef {boolean | string} ChatboxDark
             */
            /** @type {ChatboxDark} */
            #dark = false;

            /** @type {string} 聊天框标题 */
            #title = '聊天框';

            /** @type {MutationObserver | null} 用于监听body类变化的观察器 */
            #class_observer = null;

            /**
             * 聊天消息处理器，负责将某一种特定类型的聊天消息内容转换为html
             * @typedef {Object} MessageProcessor
             * @property {string} type 处理器处理的消息类型，全局唯一
             * @property {string} [name] 消息类型的名称，用于在UI中显示，没有时显示type
             * @property {(message: ChatboxMessage) => string} process 将聊天消息转换为html的方法
             * @property {string} [init] (可选) 处理器初始化方法，在初始化处理器时一次性执行
             * @property {string} [styles] (可选) 该消息类型专用的CSS样式
             */
            /**
             * 聊天消息处理器  
             * 键为处理器的类型，值为处理器对象
             * @type {Record<string, MessageProcessor>}
             */
            #processors = {
                // 预置类型：纯文本
                text: {
                    type: 'text',
                    name: '文本',
                    process(message) {
                        return message.content;
                    },
                },
                // 预置类型：图片
                image: {
                    type: 'image',
                    name: '图片',
                    process(message) {
                        return `<div class="chatbox-image-message">
                            <img src="${message.content}" alt="图片消息" loading="lazy">
                        </div>`;
                    },
                    styles: `
                        .chatbox-image-message {
                            max-width: 100%;
                            display: flex;
                            justify-content: flex-start;
                        }
                        
                        .chatbox-image-message img {
                            max-width: 200px;
                            max-height: 200px;
                            border-radius: 8px;
                            object-fit: contain;
                        }
                        
                        .chatbox-message-right .chatbox-image-message {
                            justify-content: flex-end;
                        }
                        
                        .chatbox-message-right .chatbox-image-message img {
                            max-width: 200px;
                            max-height: 200px;
                        }
                    `
                }
            };

            /** @type {HTMLElement} 聊天框容器元素 */
            #container = null;
            /** @type {HTMLElement} 标题元素 */
            #title_element = null;
            /** @type {HTMLElement} 消息列表容器 */
            #message_list = null;
            /** @type {HTMLInputElement} 消息输入框 */
            #input = null;
            /** @type {HTMLElement} 类型菜单 */
            #type_menu = null;
            /** @type {HTMLElement} 类型切换按钮 */
            #type_button = null;
            /** @type {string} 当前选中的消息类型 */
            #current_type = 'text';
            /** @type {ShadowRoot | null} shadow root实例 */
            #shadow_root = null;
            /** @type {HTMLElement} 挂载点元素 */
            #mount_element = null;

            // 公开属性
            /**
             * 全部消息列表
             * @type {ChatboxMessage[]}
             */
            get messages() {
                return [...this.#messages];
            }
            set messages(val) {
                if (Array.isArray(val)) {
                    this.#messages = val;
                    this.#renderMessages();
                }
            }

            /**
             * 是否启用了shadowroot模式
             * @readonly
             * @type {boolean}
             */
            get shadowroot() {
                return this.#shadowroot;
            }

            /**
             * 聊天框显示位置
             * @type {ChatboxPosition}
             */
            get position() {
                return this.#position;
            }
            set position(val) {
                if (val === 'left' || val === 'right') {
                    this.#position = val;
                    this.#updatePosition();
                }
            }

            /**
             * 聊天框折叠状态
             * @type {boolean}
             */
            get collapsed() {
                return this.#collapsed;
            }
            set collapsed(val) {
                this.#collapsed = Boolean(val);
                this.#updateCollapseState();
            }

            
            /**
             * 浅色/深色模式参数
             * @type {ChatboxDark}
             */
            get dark() {
                return this.#dark;
            }
            set dark(val) {
                // 停止之前的监听
                this.#stopClassObserver();
                
                this.#dark = val;
                this.#updateDarkMode();
                
                // 如果新的dark参数是字符串，重新开始监听
                this.#startClassObserver();
            }

            /**
             * 聊天框标题
             * @type {string}
             */
            get title() {
                return this.#title;
            }
            set title(val) {
                if (typeof val === 'string') {
                    this.#title = val;
                    this.#updateTitle();
                }
            }

            // 构造函数
            /**
             * {@link Chatbox}初始化参数
             * @typedef {Object} ChatboxInit
             * @property {boolean} [shadowroot=true] 若为true，将所有元素和样式封装到shadowroot内，否则直接添加到document.body；默认为true
             * @property {ChatboxDark} [dark=false] 深色/浅色模式：boolean直接控制使用深色/浅色；string则作为body class进行检测，当document.body具备此类名时为深色，否则为浅色
             * @property {ChatboxMessage[]} [messages=[]] 初始消息列表，默认为空数组
             * @property {ChatboxPosition} [position='left'] 聊天框显示位置，默认为'left'
             * @property {boolean} [collapsed=true] 初始折叠状态，默认为true
             * @property {string} [title='聊天框'] 聊天框标题，默认为'聊天框'
             */
            /**
             * @param {ChatboxInit} init 初始化参数
             */
            constructor(init = {}) {
                super();
                
                // 初始化参数
                this.#shadowroot = init.shadowroot !== false;
                this.#dark = init.dark || false;
                this.#messages = init.messages || [];
                this.#position = init.position || 'left';
                this.#collapsed = init.collapsed !== false;
                this.#title = init.title || '聊天框'; // 设置标题

                // 创建DOM结构
                this.#createDOM();
                
                // 初始化预置的聊天消息处理器
                this.#initProcessors();
                
                // 根据init参数调整实例状态、修改DOM元素
                this.#updatePosition();
                this.#updateCollapseState();
                this.#updateDarkMode();
                this.#renderMessages();
    
                // 如果dark参数是字符串，开始监听body类变化
                this.#startClassObserver();
            }

            // 私有方法
            /**
             * 创建DOM结构
             */
            #createDOM() {
                // 创建样式
                const styles = this.#createStyles();
                
                if (this.#shadowroot) {
                    // 使用shadowroot模式
                    this.#mount_element = document.createElement('div');
                    this.#shadow_root = this.#mount_element.attachShadow({ mode: 'open' });
                    
                    // 添加样式和容器
                    this.#shadow_root.appendChild(styles);
                    this.#container = this.#createChatboxStructure();
                    this.#shadow_root.appendChild(this.#container);
                    
                    document.body.appendChild(this.#mount_element);
                } else {
                    // 不使用shadowroot模式
                    const style_element = document.createElement('style');
                    style_element.textContent = styles.textContent;
                    document.head.appendChild(style_element);
                    
                    this.#container = this.#createChatboxStructure();
                    document.body.appendChild(this.#container);
                }
            }

            /**
             * 创建聊天框DOM结构
             * @returns {HTMLElement} 容器元素
             */
            #createChatboxStructure() {
                const container = document.createElement('div');
                container.className = Chatbox.CLASS_NAMES.CONTAINER;
                
                // 标题栏
                const title_bar = document.createElement('div');
                title_bar.className = Chatbox.CLASS_NAMES.TITLE_BAR;
                
                const title = document.createElement('div');
                title.className = Chatbox.CLASS_NAMES.TITLE;
                title.textContent = this.#title;
                this.#title_element = title;
                
                const button_area = document.createElement('div');
                button_area.className = Chatbox.CLASS_NAMES.BUTTON_AREA;
                
                const collapse_button = document.createElement('button');
                collapse_button.className = Chatbox.CLASS_NAMES.COLLAPSE_BUTTON;
                collapse_button.innerHTML = '−';
                collapse_button.addEventListener('click', () => {
                    this.collapsed = !this.collapsed;
                });
                
                button_area.appendChild(collapse_button);
                title_bar.appendChild(title);
                title_bar.appendChild(button_area);
                
                // 主体区域
                const main = document.createElement('div');
                main.className = Chatbox.CLASS_NAMES.MAIN;
                
                // 消息列表
                this.#message_list = document.createElement('div');
                this.#message_list.className = Chatbox.CLASS_NAMES.MESSAGE_LIST;
                
                // 输入区域
                const input_area = document.createElement('div');
                input_area.className = Chatbox.CLASS_NAMES.INPUT_AREA;
                
                const type_button = document.createElement('button');
                type_button.className = Chatbox.CLASS_NAMES.TYPE_BUTTON;
                this.#type_button = type_button;
                this.#updateTypeButton();
                type_button.addEventListener('click', () => {
                    this.#toggleTypeMenu();
                });
                
                this.#input = document.createElement('textarea');
                this.#input.className = Chatbox.CLASS_NAMES.INPUT;
                this.#input.placeholder = '输入消息...';
                
                // 输入事件处理
                this.#input.addEventListener('focus', () => {
                    this.#handleInputStart();
                });
                
                this.#input.addEventListener('blur', () => {
                    this.#handleInputEnd();
                });
                
                this.#input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.#sendMessage();
                    }
                });
                
                this.#input.addEventListener('input', () => {
                    this.#handleInputStart();
                });
                
                this.#input.addEventListener('compositionstart', () => {
                    this.#handleInputStart();
                });
                
                const send_button = document.createElement('button');
                send_button.className = Chatbox.CLASS_NAMES.SEND_BUTTON;
                send_button.textContent = '发送';
                send_button.addEventListener('click', () => {
                    this.#sendMessage();
                });
                
                // 类型菜单
                this.#type_menu = document.createElement('div');
                this.#type_menu.className = Chatbox.CLASS_NAMES.TYPE_MENU;
                this.#type_menu.style.display = 'none';
                
                input_area.appendChild(type_button);
                input_area.appendChild(this.#input);
                input_area.appendChild(send_button);
                
                main.appendChild(this.#message_list);
                main.appendChild(input_area);
                main.appendChild(this.#type_menu);
                
                container.appendChild(title_bar);
                container.appendChild(main);
                
                return container;
            }

            /**
             * 创建样式表
             * @returns {HTMLStyleElement} 样式元素
             */
            #createStyles() {
                const style = document.createElement('style');
                style.textContent = `
                    .${Chatbox.CLASS_NAMES.CONTAINER} {
                        position: fixed;
                        bottom: 0;
                        width: 300px;
                        max-width: 50vw;
                        max-height: 50vh;
                        background: white;
                        border: 1px solid #ddd;
                        border-radius: 8px 8px 0 0;
                        box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
                        font-family: 'Roboto', sans-serif;
                        z-index: 10000;
                        transition: all 0.3s ease;
                    }
                    
                    .${Chatbox.CLASS_NAMES.CONTAINER}.${Chatbox.CLASS_NAMES.POSITION_LEFT} {
                        left: 20px;
                    }
                    
                    .${Chatbox.CLASS_NAMES.CONTAINER}.${Chatbox.CLASS_NAMES.POSITION_RIGHT} {
                        right: 20px;
                    }
                    
                    .${Chatbox.CLASS_NAMES.CONTAINER}.${Chatbox.CLASS_NAMES.COLLAPSED} {
                        height: 40px !important;
                    }
                    
                    .${Chatbox.CLASS_NAMES.CONTAINER}.${Chatbox.CLASS_NAMES.COLLAPSED} .${Chatbox.CLASS_NAMES.MAIN} {
                        display: none;
                    }
                    
                    .${Chatbox.CLASS_NAMES.CONTAINER}.${Chatbox.CLASS_NAMES.DARK_MODE} {
                        background: #424242;
                        color: white;
                        border-color: #616161;
                    }
                    
                    .${Chatbox.CLASS_NAMES.TITLE_BAR} {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 12px;
                        background: #f5f5f5;
                        border-bottom: 1px solid #ddd;
                        cursor: pointer;
                        border-radius: 8px 8px 0 0;
                    }
                    
                    .${Chatbox.CLASS_NAMES.DARK_MODE} .${Chatbox.CLASS_NAMES.TITLE_BAR} {
                        background: #616161;
                        border-bottom-color: #757575;
                    }
                    
                    .${Chatbox.CLASS_NAMES.TITLE} {
                        font-weight: 500;
                    }
                    
                    .${Chatbox.CLASS_NAMES.BUTTON_AREA} {
                        display: flex;
                        gap: 8px;
                    }
                    
                    .${Chatbox.CLASS_NAMES.MAIN} {
                        display: flex;
                        flex-direction: column;
                        height: 300px;
                    }
                    
                    .${Chatbox.CLASS_NAMES.MESSAGE_LIST} {
                        flex: 1;
                        overflow-y: auto;
                        padding: 8px;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .${Chatbox.CLASS_NAMES.MESSAGE} {
                        max-width: 80%;
                        padding: 8px 12px;
                        border-radius: 12px;
                        word-wrap: break-word;
                        position: relative;
                    }
                    
                    .${Chatbox.CLASS_NAMES.MESSAGE_LEFT} {
                        align-self: flex-start;
                        background: #e0e0e0;
                    }
                    
                    .${Chatbox.CLASS_NAMES.DARK_MODE} .${Chatbox.CLASS_NAMES.MESSAGE_LEFT} {
                        background: #757575;
                    }
                    
                    .${Chatbox.CLASS_NAMES.MESSAGE_RIGHT} {
                        align-self: flex-end;
                        background: #1976d2;
                        color: white;
                    }
                    
                    .${Chatbox.CLASS_NAMES.MESSAGE_USERNAME} {
                        font-size: 0.8em;
                        font-weight: 500;
                        margin-bottom: 4px;
                        opacity: 0.8;
                    }
                    
                    .${Chatbox.CLASS_NAMES.MESSAGE_RIGHT} .${Chatbox.CLASS_NAMES.MESSAGE_USERNAME} {
                        text-align: right;
                    }
                    
                    .${Chatbox.CLASS_NAMES.INPUT_AREA} {
                        display: flex;
                        padding: 8px;
                        gap: 8px;
                        border-top: 1px solid #ddd;
                    }
                    
                    .${Chatbox.CLASS_NAMES.DARK_MODE} .${Chatbox.CLASS_NAMES.INPUT_AREA} {
                        border-top-color: #757575;
                    }
                    
                    .${Chatbox.CLASS_NAMES.INPUT} {
                        flex: 1;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 8px;
                        resize: none;
                        font-family: inherit;
                    }
                    
                    .${Chatbox.CLASS_NAMES.DARK_MODE} .${Chatbox.CLASS_NAMES.INPUT} {
                        background: #616161;
                        border-color: #757575;
                        color: white;
                    }
                    
                    .${Chatbox.CLASS_NAMES.SEND_BUTTON}, .${Chatbox.CLASS_NAMES.TYPE_BUTTON}, .${Chatbox.CLASS_NAMES.COLLAPSE_BUTTON} {
                        background: #1976d2;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        padding: 8px 12px;
                        cursor: pointer;
                        font-family: inherit;
                    }
                    
                    .${Chatbox.CLASS_NAMES.SEND_BUTTON}:hover, .${Chatbox.CLASS_NAMES.TYPE_BUTTON}:hover, .${Chatbox.CLASS_NAMES.COLLAPSE_BUTTON}:hover {
                        background: #1565c0;
                    }
                    
                    .${Chatbox.CLASS_NAMES.TYPE_MENU} {
                        position: absolute;
                        bottom: 50px;
                        left: 8px;
                        background: white;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        z-index: 10001;
                    }
                    
                    .${Chatbox.CLASS_NAMES.DARK_MODE} .${Chatbox.CLASS_NAMES.TYPE_MENU} {
                        background: #424242;
                        border-color: #616161;
                    }
                    
                    .${Chatbox.CLASS_NAMES.TYPE_ITEM} {
                        padding: 8px 12px;
                        cursor: pointer;
                        border-bottom: 1px solid #eee;
                    }
                    
                    .${Chatbox.CLASS_NAMES.DARK_MODE} .${Chatbox.CLASS_NAMES.TYPE_ITEM} {
                        border-bottom-color: #616161;
                    }
                    
                    .${Chatbox.CLASS_NAMES.TYPE_ITEM}:last-child {
                        border-bottom: none;
                    }
                    
                    .${Chatbox.CLASS_NAMES.TYPE_ITEM}:hover {
                        background: #f5f5f5;
                    }
                    
                    .${Chatbox.CLASS_NAMES.DARK_MODE} .${Chatbox.CLASS_NAMES.TYPE_ITEM}:hover {
                        background: #757575;
                    }
                `;
                return style;
            }

            /**
             * 初始化所有消息处理器
             */
            #initProcessors() {
                Object.values(this.#processors).forEach(processor => {
                    this.#initMessageProcessor(processor);
                });
            }

            /**
             * 根据传入message的类型和内容，调用，返回该message的html
             * @param {ChatboxMessage} message 
             */
            #processTypedMessage(message) {
                const processor = this.#processors[message.type];
                if (processor) {
                    return processor.process(message);
                }
                return message.content;
            }

            /**
             * 初始化聊天消息处理器  
             * 所有处理器应且仅应初始化一次
             * @param {MessageProcessor} processor 
             */
            #initMessageProcessor(processor) {
                if (processor.init) {
                    processor.init();
                }
                
                // 如果处理器有专用样式，添加到样式表中
                if (processor.styles) {
                    this.#injectProcessorStyles(processor.type, processor.styles);
                }
            }

            /**
             * 注入处理器专用样式
             * @param {string} type 消息类型
             * @param {string} styles CSS样式
             */
            #injectProcessorStyles(type, styles) {
                if (!this.#container) return;
                
                const style_id = `chatbox-processor-styles-${type}`;
                let style_element;
                
                if (this.#shadowroot) {
                    // shadowroot模式下，在shadow DOM中查找或创建样式元素
                    style_element = this.#shadow_root.querySelector(`#${style_id}`);
                    if (!style_element) {
                        style_element = document.createElement('style');
                        style_element.id = style_id;
                        this.#shadow_root.appendChild(style_element);
                    }
                } else {
                    // 非shadowroot模式下，在document中查找或创建样式元素
                    style_element = document.getElementById(style_id);
                    if (!style_element) {
                        style_element = document.createElement('style');
                        style_element.id = style_id;
                        document.head.appendChild(style_element);
                    }
                }
                
                style_element.textContent = styles;
            }

            /**
             * 渲染消息列表
             */
            #renderMessages() {
                if (!this.#message_list) return;
                
                this.#message_list.innerHTML = '';
                
                this.#messages.forEach(message => {
                    const message_element = document.createElement('div');
                    const is_self = message.is_self;
                    
                    message_element.className = `${Chatbox.CLASS_NAMES.MESSAGE} ${
                        is_self ? Chatbox.CLASS_NAMES.MESSAGE_RIGHT : Chatbox.CLASS_NAMES.MESSAGE_LEFT
                    } ${Chatbox.CLASS_NAMES.MESSAGE_TYPE_PREFIX}${message.type}`;
                    
                    // 创建用户名显示元素
                    const username_element = document.createElement('div');
                    username_element.className = Chatbox.CLASS_NAMES.MESSAGE_USERNAME;
                    username_element.textContent = message.username;
                    
                    // 创建消息内容元素
                    const content_element = document.createElement('div');
                    const content = this.#processTypedMessage(message);
                    content_element.innerHTML = content;
                    
                    message_element.appendChild(username_element);
                    message_element.appendChild(content_element);
                    
                    this.#message_list.appendChild(message_element);
                });
                
                // 滚动到底部
                this.#message_list.scrollTop = this.#message_list.scrollHeight;
            }

            /**
             * 更新位置样式
             */
            #updatePosition() {
                if (!this.#container) return;
                
                this.#container.classList.remove(
                    Chatbox.CLASS_NAMES.POSITION_LEFT,
                    Chatbox.CLASS_NAMES.POSITION_RIGHT
                );
                this.#container.classList.add(
                    this.#position === 'left' ? Chatbox.CLASS_NAMES.POSITION_LEFT : Chatbox.CLASS_NAMES.POSITION_RIGHT
                );
            }

            /**
             * 更新折叠状态
             */
            #updateCollapseState() {
                if (!this.#container) return;
                
                if (this.#collapsed) {
                    this.#container.classList.add(Chatbox.CLASS_NAMES.COLLAPSED);
                } else {
                    this.#container.classList.remove(Chatbox.CLASS_NAMES.COLLAPSED);
                }
            }

            /**
             * 更新深色模式
             */
            #updateDarkMode() {
                if (!this.#container) return;
                
                let is_dark = false;
                if (typeof this.#dark === 'boolean') {
                    is_dark = this.#dark;
                } else if (typeof this.#dark === 'string') {
                    is_dark = document.body.classList.contains(this.#dark);
                }
                
                if (is_dark) {
                    this.#container.classList.add(Chatbox.CLASS_NAMES.DARK_MODE);
                } else {
                    this.#container.classList.remove(Chatbox.CLASS_NAMES.DARK_MODE);
                }
            }

            /**
             * 开始监听body类变化
             */
            #startClassObserver() {
                if (typeof this.#dark !== 'string') {
                    return; // 只有dark参数是字符串时才需要监听
                }
                
                this.#class_observer = new MutationObserver((mutations) => {
                    let should_update = false;
                    
                    for (const mutation of mutations) {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                            should_update = true;
                            break;
                        }
                    }
                    
                    if (should_update) {
                        this.#updateDarkMode();
                    }
                });
                
                // 开始观察body元素的class属性变化
                this.#class_observer.observe(document.body, {
                    attributes: true,
                    attributeFilter: ['class']
                });
            }

            /**
             * 停止监听body类变化
             */
            #stopClassObserver() {
                if (this.#class_observer) {
                    this.#class_observer.disconnect();
                    this.#class_observer = null;
                }
            }

            /**
             * 更新标题显示
             */
            #updateTitle() {
                if (this.#title_element) {
                    this.#title_element.textContent = this.#title;
                }
            }

            /**
             * 清理处理器专用样式
             */
            #cleanupProcessorStyles() {
                Object.keys(this.#processors).forEach(type => {
                    const style_id = `chatbox-processor-styles-${type}`;
                    let style_element;
                    
                    if (this.#shadowroot && this.#shadow_root) {
                        style_element = this.#shadow_root.querySelector(`#${style_id}`);
                    } else {
                        style_element = document.getElementById(style_id);
                    }
                    
                    if (style_element) {
                        style_element.remove();
                    }
                });
            }

            /**
             * 切换类型菜单显示状态
             */
            #toggleTypeMenu() {
                if (!this.#type_menu) return;
                
                if (this.#type_menu.style.display === 'none') {
                    this.#type_menu.style.display = 'block';
                    this.#renderTypeMenu();
                } else {
                    this.#type_menu.style.display = 'none';
                }
            }

            /**
             * 渲染类型菜单
             */
            #renderTypeMenu() {
                if (!this.#type_menu) return;
                
                this.#type_menu.innerHTML = '';
                
                Object.values(this.#processors).forEach(processor => {
                    const item = document.createElement('div');
                    item.className = Chatbox.CLASS_NAMES.TYPE_ITEM;
                    item.textContent = processor.name || processor.type;
                    item.addEventListener('click', () => {
                        this.#current_type = processor.type;
                        this.#type_menu.style.display = 'none';

                        // 更新类型按钮显示
                        this.#updateTypeButton();
                    });
                    this.#type_menu.appendChild(item);
                });
            }

            /**
             * 更新类型按钮显示
             */
            #updateTypeButton() {
                if (!this.#type_button) return;
                
                const processor = this.#processors[this.#current_type];
                if (processor) {
                    // 显示类型名称的首字母或缩写
                    const displayName = processor.name || processor.type;
                    this.#type_button.textContent = displayName.charAt(0).toUpperCase();
                    this.#type_button.title = displayName;
                }
            }

            /**
             * 发送消息
             */
            #sendMessage() {
                const content = this.#input.value.trim();
                if (!content) return;
                
                /** @type {ChatboxMessage} */
                const message = {
                    type: this.#current_type,
                    content: content,
                    username: 'user',
                    is_self: true,
                    id: this.#generateMessageId()
                };
                
                // 触发发送事件
                this.dispatchEvent(new CustomEvent('send', {
                    detail: { message }
                }));
                
                this.#input.value = '';
                this.#type_menu.style.display = 'none';
            }

            /**
             * 处理输入开始事件
             */
            #handleInputStart() {
                const message = {
                    type: this.#current_type,
                    content: this.#input.value,
                    username: 'user'
                };
                
                this.dispatchEvent(new CustomEvent('inputstart', {
                    detail: { message }
                }));
            }

            /**
             * 处理输入结束事件
             */
            #handleInputEnd() {
                const message = {
                    type: this.#current_type,
                    content: this.#input.value,
                    username: 'user'
                };
                
                this.dispatchEvent(new CustomEvent('inputend', {
                    detail: { message }
                }));
            }

            /**
             * 生成消息ID
             * @returns {string} 消息ID
             */
            #generateMessageId() {
                return Date.now().toString(36) + Math.random().toString(36).substr(2);
            }

            // 公开方法
            /**
             * 添加一条或多条消息
             * @param {ChatboxMessage[]} messages 消息列表
             */
            addMessage(...messages) {
                this.#messages.push(...messages);
                this.#renderMessages();
            }
            
            /**
             * 移除一条或多条消息
             * @param {ChatboxMessageID} ids 消息ID
             */
            removeMessage(...ids) {
                this.#messages = this.#messages.filter(msg => !ids.includes(msg.id));
                this.#renderMessages();
            }
            
            /**
             * 修改一条或多条已有消息
             * @param {ChatboxMessage[]} messages 要修改的消息列表；注意：这里的消息必须带ID表明要修改的消息的ID，并且此ID对应的消息必须已经存在，否则忽略这一条消息
             */
            modifyMessage(...messages) {
                messages.forEach(new_msg => {
                    if (!new_msg.id) return;
                    
                    const index = this.#messages.findIndex(msg => msg.id === new_msg.id);
                    if (index !== -1) {
                        this.#messages[index] = { ...this.#messages[index], ...new_msg };
                    }
                });
                this.#renderMessages();
            }

            /**
             * 注册一个新的消息类型
             * @param {MessageProcessor} processor 
             */
            registerType(processor) {
                if (this.#processors[processor.type]) {
                    console.warn(`消息类型 ${processor.type} 已存在，将被覆盖`);
                }
                
                this.#processors[processor.type] = processor;
                this.#initMessageProcessor(processor);
            }

            /**
             * 销毁聊天框实例，清理事件监听和DOM元素
             */
            destroy() {
                this.#stopClassObserver();
                
                // 清理处理器样式
                this.#cleanupProcessorStyles();
                
                if (this.#shadowroot && this.#mount_element) {
                    this.#mount_element.remove();
                } else if (this.#container) {
                    this.#container.remove();
                }
                
                // 清理相关引用
                this.#container = null;
                this.#message_list = null;
                this.#input = null;
                this.#type_menu = null;
                this.#type_button = null;
                this.#title_element = null;
                this.#shadow_root = null;
                this.#mount_element = null;
                this.#class_observer = null;
            }

            /**
             * 设置折叠状态  
             * 效果同直接设置collapsed属性
             * @param {boolean} val 
             */
            setCollapse(val) {
                this.collapsed = val;
            }

            /**
             * 设置深色/浅色模式  
             * 效果同直接设置dark属性
             * @param {ChatboxDark} val 
             */
            setDark(val) {
                this.dark = val;
            }

            /**
             * 设置聊天框标题
             * 效果同直接设置title属性
             * @param {string} title 新标题
             */
            setTitle(title) {
                this.title = title;
            }

            /** 类型导出，其值无具体含义，用于调用方获取类型定义 */
            static _types = {
                /** @type {ChatboxSendEvent} */
                ChatboxSendEvent: {},
                /** @type {ChatboxInputStartEvent} */
                ChatboxInputStartEvent: {},
                /** @type {ChatboxInputEndEvent} */
                ChatboxInputEndEvent: {},
                /** @type {ChatboxMessage} */
                ChatboxMessage: {},
                /** @type {ChatboxMessageID} */
                ChatboxMessageID: {},
                /** @type {ChatboxPosition} */
                ChatboxPosition: {},
                /** @type {ChatboxDark} */
                ChatboxDark: {},
                /** @type {ChatboxInit} */
                ChatboxInit: {},
                /** @type {MessageProcessor} */
                MessageProcessor: {}
            }
        }

        /**
         * @overload
         * @param {string} selector
         * @returns {HTMLElement}
         */
        /**
         * @overload
         * @param {Node} root
         * @param {string} selector
         * @returns {HTMLElement}
         */
        function $() {
            switch (arguments.length) {
                case 1:
                    return document.querySelector(arguments[0]);
                case 2:
                    return arguments[0].querySelector(arguments[1]);
            }
        }

        return { randstr, randint, $, Popup, Chatbox };
    }) ();

    // 游戏逻辑和界面
    const { Reversing, BoardGUI, _types } = (function() {
        /** @typedef {number} RPlayer 大于零的一个整数代表一位玩家*/
        /** @typedef {number} RLandscape 小于零的一个整数代表一个地形*/
        /** @typedef {RPlayer | RLandscape} RGrid 代表棋盘上的一个点位内容*/
        /** @typedef {{x: number, y: number}} Position 代表棋盘上某一位置 */
        /** @typedef {RPlayer[]} PlayerTurnOrder 落子轮换顺序 */
        /**
         * @typedef {Object} Config 游戏配置
         * @property {number} width 棋盘宽度
         * @property {number} height 棋盘高度
         * @property {number} players 玩家数量
         * @property {PlayerTurnOrder} order 玩家落子轮换顺序
         */
        /**
         * @typedef {Object} Step
         * @property {Position} pos
         * @property {RPlayer} player
         */
        /** @typedef {Step[]} GameHistory */
        /** @typedef {RGrid[][]} Board */
        /**
         * @typedef {Object} JudgeResult
         * @property {number[]} count 以玩家id为下标的玩家子数数组
         * @property {RPlayer[]} win_order 按照子数从大到小排列的玩家id数组
         */

        /** 翻转棋游戏逻辑实现 */
        class Reversing {
            /** @type {GameHistory} 棋盘落子历史 */
            history = [];
            /** @type {number} 玩家数量 */
            players = 0;
            /** @type {Board} 当期棋盘数据 */
            board = [];
            /** @type {PlayerTurnOrder} 玩家落子轮换顺序 */
            order = [];
            /** @type {RPlayer[]} 已失去行动能力的玩家 */
            mambaouts = [];
            /** @type {number} */
            width = 0;
            /** @type {number} */
            height = 0;

            static Landscape = {
                Wall: -1,
            };

            constructor() {}

            /**
             * 清空现有游戏数据，重新开始游戏  
             * 注意：游戏开始后，不要修改传入的游戏配置对象内部数据
             * @param {Config} config 游戏配置
             */
            restart(config) {
                // 清空历史记录
                this.history = [];

                // 重置配置
                this.players = config.players;
                this.order = config.order;
                this.width = config.width;
                this.height = config.height;

                // 生成初始数据
                this.board = Array.from({length: config.width}, (_, i) => 
                    Array.from({length: config.height}, (_, i) => 0)
                );
            }

            /**
             * 生成开局，要求调用前棋盘为空，否则生成会出错
             * @param {'random'} strategy 开局策略: 'random': 随机
             * @returns {boolean} 使用选定策略布局是否成功
             */
            opening(strategy = 'random') {
                const self = this;
                const measureDistance = ({x: x1, y: y1}, {x: x2, y: y2}) => {
                    let dx = Math.abs(x1 - x2);
                    dx = Math.min(dx, self.width - dx);
                    let dy = Math.abs(y1 - y2);
                    dy = Math.min(dy, self.height - dy);
                    return dx + dy;
                };

                /**
                 * 代表一个开局生成的要素
                 * @typedef {Object} Spawning
                 * @property {RGrid} value 生成的要素内容
                 * @property {Position} pos 生成位置
                 */

                /** @satisfies {Record<string, () => Spawning[]>} */
                const spawners = {
                    /**
                     * 随机开局，所有玩家初始子和方块位置完全随机，但初始子两两之间距离不会小于4
                     * @returns {Spawning[]}
                     */
                    random() {
                        /** @type {Spawning[]} */
                        const spawnings = [];

                        // 生成玩家
                        for (let i = 1; i <= self.players; i++) {
                            const avail_poses = getAvailablePlayerPoses(spawnings);
                            if (!avail_poses.length) throw new Error('No enough space for random opening');
                            const pos = avail_poses[randint(0, avail_poses.length-1)];
                            spawnings.push({ pos, value: i });
                        }

                        // 生成地形
                        /** @type {number} 初始生成的地形数量 */
                        const count = Math.round(self.width * self.height / 10);
                        const landscapes = Object.values(Reversing.Landscape);
                        for (let i = 0; i < count; i++) {
                            const landscape = landscapes[randint(0, landscapes.length - 1)];
                            const avail_poses = getAvailableLandscapePoses(spawnings)
                            const pos = avail_poses[randint(0, avail_poses.length-1)];
                            spawnings.push({ pos, value: landscape });
                        }
                        return spawnings;

                        /**
                         * 获取所有可以随机生成玩家的位置  
                         * 首先生成玩家：假定调用时棋盘为空
                         * @param {Spawning[]} spawnings 已生成的要素数组
                         * @returns {Position[]}
                         */
                        function getAvailablePlayerPoses(spawnings) {
                            /** @type {Position[]} */
                            const avail_poses = [];
                            for (let x = 0; x < self.width; x++) {
                                for (let y = 0; y < self.height; y++) {
                                    const pos = { x, y };
                                    spawnings.every(sp => measureDistance(pos, sp.pos) >= 4) && avail_poses.push(pos);
                                }
                            }
                            return avail_poses;
                        }

                        /**
                         * 获取所有可以随机生成地形的位置  
                         * 生成玩家后生成地形：假定调用时玩家已生成完毕，且棋盘上无已有地形
                         * @param {Spawning[]} spawnings 已生成的要素数组
                         * @returns {Position[]}
                         */
                        function getAvailableLandscapePoses(spawnings) {
                            /** @type {Position[]} */
                            const avail_poses = [];
                            for (let x = 0; x < self.width; x++) {
                                for (let y = 0; y < self.height; y++) {
                                    const pos = { x, y };
                                    spawnings.every(sp => sp.pos.x !== x && sp.pos.y !== y && sp.value <= 0 || measureDistance(pos, sp.pos) >= 2) && avail_poses.push(pos);
                                }
                            }
                            return avail_poses;
                        }
                    }
                };
                /** @type {Spawning[]} */
                const spawnings = spawners[strategy]();
                spawnings.forEach(sp => self.place({
                    player: sp.value,
                    pos: sp.pos,
                }, { history: false }));

                return spawnings;
            }

            /**
             * 落子
             * @param {Position} pos
             */
            move(pos) {
                const player = this.getNextPlayer();
                Reversing.calc(this.board, { player, pos });
                this.history.push({ pos, player });
            }

            /**
             * 当前玩家跳过一回合，轮到下一位玩家
             */
            pass() {
                this.history.push({
                    player: this.getNextPlayer(),
                    pos: { x: -1, y: -1 },
                });
            }

            /**
             * 在棋盘上放置一枚棋子，不进行翻转
             * @param {Step} move 放置的棋子和位置信息
             * @param {Object} [options] 落子选项
             * @param {boolean} [options.force=false] 当指定位置已存在棋子时，是否覆盖；true: 覆盖; false: 报错
             * @param {boolean} [options.history=true] 是否将此步记入历史记录
             */
            place(move, { force = false, history = true } = {}) {
                const { player, pos } = move;
                const { x, y } = pos;

                const val = this.board[x][y];
                if (!val || force) {
                    this.board[x][y] = player;
                    history && this.history.push(move);
                } else {
                    throw new Error(`Cannot place at {x: ${x}, y: ${y}} where has already placed piece ${ val }`);
                }
            }
            
            /**
             * 悔棋（撤回落子）
             * @param {'step' | 'round' | 'curround' | number} type 悔棋类型：一步('step') / 一轮('round') / 回到当前轮开始时('curround') / 指定n步(number)
             */
            withdraw(type) {
                // 计算悔棋后处于历史记录中的第几步
                /** @type {number} */
                let steps;
                switch (type) {
                    case 'step': steps = this.history.length - 1; break;
                    case 'round': steps = this.history.length - this.players; break;
                    case 'curround': steps = this.history.length - this.history.length % this.players; break;
                }

                // 计算在该步时的棋盘数据，替换当前棋盘数据
                this.board = Reversing.calcSteps({
                    width: this.width,
                    height: this.height,
                    order: this.order,
                    players: this.players,
                }, this.history.slice(0, steps));
            }

            /**
             * 数子
             * @returns {JudgeResult}
             */
            judge() {
                return Reversing.judge(this.board, this.players);
            }

            /**
             * 获取下一步行动的玩家，如所有玩家均已失去行动能力则返回null
             * @param {boolean} [reversed=false] 是否逆向寻找，默认为false
             * @returns {RPlayer | null}
             */
            getNextPlayer(reversed = false) {
                if (this.mambaouts.length >= this.players) return null;

                // 获取上一位行动的玩家
                let last_index = reversed ? 0 : this.players - 1;
                if (this.history.length) {
                    const last_step = this.history[this.history.length - 1];
                    last_index = this.order.findIndex(p => p === last_step.player);
                }

                // 遍历寻找下一位可行动玩家
                const step = reversed ? -1 : 1;
                for (let i = last_index;;) {
                    i = (i + step) % this.players;
                    i < 0 && (i += this.players);
                    const player = this.order[i];
                    if (!this.mambaouts.includes(player)) return player;
                }
            }

            /**
             * 判断下一步是否可以在给定点落子
             * @param {Position} pos 
             * @returns {boolean}
             */
            canMove(pos) {
                return Reversing.canMove(this.board, {
                    player: this.getNextPlayer(), pos
                });
            }

            /**
             * 检查指定玩家是否还有可以落子的点位，如没有就将该玩家Mambaout  
             * *What can I say? Hahahaha*
             * @param {RPlayer} player 需要检查的玩家
             * @returns {boolean} 是否已经Mambaout
             */
            whatCanISay(player) {
                for (let x = 0; x < this.width; x++) {
                    for (let y = 0; y < this.width; y++) {
                        if (Reversing.canMove(
                            this.board,
                            { player, pos: { x, y } }
                        )) return true;
                    }
                }
                this.mambaouts.includes(player) || this.mambaouts.push(player);
                return false;
            }

            /**
             * 把所有没有落子位置的玩家都肘到Mambaout
             * *What can I say? Hahahaha*
             */
            whatCanWeSay() {
                for (let p = 1; p <= this.players; p++) {
                    this.whatCanISay(p);
                }
            }

            /**
             * 计算在一个给定棋盘局势上，给定玩家在给定位置落下一子，棋盘变化后的局势  
             * 本方法会就地修改传入棋盘数据，不对数据进行克隆
             * @param {Board} board 
             * @param {Step} move 
             * @returns {Board} 变化后的棋盘局势，此数据和传入的board为同一引用
             */
            static calc(board, move) {
                const { player, pos } = move;
                const { x, y } = pos;
                const width = board.length;
                const height = board[0].length;

                // x, y为-1时代表pass一回合
                if (x === -1 && y === -1) return board;

                // 当pos处不可落子时报错
                if (board[x][y] !== 0) throw new Error(`position {x: ${x}, y: ${y}} already filled with piece ${ board[x][y] }`);

                // 该点处落子
                board[x][y] = player;

                // 该点所在九宫格中，已有子均变为己方子
                // 注意：棋盘上下、左右是联通的
                for (let x2 = x-1; x2 <= x+1; x2++) {
                    let x3 = x2 % width;
                    x3 < 0 && (x3 += width);
                    for (let y2 = y-1; y2 <= y+1; y2++) {
                        let y3 = y2 % height;
                        y3 < 0 && (y3 += height);
                        board[x3][y3] > 0 && (board[x3][y3] = player);
                    }
                }

                return board;
            }

            /**
             * 计算以给定配置开局，经过一串给定落子后的棋盘局势  
             * 本方法会就地修改传入棋盘数据，不对数据进行克隆
             * @param {Config} config 
             * @param {Step[]} moves 
             * @returns {Board} 落子后的棋盘局势
             */
            static calcSteps(config, moves) {
                /** @type {Board} */
                const board = Array.from({length: config.players}, (_, i) => 
                    Array.from({length: config.players}, (_, i) => 0)
                );
                moves.forEach(move => Reversing.calc(board, move));
                return board;
            }

            /**
             * 数子
             * @param {Board} board 局面数据
             * @param {number} players 总玩家数量
             * @returns {JudgeResult}
             */
            static judge(board, players) {
                const width = board.length;
                const height = board[0].length;

                // 为每个玩家数子
                /** @type {number[]} */
                const count = Array.from({ length: players+1 }, (_, i) => 0);
                for (let x = 0; x < width; x++) {
                    for (let y = 0; y < height; y++) {
                        const grid = board[x][y];
                        grid > 0 && count[grid]++;
                    }
                }

                // 按照数子结果降序排列玩家id数组
                /** @type {RPlayer[]} */
                const win_order = Array.from({ length: players }, (_, i) => i + 1);
                win_order.sort((id1, id2) => count[id2] - count[id1]);

                return { count, win_order };
            }

            /**
             * 计算在一个给定棋盘局势上，给定玩家在给定位置是否可以落子
             * @param {Board} board 
             * @param {Step} move 
             * @returns {boolean} 
             */
            static canMove(board, move) {
                // 仅已有己方棋子的上下左右这4个格子可以落子
                // 也就是说，只有在给定位置的上下左右这4个格子中至少有一枚己方已有棋子时，给定位置才是合法的落子点位
                // 注意：棋盘上下、左右是联通的
                const { pos, player } = move;
                const width = board.length;
                const height = board[0].length;

                // x, y为-1代表跳过一回合
                if (pos.x === -1 && pos.y === -1) return true;

                /** @type {Position[]} */
                const surroundings = [
                    { x: pos.x - 1, y: pos.y },
                    { x: pos.x + 1, y: pos.y },
                    { x: pos.x, y: pos.y - 1 },
                    { x: pos.x, y: pos.y + 1 },
                ].map(p => this.normPos(p, width, height));

                return !board[pos.x][pos.y] && surroundings.some(s => board[s.x][s.y] === player);
            }

            /**
             * 将可能超出边界的座标（小于零的座标、超过上限的座标）根据棋盘上下、左右联通的原理转换为边界内的座标
             * 此方法不更改传入的对象，而是创建一个新的Position对象
             * @param {Position} pos 
             * @param {number} width 棋盘宽度
             * @param {number} height 棋盘高度
             * @returns {Position}
             */
            static normPos(pos, width, height) {
                let x = pos.x % width;
                x < 0 && (x += width);
                let y = pos.y % height;
                y < 0 && (y += height);
                return { x, y };
            }
        }

        /** 棋盘渲染器 */
        class BoardGUI {
            /** @type {HTMLCanvasElement} */
            canvas;
            /** @type {CanvasRenderingContext2D} */
            ctx;
            /** @type {number} 格子大小 */
            cellSize = 40;
            /** @type {number} 棋盘边距 */
            padding = 20;
            /** @type {string[]} 玩家颜色配置 */
            playerColors = ['', '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800'];
            /** @type {string} 边缘、标记用色 */
            uiColor = '#663300';
            /** @type {(pos: Position) => any | null} 点击回调函数 */
            onClickCallback = null;

            /**
             * 初始化：创建canvas并绘制空棋盘  
             * 注：创建的canvas不主动添加到DOM，以供外部调用者自行添加
             */
            constructor() {
                this.canvas = document.createElement('canvas');
                this.ctx = this.canvas.getContext('2d');
                this.canvas.style.border = '1px solid #ccc';
                this.canvas.style.cursor = 'pointer';
                
                // 添加点击事件监听
                this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
                
                // 初始化后立即绘制空棋盘
                this.clear();
            }

            /**
             * 处理canvas点击事件
             * @param {MouseEvent} event 
             */
            handleCanvasClick(event) {
                if (!this.onClickCallback) return;
                
                const rect = this.canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                
                // 将像素坐标转换为棋盘坐标
                const boardPos = this.pixelToBoard({x, y});
                
                // 检查坐标是否在有效范围内
                if (this.isValidPosition(boardPos)) {
                    this.onClickCallback(boardPos);
                }
            }

            /**
             * 检查棋盘坐标是否有效
             * @param {Position} pos 棋盘坐标
             * @returns {boolean}
             */
            isValidPosition(pos) {
                // 这里需要知道棋盘的实际尺寸，我们可以存储最后一次渲染的尺寸
                const lastWidth = this.lastRenderedWidth || 8;
                const lastHeight = this.lastRenderedHeight || 8;
                
                return pos.x >= 0 && pos.x < lastWidth && 
                    pos.y >= 0 && pos.y < lastHeight;
            }

            /**
             * 设置点击回调函数
             * @param {(pos: Position) => any | null} callback 回调函数，接收Position参数
             */
            setOnClick(callback) {
                this.onClickCallback = callback;
            }

            /**
             * 移除点击回调函数
             */
            removeOnClick() {
                this.onClickCallback = null;
            }

            /**
             * 将给定的局面绘制到棋盘上
             * @param {Board} board 棋盘数据
             * @param {Position} [last_pos] 上一步位置：给出时，绘制上一步标记；未给出 / 空值 / x,y为-1时，不绘制标记
             */
            render(board, last_pos) {
                if (!board || board.length === 0) {
                    this.clear();
                    return;
                }

                const width = board.length;
                const height = board[0].length;
                
                // 存储当前渲染的尺寸，用于点击位置验证
                this.lastRenderedWidth = width;
                this.lastRenderedHeight = height;
                
                // 设置canvas大小
                this.canvas.width = width * this.cellSize + this.padding * 2;
                this.canvas.height = height * this.cellSize + this.padding * 2;

                // 清空画布
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                // 绘制棋盘背景
                this.ctx.fillStyle = '#f0d9b5';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                // 绘制棋盘网格
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 1;
                
                // 绘制横线
                for (let y = 0; y <= height; y++) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.padding, this.padding + y * this.cellSize);
                    this.ctx.lineTo(this.padding + width * this.cellSize, this.padding + y * this.cellSize);
                    this.ctx.stroke();
                }
                
                // 绘制竖线
                for (let x = 0; x <= width; x++) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.padding + x * this.cellSize, this.padding);
                    this.ctx.lineTo(this.padding + x * this.cellSize, this.padding + height * this.cellSize);
                    this.ctx.stroke();
                }

                // 绘制棋子
                for (let x = 0; x < width; x++) {
                    for (let y = 0; y < height; y++) {
                        const player = board[x][y];
                        if (player !== 0) {
                            this.drawPiece(x, y, player);
                        }
                    }
                }

                // 绘制坐标标记
                this.drawCoordinates(width, height);

                // 绘制上一步标记
                last_pos && last_pos.x !== -1 && last_pos.y !== -1 && this.drawPieceMark(last_pos);
            }

            /**
             * 绘制棋子
             * @param {number} x 横坐标
             * @param {number} y 纵坐标
             * @param {RGrid} grid 棋盘格内容
             */
            drawPiece(x, y, grid) {
                const self = this;
                if (grid > 0) {
                    // 如果是玩家，绘制圆形棋子
                    const centerX = this.padding + x * this.cellSize + this.cellSize / 2;
                    const centerY = this.padding + y * this.cellSize + this.cellSize / 2;
                    const radius = this.cellSize * 0.4;

                    // 绘制棋子底色
                    this.ctx.fillStyle = this.playerColors[grid] || '#888888';
                    this.ctx.beginPath();
                    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    this.ctx.fill();

                    // 绘制棋子边框
                    this.ctx.strokeStyle = this.uiColor;
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    this.ctx.stroke();

                    // 绘制玩家编号
                    /*
                    this.ctx.fillStyle = '#fff';
                    this.ctx.font = `${this.cellSize * 0.3}px Arial`;
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText(player.toString(), centerX, centerY);
                    */
                } else {
                    // 是地形，根据具体地形进行绘制
                    const LS = Reversing.Landscape;
                    const painters = {
                        /**
                         * 墙：一个内部有叉子的方框
                         * @returns {}
                         */
                        [LS.Wall]() {
                            const rectX = self.padding + (x + 0.1) * self.cellSize;
                            const rectY = self.padding + (y + 0.1) * self.cellSize;
                            const length = 0.8 * self.cellSize;
                            const ctx = self.ctx;
                            ctx.strokeStyle = self.uiColor;
                            ctx.lineWidth = 2;
                            ctx.beginPath();
                            ctx.rect(rectX, rectY, length, length);
                            ctx.moveTo(rectX, rectY);
                            ctx.lineTo(rectX + length, rectY + length);
                            ctx.moveTo(rectX + length, rectY);
                            ctx.lineTo(rectX, rectY + length);
                            ctx.stroke();
                        }
                    };

                    painters[grid]();
                }
            }

            /**
             * 绘制坐标标记
             * @param {number} width 棋盘宽度
             * @param {number} height 棋盘高度
             */
            drawCoordinates(width, height) {
                this.ctx.fillStyle = '#000';
                this.ctx.font = '12px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';

                // 绘制横坐标（字母）
                for (let x = 0; x < width; x++) {
                    const char = String.fromCharCode(65 + x); // A, B, C, ...
                    const xPos = this.padding + x * this.cellSize + this.cellSize / 2;
                    const yPos = this.padding - 8;
                    this.ctx.fillText(char, xPos, yPos);
                    
                    // 底部坐标
                    this.ctx.fillText(char, xPos, this.padding + height * this.cellSize + 8);
                }

                // 绘制纵坐标（数字）
                for (let y = 0; y < height; y++) {
                    const number = (y + 1).toString();
                    const xPos = this.padding - 8;
                    const yPos = this.padding + y * this.cellSize + this.cellSize / 2;
                    this.ctx.fillText(number, xPos, yPos);
                    
                    // 右侧坐标
                    this.ctx.fillText(number, this.padding + width * this.cellSize + 8, yPos);
                }
            }

            /**
             * 绘制上一步
             * @param {Position} pos 
             */
            drawPieceMark(pos) {
                const rectX = this.padding + (pos.x + 0.35) * this.cellSize;
                const rectY = this.padding + (pos.y + 0.35) * this.cellSize;
                const length = 0.3 * this.cellSize;
                this.ctx.fillStyle = this.uiColor;
                this.ctx.fillRect(rectX, rectY, length, length);
            }

            /**
             * 清空现有内容并绘制空棋盘
             * @param {number} width 棋盘宽度
             * @param {number} height 棋盘高度
             */
            clear(width, height) {
                if (!this.ctx) return;
                
                // 设置canvas大小
                this.canvas.width = width * this.cellSize + this.padding * 2;
                this.canvas.height = height * this.cellSize + this.padding * 2;

                // 清空画布
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                // 绘制棋盘背景
                this.ctx.fillStyle = '#f0d9b5';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                // 绘制棋盘网格
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 1;
                
                // 绘制横线
                for (let y = 0; y <= height; y++) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.padding, this.padding + y * this.cellSize);
                    this.ctx.lineTo(this.padding + width * this.cellSize, this.padding + y * this.cellSize);
                    this.ctx.stroke();
                }
                
                // 绘制竖线
                for (let x = 0; x <= width; x++) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.padding + x * this.cellSize, this.padding);
                    this.ctx.lineTo(this.padding + x * this.cellSize, this.padding + height * this.cellSize);
                    this.ctx.stroke();
                }

                // 绘制坐标标记
                this.drawCoordinates(width, height);
            }


            /**
             * 设置棋盘样式
             * @param {Object} options 样式选项
             * @param {number} [options.cellSize] 格子大小
             * @param {number} [options.padding] 边距
             * @param {string[]} [options.playerColors] 玩家颜色数组
             */
            setStyle(options) {
                if (options.cellSize) this.cellSize = options.cellSize;
                if (options.padding) this.padding = options.padding;
                if (options.playerColors) this.playerColors = options.playerColors;
            }

            /**
             * 将棋盘坐标转换为像素坐标
             * @param {Position} pos 棋盘坐标
             * @returns {Position} 像素坐标
             */
            boardToPixel(pos) {
                return {
                    x: this.padding + pos.x * this.cellSize + this.cellSize / 2,
                    y: this.padding + pos.y * this.cellSize + this.cellSize / 2
                };
            }

            /**
             * 将像素坐标转换为棋盘坐标
             * @param {Position} pos 像素坐标
             * @returns {Position} 棋盘坐标
             */
            pixelToBoard(pos) {
                return {
                    x: Math.floor((pos.x - this.padding) / this.cellSize),
                    y: Math.floor((pos.y - this.padding) / this.cellSize)
                };
            }
        }

        // 用于类型推断
        const _types = {
            /** @type {RPlayer} */
            RPlayer: {},
            /** @type {RLandscape} */
            RLandscape: {},
            /** @type {RGrid} */
            RGrid: {},
            /** @type {Position} */
            Position: {},
            /** @type {PlayerTurnOrder} */
            PlayerTurnOrder: {},
            /** @type {Config} */
            Config: {},
            /** @type {Step} */
            Step: {},
            /** @type {GameHistory} */
            GameHistory: {},
            /** @type {Board} */
            Board: {},
        };
        return { Reversing, BoardGUI, _types };
    }) ();

    // 游戏框架对接
    (function () {
        /**
         * 玩家
         * @typedef {Object} Player
         * @property {string} user 玩家昵称
         * @property {boolean} mambaout 玩家是否已失去行动能力
         */
        /**
         * 游戏内发言消息
         * @typedef {Object} GameMessage
         * @property {number} player 玩家id
         * @property {string} type 发言消息类型
         * @property {string} content 发言内容
         */
        /**
         * 规则端存储的state  
         * 此数据承担两个任务：规则端本地运算、规则端本地存储
         * @typedef {Object} ServerState
         * @property {number} n 玩家人数
         * @property {boolean} end 是否已结束
         * @property {Player[]} players 玩家信息
         */
        /**
         * 玩家端接收的state（由{@link ServerState}经projection得到，但也含有不依赖于{@link ServerState}的字段）  
         * 此数据承担且仅承担玩家端渲染UI的任务
         * @typedef {Object} ClientState
         * @property {number} id 此玩家id
         * @property {number} n 玩家人数
         * @property {boolean} end 是否已结束
         * @property {typeof _types.Step | null} last_step 上一手落子
         * @property {number} next_move 下一手落子玩家id
         * @property {number[]} move_order 玩家落子顺序，为玩家id数组
         * @property {typeof _types.Board} board 棋盘数据
         * @property {Player[]} players 玩家信息
         */
        /**
         * 玩家端接收的消息体
         * @typedef {Object} ClientData
         * @property {'state' | 'response' | 'request'} type 消息类型：状态数据 / api返回值 / api请求
         * @property {ClientState | APIResponse | APIRequest} body
         */
        /**
         * 规则端接受的消息体
         * @typedef {Object} ServerData
         * @property {'request' | 'response'} type 消息类型：api请求 | api返回值
         * @property {APIRequest | APIResponse} body
         */
        /**
         * API请求体
         * @typedef {Object} APIRequest
         * @property {string} action 请求操作
         * @property {any} body 请求数据
         * @property {string} id 请求id
         */
        /**
         * API返回消息
         * @typedef {Object} APIResponse
         * @property {string} id 请求id，代表本条回复的目标是此id所对应的请求
         * @property {boolean} error 是否存在错误
         * @property {string} err_msg 错误信息，如没有错误则为空字符串
         * @property {any} body 返回消息内容，没有内容时应为null
         */
        /**
         * 落子API请求
         * API方向：玩家端 -> 规则端
         * @typedef {Object} MoveRequest
         * @property {'move'} action 请求操作
         * @property {Object} body 请求数据
         * @property {typeof _types.Position} body.pos 落子位置
         * @property {string} id 请求id
         */
        /**
         * 落子API返回值
         * API方向：玩家端 -> 规则端
         * @typedef {Object} MoveResponse
         * @property {string} id 请求id，代表本条回复的目标是此id所对应的请求
         * @property {boolean} error 是否存在错误，落子成功为false，落子失败为true
         * @property {string} err_msg 错误信息，如没有错误则为空字符串
         * @property {null} body 无返回内容
         */
        /**
         * 认输API请求
         * API方向：玩家端 -> 规则端
         * @typedef {Object} GiveupRequest
         * @property {'giveup'} action 请求操作
         * @property {null} body 无请求数据
         * @property {string} id 请求id
         */
        /**
         * 认输API返回值
         * API方向：玩家端 -> 规则端
         * @typedef {Object} GiveupResponse
         * @property {string} id 请求id，代表本条回复的目标是此id所对应的请求
         * @property {boolean} error 是否存在错误
         * @property {string} err_msg 错误信息，如没有错误则为空字符串
         * @property {null} body 无返回内容
         */
        /**
         * 发送发言API请求  
         * API方向：玩家端 -> 规则端
         * @typedef {Object} MessageSendRequest
         * @property {'message'} action 请求操作
         * @property {Object} body 请求数据
         * @property {string} body.type 消息类型
         * @property {string} body.content 消息内容
         * @property {string} id 请求id
         */
        /**
         * 发送发言API返回值  
         * API方向：玩家端 -> 规则端
         * @typedef {Object} MessageSendResponse
         * @property {string} id 请求id，代表本条回复的目标是此id所对应的请求
         * @property {boolean} error 是否存在错误
         * @property {string} err_msg 错误信息，如没有错误则为空字符串
         * @property {Object} body 返回内容
         * @property {GameMessage[]} body.messages 添加新发言后的全部游戏内发言
         */
        /**
         * 展示发言API请求  
         * API方向：规则端 -> 玩家端
         * @typedef {Object} MessageShowRequest
         * @property {'message'} action 请求操作
         * @property {Object} body 请求数据
         * @property {string} body.type 消息类型
         * @property {string} body.content 消息内容
         * @property {number} body.player 发言玩家id
         * @property {string} id 请求id
         */
        /**
         * 展示发言API返回值  
         * API方向：规则端 -> 玩家端
         * @typedef {Object} MessageShowResponse
         * @property {string} id 请求id，代表本条回复的目标是此id所对应的请求
         * @property {boolean} error 是否存在错误
         * @property {string} err_msg 错误信息，如没有错误则为空字符串
         * @property {null} body 无返回内容
         */
        /**
         * 获取所有发言API请求  
         * API方向：玩家端 -> 规则端
         * @typedef {Object} ListMessagesRequest
         * @property {'listMessages'} action 请求操作
         * @property {null} body 无请求数据
         * @property {string} id 请求id
         */
        /**
         * 获取所有发言API返回值  
         * API方向：玩家端 -> 规则端
         * @typedef {Object} ListMessagesResponse
         * @property {string} id 请求id，代表本条回复的目标是此id所对应的请求
         * @property {boolean} error 是否存在错误
         * @property {string} err_msg 错误信息，如没有错误则为空字符串
         * @property {Object} body 返回内容
         * @property {GameMessage[]} body.messages 发言列表
         */

        // 规则端
        class CustomGameRule extends GameRule {
            // 游戏名
            name = GAME_NAME;

            // 最多玩家人数
            maxN = 4;

            // 是否允许游戏人数n
            allowedN(n) {
                return n > 1 && n <= this.maxN;
            }

            /** @type {ServerState} */
            state = {};

            /**
             * 保存游戏状态的Reversing实例，其中玩家id为游戏框架玩家id + 1
             * @type {InstanceType<typeof Reversing>}
             */
            game = new Reversing();

            /** @type {GameMessage[]} 游戏内发言列表 */
            messages = [];

            /** @type {Record<string, ((data: APIResponse) => any)[]>} 存储API回调 */
            api_callbacks = {};

            // 构造函数
            constructor() { super(); }

            /**
             * 初始化
             * @param {Player[]} players 
             */
            init(players) {
                const self = this;
                const { state, game } = self;

                // 初始化游戏状态
                state.end = false;
                state.n = players.length;
                state.players = structuredClone(players);

                // 初始化游戏实例
                game.restart({
                    // 棋盘的宽高
                    width: 10,
                    height: 10,
                    players: players.length,

                    // 随机的玩家落子顺序
                    order: Array.from({ length: players.length }, (_, i) => i+1).sort((p1, p2) => Math.random() - 0.5),
                });

                // 初始子
                game.opening();
                
                // 将游戏状态更新至客户端和历史记录
                self.pushState();
            }

            /**
             * 接收并处理玩家端发送消息
             * @param {ServerData} data 玩家端发送的消息
             * @param {number} id 玩家ID 
             */
            receive(data, id) {
                switch (data.type) {
                    case 'request':
                        return this.processRequest(data.body, id);
                    case 'response':
                        return this.processResponse(data.body, id);
                }
            }

            /**
             * 接收并处理API请求
             * API方向：玩家端 -> 规则端
             * @param {APIRequest} data API请求数据
             * @param {number} id 玩家ID
             */
            processRequest(data, id) {
                const self = this;
                const { state, game } = self;
                const { action, id: api_id } = data;

                /**
                 * 按照请求类型，处理请求体并生成请求回复的方法
                 * @satisfies {Record<string, (data: APIRequest) => APIResponse>}
                 */
                const api = {
                    /**
                     * 落子
                     * @param {MoveRequest} data 
                     * @returns {MoveResponse}
                     */
                    move(data) {
                        const player = game.getNextPlayer() - 1;
                        if (id !== player) return {
                            error: true,
                            err_msg: `当前未轮到 ${state.players[id].user} 落子，当前应为 ${state.players[player].user} 落子`,
                        }

                        const pos = data.body.pos;
                        const { x, y } = pos;
                        const can_move = game.canMove(pos);
                        can_move && game.move(pos);
                        return can_move ? {} : {
                            error: true,
                            err_msg: `不能在(${x}, ${y})落子，落子位置应为任意己方已有棋子的上、下、左、右这4格其中的一个空格`,
                        };
                    },

                    /**
                     * 认输
                     * @param {GiveupRequest} data 
                     * @returns {GiveupResponse}
                     */
                    giveup(data) {
                        game.mambaouts.includes(id+1) || game.mambaouts.push(id+1);
                        state.players[id].mambaout = true;
                        return {};
                    },

                    /**
                     * 发送发言
                     * @param {MessageSendRequest} data 
                     * @returns {MessageSendResponse}
                     */
                    message(data) {
                        // 添加发言到列表
                        self.messages.push({
                            type: data.body.type,
                            content: data.body.content,
                            player: id,
                        });

                        // 通知所有玩家端发言内容
                        state.players.map((player, player_id) => {
                            /** @type {MessageShowRequest} */
                            const req = {
                                action: 'message',
                                body: {
                                    type: data.body.type,
                                    content: data.body.content,
                                    player: id,
                                },
                                id: randstr(16, false),
                            };
                            self.apiRequest(req, player_id);
                        });
                        return {
                            body: {
                                messages: self.messages,
                            }
                        };
                    },

                    /**
                     * 获取全部发言列表
                     * @param {ListMessagesRequest} data 
                     * @returns {ListMessagesResponse}
                     */
                    listMessages(data) {
                        return {
                            body: {
                                messages: self.messages,
                            }
                        };
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
                    type: 'response',
                    body: response,
                };
                self.send(response_data, id);

                // 检查玩家行动能力状况
                game.whatCanWeSay();
                game.mambaouts.forEach(game_id => state.players[game_id-1].mambaout = true);

                // 检查游戏是否结束
                // 当所有玩家均失去行动能力时游戏结束
                state.players.filter(p => !p.mambaout).length < 1 && (state.end = true);
                // 当上一轮所有玩家都pass时游戏结束
                const alive_players = game.players - game.mambaouts.length;
                game.history.length > alive_players && game.history.slice(Math.max(0, game.history.length - alive_players)).every(step => step.pos.x === -1 && step.pos.y === -1) && (state.end = true);

                // 状态需要更新时需要调用这个函数
                self.syncState();
            }

            /**
             * 发送API请求到玩家端
             * @param {APIRequest} data 
             * @param {number} id 目标玩家id
             * @returns {string} API请求id，该id也会赋值到传入data对象的id属性上
             */
            apiRequest(data, id) {
                const self = this;

                // 随机请求id
                data.id = randstr(16, false);

                // 构造并发送请求
                /** @type {ClientData} */
                const req = {
                    type: 'request',
                    body: data,
                };
                self.send(req, id);

                return data.id;
            }

            /**
             * 接收并处理API返回值  
             * API方向：规则端 -> 玩家端
             * @param {APIResponse} data API返回值
             * @param {number} id 玩家ID 
             */
            processResponse(data, id) {
                const self = this;
                const { api_callbacks } = self;
                Object.hasOwn(api_callbacks, data.id) && api_callbacks[data.id].forEach(callback => callback(data));
                delete api_callbacks[data.id];
            }

            /**
             * 注册API返回值回调，当受到API返回值时执行回调
             * @param {string} api_id API访问id
             * @param {(data: APIResponse) => any} callback 
             */
            registerAPICallback(api_id, callback) {
                const self = this;
                const { api_callbacks } = self;
                Object.hasOwn(api_callbacks, api_id) || (api_callbacks[api_id] = []);
                api_callbacks[api_id].push(callback);
            }

            /**
             * 将游戏状态转化为玩家id的视角，并包装为{@link ClientData}
             * @param {number} id 
             * @returns {ClientData}
             */
            projection(id) {
                const self = this;
                const { state, game } = self;

                /** @type {ClientState} */
                const client_state = {
                    id: id,
                    end: state.end,
                    n: state.n,
                    next_move: game.getNextPlayer() - 1,
                    last_step: game.history.length > 0 ? game.history[game.history.length-1] : null,
                    move_order: game.order.map(id => id - 1),
                    board: structuredClone(game.board),
                    players: state.players.map((player, i) => {
                        /** @type {Player} 公开字段，所有玩家可见 */
                        const publics = {
                            user: player.user,
                            mambaout: player.mambaout,
                        };
                        /** @type {Player} 私有字段，仅自己可见 */
                        const privates = {};
                        return Object.assign(publics, i === id ? privates : {});
                    }),
                };
                return {
                    type: 'state',
                    body: client_state,
                };
            }

            // 游戏程序描述
            rule() {
                const self = this;
                return GAME_RULE.split('\n').map(line => line.trim()).join('\n').trim();
            }
        }

        // 玩家端
        class CustomGameRenderer extends GameRenderer {
            /** @type {ClientState}  */
            state;

            /** @type {InstanceType<typeof BoardGUI>} 棋盘GUI实例 */
            board = new BoardGUI();

            /** @type {Record<string, ((data: APIResponse) => any)[]>} 存储API回调 */
            api_callbacks = {};

            chat = new Chatbox({
                position: 'left',
                dark: 'darktheme',
                title: `${ GAME_NAME } 游戏聊天`,
            });

            /**
             * 初始化渲染器
             * @param {ClientData} data 
             * @param {boolean} isPlaying 
             */
            init(data, isPlaying = true) {
                const self = this;

                if (data.type !== 'state') throw new Error('First message is not in type "state"');
                /** @type {ClientState} */
                const state = self.state = data.body;
                const chat = self.chat;

                self.element.innerHTML = `
                    <div class="game-container">
                        <div class="game-title game-center">翻转棋</div>
                        <div class="game-status game-center">游戏进行中</div>
                        <div class="game-stage">
                            <div class="game-board"></div>
                            <div class="game-info">
                                <div class="game-player"></div>
                                <div class="game-curplayer">
                                    当前行动玩家：
                                    <span class="game-cpcolor game-pcolor"></span>
                                    <span class="game-cpname game-pname"></span>
                                </div>
                                <div class="game-playorder"></div>
                                <div class="game-count-container">
                                    实时数子：
                                    <div class="game-count"></div>
                                </div>
                            </div>
                        </div>
                        <div class="game-actions game-center">
                            <div class="game-button game-center game-pass">Pass</div>
                            <div class="game-button game-center game-help">帮助</div>
                        </div>
                    </div>
                `;

                const stage = $('.game-stage');
                const actions = $('.game-actions');
                const stage_board = $(stage, '.game-board');
                const stage_info = $(stage, '.game-info');

                // 棋盘
                const board = self.board;
                board.setOnClick(pos => {
                    // 使用最新的state值
                    const state = self.state;

                    // 是否轮到自己行动
                    if (state.next_move !== state.id) return;

                    // 此位置是否可以落子
                    if (!Reversing.canMove(state.board, {
                        player: state.id + 1, pos
                    })) return;

                    /** @type {MoveRequest} */
                    const data = {
                        action: 'move',
                        body: { pos },
                    };
                    self.apiRequest(data);
                });
                stage_board.append(board.canvas);

                // 按钮
                // Pass按钮
                const pass = $(actions, '.game-pass');
                pass.addEventListener('click', e => {
                    if (self.state.next_move !== self.state.id) return;

                    /** @type {MoveRequest} */
                    const data = {
                        action: 'move',
                        body: { pos: { x: -1, y: -1 } },
                    };
                    self.apiRequest(data);
                });
                confirmButton(pass);
                // 帮助按钮
                const popup = new Popup({
                    dark: 'darktheme',
                    shadowroot: true,
                });
                const help = $(actions, '.game-help');
                help.addEventListener('click', e => {
                    popup.content = GAME_RULE;
                    popup.show();
                });

                // 聊天框
                chat.addEventListener('send', 
                    /** @param {{ detail: typeof Chatbox._types.ChatboxSendEvent }} e */
                    e => {
                        e.message
                    /** @type {MessageSendRequest} */
                    const req = {
                        action: 'message',
                            body: {
                                type: e.detail.message.type,
                                content: e.detail.message.content,
                            },
                    };
                    self.apiRequest(req);
                    self.registerAPICallback(req.id,
                        /** @param {MessageSendResponse} data */
                        data => {
                                chat.messages = data.body.messages.map(msg => ({
                                    username: self.state.players[msg.player].user,
                                    type: msg.type,
                                    content: msg.content,
                                    is_self: msg.player === self.state.id,
                                }));
                            }
                        );
                    }
                );

                // 游戏信息初始渲染
                $('.game-player').innerText = `您好，${ state.players[state.id].user }`;
                $(stage_info, '.game-playorder').innerText = `本局回合轮换顺序：${
                    state.move_order.map(id => state.players[id].user).join(' → ')
                }`;

                // 游戏内发言初始渲染
                /** @type {ListMessagesRequest} */
                const listmsg_req = {
                    action: 'listMessages',
                    body: null,
                };
                self.apiRequest(listmsg_req);
                self.registerAPICallback(listmsg_req.id,
                    /** @param {ListMessagesResponse} data */
                    data => {
                        chat.messages = data.body.messages.map(msg => ({
                            username: self.state.players[msg.player].user,
                            type: msg.type,
                            content: msg.content,
                            is_self: msg.player === self.state.id,
                        }));
                    }
                );

                // 应用样式
                this.applyStyle();

                // 常规渲染
                self.doRender(state, isPlaying);

                /**
                 * 拦截给定元素的click事件，使其在执行原有点击事件处理器前，需再次点击确认  
                 * **对capture类型的原有事件处理器无效**
                 * @param {HTMLElement} button 
                 */
                function confirmButton(button) {
                    let in_confirm = false, timeout_id = null;

                    const ori_text = button.innerText;
                    const requestConfirm = () => {
                        button.innerText = '确认？'
                        in_confirm = true;
                        timeout_id = setTimeout(recover, 2000);
                    };
                    const recover = () => {
                        clearTimeout(timeout_id);
                        button.innerText = ori_text;
                        in_confirm = false;
                    };

                    button.addEventListener('click', e => {
                        if (in_confirm) {
                            // 二次点击，复原按钮
                            recover();
                        } else {
                            // 首次点击，请求确认
                            requestConfirm();
                            e.stopImmediatePropagation();
                        }
                    }, { capture: true });
                }
            }

            /**
             * 渲染器接收并处理规则端发送消息
             * @param {ClientData} data 
             * @param {boolean} isPlaying 
             */
            render(data, isPlaying = true) {
                switch (data.type) {
                    case 'state':
                        this.doRender(data.body, isPlaying);
                        break;
                    case 'request':
                        this.processRequest(data.body, isPlaying);
                        break;
                    case 'response':
                        this.processResponse(data.body, isPlaying);
                        break;
                    default:
                        console.error('reversing: 渲染器接收到type不合法的消息数据', data);
                }
            }

            /**
             * 渲染器更新状态
             * @param {ClientState} state 
             * @param {boolean} isPlaying 
             */
            doRender(state, isPlaying = true) {
                const self = this;
                const { board } = self;
                self.state = state;
                const is_self = state.next_move === state.id && !state.end;

                // 绘制棋盘
                board.render(state.board, state.last_step?.pos);

                // 游戏信息
                const game_status = $('.game-status');
                if (state.end) {
                    game_status.innerText = '游戏已结束';
                } else {
                    let status_text = '游戏进行中';
                    if (state.last_step) {
                        const { x, y } = state.last_step.pos;
                        const name = state.players[state.last_step.player-1].user;
                        const action = x === -1 ? '跳过了一回合' : `落子在 ${ String.fromCharCode(65+x) }${y+1}`;
                        status_text += `，${ name } ${ action }`;
                    }
                    game_status.innerText = status_text;
                }
                if (!state.end) {
                    $('.game-cpcolor').style.background = board.playerColors[state.next_move + 1];
                    $('.game-cpname').innerText = state.players[state.next_move].user;
                }

                // 实时数子
                const count_div = $('.game-count');
                const judge_result = Reversing.judge(state.board, state.players.length);
                [...count_div.childNodes].forEach(node => node.remove());
                state.players.forEach((player, id) => {
                    const game_id = id + 1;
                    const element = document.createElement('div');
                    element.classList.add('game-pcount');

                    // 棋子图标
                    const span_color = document.createElement('span');
                    span_color.classList.add('game-pcolor');
                    span_color.style.background = self.board.playerColors[game_id];

                    // 玩家名
                    const span_name = document.createElement('span');
                    span_color.classList.add('game-pname');
                    span_name.innerText = player.user;

                    // 数子结果
                    const span_number = document.createElement('span');
                    span_number.classList.add('game-pnumber');
                    span_number.innerText = ` ${ judge_result.count[game_id] } 子`;

                    element.append(span_color, span_name, span_number);
                    count_div.append(element);
                });

                // 轮到己方落子时，canvas鼠标样式换为pointer
                if (is_self) {
                    board.canvas.style.cursor = 'pointer';
                } else {
                    board.canvas.style.cursor = 'default';
                }

                // 按钮状态
                $('.game-pass').classList[is_self ? 'remove' : 'add']('game-disabled');

                // 游戏结束时展示数子情况
                // 【由Ya修改】取消li之间的多余逗号
                if (state.end) {
                    const popup = new Popup({
                        content: `
                            <h2>游戏结束！</h2>
                            <div>
                                本局玩家排名如下：
                                <ol>${
                                    judge_result.win_order.map(
                                        game_id => state.players[game_id-1].user
                                    ).map(
                                        name => `<li>${ name }</li>`
                                    ).join('')
                                }</ol>
                            </div>
                        `,
                        dark: 'darktheme',
                        shadowroot: true,
                        visible: true,
                    });
                }
            }

            /**
             * 处理规则端api请求  
             * API方向：规则端 -> 玩家端
             * @param {APIRequest} data 
             * @param {boolean} isPlaying 
             */
            processRequest(data, isPlaying = true) {
                const self = this;
                const { state } = self;
                const { action, id: api_id } = data;

                /**
                 * 按照请求类型，处理请求体并生成请求回复的方法
                 * @satisfies {Record<string, (data: APIRequest) => APIResponse>}
                 */
                const api = {
                    /**
                     * 展示发言
                     * @param {MessageShowRequest} data 
                     * @returns {MessageShowResponse}
                     */
                    message(data) {
                        const { player, content, type } = data.body;
                        self.chat.addMessage({
                            type, content,
                            username: state.players[player].user,
                            is_self: player === state.id,
                        });
                        return {};
                    }
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
                    type: 'response',
                    body: response,
                };
                self.send(response_data);
            }

            /**
             * 处理api返回值
             * API方向：玩家端 -> 规则端
             * @param {APIResponse} data 
             * @param {boolean} isPlaying 
             */
            processResponse(data, isPlaying = true) {
                const self = this;
                const { api_callbacks } = self;
                Object.hasOwn(api_callbacks, data.id) && api_callbacks[data.id].forEach(callback => callback(data));
                delete api_callbacks[data.id];
            }

            /**
             * 发送API请求到规则端
             * @param {APIRequest} data 
             * @returns {string} API请求id，该id也会赋值到传入data对象的id属性上
             */
            apiRequest(data) {
                const self = this;

                // 随机请求id
                data.id = randstr(16, false);

                // 构造并发送请求
                /** @type {ServerData} */
                const req = {
                    type: 'request',
                    body: data,
                };
                self.send(req);

                return data.id;
            }
            
            /**
             * 注册API返回值回调，当受到API返回值时执行回调
             * @param {string} api_id API访问id
             * @param {(data: APIResponse) => any} callback 
             */
            registerAPICallback(api_id, callback) {
                const self = this;
                const { api_callbacks } = self;
                Object.hasOwn(api_callbacks, api_id) || (api_callbacks[api_id] = []);
                api_callbacks[api_id].push(callback);
            }

            send(data) { }

            /**
             * 添加聊天室渲染器所用的css到页面
             */
            applyStyle() {
                const css = `
                    .game-container {
                        display: flex;
                        flex-direction: column;
                        width: 90vw;
                        height: 100vh;
                        padding: min(15px, 2.5vh) min(15px, 2.5vw);
                    }
                    .game-container > * {
                        margin: calc(min(15px, 2.5vh) / 2) 0;
                    }
                    .game-title {
                        font-weight: 900;
                        font-size: 3rem;
                    }
                    .game-stage {
                        display: flex;
                        flex-direction: row;
                        justify-content: center;
                    }
                    .game-stage > * {
                        margin: 0 calc(min(15px, 2.5vw) / 2);
                    }
                    .game-info {
                        padding: min(15px, 2.5vh) min(15px, 2.5vw);
                        display: flex;
                        flex-direction: column;
                    }
                    .game-curplayer, .game-pcount {
                        display: flex;
                        align-items: center;
                    }
                    .game-pnumber {
                        margin-left: 0.5em;
                    }
                    .game-messages {
                        position: fixed;
                        left: 1em;
                        bottom: 1em;
                        width: 20em;
                    }
                    .darktheme .game-messages {
                        background: #222;
                    }
                    .lighttheme .game-messages {
                        background: #ddd;
                    }
                    .game-messages > * {
                        padding: 1em;
                    }
                    .game-messages.game-folded > *:not(.game-msgcaption) {
                        display: none;
                    }
                    .game-msgcaption {
                        display: flex;
                        align-items: center;
                    }
                    .darktheme .game-msgcaption {
                        border-bottom: 1px solid #111;
                    }
                    .lighttheme .game-msgcaption {
                        border-bottom: 1px solid #ccc;
                    }
                    .game-msgtitle {
                        flex-grow: 1;
                    }
                    .game-fold {
                        display: flex;
                        width: 1em;
                        height: 1em;
                        font-weight: 900;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                    }
                    .game-msglist {
                        display: flex;
                        flex-direction: column;
                        overflow-y: auto;
                        max-height: 20vh;
                    }
                    .game-message {
                        margin-bottom: 0.2em;
                    }
                    .game-chatbox {
                        display: flex;
                        flex-direction: row;
                    }
                    .game-chat-editor {
                        flex-grow: 1;
                    }
                    .game-button.game-sendmsg {
                        font-size: 1rem;
                        padding: 0.5em;
                        margin-left: 0.5em;
                    }
                    .game-actions, .game-center.game-actions {
                        justify-content: space-evenly;
                    }
                    .darktheme .game-info {
                        background: #333;
                    }
                    .lighttheme .game-info {
                        background: #ccc;
                    }
                    .game-info > * {
                        margin: 0.25em;
                    }
                    .game-pcolor {
                        border-radius: 100%;
                        display: inline-block;
                        width: 1em;
                        height: 1em;
                        margin-right: 0.5em;
                    }
                    .darktheme .game-pcolor {
                        border: 1px solid white;
                    }
                    .lighttheme .game-pcolor {
                        border: 1px solid black;
                    }
                    .game-button {
                        font-size: 1.5rem;
                        padding: 1em 2rem;
                        cursor: pointer;
                        border-radius: 5px;
                        width: min-content;
                        height: min-content;
                        border: 1px solid transparent;
                        word-break: keep-all;
                    }
                    .darktheme .game-button {
                        background: #333;
                    }
                    .darktheme .game-button:hover {
                        border-color: white;
                        background: #444;
                    }
                    .lighttheme .game-button {
                        background: #ccc;
                    }
                    .lighttheme .game-button:hover {
                        border-color: black;
                        background: #bbb;
                    }
                    .game-center {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    .game-disabled {
                        filter: grayscale(1) brightness(0.8);
                        pointer-events: none;
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
            name: GAME_NAME,
            rule: CustomGameRule,
            renderer: CustomGameRenderer,
        });
    }) ();
}) ();