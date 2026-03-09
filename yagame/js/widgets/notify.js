function notify(title, body, tag = 'yagame', icon = '../../yagame/img/yagame.svg') {
	function createNotification() {
		return new Notification(title, {
			body: body,
			badge: icon,
			icon: icon,
			renotify: true,
			tag: tag,
		});
	}
	if ('Notification' in window) {
		if (Notification.permission === 'granted') {
			const notification = createNotification();
		} else if (Notification.permission !== 'denied') {
			Notification.requestPermission().then(function (permission) {
				if (permission === 'granted') {
					const notification = createNotification();
				}
			});
		}
	}
}