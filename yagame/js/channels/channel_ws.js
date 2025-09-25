const WSConfig = {
	// wsUri: 'wss://36413b5w11.goho.co:443/',
	wsUri: 'ws://124.221.178.76:3000/',
	// wsUri: 'ws://tiedan.site:3000/',
};
class WSServer extends Server {
	constructor() {
		super();
	}
	connect(config) {
		const self = this;
		if (self.connected) {
			throw 'Server is already connected';
		}
		self.config = config;
		self.id = self.config.server.id;
		self.connections = {};
		console.log(`Server creating... (config: ${JSON.stringify(self.config)})`);
		self.ws = new WebSocket(WSConfig.wsUri);
		self.ws.addEventListener('open', function () {
			console.log(`Server is open (server ID: ${self.id})`);
			self.ws.send(JSON.stringify({ id: self.id, isServer: true }));
			self.connected = true;
			self.open(self.id);
		});
		self.ws.addEventListener('message', function (e) {
			const data = JSON.parse(e.data);
			switch (data.type) {
				case 'data':
					self.receive(data.data, data.user);
					break;
				case 'verify':
					if (self.config.isPublic) {
						self.ws.send(JSON.stringify({ type: 'verify', keyID: data.keyID, ok: true, user: data.keyID }));
					} else {
						const ok = data.hasOwnProperty('keyID') && self.config.keys.hasOwnProperty(data.keyID);
						const user = ok ? self.config.keys[data.keyID].user : undefined;
						self.ws.send(JSON.stringify({ type: 'verify', keyID: data.keyID, ok: ok, user: user }));
					}
					break;
			}
		});
		self.ws.addEventListener('close', function () {
			if (self.connected) {
				console.warn('WebSocket disconnected, attempting reconnect...');
				self.connected = false;
				self.connect(self.config);
			} else {
				console.log(`Server disconnected`);
				self.close();
			}
		});
		self.ws.addEventListener('error', function (err) {
			self.error('Error');
		});
	}
	send(data, user = undefined, err = false) {
		const d = { type: err ? 'err' : 'ok', msg: data };
		const self = this;
		if (self.connected) {
			let o = { type: 'send', data: d, user: user };
			o = JSON.stringify(o);
			self.ws.send(JSON.stringify({ type: 'send', data: d, user: user }));
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
		self.ws.close();
	}
}
class WSClient extends Client {
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

		self.ws = new WebSocket(WSConfig.wsUri);
		self.ws.addEventListener('open', function () {
			self.ws.send(JSON.stringify({ id: serverID, keyID: keyID }));
		});
		self.ws.addEventListener('message', function (e) {
			const data = JSON.parse(e.data);
			if (data.type === 'open') {
				self.connected = true;
				self.open();
			} else if (data.type === 'ok') {
				self.receive(data.msg);
			} else {
				self.error(data.msg);
			}
		});
		self.ws.addEventListener('close', function () {
			self.connected = false;
			self.close();
		});
		self.ws.addEventListener('error', function (err) {
			self.error('Error');
		});
	}
	send(data) {
		const self = this;
		if (self.connected) {
			self.ws.send(JSON.stringify(data));
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
		self.ws.close();
	}
}