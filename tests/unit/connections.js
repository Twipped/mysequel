
var suite = require('tapsuite');
var stepper = require('stepperbox')();
var proxyquire = require('proxyquire').noCallThru();
var Emitter = require('events').EventEmitter;
var Promise = require('bluebird');
var quint = proxyquire('../../', {
	mysql2: {
		createPool: stepper.as('mysql.createPool'),
	},
	'./lib/queries': {
		mockQuery: stepper.as('mockQuery'),
	},
	'./lib/promise-query': stepper.as('promiseQuery'),
});

suite('connections', (s) => {
	var db = quint({ ping: false });
	db.getPool = function () {
		var pool = new Emitter();
		pool.getConnection = function (cb) {
			var conn = {
				_isMockedConnection: true,
				beginTransaction: stepper.as('connection.beginTransaction'),
				query: stepper.as('connection.query'),
				execute: stepper.as('connection.execute'),
				release: stepper.as('connection.release'),
				destroy: stepper.as('connection.destroy'),
				commit: stepper.as('connection.commit'),
				rollback: stepper.as('connection.rollback'),
			};
			pool.once('connection', (c) => cb(null, c));
			pool.emit('connection', conn);
		};
		pool.on('connection', stepper.as('pool.getConnection'));

		return pool;
	};

	s.beforeEach((done) => {
		stepper.reset(true);
		done();
	});

	s.test('fetch and release', (t) => {
		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called pool.getConnection');
		});

		stepper.add((method) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			return Promise.resolve([]);
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		return db.getConnection({ prepared: false }).then((connection) =>
			connection.mockQuery('SELECT 1 + 1')
				.then(() => connection.release('PASSTHRU'))
				.then((result) => {
					t.equal(result, 'PASSTHRU', 'got passed through value');
				})
		);
	});
});
