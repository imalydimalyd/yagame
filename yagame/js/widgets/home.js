const homeElement = document.createElement('div');
homeElement.className = 'button';
homeElement.style.position = 'absolute';
homeElement.style.right = '0';
homeElement.style.bottom = 'min(5vw, 5vh)';
homeElement.innerHTML = '返回主页';
homeElement.addEventListener('click', function () {
	location.href = '../../index.html';
});
addEventListener('load', function () {
	document.body.appendChild(homeElement);
});