
var suite = require('tapsuite');
var promiseQuery = require('../../lib/promise-query');
var stepper = require('stepperbox')();

var connection = {
	query: stepper.as('connection.query'),
	execute: stepper.as('connection.execute'),
};

suite('promise-query', (s) => {

	s.beforeEach((done) => {
		stepper.reset(true);
		done();
	});

	s.test('normal query', (t) => {
		t.plan(4);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			connection,
		};

		var expected = [
			[ { id: '' } ],
			[ { name: 'id' } ],
		];

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			t.equal(query, q, 'query passed thru');
			t.equal(params, q.values, 'params passed thru');
			cb(null, expected[0], expected[1]);
		});

		return promiseQuery(q).then((result) => {
			t.deepEqual(result, expected, 'got back result');
		});
	});

	s.test('prepared', (t) => {
		t.plan(4);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			connection,
			prepared: true,
		};

		var expected = [
			[ { id: '' } ],
			[ { name: 'id' } ],
		];

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.execute', 'called connection.execute');
			t.equal(query, q, 'query passed thru');
			t.equal(params, q.values, 'params passed thru');
			cb(null, expected[0], expected[1]);
		});

		return promiseQuery(q).then((result) => {
			t.deepEqual(result, expected, 'got back result');
		});
	});

	s.test('query error', (t) => {
		t.plan(2);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			connection,
		};

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			cb(new Error('ERROR'));
		});

		return promiseQuery(q)
			.then(
				() => t.fail('query should have failed'),
				(err) => t.equal(err.message, 'ERROR', 'got back error')
			);
	});

	s.test('query retry', (t) => {
		t.plan(4);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			connection,
			retry: true,
			retryCount: 2,
		};

		var expected = [
			[ { id: '' } ],
			[ { name: 'id' } ],
		];

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			cb(new Error('ERROR'));
		});

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			cb(new Error('ERROR'));
		});

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			cb(null, expected[0], expected[1]);
		});

		return promiseQuery(q)
			.then((result) => {
				t.deepEqual(result, expected, 'got back result');
			});
	});

	s.test('query retry failure', (t) => {
		t.plan(3);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			connection,
			retry: true,
			retryCount: 1,
		};

		var expected = [
			[ { id: '' } ],
			[ { name: 'id' } ],
		];

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			cb(new Error('ERROR'));
		});

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			cb(new Error('ERROR'));
		});

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			cb(null, expected[0], expected[1]);
		});

		return promiseQuery(q)
			.then(
				() => t.fail('query should have failed'),
				(err) => t.equal(err.message, 'ERROR', 'got back error')
			);
	});

	s.test('query retry - fatal error', (t) => {
		t.plan(2);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			connection,
			retry: true,
			retryCount: 1,
		};

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');

			var err = new Error('ERROR');
			err.fatal = true;
			cb(err);
		});

		return promiseQuery(q)
			.then(
				() => t.fail('query should have failed'),
				(err) => t.equal(err.message, 'ERROR', 'got back error')
			);
	});

	s.test('stacktrace rewriting', (t) => {
		t.plan(4);
		var q = {
			sql: 'QUERY',
			values: { foo: 'bar' },
			connection,
			tidyStacks: true,
		};

		stepper.add((method, query, params, cb) => {
			t.equal(method, 'connection.query', 'called connection.query');
			var i = 2;
			setImmediate(function deep () {
				if (i--) deep();
				else cb(new Error('ERROR'));
			});
		});

		return promiseQuery(q)
			.then(
				() => t.fail('query should have failed'),
				(err) => {
					t.equal(err.message, 'ERROR', 'got back error');

					var stack = err.stack.split('\n');
					t.equal(stack[0], 'Error: ' + err.message, 'stack matches error messages');
					t.ok(stack[1].indexOf('at promiseQuery') > -1, 'Top of the stack is promiseQuery');
				}
			);
	});
});
