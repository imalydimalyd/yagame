const peerJSConfig = {
	debug: 3,
};
class PeerJSServer extends Server {
	constructor() {
		super();
	}
	connect(config) {
		const self = this;
		if (self.connected) {
			throw 'Server is already connected';
		}
		self.config = config;
		self.connections = {};
		console.log(`Server creating... (config: ${JSON.stringify(self.config)})`);
		self.peer = new Peer(self.config.server.id, peerJSConfig);
		self.peer.on('open', function (id) {
			console.log(`Server is open (server ID: ${id})`);
			self.connected = true;
			self.open(id);
		});
		self.peer.on('connection', function (dataConnection) {
			const data = dataConnection.metadata;
			const ok = (typeof data === 'object') && data.hasOwnProperty('keyID') && (typeof data.keyID === 'string') && (self.config.isPublic ? (data.keyID && data.keyID.length <= 15) : self.config.keys.hasOwnProperty(data.keyID));
			if (ok) {
				const keyID = data.keyID;
				const user = self.config.isPublic ? keyID : self.config.keys[keyID].user;
				console.log(`Connection made (user: ${user})`);
				const connection = {
					dataConnection: dataConnection,
					connected: true,
				};

				if (!self.connections.hasOwnProperty(user)) {
					self.connections[user] = [];
				}
				self.connections[user].push(connection);
				dataConnection.on('open', function () { });
				dataConnection.on('data', function (data) {
					self.receive(data, user);
				});
				dataConnection.on('close', function () {
					connection.connected = false;
				});
				dataConnection.on('error', function (err) {
					if (err.type !== 'not-open-yet') {
						console.error(`Server error: ${err.type} (server ID: ${self.id})`);
						self.error('data-connection-error-' + err.type);
					}
				});
			} else {
				console.log(`Connection rejected due to invalid metadata: ${JSON.stringify(data)}`)
				dataConnection.on('open', function () {
					dataConnection.send({ type: 'err', msg: 'Token incorrect' });
					dataConnection.close();
				});
			}
		});
		self.peer.on('disconnected', function () {
			if (self.connected) {
				console.warn('Peer disconnected, attempting reconnect...');
				self.peer.reconnect();
			} else {
				console.log(`Server disconnected`);
				self.close();
			}
		});
		self.peer.on('close', function () {
			self.connected = false;
			console.error(`Server closed`);
			self.error('server-closed');
		});
		self.peer.on('error', function (err) {
			console.error(`Server error: ${err.type}`);
			self.error('server-error-' + err.type);
		});
		if (self.config.server.reconnect) {
			self.peer.reconnect();
		}
	}
	send(data, user = undefined, err = false) {
		const d = { type: err ? 'err' : 'ok', msg: data };
		const self = this;
		if (self.connected) {
			if (user) {
				if (self.connections[user]) {
					for (const connection of self.connections[user]) {
						connection.dataConnection.send(d);
					}
				}
			} else {
				for (const connections of Object.values(self.connections)) {
					for (const connection of connections) {
						if (connection.connected) {
							connection.dataConnection.send(d);
						}
					}
				}
			}
		} else {
			throw 'Server is not connected';
		}
	}
	disconnect() {
		const self = this;
		if (!self.connected) {
			throw 'Server is not connected';
		}
		self.connected = false;
		for (const connections of Object.values(self.connections)) {
			for (const connection of connections) {
				if (connection.connected) {
					connection.dataConnection.close();
				}
			}
		}
		self.peer.disconnect();
		self.connections = {};
	}
}
class PeerJSClient extends Client {
	constructor() {
		super();
	}
	connect(serverID, keyID) {
		const self = this;
		if (self.connected) {
			throw 'Server is already connected';
		}
		if (typeof serverID !== 'string') {
			throw 'serverID should be a string';
		}
		if (typeof keyID !== 'string') {
			throw 'keyID should be a string';
		}
		self.serverID = serverID;
		self.keyID = keyID;

		self.peer = new Peer(undefined, peerJSConfig);
		self.peer.on('open', function () {
			self.dataConnection = self.peer.connect(self.serverID, {
				metadata: {
					keyID: self.keyID,
				},
				reliable: true,
			});
			self.dataConnection.on('open', function () {
				self.connected = true;
				self.open();
			});
			self.dataConnection.on('data', function (data) {
				if (data.type === 'ok') {
					self.receive(data.msg);
				} else {
					self.error(data.msg);
				}
			});
			self.dataConnection.on('close', function () {
				self.connected = false;
				self.close();
			});
			self.dataConnection.on('error', function (err) {
				self.error(err.type);
			});
		});
	}
	send(data) {
		const self = this;
		if (self.connected) {
			self.dataConnection.send(data);
		} else {
			throw 'Client is not connected';
		}
	}
	disconnect() {
		const self = this;
		if (!self.connected) {
			throw 'Client is not connected';
		}
		self.connected = false;
		self.dataConnection.close();
		self.peer.destroy();
	}
}