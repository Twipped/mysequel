
var Emitter = require('events').EventEmitter;

module.exports = exports = function (stepper) {
	var pool = new Emitter();
	pool.getConnection = function (cb) {
		var conn = {
			_isMockedConnection: true,
			beginTransaction: stepper.as('connection.beginTransaction'),
			query:    stepper.as('connection.query'),
			execute:  stepper.as('connection.execute'),
			release:  stepper.as('connection.release'),
			destroy:  stepper.as('connection.destroy'),
			commit:   stepper.as('connection.commit'),
			rollback: stepper.as('connection.rollback'),
		};
		pool.once('connection', (c) => cb(null, c));
		pool.emit('connection', conn);
	};
	pool.on('connection', stepper.as('pool.getConnection'));
	pool.end = stepper.as('pool.end');

	return () => pool;
};
