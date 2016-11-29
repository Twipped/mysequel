
var suite = require('tapsuite');
var stepper = require('stepperbox')();
var proxyquire = require('proxyquire').noCallThru();
var makeMockPool = require('../lib/mockRawPool');
var Promise = require('bluebird');
var mysequel = proxyquire('../../', {
	mysql2: {
		createPool: stepper.as('mysql.createPool'),
	},
	'./lib/queries': {
		mockQuery: stepper.as('mockQuery'),
	},
	'./lib/promise-query': stepper.as('promiseQuery'),
});

suite('transactions', (s) => {
	var db = mysequel({ ping: false });
	db.getPool = makeMockPool(stepper);

	s.beforeEach((done) => {
		stepper.reset(true);
		done();
	});

	s.test('commit', (t) => {
		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called pool.getConnection');
		});

		stepper.add((method, cb) => {
			t.equal(method, 'connection.beginTransaction', 'called connection.beginTransaction');
			cb(null, 'IGNOREME');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.ok(query.connection._isMockedConnection, 'with the mocked connection');
			t.equal(query.sql, 'QUERY', 'and the triggering query');
			t.deepEqual(query.values, { nope: true }, 'and data');
			return Promise.resolve([
				{ columnA: 1 },
			]);
		});

		stepper.add((method, cb) => {
			t.equal(method, 'connection.commit', 'called connection.commit');
			cb(null, 'IGNOREME');
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		return db.transaction().then((trans) => {
			t.equal(trans.isOpen, true, 'transaction is open');
			return trans.mockQuery('QUERY', { nope: true })
				.then(() => trans.commit('SOMETHING'))
				.then((v) => {
					t.equal(v, 'SOMETHING', 'commit passed thru its input');
					t.equal(trans.isOpen, false, 'transaction has closed');
				});
		});

	});

	s.test('rollback', (t) => {
		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called pool.getConnection');
		});

		stepper.add((method, cb) => {
			t.equal(method, 'connection.beginTransaction', 'called connection.beginTransaction');
			cb(null, 'IGNOREME');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.ok(query.connection._isMockedConnection, 'with the mocked connection');
			t.equal(query.sql, 'QUERY', 'and the triggering query');
			t.deepEqual(query.values, { nope: true }, 'and data');
			return Promise.resolve([
				{ columnA: 1 },
			]);
		});

		stepper.add((method, cb) => {
			t.equal(method, 'connection.rollback', 'called connection.rollback');
			cb(null, 'IGNOREME');
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		return db.transaction().then((trans) => {
			t.equal(trans.isOpen, true, 'transaction is open');
			return trans.mockQuery('QUERY', { nope: true })
				.then(() => trans.rollback(Promise.reject(new Error('SOMETHING'))))
				.then(
					() => t.fail('Rollback passing a rejected promise should have thrown'),
					(err) => {
						t.equal(err.message, 'SOMETHING', 'rollback passed thru its input');
						t.equal(trans.isOpen, false, 'transaction has closed');
					}
				);
		});
	});

	s.test('query failure auto-rollback', (t) => {
		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called pool.getConnection');
		});

		stepper.add((method, cb) => {
			t.equal(method, 'connection.beginTransaction', 'called connection.beginTransaction');
			cb(null, 'IGNOREME');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.ok(query.connection._isMockedConnection, 'with the mocked connection');
			t.equal(query.sql, 'QUERY', 'and the triggering query');
			t.deepEqual(query.values, { nope: true }, 'and data');
			return Promise.reject(new Error('I HURT MYSELF'));
		});

		stepper.add((method, cb) => {
			t.equal(method, 'connection.rollback', 'called connection.rollback');
			cb(null, 'IGNOREME');
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release', 'called connection.release');
		});

		return db.transaction().then((trans) => {
			t.equal(trans.isOpen, true, 'transaction is open');
			return trans.mockQuery('QUERY', { nope: true })
				.then(
					() => t.fail('Query should have thrown'),
					(err) => {
						t.equal(err.message, 'I HURT MYSELF', 'original error was passed thru');
						t.equal(trans.isOpen, false, 'transaction has closed');
					}
				);
		});
	});

	s.test('query failure auto-rollback - fatal errors', (t) => {
		stepper.add((method) => {
			t.equal(method, 'pool.getConnection', 'called pool.getConnection');
		});

		stepper.add((method, cb) => {
			t.equal(method, 'connection.beginTransaction', 'called connection.beginTransaction');
			cb(null, 'IGNOREME');
		});

		stepper.add((method, query) => {
			t.equal(method, 'mockQuery', 'called mockQuery');
			t.ok(query.connection._isMockedConnection, 'with the mocked connection');
			t.equal(query.sql, 'QUERY', 'and the triggering query');
			t.deepEqual(query.values, { nope: true }, 'and data');
			var err = new Error('FATAL ERROR');
			err.fatal = true;
			return Promise.reject(err);
		});

		stepper.add((method) => {
			t.equal(method, 'connection.destroy', 'called connection.destroy');
		});

		return db.transaction().then((trans) => {
			t.equal(trans.isOpen, true, 'transaction is open');
			return trans.mockQuery('QUERY', { nope: true })
				.then(
					() => t.fail('Query should have thrown'),
					(err) => {
						t.equal(err.message, 'FATAL ERROR', 'original error was passed thru');
						t.equal(trans.isOpen, false, 'transaction has closed');
					}
				);
		});
	});
});
