
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

suite('connections', (s) => {
	var db = mysequel({ ping: false });
	db.getPool = makeMockPool(stepper);

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
				}),
		);
	});
});
