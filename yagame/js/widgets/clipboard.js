function copyText(text) {
	navigator.clipboard.writeText(text)
		.then(function () {
			alert('复制成功！');
		})
		.catch(function (err) {
			alert('复制失败：', err);
		});
}