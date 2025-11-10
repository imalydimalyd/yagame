document.addEventListener('DOMContentLoaded', function () {
    const footer = document.createElement('footer');
    footer.id = 'site-footer';
    footer.setAttribute('role', 'contentinfo');

    footer.innerHTML = `
        <a href="https://beian.miit.gov.cn" target="_blank" rel="noreferrer noopener">苏ICP备2025218151号-1</a><br>
        <img src="yagame/img/gongan.png" alt=""/><a href="https://beian.mps.gov.cn/#/query/webSearch?code=32021102003220" rel="noreferrer" target="_blank">苏公网安备32021102003220号</a>
    `;

    document.body.appendChild(footer);

    const style = document.createElement('style');
    style.textContent = `
        #site-footer {
            margin-top: auto;
            font-size: 13px;
            text-align: center;
            background: inherit;
            padding: 10px 0 8px;
        }
        #site-footer a {
            color: inherit;
            text-decoration: none;
        }
        #site-footer img {
            width: 15px;
            height: 15px;
            margin-right: 3px;
            transform: translateY(3px);
        }
    `;
    document.head.appendChild(style);
});
