function generate() {
	key = '';
	for (let i = 0; i < 16; ++i) {
		key += String.fromCodePoint(Math.floor(Math.random() * 26) + 65);
	}
	return key;
}
const keyDisplayElement = document.getElementById('keydisplay');
let key = '';
function generateAndLoad() {
	keyDisplayElement.style.transition = `none`;
	keyDisplayElement.classList.add('hidden');
	key = generate();
	keyDisplayElement.innerText = key;
	setTimeout(function () {
		keyDisplayElement.style.transition = '';
		keyDisplayElement.classList.remove('hidden');
	}, 50);
}
document.getElementById('keygenerate').addEventListener('click', function () {
	generateAndLoad();
});
document.getElementById('keycopy').addEventListener('click', function () {
	navigator.clipboard.writeText(key).then(function () {
		alert('复制成功！');
	}, function (reason) {
		alert('复制失败！原因：' + reason.toString());
	});
});
generateAndLoad();