class Agent {
	constructor(config, state) {
		this.config = config;
		this.state = state;
	}
	input(message, user) { }
	trigger(outputConfig) { }
	setSleepTime() { }

	output(message, outputConfig) { }
	log(message, outputConfig) { }
	finishSleep() { }
}