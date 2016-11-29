
var suite = require('tapsuite');
var stepper = require('stepperbox')();
var proxyquire = require('proxyquire').noCallThru();
var Promise = require('bluebird');
var queries = proxyquire('../../lib/queries', {
	'./promise-query': stepper.as('promiseQuery'),
});

suite('queries', (s) => {
	var q = {
		sql: 'QUERY',
	};

	function setup (t) {
		var result = [
			[
				{ id: 10, active: false },
				{ id: 11, active: true },
				{ id: 12, active: true },
				{ id: 13, active: false },
			],
			[
				{ name: 'id' },
				{ name: 'active' },
			],
		];

		stepper.add((method, query) => {
			t.equal(method, 'promiseQuery', 'called promiseQuery');
			t.equal(query, q, 'got query input');
			return Promise.resolve(result);
		});
	}

	s.beforeEach((done) => {
		stepper.reset(true);
		done();
	});

	s.test('query', (t) => {
		setup(t);
		return queries.query(q)
			.then((result) => {
				t.deepEqual(result, [
					{ id: 10, active: false },
					{ id: 11, active: true },
					{ id: 12, active: true },
					{ id: 13, active: false },
				], 'result is correct');
			});
	});

	s.test('queryRow', (t) => {
		setup(t);
		return queries.queryRow(q)
			.then((result) => {
				t.deepEqual(result, { id: 10, active: false }, 'result is correct');
			});
	});

	s.test('queryColumn', (t) => {
		setup(t);
		return queries.queryColumn(q)
			.then((result) => {
				t.deepEqual(result, [
					10,
					11,
					12,
					13,
				], 'result is correct');
			});
	});

	s.test('queryCell', (t) => {
		setup(t);
		return queries.queryCell(q)
			.then((result) => {
				t.deepEqual(result, 10, 'result is correct');
			});
	});

	s.test('queryInsert', (t) => {
		var response = [];
		response.insertId = 5;

		stepper.add((method, query) => {
			t.equal(method, 'promiseQuery', 'called promiseQuery');
			t.equal(query, q, 'got query input');
			return Promise.resolve([ response ]);
		});

		return queries.queryInsert(q)
			.then((result) => {
				t.deepEqual(result, 5, 'result is correct');
			});
	});
});
