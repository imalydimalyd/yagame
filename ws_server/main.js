const port = 3000;
const useCert = true;
const pathToKey = 'path/to/your.key';
const pathToCert = 'path/to/your.crt';

const express = require('express');
const expressWs = require('express-ws');
const fs = require('fs');
const https = require('https');

const app = express();
expressWs(app);

const ids = {};

app.ws('/', function (ws, req) {
	const socket = {
		ws: ws,
		handshaked: false,
		needVerify: false,
		ok: false,
		id: '',
		isServer: false,
		keyID: '',
		user: '',
	};
	ws.on('message', function (data) {
		let info;
		try {
			info = JSON.parse(data.toString());
		} catch {
			info = {};
		}
		if (socket.handshaked) {
			if (!socket.ok) {
				return;
			}
			if (socket.isServer) {
				switch (info.type) {
					case 'verify':
						for (const client of ids[socket.id].clients) {
							if (client.needVerify && client.keyID === info.keyID) {
								if (info.ok) {
									client.ws.send(JSON.stringify({ type: 'open' }));
								} else {
									client.ws.close();
								}
								client.needVerify = false;
								client.ok = info.ok;
								client.user = info.user;
							}
						}
						break;
					case 'send':
						for (const client of ids[socket.id].clients) {
							if (client.ok && (!info.user || client.user === info.user)) {
								client.ws.send(JSON.stringify(info.data));
							}
						}
						break;
				}
			} else {
				ids[socket.id].server.ws.send(JSON.stringify({
					type: 'data',
					user: socket.user,
					data: info,
				}));
			}
		} else {
			socket.handshaked = true;
			try {
				if (typeof info !== 'object' || (info.isServer !== undefined && typeof info.isServer !== 'boolean') || typeof info.id !== 'string') {
					throw '';
				}
				if (info.isServer) {
					if (ids.hasOwnProperty(info.id)) {
						ws.send(JSON.stringify({ type: 'err', msg: 'ID is occupied' }));
						ws.close();
					} else {
						socket.ok = true;
						socket.isServer = true;
						socket.id = info.id;
						ids[info.id] = { server: socket, clients: [] };
					}
				} else {
					if (typeof info.keyID !== 'string') {
						throw '';
					}
					if (!ids.hasOwnProperty(info.id)) {
						ws.send(JSON.stringify({ type: 'err', msg: 'ID is nonexistent' }));
						ws.close();
					} else {
						socket.needVerify = true;
						socket.id = info.id;
						socket.keyID = info.keyID;
						ids[info.id].clients.push(socket);
						ids[info.id].server.ws.send(JSON.stringify({
							type: 'verify',
							keyID: info.keyID,
						}));
					}
				}
			} catch {
				ws.send(JSON.stringify({ type: 'err', msg: 'Format incorrect' }));
				ws.close();
			}
		}
	});
	ws.on('close', function () {
		if (!socket.ok) {
			return;
		}
		if (socket.isServer) {
			for (const client of ids[socket.id].clients) {
				if (client.ok) {
					client.ws.close();
				}
			}
			delete ids[socket.id];
		}
	});
});

let server;
if (useCert) {
	server = https.createServer({
		key: fs.readFileSync(pathToKey),
		cert: fs.readFileSync(pathToCert),
	}, app);
	server.listen(port, function () {
		console.log(`Server running on port ${port}`);
		console.log(`Path to SSL cert key: ${pathToKey}`);
		console.log(`Path to SSL cert    : ${pathToCert}`);
	});
} else {
	app.listen(port);
	console.log(`Server running on port ${port} without SSL certificate`);
}