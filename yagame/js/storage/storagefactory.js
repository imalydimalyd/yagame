function createStorage(type, key, init) {
	switch (type) {
		case 'ls':
			return new LocalStorage(key, init);
		default:
			throw `Unknown storage type: ${type}`
	}
}