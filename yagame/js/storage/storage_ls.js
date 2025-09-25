class LocalStorage extends Storage {
	constructor(key, init) {
		super(key, init);
		if (typeof key !== 'string') {
			throw 'Key should be string';
		}
		this.key = key;
		this.loaded = false;
		this.init = init;
	}
	load() {
		const self = this;
		if (self.loaded) {
			throw 'Storage is already loaded';
		}
		try {
			const get = localStorage.getItem(self.key);
			if (!get) {
				throw '';
			}
			self.data = JSON.parse(get);
		} catch {
			console.warn('Get no data or invalid data from storage');
			self.data = self.init;
		}
		self.loaded = true;
		return self.data;
	}
	save() {
		const self = this;
		if (!self.loaded) {
			throw 'Storage has not been loaded';
		}
		localStorage.setItem(self.key, JSON.stringify(self.data));
	}
}