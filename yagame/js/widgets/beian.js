const beianInfo = '';// 示例：京ICP备12345678号

if (beianInfo) {
    const beianElement = document.createElement('div');
    beianElement.style.position = 'absolute';
    beianElement.style.bottom = '0';
    beianElement.innerHTML = beianInfo;
    addEventListener('load', function () {
        document.body.appendChild(beianElement);
    });
}