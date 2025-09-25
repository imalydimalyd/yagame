class Server {
	constructor() {
		this.connected = false;
		this.connections = {};
	}
	connect(config) { }
	send(data, user, err = false) { }
	disconnect() { }

	open(id) { }
	receive(data, user) { }
	close() { }
	error(err) { }
}
class Client {
	constructor() {
		this.connected = false;
	}
	connect(token) { }
	send(data) { }
	disconnect() { }

	open() { }
	receive(data) { }
	close() { }
	error(err) { }
}