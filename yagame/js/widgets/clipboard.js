function copyText(text) {
	navigator.clipboard.writeText(text)
		.then(function () {
			yaGameAlert('复制成功！');
		})
		.catch(function (err) {
			yaGameAlert('复制失败：' + err);
		});
}