class Countdown {
	constructor() {
		this.on = false;
		this.hasHandle = false;
	}
	update() {
		const self = this;
		const m = Math.floor(self.time / 60000).toString().padStart(2, '0');
		const s = Math.floor((self.time % 60000) / 1000).toString().padStart(2, '0');
		self.element.innerText = `${m}:${s}`;
	}
	countdown() {
		const self = this;
		if (self.on) {
			return;
		}
		self.on = true;
		self.date = new Date();
		function frame() {
			const newDate = new Date();
			self.time = Math.max(0, self.time - (newDate - self.date));
			self.date = newDate;
			self.update();
			self.hasHandle = true;
			self.handle = requestAnimationFrame(frame);
		}
		frame();
	}
	start(element, time) {
		const self = this;
		self.element = element;
		self.time = time;
		self.countdown();
	}
	pause() {
		const self = this;
		if (self.hasHandle) {
			cancelAnimationFrame(self.handle);
			self.hasHandle = false;
		}
		self.on = false;
	}
	resume() {
		const self = this;
		self.countdown();
	}
};