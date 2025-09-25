function createAgent(config, state) {
	switch (config.type) {
		case 'deepseek':
			return new DeepseekAgent(config, state);
		default:
			throw `Unknown agent type: ${config.type}`
	}
}