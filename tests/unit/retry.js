
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

function FatalError (msg) {
	var e = new Error(msg);
	e.fatal = true;
	return e;
}

suite('promise-query', (s) => {

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


	s.test('query retry', (t) => {
		t.plan(16);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			retry: true,
			retryCount: 2,
		};

		var expected = [
			[ { id: '' } ],
			[ { name: 'id' } ],
		];

		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called connection.query');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.equal(query.sql, 'QUERY', 'with the triggering query');
			t.deepEqual(query.values, { foo: 'bar' }, 'and data');
			return Promise.reject(new FatalError('ERROR'));
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called pool.getConnection');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.equal(query.sql, 'QUERY', 'with the triggering query');
			t.deepEqual(query.values, { foo: 'bar' }, 'and data');
			return Promise.reject(new FatalError('ERROR'));
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called connection.query');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.equal(query.sql, 'QUERY', 'with the triggering query');
			t.deepEqual(query.values, { foo: 'bar' }, 'and data');
			return Promise.resolve(expected);
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		return db.mockQuery(q).then((result) => {
			t.deepEqual(result, expected, 'got back result');
		});
	});

	s.test('query retry failure', (t) => {
		t.plan(11);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			retry: true,
			retryCount: 1,
		};

		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called connection.query');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.equal(query.sql, 'QUERY', 'with the triggering query');
			t.deepEqual(query.values, { foo: 'bar' }, 'and data');
			return Promise.reject(new FatalError('ERROR'));
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called connection.query');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.equal(query.sql, 'QUERY', 'with the triggering query');
			t.deepEqual(query.values, { foo: 'bar' }, 'and data');
			return Promise.reject(new FatalError('ERROR'));
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called connection.query');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.equal(query.sql, 'QUERY', 'with the triggering query');
			t.deepEqual(query.values, { foo: 'bar' }, 'and data');
			return Promise.reject(new FatalError('ERROR'));
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		return db.mockQuery(q).then(
			() => t.fail('query should have failed'),
			(err) => t.equal(err.message, 'ERROR', 'got back error')
		);
	});

	s.only('query retry - non-fatal error', (t) => {
		t.plan(6);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			retry: true,
			retryCount: 1,
		};

		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called connection.query');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.equal(query.sql, 'QUERY', 'with the triggering query');
			t.deepEqual(query.values, { foo: 'bar' }, 'and data');
			return Promise.reject(new Error('ERROR'));
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		return db.mockQuery(q).then(
			() => t.fail('query should have failed'),
			(err) => t.equal(err.message, 'ERROR', 'got back error')
		);
	});

});
