function createServer(type) {
	switch (type) {
		case 'ws':
			return new WSServer();
		case 'peerjs':
			return new PeerJSServer();
		default:
			throw `Unknown server type: ${type}`
	}
}
function createClient(type) {
	switch (type) {
		case 'ws':
			return new WSClient();
		case 'peerjs':
			return new PeerJSClient();
		default:
			throw `Unknown client type: ${type}`
	}
}