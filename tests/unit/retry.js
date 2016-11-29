
var suite = require('tapsuite');
var stepper = require('stepperbox')();
var proxyquire = require('proxyquire').noCallThru();
var Promise = require('bluebird');
var makeMockPool = require('../lib/mockRawPool');
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
	db.getPool = makeMockPool(stepper);

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
