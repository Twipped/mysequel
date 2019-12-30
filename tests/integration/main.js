/* eslint no-unreachable:0 */

var Promise = require('bluebird');
var suite = require('tapsuite');
var mktmpio = require('../lib/mktmpio');
var mysequel = require('../../');
var es = require('event-stream');

return; // Disabling integration tests because mktmp.io has an expired SSL cert

suite('mysql integration', (s) => {
	var pool, db;

	s.before(() => mktmpio.create()
		.then((_db) => {
			db = _db;
			s.comment(`Database created: --user=${db.username} --password=${db.password} --host=${db.host} --port=${db.port}`);
			return mktmpio.populate();
		})
		.then(() => {
			s.comment('Database populated');
		}),
	);

	s.after(() => mktmpio.destroy()
		.then(() => s.comment('Database destroyed')),
	);

	s.beforeEach((done) => {
		pool = mysequel({
			host: db.host,
			port: db.port,
			user: 'root',
			password: db.password,
			database: 'test_data',
		});
		done();
	});

	s.afterEach(() => {
		var p = pool;
		pool = null;
		return p.close();
	});

	var q = `
		SELECT
			e.first_name,
			e.last_name,
			d.dept_name
		FROM employees e
		INNER JOIN dept_emp de USING (emp_no)
		INNER JOIN departments d USING (dept_no)
		WHERE gender = :gender
		ORDER BY birth_date, emp_no
		LIMIT 4
	`;

	s.test('query', (t) => {
		var expected = [
			{
				first_name: 'Sumant',
				last_name:  'Peac',
				dept_name:  'Quality Management',
			},
			{
				first_name: 'Anneke',
				last_name:  'Preusig',
				dept_name:  'Development',
			},
			{
				first_name: 'Mary',
				last_name:  'Sluis',
				dept_name:  'Customer Service',
			},
			{
				first_name: 'Kazuhide',
				last_name:  'Peha',
				dept_name:  'Development',
			},
		];

		return pool.query(q, { gender: 'F' })
			.then((results) => {
				t.deepEqual([].concat(results), expected, 'results match');
			});
	});

	s.test('queryRow', (t) => {
		var expected = {
			first_name: 'Sumant',
			last_name:  'Peac',
			dept_name:  'Quality Management',
		};

		return pool.queryRow(q, { gender: 'F' })
			.then((results) => {
				t.deepEqual(results, expected, 'results match');
			});
	});

	s.test('queryColumn', (t) => {
		var expected = [
			'Sumant',
			'Anneke',
			'Mary',
			'Kazuhide',
		];

		return pool.queryColumn(q, { gender: 'F' })
			.then((results) => {
				t.deepEqual([].concat(results), expected, 'results match');
			});
	});

	s.test('queryCell', (t) => {
		var expected = 'Sumant';

		return pool.queryCell(q, { gender: 'F' })
			.then((results) => {
				t.deepEqual(results, expected, 'results match');
			});
	});

	s.test('queryInsert', (t) => {
		var expected = 10021;
		var query = `
			INSERT INTO employees SET
				first_name = :firstName,
				last_name  = :lastName,
				gender     = :gender,
				birth_date = :dateBorn,
				hire_date  = :dateHired
		`;
		var data = {
			firstName: 'Jocelyn',
			lastName: 'Badgley',
			gender: 'F',
			dateBorn: '1990-12-31',
			dateHired: new Date('2012-01-01'),
		};

		return pool.queryInsert(query, data)
			.then((results) => {
				t.deepEqual(results, expected, 'results match');
			});
	});

	s.test('queryStream', (t) => {
		var expected = [
			{
				first_name: 'Sumant',
				last_name:  'Peac',
				dept_name:  'Quality Management',
			},
			{
				first_name: 'Anneke',
				last_name:  'Preusig',
				dept_name:  'Development',
			},
			{
				first_name: 'Mary',
				last_name:  'Sluis',
				dept_name:  'Customer Service',
			},
			{
				first_name: 'Kazuhide',
				last_name:  'Peha',
				dept_name:  'Development',
			},
		];

		var stream = pool.queryStream(q, { gender: 'F' }).stream();

		var writer = es.writeArray((err, results) => {
			t.error(err);
			t.deepEqual(results, expected, 'results match');
			t.end();
		});

		stream.pipe(writer);
	});

	s.test('transaction - insert and rollback', async (t) => {
		var sql = `
		  INSERT INTO departments SET dept_no = :dNum, dept_name = :dName
		`;

		var data = { dNum: 'd010', dName: 'Shipping & Receiving' };
		var initialCount;

		const transaction = await pool.transaction();
		let count = await pool.queryCell('SELECT COUNT(*) FROM departments');

		t.pass('Initial count is ' + count);
		initialCount = count;
		await transaction.queryInsert(sql, data);
		t.pass('Inserted OK');

		count = await transaction.queryCell('SELECT COUNT(*) FROM departments');
		t.equal(count, initialCount + 1, 'In-transaction count is one greater than start count');

		await transaction.rollback();

		count = await pool.queryCell('SELECT COUNT(*) FROM departments');
		t.equal(count, initialCount, 'Final count matches original count');
	});

	s.test('transaction - insert and commit', async (t) => {
		var sql = `
		  INSERT INTO departments SET dept_no = :dNum, dept_name = :dName
		`;

		var data = { dNum: 'd010', dName: 'Shipping & Receiving' };
		var initialCount;

		const transaction = await pool.transaction();
		let count = await pool.queryCell('SELECT COUNT(*) FROM departments');

		t.pass('Initial count is ' + count);
		initialCount = count;
		await transaction.queryInsert(sql, data);
		t.pass('Inserted OK');

		count = await transaction.queryCell('SELECT COUNT(*) FROM departments');
		t.equal(count, initialCount + 1, 'In-transaction count is one greater than start count');

		await transaction.commit();

		count = await pool.queryCell('SELECT COUNT(*) FROM departments');
		t.equal(count, initialCount + 1, 'Final count matches the new count');
	});

	s.test('transaction - query error triggers rollback', async (t) => {
		var sql = `
		  INSERT INTO departments SET dept_no = :dNum, dept_name = :dName
		`;

		var data = { dNum: 'd011', dName: 'Cafeteria' };
		var initialCount;

		const transaction = await pool.transaction();
		let count = await pool.queryCell('SELECT COUNT(*) FROM departments');

		t.pass('Initial count is ' + count);
		initialCount = count;
		await transaction.queryInsert(sql, data);
		t.pass('Inserted OK');

		count = await transaction.queryCell('SELECT COUNT(*) FROM departments');
		t.equal(count, initialCount + 1, 'in-transaction count is one greater than start count');

		try {
			await transaction.queryInsert(sql, data);
			t.fail('Second insert should not have worked');
			return;
		} catch (err) {
			t.equal(err.code, 'ER_DUP_ENTRY', 'got back error from bad insert');
		}

		count = await transaction.queryCell('SELECT COUNT(*) FROM departments');
		t.equal(count, initialCount, 'Final count matches the original count');
	});

	s.test('transaction - queryStream', async (t) => {
		var expected = [
			{
				first_name: 'Sumant',
				last_name:  'Peac',
				dept_name:  'Quality Management',
			},
			{
				first_name: 'Anneke',
				last_name:  'Preusig',
				dept_name:  'Development',
			},
			{
				first_name: 'Mary',
				last_name:  'Sluis',
				dept_name:  'Customer Service',
			},
			{
				first_name: 'Kazuhide',
				last_name:  'Peha',
				dept_name:  'Development',
			},
		];

		const transaction = await pool.transaction();
		const stream = transaction.queryStream(q, { gender: 'F' }).stream();

		const results = await new Promise((resolve, reject) => {
			const writer = es.writeArray((err, res) => {
				if (err) return reject(err);
				resolve(res);
			});
			stream.pipe(writer);
		});

		t.deepEqual(results, expected, 'results match');
	});

});
