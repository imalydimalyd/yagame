let wakeLockCount = 0, wakeLock = undefined;
function updateWakeLock() {
	if (wakeLockCount >= 1) {
		if (wakeLock === undefined || wakeLock.released) {
			try {
				navigator.wakeLock.request('screen').then(function (w) {
					wakeLock = w;
				});
			} catch (err) { }
		}
	} else {
		if (wakeLock !== undefined && !wakeLock.released) {
			wakeLock.release().then(function () {
				wakeLock = undefined;
			});
		}
	}
};
function requestWakeLock() {
	++wakeLockCount;
	updateWakeLock();
}
function releaseWakeLock() {
	if (wakeLockCount) {
		--wakeLockCount;
	}
	updateWakeLock();
}