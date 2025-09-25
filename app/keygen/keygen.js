function generate() {
	key = '';
	for (let i = 0; i < 16; ++i) {
		key += String.fromCodePoint(Math.floor(Math.random() * 26) + 65);
	}
	return key;
}
document.getElementById('send').addEventListener('click', function () {
	printMessage({
		user: '茉茉',
		avatar: 'https://q1.qlogo.cn/g?b=qq&nk=3795740926&s=140',
		content: generate(),
	});
});