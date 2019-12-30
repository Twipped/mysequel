
var suite = require('tapsuite');
var stepper = require('stepperbox')();
var proxyquire = require('proxyquire').noCallThru();
var Promise = require('bluebird');
var makeMockPool = require('../lib/mockRawPool');
var mysequel = proxyquire('../../', {
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

	var db = mysequel({ ping: false });
	db.getPool = makeMockPool(stepper);
	db.on('query-start',   stepper.as('event:query-start'));
	db.on('query-retry',   stepper.as('event:query-retry'));
	db.on('query-success', stepper.as('event:query-success'));
	db.on('query-error',   stepper.as('event:query-error'));
	db.on('query-done',    stepper.as('event:query-done'));

	s.beforeEach((done) => {
		stepper.reset(true);
		done();
	});

	s.test('query retry', (t) => {
		t.plan(21);
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
			t.equal(method, 'event:query-start', 'fired query-start');
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
			t.equal(method, 'event:query-retry', 'fired query-retry');
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
			t.equal(method, 'event:query-retry', 'fired query-retry');
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

		stepper.add((method) => {
			t.equal(method, 'event:query-success', 'fired query-success');
		});

		stepper.add((method) => {
			t.equal(method, 'event:query-done', 'fired query-done');
		});


		return db.mockQuery(q).then((result) => {
			t.deepEqual(result, expected, 'got back result');
		});
	});

	s.test('query retry failure', (t) => {
		t.plan(15);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			retry: true,
			retryCount: 1,
		};

		stepper.add((method) => {
			t.equal(method, 'event:query-start', 'fired query-start');
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
			t.equal(method, 'event:query-retry', 'fired query-retry');
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
			t.equal(method, 'event:query-error', 'fired query-error');
		});

		stepper.add((method) => {
			t.equal(method, 'event:query-done', 'fired query-done');
		});

		return db.mockQuery(q).then(
			() => t.fail('query should have failed'),
			(err) => t.equal(err.message, 'ERROR', 'got back error'),
		);
	});

	s.test('query retry - non-fatal error', (t) => {
		t.plan(9);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			retry: true,
			retryCount: 1,
		};

		stepper.add((method) => {
			t.equal(method, 'event:query-start', 'fired query-start');
		});

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

		stepper.add((method) => {
			t.equal(method, 'event:query-error', 'fired query-error');
		});

		stepper.add((method) => {
			t.equal(method, 'event:query-done', 'fired query-done');
		});

		return db.mockQuery(q).then(
			() => t.fail('query should have failed'),
			(err) => t.equal(err.message, 'ERROR', 'got back error'),
		);
	});

});
